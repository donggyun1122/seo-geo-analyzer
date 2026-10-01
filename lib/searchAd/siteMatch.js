// 광고의 "사이트"를 판별하는 도우미 — 두 곳에서 씁니다.
//  1) 노출 광고 현황: 같은 사이트의 광고가 여러 번 잡히면(문안만 다른 광고) 하나로 합치기
//  2) 키워드 노출분석: 사용자가 입력한 "우리 사이트 URL"과 같은 사이트의 광고를 찾기
//
// 원칙
//  - 표시 URL(예: hotelscombined.co.kr/, smartstore.naver.com/lottehotel_ecoupon)을 기준으로 해요.
//  - 앞의 http(s)://, www., m. 과 끝의 / 는 무시해요(모바일 표시 URL이 m. 으로 시작할 수 있어서).
//  - 스마트스토어처럼 여러 업체가 같은 도메인을 쓰는 곳은 도메인만으로는 구분이 안 되니까,
//    첫 번째 경로(스토어 이름)까지 같아야 같은 사이트로 봐요.
//  - 플레이스 랜딩 광고(파워링크인데 클릭하면 네이버 플레이스로 가는 광고)는 표시 URL이 업체 구분이 안
//    되는 공용 주소예요 — PC "map.naver.com/p", 모바일 "m.place.naver.com/accommodation"(✅ 둘 다 실제
//    샘플로 확인). PC는 실제 랜딩 주소에 플레이스 ID(/entry/place/1763456372)가 있어서 그걸로 구분하고,
//    모바일은 랜딩 주소 자체가 HTML에 없어서 광고주명(예: 몬스마리양평)으로 구분해요.

// 여러 업체가 같은 도메인을 함께 쓰는 플랫폼 — 경로 첫 부분(스토어명)까지 봐야 구분돼요.
const SHARED_PLATFORM_HOSTS = [
  "smartstore.naver.com",
  "brand.naver.com",
  "shopping.naver.com",
  "blog.naver.com",
  "cafe.naver.com",
  "m.smartstore.naver.com",
  "m.brand.naver.com",
  "m.blog.naver.com",
  "m.cafe.naver.com",
  "instagram.com",
  "linktr.ee",
];

// 네이버 지도/플레이스 — 경로로도 업체 구분이 안 되고(map.naver.com/p), 플레이스 ID로만 구분돼요.
const PLACE_HOSTS = ["map.naver.com", "place.naver.com", "pcmap.place.naver.com", "naver.me"];

function parseSite(raw) {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, ""); // http:// https://
  s = s.split(/[?#]/)[0];
  const slash = s.indexOf("/");
  let host = slash === -1 ? s : s.slice(0, slash);
  const path = slash === -1 ? "" : s.slice(slash + 1);
  host = host.replace(/:\d+$/, "").replace(/\.+$/, "");
  if (!host || host.indexOf(".") === -1) return null;
  const fullHost = host;
  host = host.replace(/^(www|m)\./, "");
  const firstSegment = path.split("/").filter(Boolean)[0] || "";
  const shared = SHARED_PLATFORM_HOSTS.includes(fullHost) || SHARED_PLATFORM_HOSTS.includes(host);
  const isPlaceHost = PLACE_HOSTS.includes(fullHost) || PLACE_HOSTS.includes(host);
  return { host, path, firstSegment, shared, isPlaceHost };
}

// 네이버 지도/플레이스 주소에서 플레이스 ID를 뽑습니다
// 예: https://map.naver.com/p/entry/place/1763456372, https://m.place.naver.com/restaurant/1234/home
function placeIdOf(raw) {
  const p = parseSite(raw);
  if (!p || !p.isPlaceHost) return null;
  const m =
    p.path.match(/(?:^|\/)place\/(\d+)/) ||
    p.path.match(/(?:^|\/)(?:restaurant|hairshop|accommodation|hospital|attraction|cafe|nailshop|beauty)\/(\d+)/);
  return m ? m[1] : null;
}

// 같은 사이트인지 비교할 때 쓰는 키(문자열). 업체를 구분할 수 없는 주소(플레이스 공용 주소,
// 스토어명 없는 스마트스토어 주소)는 null — 이런 주소로 서로 다른 업체를 묶어버리지 않도록.
function siteKeyOf(raw) {
  const pid = placeIdOf(raw);
  if (pid) return `place:${pid}`;
  const p = parseSite(raw);
  if (!p || p.isPlaceHost) return null;
  if (p.shared) return p.firstSegment ? `${p.host}/${p.firstSegment}` : null;
  return p.host;
}

// 광고 1건의 사이트 키 — 플레이스 ID → 표시 URL → 실제 랜딩 주소 → 광고주명 순
function adSiteKey(ad) {
  const pid = placeIdOf(ad.landingUrl) || placeIdOf(ad.displayUrl);
  if (pid) return `place:${pid}`;
  return siteKeyOf(ad.displayUrl) || siteKeyOf(ad.landingUrl) || (ad.advertiser ? `name:${ad.advertiser}` : null) || ad.adId || null;
}

// 사용자가 입력한 "우리 사이트"와 광고가 같은 사이트인지
//  - 네이버 플레이스 주소를 넣은 경우: 플레이스 ID가 같아야 같은 광고
//  - 일반 도메인: 같은 도메인이거나, 한쪽이 다른 쪽의 하위 도메인이면 같은 사이트
//    (예: 입력 mysite.co.kr ↔ 광고 shop.mysite.co.kr)
//  - 공유 플랫폼(스마트스토어 등): 도메인 + 스토어명까지 같아야 같은 사이트
function adMatchesSite(ad, siteInput) {
  const targetPlace = placeIdOf(siteInput);
  if (targetPlace) {
    return [ad.landingUrl, ad.displayUrl].some((u) => placeIdOf(u) === targetPlace);
  }
  const target = parseSite(siteInput);
  if (!target || target.isPlaceHost) return false;
  const candidates = [ad.displayUrl, ad.landingUrl].map(parseSite).filter((c) => c && !c.isPlaceHost);
  return candidates.some((c) => {
    if (target.shared || c.shared) {
      return c.host === target.host && !!target.firstSegment && c.firstSegment === target.firstSegment;
    }
    return c.host === target.host || c.host.endsWith("." + target.host) || target.host.endsWith("." + c.host);
  });
}

// 플레이스 랜딩 광고인지 — 표시 URL이나 랜딩 주소가 네이버 지도/플레이스 주소
function isPlaceLanding(ad) {
  return [ad.displayUrl, ad.landingUrl].some((u) => {
    const p = parseSite(u);
    return !!(p && p.isPlaceHost);
  });
}

// 광고주명 비교용 정리(공백/대소문자 무시)
function normName(name) {
  return (name || "").replace(/\s+/g, "").toLowerCase();
}

// 사용자가 입력한 업체명(광고주명)과 광고의 광고주명이 같은지 — 모바일 플레이스 랜딩 광고처럼
// 주소로는 우리 광고를 특정할 수 없을 때 쓰는 보조 기준이에요(정확히 같은 이름일 때만).
function adMatchesAdvertiser(ad, name) {
  const want = normName(name);
  return !!want && normName(ad.advertiser) === want;
}

module.exports = {
  parseSite,
  placeIdOf,
  siteKeyOf,
  adSiteKey,
  adMatchesSite,
  isPlaceLanding,
  adMatchesAdvertiser,
  SHARED_PLATFORM_HOSTS,
  PLACE_HOSTS,
};
