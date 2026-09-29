// 순위 수집 방식을 나중에 바꿀 수 있도록 만든 추상 인터페이스입니다.
// 지금은 PlaywrightPlaceRankProvider(브라우저 자동화) 하나만 구현체로 두지만,
// 나중에 "사용자 직접 입력" 방식이나 상용 API 연동으로 바꾸더라도
// checkRank()의 입출력 형태만 지키면 나머지 코드(실행 스크립트, API, UI)는 그대로 씁니다.
//
// 절대 이 인터페이스에 "우회"를 위한 옵션(프록시 로테이션, 캡차 자동 풀이 등)을 추가하지 마세요.
// 구현체가 네이버의 접근 제한에 부딪히면 status: "blocked"로 정직하게 보고하고 끝내야 합니다.

/**
 * @typedef {Object} RankCheckRequest
 * @property {string} keyword          검색 키워드 (예: "강남역 맛집")
 * @property {string|null} searchLocation  검색 기준 위치 (지역명 또는 좌표, 선택)
 * @property {'mobile'|'pc'} device    어떤 화면 기준으로 검색했는지
 * @property {string} targetPlaceId    찾으려는 매장의 네이버 플레이스 고유 ID (이름 문자열 아님)
 * @property {number} [maxRank]        몇 위까지 확인할지 (기본 50)
 *
 * @typedef {Object} RankCheckResult
 * @property {'ok'|'not_found'|'blocked'|'error'} status
 *   - ok: 순위를 정상적으로 찾음
 *   - not_found: maxRank 안에서 매장을 못 찾음 (그 밖의 순위일 가능성)
 *   - blocked: 네이버가 자동화된 접근으로 판단해 결과를 막음 — 절대 우회하지 않고 그대로 보고
 *   - error: 그 외 기술적 오류(타임아웃, 페이지 구조 변경 등)
 * @property {number|null} rank            status='ok'일 때만 값이 있음 (1부터 시작, 광고 제외 자연 순위)
 * @property {number|null} maxRankChecked  실제로 몇 위까지 스캔했는지
 * @property {string|null} errorMessage
 * @property {Array<{placeId:string,name:string,rank:number|null}>} [topResults]
 */

class PlaceRankProvider {
  /**
   * @param {RankCheckRequest} request
   * @returns {Promise<RankCheckResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async checkRank(request) {
    throw new Error("PlaceRankProvider.checkRank()는 하위 클래스에서 구현해야 합니다.");
  }
}

module.exports = { PlaceRankProvider };
