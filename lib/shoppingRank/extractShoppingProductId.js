// 사용자가 붙여넣은 "상품 URL 또는 ID" 문자열에서 실제 매칭에 쓸 숫자 ID를 뽑아냅니다.
//
// ⚠️ 중요 — 네이버쇼핑은 확인된 실제 마크업 기준으로 ID 공간이 최소 3가지로 나뉩니다.
// 이 셋은 서로 다른 숫자 체계라 하나로 뭉쳐서 비교하면 안 됩니다:
//   1) nv_mid           — 개별(비카탈로그) 상품/광고의 네이버쇼핑 통합 상품 ID
//   2) catalog_nv_mid   — 카탈로그(여러 판매처가 묶인) 상품의 대표 ID.
//                         비카탈로그 개별 상품은 실제 샘플에서 nv_mid와 같은 값으로
//                         확인됐습니다.
//   3) chnl_prod_no     — 판매처(스마트스토어 등) 자신의 내부 상품 번호. 예를 들어
//                         smartstore.naver.com/스토어명/products/12345 URL의 12345가
//                         이 값입니다.
// 이 중 chnl_prod_no는 광고·개별 상품 항목에는 검색결과 데이터에 같이 들어있지만,
// 카탈로그형 상품(여러 판매처가 묶인 상품)에는 "어느 판매처의 번호인지"가 검색결과
// 데이터 자체에 없어서 이 값으로는 찾을 수 없습니다 — 사용자가 본인 스마트스토어 상품
// URL을 붙여넣었는데 그 상품이 카탈로그로 묶여 노출되는 경우, 지금 방식으로는 순위를
// 찾지 못할 수 있다는 뜻이에요(추측으로 매칭시키지 않고 "찾지 못했음"으로 정직하게
// 실패시킵니다).
//
// 그래서 이 함수는 입력값의 형태로 최대한 정확한 "공간(space)"을 판별하고, 판별이
// 안 되는 경우(순수 숫자만 입력 등)에는 space: "unknown"으로 반환해서, 호출하는 쪽이
// catalogNvMid/nvMid/chnlProdNo 세 필드를 모두 대상으로 매칭을 시도하도록 합니다.

function extractShoppingProductIdInput(raw) {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;

  // 1) 쿼리 파라미터 nvMid=숫자 (예: https://cr.shopping.naver.com/adcr?...&nvMid=88981781869)
  let m = value.match(/[?&]nvMid=(\d+)/i);
  if (m) return { value: m[1], space: "nv_mid" };

  // 2) 카탈로그 상세 페이지 경로 /catalog/숫자
  m = value.match(/\/catalog\/(\d+)/);
  if (m) return { value: m[1], space: "catalog_nv_mid" };

  // 3) 스마트스토어 개별 상품 URL — smartstore.naver.com/.../products/숫자
  if (/smartstore\.naver\.com/i.test(value)) {
    m = value.match(/\/products\/(\d+)/);
    if (m) return { value: m[1], space: "chnl_prod_no" };
  }

  // 4) URL이 아니라 순수 숫자만 입력한 경우 — 어느 ID 공간인지 알 수 없어서 "unknown"으로
  //    반환하고, 호출하는 쪽에서 세 필드를 모두 대상으로 매칭을 시도합니다.
  if (/^\d{5,}$/.test(value)) return { value, space: "unknown" };

  // 5) 그 외의 URL 형태 — 마지막 수단으로 URL 안에서 가장 긴 숫자열을 추출합니다
  //    (⚠️ 확인 필요: 이 경로는 확인된 샘플이 없어서 추측성 폴백입니다).
  const numMatches = value.match(/\d{5,}/g);
  if (numMatches && numMatches.length) {
    numMatches.sort((a, b) => b.length - a.length);
    return { value: numMatches[0], space: "unknown" };
  }

  return null;
}

module.exports = { extractShoppingProductIdInput };
