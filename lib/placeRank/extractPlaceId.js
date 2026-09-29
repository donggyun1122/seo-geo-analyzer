// 네이버 플레이스 URL/링크에서 고유 식별자(숫자 ID)를 뽑아냅니다.
// 업종별로 URL 경로가 다릅니다 (음식점=restaurant, 미용실=hairshop, 숙박=accommodation, 병원=hospital 등).
// 새로운 업종 경로를 만나면 이 배열에 패턴을 추가하면 됩니다.
const PLACE_ID_PATTERNS = [
  /\/place\/(\d+)/,
  /\/restaurant\/(\d+)/,
  /\/hairshop\/(\d+)/,
  /\/accommodation\/(\d+)/,
  /\/hospital\/(\d+)/,
  /\/attraction\/(\d+)/,
  /\/cafe\/(\d+)/,
];

// "https://m.place.naver.com/restaurant/1234567890/home?..." 같은 URL이나
// href 속성 값에서 순수 숫자 ID만 뽑아냅니다. 매칭되는 패턴이 없으면 null.
function extractPlaceIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  for (const re of PLACE_ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

module.exports = { extractPlaceIdFromUrl, PLACE_ID_PATTERNS };
