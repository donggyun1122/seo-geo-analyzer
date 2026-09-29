// 브라우저에서 긁어온 결과 목록으로부터 순위를 계산하는 순수 함수들입니다.
// Playwright(브라우저 자동화) 의존성이 전혀 없어서, 실제 네이버 접속 없이도
// fixture 데이터로 테스트할 수 있습니다. (테스트는 scripts/../test에서)

// items: [{ placeId: string, name: string, isAd: boolean }] — 화면에 보이는 순서 그대로
// targetPlaceId: 찾으려는 매장의 고유 ID
//
// 광고(파워링크 성격의 홍보 노출)는 "자연 노출 순위"에서 제외합니다. 이름 문자열이 아니라
// placeId로만 매칭해서, 동명 매장이 여러 개 있어도 정확히 구분합니다.
function computeRank(items, targetPlaceId) {
  if (!targetPlaceId) {
    return { found: false, rank: null, totalOrganicScanned: 0 };
  }
  const organicItems = (items || []).filter((it) => it && !it.isAd && it.placeId);
  const idx = organicItems.findIndex((it) => it.placeId === targetPlaceId);
  if (idx === -1) {
    return { found: false, rank: null, totalOrganicScanned: organicItems.length };
  }
  return { found: true, rank: idx + 1, totalOrganicScanned: organicItems.length };
}

module.exports = { computeRank };
