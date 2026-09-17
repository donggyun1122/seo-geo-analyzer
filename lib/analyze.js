const cheerio = require("cheerio");

const FETCH_TIMEOUT_MS = 9000;
const UA =
  "Mozilla/5.0 (compatible; SEOGeoAnalyzer/1.0; +https://example.com/bot)";

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { promise: promise(controller.signal), controller, cleanup: () => clearTimeout(timer) };
}

async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
    return res;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(input) {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  return url;
}

function countWords(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

function makeCheck(id, label, weight, pass, detail) {
  return { id, label, weight, pass: !!pass, detail };
}

function categoryScore(checks) {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  const score = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100);
  return { checks, score };
}

async function analyzeUrl(rawUrl) {
  const targetUrl = normalizeUrl(rawUrl);
  const origin = new URL(targetUrl).origin;

  const mainRes = await safeFetch(targetUrl);
  if (!mainRes) {
    return {
      ok: false,
      error:
        "사이트에 접속할 수 없었습니다. URL 주소가 정확한지, 사이트가 정상 작동 중인지 확인해주세요.",
      targetUrl,
    };
  }

  const finalUrl = mainRes.url || targetUrl;
  const html = await mainRes.text().catch(() => "");
  const headers = mainRes.headers;
  const $ = cheerio.load(html || "");

  // ---- Fetch supporting resources in parallel ----
  const [robotsRes, sitemapRes] = await Promise.all([
    safeFetch(new URL("/robots.txt", origin).toString()),
    safeFetch(new URL("/sitemap.xml", origin).toString(), { method: "GET" }),
  ]);
  const robotsTxt = robotsRes && robotsRes.ok ? await robotsRes.text().catch(() => "") : "";

  // ================= CONTENT SEO =================
  const titleText = $("title").first().text().trim();
  const metaDescription = $('meta[name="description"]').attr("content") || "";
  const h1Count = $("h1").length;
  const h2Count = $("h2").length;
  const imgs = $("img");
  const imgsWithAlt = imgs.filter((_, el) => {
    const alt = $(el).attr("alt");
    return alt && alt.trim().length > 0;
  });
  const bodyText = $("body").clone().find("script,style,noscript").remove().end().text();
  const wordCount = countWords(bodyText);
  const links = $("a[href]");
  let internalLinks = 0;
  links.each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.startsWith("/") || href.includes(new URL(origin).hostname)) internalLinks++;
  });

  const contentSeo = categoryScore([
    makeCheck(
      "title",
      "Title 태그",
      10,
      titleText.length >= 10 && titleText.length <= 60,
      titleText
        ? `현재 제목: "${titleText}" (${titleText.length}자, 권장 10~60자)`
        : "title 태그가 없습니다."
    ),
    makeCheck(
      "meta_description",
      "Meta Description",
      10,
      metaDescription.length >= 50 && metaDescription.length <= 160,
      metaDescription
        ? `현재 길이: ${metaDescription.length}자 (권장 50~160자)`
        : "meta description이 없습니다."
    ),
    makeCheck(
      "h1",
      "H1 태그 (1개 권장)",
      8,
      h1Count === 1,
      `현재 H1 개수: ${h1Count}개`
    ),
    makeCheck(
      "heading_structure",
      "제목 계층 구조 (H2 이상 사용)",
      5,
      h2Count > 0,
      `현재 H2 개수: ${h2Count}개`
    ),
    makeCheck(
      "image_alt",
      "이미지 alt 텍스트",
      8,
      imgs.length === 0 || imgsWithAlt.length / imgs.length >= 0.8,
      imgs.length === 0
        ? "이미지가 없습니다."
        : `alt 텍스트 보유율: ${Math.round((imgsWithAlt.length / imgs.length) * 100)}% (${imgsWithAlt.length}/${imgs.length})`
    ),
    makeCheck(
      "content_length",
      "본문 콘텐츠 분량",
      7,
      wordCount >= 300,
      `본문 단어 수(추정): 약 ${wordCount}개 (권장 300개 이상)`
    ),
    makeCheck(
      "internal_links",
      "내부 링크",
      5,
      internalLinks >= 1,
      `내부 링크 수(추정): ${internalLinks}개`
    ),
  ]);

  // ================= TECHNICAL SEO =================
  const canonical = $('link[rel="canonical"]').attr("href");
  const metaRobots = ($('meta[name="robots"]').attr("content") || "").toLowerCase();
  const jsonLd = $('script[type="application/ld+json"]');
  const htmlLang = $("html").attr("lang");
  const robotsAccessible = !!(robotsRes && robotsRes.ok);
  const robotsBlocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\n)/i.test(robotsTxt);
  const sitemapAccessible = !!(sitemapRes && sitemapRes.ok);

  const technicalSeo = categoryScore([
    makeCheck(
      "canonical",
      "Canonical 태그",
      8,
      !!canonical,
      canonical ? `canonical: ${canonical}` : "canonical 태그가 없습니다."
    ),
    makeCheck(
      "robots_txt",
      "robots.txt 존재 여부",
      7,
      robotsAccessible,
      robotsAccessible ? "robots.txt가 정상적으로 존재합니다." : "robots.txt를 찾을 수 없습니다."
    ),
    makeCheck(
      "robots_not_blocking",
      "robots.txt 전체 차단 여부",
      10,
      robotsAccessible ? !robotsBlocksAll : true,
      robotsBlocksAll
        ? "robots.txt가 모든 검색엔진의 접근을 막고 있습니다."
        : "검색엔진 접근을 막고 있지 않습니다."
    ),
    makeCheck(
      "sitemap",
      "sitemap.xml 존재 여부",
      7,
      sitemapAccessible,
      sitemapAccessible ? "sitemap.xml이 정상적으로 존재합니다." : "sitemap.xml을 찾을 수 없습니다."
    ),
    makeCheck(
      "structured_data",
      "구조화 데이터 (JSON-LD)",
      8,
      jsonLd.length > 0,
      jsonLd.length > 0
        ? `구조화 데이터 ${jsonLd.length}개 발견`
        : "구조화 데이터(JSON-LD)가 없습니다."
    ),
    makeCheck(
      "meta_robots_indexable",
      "색인 허용 여부 (noindex 미설정)",
      10,
      !metaRobots.includes("noindex"),
      metaRobots.includes("noindex")
        ? "meta robots에 noindex가 설정되어 검색엔진에 노출되지 않습니다."
        : "색인이 허용되어 있습니다."
    ),
    makeCheck(
      "html_lang",
      "HTML 언어(lang) 속성",
      5,
      !!htmlLang,
      htmlLang ? `lang="${htmlLang}"` : "html 태그에 lang 속성이 없습니다."
    ),
  ]);

  // ============ SEARCH ENGINE FRIENDLINESS ============
  const viewport = $('meta[name="viewport"]').attr("content");
  const favicon =
    $('link[rel="icon"]').length > 0 || $('link[rel="shortcut icon"]').length > 0;
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDescription = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const twitterCard = $('meta[name="twitter:card"]').attr("content");
  const charset = $("meta[charset]").attr("charset") || (/<meta[^>]*charset=/i.test(html) ? "present" : null);

  const searchFriendliness = categoryScore([
    makeCheck(
      "viewport",
      "모바일 뷰포트 설정",
      12,
      !!viewport,
      viewport ? `viewport: ${viewport}` : "viewport 메타 태그가 없어 모바일 화면 최적화가 어려울 수 있습니다."
    ),
    makeCheck(
      "favicon",
      "Favicon 아이콘",
      6,
      favicon,
      favicon ? "favicon이 설정되어 있습니다." : "favicon이 설정되어 있지 않습니다."
    ),
    makeCheck(
      "open_graph",
      "Open Graph 태그 (소셜 공유)",
      10,
      !!(ogTitle && ogDescription && ogImage),
      ogTitle && ogDescription && ogImage
        ? "og:title / og:description / og:image가 모두 설정되어 있습니다."
        : "Open Graph 태그가 일부 또는 전부 누락되었습니다."
    ),
    makeCheck(
      "twitter_card",
      "Twitter Card 태그",
      6,
      !!twitterCard,
      twitterCard ? `twitter:card: ${twitterCard}` : "Twitter Card 태그가 없습니다."
    ),
    makeCheck(
      "charset",
      "문자 인코딩(charset) 선언",
      6,
      !!charset,
      charset ? "charset이 선언되어 있습니다." : "charset 선언이 없습니다."
    ),
  ]);

  // ================= SPEED OPTIMIZATION =================
  const htmlSizeKb = Math.round((Buffer.byteLength(html || "", "utf8") / 1024) * 10) / 10;
  const headScripts = $("head script").filter((_, el) => {
    const $el = $(el);
    return !$el.attr("async") && !$el.attr("defer") && $el.attr("src");
  });
  const imagesMissingDimensions = imgs.filter((_, el) => {
    const $el = $(el);
    return !($el.attr("width") && $el.attr("height"));
  });
  const contentEncoding = headers.get("content-encoding") || "";
  const cacheControl = headers.get("cache-control") || "";

  const speedOptimization = categoryScore([
    makeCheck(
      "html_size",
      "HTML 문서 크기",
      6,
      htmlSizeKb <= 150,
      `HTML 크기: 약 ${htmlSizeKb}KB (권장 150KB 이하)`
    ),
    makeCheck(
      "render_blocking_scripts",
      "렌더링 차단 스크립트",
      10,
      headScripts.length <= 2,
      `<head>의 동기 로드 스크립트: ${headScripts.length}개 (async/defer 미사용)`
    ),
    makeCheck(
      "image_dimensions",
      "이미지 width/height 지정",
      7,
      imgs.length === 0 || imagesMissingDimensions.length / imgs.length <= 0.3,
      imgs.length === 0
        ? "이미지가 없습니다."
        : `width/height 미지정 이미지: ${imagesMissingDimensions.length}/${imgs.length}개 (레이아웃 밀림 원인이 될 수 있음)`
    ),
    makeCheck(
      "compression",
      "응답 압축 (gzip/br)",
      9,
      /gzip|br|deflate/i.test(contentEncoding),
      contentEncoding
        ? `Content-Encoding: ${contentEncoding}`
        : "응답이 압축되어 있지 않습니다 (Content-Encoding 헤더 없음)."
    ),
    makeCheck(
      "cache_control",
      "캐시 설정 (Cache-Control)",
      6,
      !!cacheControl,
      cacheControl ? `Cache-Control: ${cacheControl}` : "Cache-Control 헤더가 없습니다."
    ),
  ]);

  // ================= SECURITY =================
  const isHttps = finalUrl.startsWith("https://");
  const redirectedToHttps = targetUrl.startsWith("http://") && finalUrl.startsWith("https://");
  const hsts = headers.get("strict-transport-security");
  const xContentType = headers.get("x-content-type-options");
  const xFrame = headers.get("x-frame-options");
  const csp = headers.get("content-security-policy");
  const mixedContent = isHttps && /(src|href)=["']http:\/\/(?!localhost)/i.test(html || "");

  const security = categoryScore([
    makeCheck(
      "https",
      "HTTPS 사용",
      15,
      isHttps,
      isHttps ? "HTTPS로 서비스되고 있습니다." : "HTTPS가 아닌 HTTP로 서비스되고 있습니다. HTTPS 적용을 권장합니다."
    ),
    makeCheck(
      "http_to_https_redirect",
      "HTTP → HTTPS 리다이렉트",
      8,
      targetUrl.startsWith("https://") ? true : redirectedToHttps,
      targetUrl.startsWith("https://")
        ? "이미 HTTPS 주소로 접속했습니다."
        : redirectedToHttps
        ? "HTTP 접속 시 HTTPS로 자동 전환됩니다."
        : "HTTP로 접속 시 HTTPS로 자동 전환되지 않습니다."
    ),
    makeCheck(
      "hsts",
      "HSTS 헤더",
      6,
      !!hsts,
      hsts ? `Strict-Transport-Security: ${hsts}` : "HSTS 헤더 설정을 권장합니다."
    ),
    makeCheck(
      "x_content_type_options",
      "X-Content-Type-Options 헤더",
      5,
      xContentType === "nosniff",
      xContentType
        ? `X-Content-Type-Options: ${xContentType}`
        : "X-Content-Type-Options: nosniff 설정을 권장합니다."
    ),
    makeCheck(
      "x_frame_options",
      "클릭재킹 방지 (X-Frame-Options / CSP)",
      5,
      !!xFrame || (!!csp && /frame-ancestors/i.test(csp)),
      xFrame || csp ? "클릭재킹 방지 설정이 되어 있습니다." : "X-Frame-Options 또는 CSP frame-ancestors 설정을 권장합니다."
    ),
    makeCheck(
      "csp",
      "Content-Security-Policy",
      5,
      !!csp,
      csp ? "CSP가 설정되어 있습니다." : "Content-Security-Policy 설정을 권장합니다."
    ),
    makeCheck(
      "mixed_content",
      "혼합 콘텐츠(Mixed Content)",
      6,
      !mixedContent,
      mixedContent ? "HTTPS 페이지에서 HTTP 리소스를 불러오고 있습니다." : "혼합 콘텐츠가 발견되지 않았습니다."
    ),
  ]);

  const overallScore = Math.round(
    contentSeo.score * 0.3 +
      technicalSeo.score * 0.3 +
      searchFriendliness.score * 0.2 +
      speedOptimization.score * 0.2
  );

  return {
    ok: true,
    targetUrl,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    overallScore,
    categories: {
      contentSeo,
      technicalSeo,
      searchFriendliness,
      speedOptimization,
    },
    security,
  };
}

module.exports = { analyzeUrl };
