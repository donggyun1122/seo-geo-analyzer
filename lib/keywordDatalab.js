// 네이버 데이터랩(DataLab) 검색어트렌드 API
// 절대 검색량이 아닌 "구간 내 최고치를 100으로 한 상대 비율"을 제공합니다.
// developers.naver.com(네이버 개발자센터)에서 별도로 등록하는 애플리케이션의
// Client ID/Secret이 필요합니다 (검색 API용으로 이미 등록한 API HUB 키와는 다른 값이에요).
// 필요한 환경변수: NAVER_DATALAB_CLIENT_ID, NAVER_DATALAB_CLIENT_SECRET

const ENDPOINT = "https://openapi.naver.com/v1/datalab/search";

export function isDatalabConfigured() {
  return Boolean(process.env.NAVER_DATALAB_CLIENT_ID && process.env.NAVER_DATALAB_CLIENT_SECRET);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

async function callDatalab(keyword, { startDate, endDate, timeUnit }) {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error("NOT_CONFIGURED");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      timeUnit,
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(
      `데이터랩 API 호출 실패 (status ${res.status})${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`
    );
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const series = data.results && data.results[0] ? data.results[0].data : [];
  return series.map((d) => ({ period: d.period, ratio: d.ratio }));
}

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월",
];
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 최근 12개월 검색량 트렌드 (월 단위 상대 비율) + 월별 검색 비율(전체 합 대비 %)
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
