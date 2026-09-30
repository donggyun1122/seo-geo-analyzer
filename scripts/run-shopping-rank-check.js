// "네이버 쇼핑 순위 체크" 화면에서 조회 버튼을 누르면 이 스크립트가 workflow_dispatch로
// 실행되어, 키워드 + 특정 상품이 광고/일반(광고 제외) 영역 중 선택한 쪽에서 몇 위인지
// 조회해서 Supabase에 기록합니다. keyword-place-list.js와 동일한 온디맨드 방식입니다.
//
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REQUEST_ID, KEYWORD,
//   PRODUCT_ID_INPUT (사용자가 붙여넣은 원본 URL/ID)
// 선택 환경변수: AREA_MODE (기본 organic), MAX_RANK (기본 200)

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");
const { PlaywrightShoppingRankProvider } = require("../lib/shoppingRank/PlaywrightShoppingRankProvider");
const { extractShoppingProductIdInput } = require("../lib/shoppingRank/extractShoppingProductId");

async function main() {
  const requestId = (process.env.REQUEST_ID || "").trim();
  const keyword = (process.env.KEYWORD || "").trim();
  const productIdInput = (process.env.PRODUCT_ID_INPUT || "").trim();
  const areaMode = process.env.AREA_MODE === "ad" ? "ad" : "organic";
  const maxRank = Number(process.env.MAX_RANK) || 200;

  if (!requestId || !keyword || !productIdInput) {
    console.error("REQUEST_ID, KEYWORD, PRODUCT_ID_INPUT은 모두 필수입니다.");
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  const parsed = extractShoppingProductIdInput(productIdInput);
  if (!parsed) {
    await supabase.from("shopping_rank_checks").insert({
      request_id: requestId,
      keyword,
      product_id_input: productIdInput,
      product_id_value: null,
      product_id_space: null,
      area_mode: areaMode,
      max_rank: maxRank,
      status: "error",
      error_message: "입력하신 값에서 상품 ID를 찾지 못했어요. 네이버쇼핑 상품 URL이나 숫자 ID를 입력해주세요.",
    });
    console.error("상품 ID 파싱 실패");
    process.exit(0);
    return;
  }

  console.log(`조회 중: "${keyword}" — ID ${parsed.value} (space=${parsed.space}, area=${areaMode})`);

  const provider = new PlaywrightShoppingRankProvider({ headless: true });
  let result;
  try {
    result = await provider.checkRank({
      keyword,
      targetIdValue: parsed.value,
      targetIdSpace: parsed.space,
      areaMode,
      maxRank,
    });
  } catch (err) {
    result = {
      status: "error",
      rank: null,
      matchedItem: null,
      maxRankChecked: null,
      errorMessage: err.message || String(err),
    };
  }

  console.log(
    `  → ${result.status}${result.rank ? ` (rank=${result.rank})` : ""}${
      result.errorMessage ? ` — ${result.errorMessage}` : ""
    }`
  );

  const { error } = await supabase.from("shopping_rank_checks").insert({
    request_id: requestId,
    keyword,
    product_id_input: productIdInput,
    product_id_value: parsed.value,
    product_id_space: parsed.space,
    area_mode: areaMode,
    max_rank: maxRank,
    status: result.status,
    error_message: result.errorMessage,
    rank: result.rank,
    max_rank_checked: result.maxRankChecked,
    matched_item: result.matchedItem || null,
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
