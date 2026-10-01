// "검색광고 분석" 화면에서 키워드를 검색하면 이 스크립트가 GitHub Actions(workflow_dispatch)로
// 실행되어, 그 키워드로 노출되는 파워링크 광고 목록을 조회해서 Supabase에 기록합니다.
// (keyword-place-list와 같은 온디맨드 방식)
//
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REQUEST_ID, KEYWORD

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");
const { PlaywrightSearchAdProvider } = require("../lib/searchAd/PlaywrightSearchAdProvider");

async function main() {
  const requestId = (process.env.REQUEST_ID || "").trim();
  const keyword = (process.env.KEYWORD || "").trim();
  if (!requestId || !keyword) {
    console.error("REQUEST_ID와 KEYWORD는 필수입니다.");
    process.exit(1);
  }

  console.log(`검색광고 조회 중: "${keyword}"`);
  const provider = new PlaywrightSearchAdProvider({ headless: true });
  let result;
  try {
    result = await provider.listAds({ keyword });
  } catch (err) {
    result = { status: "error", items: [], errorMessage: err.message || String(err) };
  }
  console.log(`  → ${result.status} (광고 ${result.items.length}개)${result.errorMessage ? ` — ${result.errorMessage}` : ""}`);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("search_ad_lists").insert({
    request_id: requestId,
    keyword,
    status: result.status,
    error_message: result.errorMessage,
    results: result.items,
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
