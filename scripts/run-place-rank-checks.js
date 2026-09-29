// 활성화된 모든 (매장, 키워드) 조합의 순위를 한 번씩 측정해서 Supabase에 기록합니다.
// Vercel 서버리스 함수가 아니라 별도 실행 환경(GitHub Actions 등)에서 돌리는 걸 전제로 합니다.
// (헤드리스 브라우저는 Vercel 서버리스 환경과 궁합이 잘 안 맞고, 실행시간 제한에도 걸리기 쉬워요.)
//
// 실행: node scripts/run-place-rank-checks.js
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 선택 환경변수: PLACE_KEYWORD_ID — 값이 있으면 그 키워드 하나만 측정하고(웹 화면의
//   "지금 측정하기" 버튼이 이 방식으로 동작), 없으면(매일 스케줄 실행) 등록된 전체
//   활성 키워드를 측정합니다.

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");
const { PlaywrightPlaceRankProvider } = require("../lib/placeRank/PlaywrightPlaceRankProvider");

// 요청 사이에 간격을 두는 건 "예의 있는" 접근을 위한 것이지, 차단을 피하기 위한 우회가 아닙니다.
// (연속으로 너무 빠르게 요청을 보내지 않도록 하는 최소한의 배려)
const DELAY_BETWEEN_CHECKS_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadActiveKeywords(supabase) {
  const { data, error } = await supabase
    .from("place_keywords")
    .select("id, keyword, search_location, device, place_id, places(naver_place_id, name)")
    .eq("is_active", true);
  if (error) throw error;
  return data || [];
}

async function loadSingleKeyword(supabase, placeKeywordId) {
  const { data, error } = await supabase
    .from("place_keywords")
    .select("id, keyword, search_location, device, place_id, places(naver_place_id, name)")
    .eq("id", placeKeywordId)
    .maybeSingle();
  if (error) throw error;
  return data ? [data] : [];
}

async function saveResult(supabase, placeKeyword, result) {
  const { error } = await supabase.from("rank_checks").insert({
    place_keyword_id: placeKeyword.id,
    place_id: placeKeyword.place_id,
    keyword: placeKeyword.keyword,
    search_location: placeKeyword.search_location,
    device: placeKeyword.device,
    status: result.status,
    rank: result.rank,
    max_rank_checked: result.maxRankChecked,
    error_message: result.errorMessage,
    raw_top_results: result.topResults || null,
  });
  if (error) throw error;
}

async function main() {
  const supabase = getSupabaseAdmin();
  const provider = new PlaywrightPlaceRankProvider({ headless: true });

  const singleId = process.env.PLACE_KEYWORD_ID && process.env.PLACE_KEYWORD_ID.trim();
  const keywords = singleId ? await loadSingleKeyword(supabase, singleId) : await loadActiveKeywords(supabase);

  if (singleId && keywords.length === 0) {
    console.error(`PLACE_KEYWORD_ID=${singleId} 에 해당하는 키워드를 찾지 못했습니다.`);
    process.exit(1);
  }

  console.log(
    singleId ? `단건 측정 모드 — 대상: ${keywords.length}개` : `측정 대상 키워드: ${keywords.length}개`
  );

  const summary = { ok: 0, not_found: 0, blocked: 0, error: 0 };

  for (const pk of keywords) {
    const targetPlaceId = pk.places && pk.places.naver_place_id;
    const label = `[${pk.places ? pk.places.name : "?"}] "${pk.keyword}" (${pk.device})`;

    if (!targetPlaceId) {
      console.error(`${label} — 매장의 naver_place_id가 없어 건너뜁니다.`);
      summary.error++;
      await saveResult(supabase, pk, {
        status: "error",
        rank: null,
        maxRankChecked: null,
        errorMessage: "매장에 naver_place_id가 설정되어 있지 않습니다.",
      });
      continue;
    }

    console.log(`측정 중: ${label}`);
    let result;
    try {
      result = await provider.checkRank({
        keyword: pk.keyword,
        searchLocation: pk.search_location,
        device: pk.device,
        targetPlaceId,
      });
    } catch (err) {
      result = { status: "error", rank: null, maxRankChecked: null, errorMessage: err.message || String(err) };
    }

    console.log(`  → ${result.status}${result.rank ? ` (rank=${result.rank})` : ""}${result.errorMessage ? ` — ${result.errorMessage}` : ""}`);
    summary[result.status] = (summary[result.status] || 0) + 1;

    try {
      await saveResult(supabase, pk, result);
    } catch (err) {
      console.error(`  저장 실패: ${err.message}`);
    }

    await sleep(DELAY_BETWEEN_CHECKS_MS);
  }

  console.log("\n=== 측정 요약 ===");
  console.log(summary);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실행 중 오류:", err);
    process.exit(1);
  });
