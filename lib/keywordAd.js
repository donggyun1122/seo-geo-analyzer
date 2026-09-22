// 네이버 검색광고(Search Ad) API — 키워드 도구(keywordstool)
// 월간 검색량(PC/모바일), 연관 키워드, 광고 경쟁정도, 월평균 클릭수/클릭률,
// 평균 노출 광고 수를 제공합니다.
// (네이버 API HUB의 블로그/뉴스/카페 검색 API와는 완전히 별개의 서비스로,
//  searchad.naver.com 에서 별도로 발급받는 자격 증명이 필요합니다.)
// 필요한 환경변수: NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID

import crypto from "crypto";

const BASE_URL = "https://api.searchad.naver.com";
const URI = "/keywordstool";

function buildSignature(timestamp, method, uri, secretKey) {
  const message = `${timestamp}.${method}.${uri}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

// "< 10" 같은 문자열 값을 화면 표시용 라벨과 정렬용 숫자로 함께 변환합니다.
function parseVolume(raw) {
  if (raw === null || raw === undefined) return { value: 0, label: "-" };
  if (typeof raw === "number") return { value: raw, label: raw.toLocaleString("ko-KR") };
  const s = String(raw).trim();
  if (s.startsWith("<")) {
    // "< 10" -> 정렬용으로는 5로 취급, 화면에는 원문 그대로 표시
    return { value: 5, label: "10 미만" };
  }
  const n = Number(s.replace(/,/g, ""));
  return { value: isNaN(n) ? 0 : n, label: isNaN(n) ? s : n.toLocaleString("ko-KR") };
}

// 월평균 클릭수는 소수점이 있는 값(예: 12.3)으로 오는 경우가 있어 소수 첫째자리까지 표시합니다.
function parseClickCount(raw) {
  if (raw === null || raw === undefined) return { value: 0, label: "-" };
  if (typeof raw === "number") {
    return { value: raw, label: raw.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) };
  }
  const s = String(raw).trim();
  if (s.startsWith("<")) return { value: 5, label: "10 미만" };
  const n = Number(s.replace(/,/g, ""));
  return {
    value: isNaN(n) ? 0 : n,
    label: isNaN(n) ? s : n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }),
  };
}

// 월평균 클릭률(%) — 예: 1.23 -> "1.23%"
function parseCtr(raw) {
  if (raw === null || raw === undefined) return { value: 0, label: "-" };
  const n = Number(raw);
  return { value: isNaN(n) ? 0 : n, label: isNaN(n) ? String(raw) : `${n.toFixed(2)}%` };
}

// 평균 노출 광고 수(정수) — 예: 15 -> "15개"
function parseAdDepth(raw) {
  if (raw === null || raw === undefined) return { value: null, label: "-" };
  const n = Number(raw);
  return { value: isNaN(n) ? null : n, label: isNaN(n) ? "-" : `${n.toLocaleString("ko-KR")}개` };
}

export function isKeywordAdConfigured() {
  return Boolean(
    process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET_KEY && process.env.NAVER_AD_CUSTOMER_ID
  );
}

// hintKeywords로 조회한 원본 키워드 + 연관 키워드 목록을 반환합니다.
// 반환된 배열의 각 항목: { keyword, isSeed, pcCount, mobileCount, totalCount, pcLabel, mobileLabel,
//   compIdx, pcClickCount, mobileClickCount, pcClickLabel, mobileClickLabel,
//   pcCtr, mobileCtr, pcCtrLabel, mobileCtrLabel, adDepth, adDepthLabel }
export async function fetchRelatedKeywords(rawKeyword) {
  const keyword = (rawKeyword || "").trim();
  if (!keyword) throw new Error("키워드를 입력해주세요.");

  const apiKey = process.env.NAVER_AD_API_KEY;
  const secretKey = process.env.NAVER_AD_SECRET_KEY;
  const customerId = process.env.NAVER_AD_CUSTOMER_ID;
  if (!apiKey || !secretKey || !customerId) {
    const err = new Error("NOT_CONFIGURED");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  // 검색광고 API는 공백을 제거한 키워드만 허용합니다.
  const hint = keyword.replace(/\s+/g, "");
  const timestamp = Date.now().toString();
  const signature = buildSignature(timestamp, "GET", URI, secretKey);

  const url = `${BASE_URL}${URI}?hintKeywords=${encodeURIComponent(hint)}&showDetail=1`;
  const res = await fetch(url, {
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": apiKey,
      "X-Customer": customerId,
      "X-Signature": signature,
    },
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(
      `검색량 조회 실패 (status ${res.status})${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`
    );
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const list = Array.isArray(data.keywordList) ? data.keywordList : [];

  return list.map((item, idx) => {
    const pc = parseVolume(item.monthlyPcQcCnt);
    const mobile = parseVolume(item.monthlyMobileQcCnt);
    const pcClick = parseClickCount(item.monthlyAvePcClkCnt);
    const mobileClick = parseClickCount(item.monthlyAveMobileClkCnt);
    const pcCtr = parseCtr(item.monthlyAvePcCtr);
    const mobileCtr = parseCtr(item.monthlyAveMobileCtr);
    const adDepth = parseAdDepth(item.plAvgDepth);
    return {
      keyword: item.relKeyword,
      isSeed: idx === 0,
      pcCount: pc.value,
      mobileCount: mobile.value,
      pcLabel: pc.label,
      mobileLabel: mobile.label,
      totalCount: pc.value + mobile.value,
      compIdx: item.compIdx || "-",
      pcClickCount: pcClick.value,
      mobileClickCount: mobileClick.value,
      pcClickLabel: pcClick.label,
      mobileClickLabel: mobileClick.label,
      pcCtr: pcCtr.value,
      mobileCtr: mobileCtr.value,
      pcCtrLabel: pcCtr.label,
      mobileCtrLabel: mobileCtr.label,
      adDepth: adDepth.value,
      adDepthLabel: adDepth.label,
    };
  });
}
