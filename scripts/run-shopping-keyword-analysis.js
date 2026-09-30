// 활성화된 모든 쇼핑 키워드의 네이버쇼핑 노출 상품 목록을 조회해서 스냅샷으로 저장합니다.
// place-rank-checks.js와 동일한 구조 — Vercel 서버리스가 아니라 GitHub Actions에서 실행됩니다.
//
// 실행: node scripts/run-shopping-keyword-analysis.js
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 선택 환경변수: SHOPPING_KEYWORD_ID — 값이 있으면 그 키워드 하나만(웹 화면의
//   "지금 분석하기" 버튼이 이 방식으로 동작), 없으면(매일 스케줄 실행) 등록된 전체
//   활성 키워드를 조회합니다. REQUEST_ID가 있으면 결과에 같이 저장합니다.

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");
const { PlaywrightShoppingRankProvider } = require("../lib/shoppingRank/PlaywrightShoppingRankProvider");

// 연속 요청 사이 최소한의 간격 — 차단 회피가 아니라 예의상의 배려입니다.
const DELAY_BETWEEN_CHECKS_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadActiveKeywords(supabase) {
  const { data, error } = await supabase.from("shopping_keywords").select("*").eq("is_active", true);
  if (error) throw error;
  return data || [];
}

async function loadSingleKeyword(supabase, id) {
  const { data, error } = await supabase.from("shopping_keywords").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? [data] : [];
}

async function saveResult(supabase, shoppingKeyword, result) {
  const requestId = process.env.REQUEST_ID && process.env.REQUEST_ID.trim() ? process.env.REQUEST_ID.trim() : null;

  const { error } = await supabase.from("shopping_keyword_snapshots").insert({
    request_id: requestId,
    shopping_keyword_id: shoppingKeyword.id,
    keyword: shoppingKeyword.keyword,
    max_rank: shoppingKeyword.max_rank,
    status: result.status,
    error_message: result.errorMessage,
    results: result.items || null,
  });
  if (error) throw error;
}

async function main() {
  const supabase = getSupabaseAdmin();
  const provider = new PlaywrightShoppingRankProvider({ headless: true });

  const singleId = process.env.SHOPPING_KEYWORD_ID && process.env.SHOPPING_KEYWORD_ID.trim();
  const keywords = singleId ? await loadSingleKeyword(supabase, singleId) : await loadActiveKeywords(supabase);

  if (singleId && keywords.length === 0) {
    console.error(`SHOPPING_KEYWORD_ID=${singleId} 에 해당하는 키워드를 찾지 못했습니다.`);
    process.exit(1);
  }

  console.log(singleId ? `단건 분석 모드 — 대상: ${keywords.length}개` : `분석 대상 키워드: ${keywords.length}개`);

  const summary = { ok: 0, blocked: 0, error: 0 };

  for (const kw of keywords) {
    console.log(`분석 중: "${kw.keyword}" (최대 ${kw.max_rank}개)`);
    let result;
    try {
      result = await provider.listProducts({ keyword: kw.keyword, maxRank: kw.max_rank });
    } catch (err) {
      result = { status: "error", items: [], errorMessage: err.message || String(err) };
    }

    console.log(
      `  → ${result.status}${result.items ? ` (상품 ${result.items.length}개)` : ""}${
        result.errorMessage ? ` — ${result.errorMessage}` : ""
      }`
    );
    summary[result.status] = (summary[result.status] || 0) + 1;

    try {
      await saveResult(supabase, kw, result);
    } catch (err) {
      console.error(`  저장 실패: ${err.message}`);
    }

    await sleep(DELAY_BETWEEN_CHECKS_MS);
  }

  console.log("\n=== 분석 요약 ===");
  console.log(summary);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실행 중 오류:", err);
    process.exit(1);
  });
