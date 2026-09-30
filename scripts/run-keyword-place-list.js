// "키워드 분석" 기능 — 키워드 하나로 네이버 플레이스에서 노출되는 업체 목록을
// 순위/이름/카테고리/주소로 조회해서 Supabase에 저장합니다.
// place-rank-check와 마찬가지로 헤드리스 브라우저(Playwright)가 필요해서 Vercel
// 서버리스 함수가 아니라 이 스크립트를 GitHub Actions에서 실행합니다.
//
// 실행: node scripts/run-keyword-place-list.js
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REQUEST_ID, KEYWORD
// 선택 환경변수: DEVICE (기본값 "mobile"), MAX_RANK (기본값 "50")

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");
const { PlaywrightPlaceRankProvider } = require("../lib/placeRank/PlaywrightPlaceRankProvider");

async function main() {
  const requestId = (process.env.REQUEST_ID || "").trim();
  const keyword = (process.env.KEYWORD || "").trim();
  const device = (process.env.DEVICE || "mobile").trim() === "pc" ? "pc" : "mobile";
  const maxRank = parseInt(process.env.MAX_RANK || "50", 10) || 50;

  if (!requestId) {
    console.error("REQUEST_ID 환경변수가 필요합니다.");
    process.exit(1);
  }
  if (!keyword) {
    console.error("KEYWORD 환경변수가 필요합니다.");
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();
  const provider = new PlaywrightPlaceRankProvider({ headless: true });

  console.log(`키워드 분석 시작: "${keyword}" (${device}, 최대 ${maxRank}개)`);

  let result;
  try {
    result = await provider.listPlaces({ keyword, device, maxRank });
  } catch (err) {
    result = { status: "error", items: [], errorMessage: err.message || String(err) };
  }

  console.log(
    `  → ${result.status} (${(result.items || []).length}개)${result.errorMessage ? ` — ${result.errorMessage}` : ""}`
  );

  const { error } = await supabase.from("keyword_place_lists").insert({
    request_id: requestId,
    keyword,
    device,
    max_rank: maxRank,
    status: result.status,
    error_message: result.errorMessage || null,
    results: result.items || [],
  });

  if (error) {
    console.error("저장 실패:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실행 중 오류:", err);
    process.exit(1);
  });
