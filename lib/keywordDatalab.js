// 네이버 Search Trend(데이터랩 검색어트렌드) API — NAVER API HUB(네이버 클라우드 플랫폼)
// 절대 검색량이 아닌 "요청 구간 내 최고치를 100으로 한 상대 비율"을 제공합니다.
// 검색 API(블로그/뉴스/카페)와 같은 NCP Application에 Search Trend 상품을 추가로
// 이용 신청하면, 이미 쓰고 있는 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 그대로 조회할 수 있어요.
//
// 이 파일은 "원시 비율(raw ratio) 시계열"만 가져옵니다. 실제 건수로 환산하는 계산은
// keywordAnalysis.js에서, 검색광고 API의 절대 검색량(anchor)과 함께 처리합니다 —
// ratio는 요청 하나 안에서만 비교 가능한 상대값이라, 이 파일 안에서 서로 다른 요청의
// ratio끼리 더하거나 비교하는 계산은 하지 않습니다.
//
// ※ 성별·연령대별 검색 비율은 이 파일에서 아예 요청하지 않습니다. Search Trend API는
// 성별/연령대를 나눠 조회하려면 gender/ages 파라미터로 매번 별도 요청을 보내야 하는데,
// 그 ratio는 "그 요청 안에서" 최고값을 100으로 정규화한 상대값이라 서로 다른 요청끼리는
// 비교·합산할 수 없습니다(예: 남성 요청의 100과 여성 요청의 100은 서로 다른 기준입니다).
// 두 그룹을 같은 기준으로 비교할 수 있는 공개 API가 없어서, 정확하지 않은 값을 보여주는
// 대신 이 항목 자체를 제공하지 않기로 했습니다.

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

async function callDatalabOnce(keyword, { startDate, endDate, timeUnit, device }, clientId, clientSecret) {
  const body = {
    startDate,
    endDate,
    timeUnit,
    keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
  };
  if (device) body.device = device;

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
      `Search Trend 호출 실패 (status ${res.status})${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`
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

// 여러 요청을 동시에 쏟아내면 초당 호출 한도(rate limit)에 걸릴 수 있어, 이름을 붙인
// 작업들을 약간의 간격을 두고 순차 실행합니다. 각각 독립적으로 성공/실패를 기록해서,
// 하나가 실패해도 나머지 결과는 그대로 씁니다.
async function runNamedStaggered(namedTasks, delayMs = 150) {
  const out = {};
  for (const { name, task } of namedTasks) {
    try {
      out[name] = { ok: true, value: await task() };
    } catch (err) {
      out[name] = { ok: false, error: err };
    }
    if (delayMs) await sleep(delayMs);
  }
  return out;
}

function monthRange(monthsBack) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - (monthsBack - 1));
  start.setDate(1);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

// 최근 12개월(전체 / PC / 모바일) + 최근 84일(요일 집계용) —
// 필요한 원시 ratio 시계열을 모아옵니다. (총 4건, 순차 호출)
export async function fetchAllRawTrend(keyword) {
  if (!isDatalabConfigured()) {
    const err = { ok: false, error: Object.assign(new Error("NOT_CONFIGURED"), { code: "NOT_CONFIGURED" }) };
    return {
      overallMonthly: err,
      pcMonthly: err,
      moMonthly: err,
      daily: err,
    };
  }

  const { startDate: mStart, endDate: mEnd } = monthRange(12);
  const dayEnd = new Date();
  const dayStart = new Date(dayEnd);
  dayStart.setDate(dayStart.getDate() - 83);

  const tasks = [
    { name: "overallMonthly", task: () => callDatalab(keyword, { startDate: mStart, endDate: mEnd, timeUnit: "month" }) },
    { name: "pcMonthly", task: () => callDatalab(keyword, { startDate: mStart, endDate: mEnd, timeUnit: "month", device: "pc" }) },
    { name: "moMonthly", task: () => callDatalab(keyword, { startDate: mStart, endDate: mEnd, timeUnit: "month", device: "mo" }) },
    { name: "daily", task: () => callDatalab(keyword, { startDate: formatDate(dayStart), endDate: formatDate(dayEnd), timeUnit: "date" }) },
  ];

  const results = await runNamedStaggered(tasks);

  function toSection(key) {
    const r = results[key];
    return r.ok ? { ok: true, series: r.value } : { ok: false, error: r.error };
  }

  return {
    overallMonthly: toSection("overallMonthly"),
    pcMonthly: toSection("pcMonthly"),
    moMonthly: toSection("moMonthly"),
    daily: toSection("daily"),
  };
}
