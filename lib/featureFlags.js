// 기능 노출 스위치. 값을 true로 바꾸면 해당 기능이 메뉴/화면/API에 다시 나타납니다.
//
// SHOPPING_ENABLED (2026-10-01 false로 변경)
//   네이버 쇼핑 분석(키워드 분석 / 순위 체크)은 네이버 쇼핑 검색이 자동화 접근을 차단(캡차)해서
//   현재 데이터를 가져올 수 없는 상태라, 대장님 요청으로 일단 전부 미노출 처리했습니다.
//   코드는 지우지 않고 그대로 두었어요 — 나중에 다시 켜려면 여기만 true로 바꾸고,
//   .github/workflows/shopping-keyword-analysis.yml 의 schedule(매일 자동 실행)도 다시 살리면 돼요.
const SHOPPING_ENABLED = false;

module.exports = { SHOPPING_ENABLED };
