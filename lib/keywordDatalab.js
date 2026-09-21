// 네이버 데이터랩 검색어트렌드(Search Trend) API — NAVER API HUB(네이버 클라우드 플랫폼)
// 절대 검색량이 아닌 "구간 내 최고치를 100으로 한 상대 비율"을 제공합니다.
// 검색 API(블로그/뉴스/카페)와 같은 NCP Application에 "Search Trend" 상품을 추가로
// 이용 신청하면, 이미 쓰고 있는 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 그대로 조회할 수 있어요.
// (별도의 데이터랩 전용 키가 필요하지 않습니다.)

const ENDPOINT = "https://naveropenapi.apigw.ntruss.com/datalab/v1/search";

export function isDatalabConfigured() {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

async function callDatalab(keyword, { startDate, endDate, timeUnit, device, gender, ages }) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error("NOT_CONFIGURED");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const body = {
    startDate,
    endDate,
    timeUnit,
    keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
  };
  if (device) body.device = device;
  if (gender) body.gender = gender;
  if (ages) body.ages = ages;

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
      `데이터랩(Search Trend) API 호출 실패 (status ${res.status})${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`
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

// 연령대 그룹 (네이버 데이터랩 ages 코드: 1=0~12, 2=13~18, 3=19~24, 4=25~29,
// 5=30~34, 6=35~39, 7=40~44, 8=45~49, 9=50~54, 10=55~59, 11=60세 이상)
const AGE_GROUPS = [
  { label: "~18세", codes: ["1", "2"] },
  { label: "19~24세", codes: ["3"] },
  { label: "25~29세", codes: ["4"] },
  { label: "30대", codes: ["5", "6"] },
  { label: "40대", codes: ["7", "8"] },
  { label: "50대 이상", codes: ["9", "10", "11"] },
];

// 최근 3개월(월 단위) 기준 연령별/성별 검색 비율(%)
// (네이버 검색광고 키워드 도구 화면에서 보여주는 연령/성별 분포와 같은 데이터 소스예요.)
export async function fetchAgeGenderRatio(keyword) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 2);
  start.setDate(1);
  const startDate = formatDate(start);
  const endDate = formatDate(end);

  const [ageResults, maleSeries, femaleSeries] = await Promise.all([
    Promise.all(
      AGE_GROUPS.map((g) =>
        callDatalab(keyword, { startDate, endDate, timeUnit: "month", ages: g.codes })
      )
    ),
    callDatalab(keyword, { startDate, endDate, timeUnit: "month", gender: "m" }),
    callDatalab(keyword, { startDate, endDate, timeUnit: "month", gender: "f" }),
  ]);

  const ageSums = ageResults.map((series) => series.reduce((sum, d) => sum + d.ratio, 0));
  const ageTotal = ageSums.reduce((a, b) => a + b, 0) || 1;
  const byAge = AGE_GROUPS.map((g, i) => ({
    label: g.label,
    percent: Math.round((ageSums[i] / ageTotal) * 1000) / 10,
  }));

  const maleSum = maleSeries.reduce((sum, d) => sum + d.ratio, 0);
  const femaleSum = femaleSeries.reduce((sum, d) => sum + d.ratio, 0);
  const genderTotal = maleSum + femaleSum || 1;
  const byGender = [
    { label: "남성", percent: Math.round((maleSum / genderTotal) * 1000) / 10 },
    { label: "여성", percent: Math.round((femaleSum / genderTotal) * 1000) / 10 },
  ];

  return { byAge, byGender };
}
