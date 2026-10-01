// "검색광고 분석 > 키워드 노출분석" — 우리 사이트 URL + 키워드를 받아서, 네이버 파워링크에서
// 우리 광고가 PC/모바일 각각 몇 위에 노출되는지 확인해서 Supabase(search_ad_rank_checks)에 기록합니다.
// 노출 광고 현황과 같은 PlaywrightSearchAdProvider를 쓰고, 우리 광고를 찾으면 그 자리에서 페이지 넘김을
// 멈춰요(stopWhen). 못 찾으면 마지막 페이지까지 다 본 뒤 "노출 안 됨"으로 기록해요.
//
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REQUEST_ID, KEYWORD
// SITE_URL(우리 사이트 주소)과 ADVERTISER_NAME(광고주명/업체명) 중 하나 이상 필요 — 둘 다 있으면
// 둘 중 하나라도 맞는 광고를 우리 광고로 봐요. 모바일 플레이스 랜딩 광고는 주소에 업체 ID가 없어서
// 광고주명으로만 찾을 수 있어요.

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");
const { PlaywrightSearchAdProvider } = require("../lib/searchAd/PlaywrightSearchAdProvider");
const { adMatchesSite, adMatchesAdvertiser } = require("../lib/searchAd/siteMatch");

const DEVICES = ["pc", "mobile"];
const DELAY_BETWEEN_DEVICES_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDevice(provider, keyword, siteUrl, advertiserName, device) {
  const isOurs = (ad) => (siteUrl && adMatchesSite(ad, siteUrl)) || (advertiserName && adMatchesAdvertiser(ad, advertiserName));
  let r;
  try {
    r = await provider.listAds({ keyword, device, stopWhen: isOurs });
  } catch (err) {
    return { status: "error", errorMessage: err.message || String(err) };
  }
  if (r.status === "ok") {
    const base = {
      device,
      rankSource: r.rankSource,
      pagesFetched: r.pagesFetched,
      scannedAds: r.items.length,
      loadSummary: r.loadSummary || null,
      note: r.errorMessage || null,
    };
    if (r.moreButton) console.log(`  (모바일 더보기 버튼: ${r.moreButton})`);
    if (r.found) {
      const ad = r.items.find((it) => it.matched) || r.items[r.items.length - 1];
      return { status: "found", rank: ad.rank, page: ad.page, pageLabel: ad.pageLabel || null, ad, ...base };
    }
    return { status: "not_found", rank: null, ...base };
  }
  // empty(그 키워드에 광고 자체가 없음) / blocked / error
  return { status: r.status, device, rank: null, pagesFetched: r.pagesFetched || 0, scannedAds: 0, errorMessage: r.errorMessage };
}

async function main() {
  const requestId = (process.env.REQUEST_ID || "").trim();
  const keyword = (process.env.KEYWORD || "").trim();
  const siteUrl = (process.env.SITE_URL || "").trim();
  const advertiserName = (process.env.ADVERTISER_NAME || "").trim();
  if (!requestId || !keyword || (!siteUrl && !advertiserName)) {
    console.error("REQUEST_ID, KEYWORD와 SITE_URL/ADVERTISER_NAME 중 하나는 필수입니다.");
    process.exit(1);
  }

  const provider = new PlaywrightSearchAdProvider({ headless: true });
  const results = {};
  for (let i = 0; i < DEVICES.length; i++) {
    const device = DEVICES[i];
    if (i > 0) await sleep(DELAY_BETWEEN_DEVICES_MS);
    console.log(`[${device}] "${keyword}"에서 ${[siteUrl, advertiserName].filter(Boolean).join(" / ")} 광고 찾는 중...`);
    results[device] = await checkDevice(provider, keyword, siteUrl, advertiserName, device);
    const d = results[device];
    console.log(`  → ${d.status}${d.rank ? ` ${d.rank}위(${d.page}페이지)` : ""} · 확인한 광고 ${d.scannedAds || 0}개${d.errorMessage ? ` — ${d.errorMessage}` : ""}`);
  }

  const allFailed = DEVICES.every((d) => results[d].status === "error" || results[d].status === "blocked");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("search_ad_rank_checks").insert({
    request_id: requestId,
    keyword,
    site_url: siteUrl || "",
    advertiser_name: advertiserName || null,
    status: allFailed ? "error" : "ok",
    error_message: allFailed ? DEVICES.map((d) => `${d}: ${results[d].errorMessage || results[d].status}`).join(" / ") : null,
    results,
  });
  if (error) {
    console.error("저장 실패:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실행 중 오류:", err);
    process.exit(1);
  });
