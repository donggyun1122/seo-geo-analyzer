// 네이버 데이터랩 검색어트렌드(Search Trend) API — NAVER API HUB(네이버 클라우드 플랫폼)
// 절대 검색량이 아닌 "요청 구간 내 최고치를 100으로 한 상대 비율"을 제공합니다.
// 검색 API(블로그/뉴스/카페)와 같은 NCP Application에 "Search Trend" 상품을 추가로
// 이용 신청하면, 이미 쓰고 있는 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 그대로 조회할 수 있어요.
// (별도의 데이터랩 전용 키가 필요하지 않습니다.)
//
// ⚠️ ratio는 "같은 한 번의 요청 안에서" 최고값을 100으로 정규화한 값이라,
// 서로 다른 요청(예: 성별을 m/f로 나눠 각각 호출)의 ratio끼리는 절대 합산·비교할 수 없습니다.
// 그래서 이 파일은 "한 번의 요청으로 받은 시계열 안에서" 비율을 계산하는 월별/요일별 비율만
// 제공하고, 별도 요청을 여러 번 나눠 호출해야 하는 연령별/성별 비율은 제공하지 않습니다.

const ENDPOINT = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";

export function isDatalabConfigured() {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callDatalabOnce(keyword, { startDate, endDate, timeUnit }, clientId, clientSecret) {
  const body = {
    startDate,
    endDate,
    timeUnit,
    keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(
      `데이터랩(Search Trend) API 호출 실패 (status ${res.status})${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`
    );
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const series = data.results && data.results[0] ? data.results[0].data : [];
  return series.map((d) => ({ period: d.period, ratio: d.ratio }));
}

// 초당 호출 한도(429)에 걸린 경우 한 번 더 재시도합니다.
async function callDatalab(keyword, params) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error("NOT_CONFIGURED");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  try {
    return await callDatalabOnce(keyword, params, clientId, clientSecret);
  } catch (err) {
    if (err.status === 429 || err.status === 503) {
      await sleep(600);
      return callDatalabOnce(keyword, params, clientId, clientSecret);
    }
    throw err;
  }
}

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월",
];
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 최근 12개월 검색량 트렌드 (월 단위 상대 비율) + 월별 검색 비율(전체 합 대비 %)
// — 한 번의 요청으로 받은 12개월 시계열이라 서로 비율을 비교/합산해도 정확합니다.
export async function fetchMonthlyTrend(keyword) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 11);
  start.setDate(1);

  const series = await callDatalab(keyword, {
    startDate: formatDate(start),
    endDate: formatDate(end),
    timeUnit: "month",
  });

  const trend = series.map((d) => {
    const dt = new Date(d.period);
    return {
      period: d.period,
      label: `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}`,
      monthLabel: MONTH_LABELS[dt.getMonth()],
      ratio: d.ratio,
    };
  });

  const ratioSum = trend.reduce((sum, d) => sum + d.ratio, 0) || 1;
  const byMonth = trend.map((d) => ({
    label: d.monthLabel,
    percent: Math.round((d.ratio / ratioSum) * 1000) / 10,
  }));

  return { trend, byMonth };
}

// 최근 약 12주(84일)의 일 단위 데이터를 요일별로 묶어 상대 비율(%)을 계산합니다.
// — 이것도 한 번의 요청으로 받은 하나의 시계열 안에서만 집계하므로 정확합니다.
// (데이터랩은 요일별 통계를 직접 제공하지 않아, 일 단위 원시 비율을 직접 집계한 값이에요.)
export async function fetchWeekdayRatio(keyword) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 83);

  const series = await callDatalab(keyword, {
    startDate: formatDate(start),
    endDate: formatDate(end),
    timeUnit: "date",
  });

  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  series.forEach((d) => {
    const dt = new Date(d.period);
    const wd = dt.getDay();
    sums[wd] += d.ratio;
    counts[wd] += 1;
  });

  const averages = sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0));
  const avgSum = averages.reduce((a, b) => a + b, 0) || 1;

  // 월요일부터 시작하도록 정렬 (일 0 -> 맨 뒤로)
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((wd) => ({
    label: `${WEEKDAY_LABELS[wd]}요일`,
    percent: Math.round((averages[wd] / avgSum) * 1000) / 10,
  }));
}
