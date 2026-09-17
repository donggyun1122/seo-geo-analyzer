const cheerio = require("cheerio");

const FETCH_TIMEOUT_MS = 9000;
const UA =
  "Mozilla/5.0 (compatible; SEOGeoAnalyzer/1.0; +https://example.com/bot)";

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

function truncate(str, max = 90) {
  if (!str) return "";
  const s = String(str).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// lines: array of code-like strings. Shows up to `limit`, then a "+N개 더" note.
function formatCodeList(lines, limit = 5, unitLabel = "개") {
  if (!lines || lines.length === 0) return null;
  const shown = lines.slice(0, limit);
  const remaining = lines.length - shown.length;
  let out = shown.join("\n");
  if (remaining > 0) out += `\n... 외 ${remaining}${unitLabel} 더`;
  return out;
}

// recommendation & evidence are only shown to the user when the check fails (pass === false)
function makeCheck(id, label, weight, pass, detail, recommendation, evidence) {
  return {
    id,
    label,
    weight,
    pass: !!pass,
    detail,
    recommendation: pass ? null : recommendation || null,
    evidence: pass ? null : evidence || null,
  };
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

  // ---- Shared: full heading sequence in document order (used by h1 + heading_structure) ----
  const headingElements = $("h1, h2, h3, h4, h5, h6").toArray();
  const headingList = headingElements.map((el) => {
    const tag = el.tagName.toLowerCase();
    const text = truncate($(el).text(), 70) || "(내용 없음)";
    return { tag, text, line: `<${tag}>${text}</${tag}>` };
  });

  // ================= CONTENT SEO =================
  const titleText = $("title").first().text().trim();
  const metaDescriptionRaw = $('meta[name="description"]').attr("content") || "";
  const h1Lines = headingList.filter((h) => h.tag === "h1").map((h) => h.line);
  const h1Count = h1Lines.length;
  const h2Count = headingList.filter((h) => h.tag === "h2").length;
  const imgs = $("img");
  const imgsWithAlt = imgs.filter((_, el) => {
    const alt = $(el).attr("alt");
    return alt && alt.trim().length > 0;
  });
  const imgsMissingAltLines = imgs
    .toArray()
    .filter((el) => {
      const alt = $(el).attr("alt");
      return !(alt && alt.trim().length > 0);
    })
    .map((el) => `<img src="${truncate($(el).attr("src") || "(src 없음)", 70)}">`);
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
        : "title 태그가 없습니다.",
      "50~60자 내외로 핵심 키워드를 포함한 제목을 작성하세요.",
      titleText ? `<title>${truncate(titleText, 90)}</title>` : null
    ),
    makeCheck(
      "meta_description",
      "Meta Description",
      10,
      metaDescriptionRaw.length >= 50 && metaDescriptionRaw.length <= 160,
      metaDescriptionRaw
        ? `현재 길이: ${metaDescriptionRaw.length}자 (권장 50~160자)`
        : "meta description이 없습니다.",
      "페이지 내용을 요약하는 150~160자 내외의 description을 추가하세요.",
      metaDescriptionRaw
        ? `<meta name="description" content="${truncate(metaDescriptionRaw, 90)}">`
        : null
    ),
    makeCheck(
      "h1",
      "H1 태그 (1개 권장)",
      8,
      h1Count === 1,
      `현재 H1 개수: ${h1Count}개`,
      "페이지의 핵심 주제를 담은 H1 태그를 정확히 1개만 사용하세요.",
      h1Count > 0 ? formatCodeList(h1Lines, 5, "개") : "<!-- H1 태그를 찾을 수 없습니다 -->"
    ),
    makeCheck(
      "heading_structure",
      "제목 계층 구조 (H1~H6 순서)",
      5,
      h2Count > 0,
      `현재 H2 개수: ${h2Count}개`,
      "H1 아래에 H2, H3로 이어지는 계층적 제목 구조를 만들어 콘텐츠를 구획화하세요.",
      formatCodeList(
        headingList.map((h) => h.line),
        20,
        "개"
      )
    ),
    makeCheck(
      "image_alt",
      "이미지 alt 텍스트",
      8,
      imgs.length === 0 || imgsWithAlt.length / imgs.length >= 0.8,
      imgs.length === 0
        ? "이미지가 없습니다."
        : `alt 텍스트 보유율: ${Math.round((imgsWithAlt.length / imgs.length) * 100)}% (${imgsWithAlt.length}/${imgs.length})`,
      "모든 이미지에 내용을 설명하는 alt 텍스트를 추가하세요. (예: alt=\"제품 상세 이미지\")",
      formatCodeList(imgsMissingAltLines, 5, "개")
    ),
    makeCheck(
      "content_length",
      "본문 콘텐츠 분량",
      7,
      wordCount >= 300,
      `본문 단어 수(추정): 약 ${wordCount}개 (권장 300개 이상)`,
      "본문 콘텐츠를 최소 300단어 이상으로 보강해 정보량을 늘리세요."
    ),
    makeCheck(
      "internal_links",
      "내부 링크",
      5,
      internalLinks >= 1,
      `내부 링크 수(추정): ${internalLinks}개`,
      "관련된 다른 페이지로 연결되는 내부 링크를 추가하세요."
    ),
  ]);

  // ================= TECHNICAL SEO =================
  const canonical = $('link[rel="canonical"]').attr("href");
  const metaRobotsRaw = $('meta[name="robots"]').attr("content") || "";
  const metaRobots = metaRobotsRaw.toLowerCase();
  const jsonLd = $('script[type="application/ld+json"]');
  const htmlAttribs = $("html").get(0) ? $("html").get(0).attribs || {} : {};
  const htmlLang = htmlAttribs.lang;
  const htmlOpenTag =
    "<html" + Object.entries(htmlAttribs).map(([k, v]) => ` ${k}="${truncate(v, 30)}"`).join("") + ">";
  const robotsAccessible = !!(robotsRes && robotsRes.ok);
  const robotsBlockMatch = robotsTxt.match(/user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\n)/i);
  const robotsBlocksAll = !!robotsBlockMatch;
  const robotsReferencesSitemap = /sitemap:\s*\S+/i.test(robotsTxt);
  const sitemapAccessible = !!(sitemapRes && sitemapRes.ok);
  const sitemapXml = sitemapAccessible ? await sitemapRes.text().catch(() => "") : "";
  let sitemapUrlCount = 0;
  let sitemapIndexCount = 0;
  if (sitemapXml) {
    try {
      const $sm = cheerio.load(sitemapXml, { xmlMode: true });
      sitemapUrlCount = $sm("url").length;
      sitemapIndexCount = $sm("sitemap").length;
    } catch (e) {
      // 파싱 실패 시 0개로 처리 (아래에서 실패로 판정됨)
    }
  }
  const sitemapHasEntries = sitemapUrlCount > 0 || sitemapIndexCount > 0;

  // HTML5 Doctype (문서 맨 앞에 있어야 함)
  const trimmedHtml = (html || "").replace(/^﻿/, "").trimStart();
  const hasDoctype = /^<!doctype\s+html\s*>/i.test(trimmedHtml);

  const technicalSeo = categoryScore([
    makeCheck(
      "canonical",
      "Canonical 태그",
      8,
      !!canonical,
      canonical ? `canonical: ${canonical}` : "canonical 태그가 없습니다.",
      "중복 콘텐츠 문제를 방지하기 위해 <link rel=\"canonical\"> 태그를 추가하세요."
    ),
    makeCheck(
      "robots_txt",
      "robots.txt 존재 여부",
      7,
      robotsAccessible,
      robotsAccessible ? "robots.txt가 정상적으로 존재합니다." : "robots.txt를 찾을 수 없습니다.",
      "사이트 루트 경로(/robots.txt)에 크롤링 규칙을 명시한 파일을 추가하세요."
    ),
    makeCheck(
      "robots_not_blocking",
      "robots.txt 전체 차단 여부",
      10,
      robotsAccessible ? !robotsBlocksAll : true,
      robotsBlocksAll
        ? "robots.txt가 모든 검색엔진의 접근을 막고 있습니다."
        : "검색엔진 접근을 막고 있지 않습니다.",
      "robots.txt에서 \"Disallow: /\" 설정을 제거하거나 필요한 경로만 차단하도록 수정하세요.",
      robotsBlocksAll ? truncate(robotsBlockMatch[0], 200) : null
    ),
    makeCheck(
      "sitemap",
      "sitemap.xml 존재 여부",
      7,
      sitemapAccessible,
      sitemapAccessible ? "sitemap.xml이 정상적으로 존재합니다." : "sitemap.xml을 찾을 수 없습니다.",
      "sitemap.xml을 생성해 검색엔진이 사이트 구조를 쉽게 파악하도록 하세요."
    ),
    makeCheck(
      "structured_data",
      "구조화 데이터 (JSON-LD)",
      8,
      jsonLd.length > 0,
      jsonLd.length > 0
        ? `구조화 데이터 ${jsonLd.length}개 발견`
        : "구조화 데이터(JSON-LD)가 없습니다.",
      "schema.org 기반 JSON-LD 구조화 데이터를 추가해 검색 결과에 리치 스니펫이 노출되도록 하세요.",
      jsonLd.length === 0 ? "<!-- <script type=\"application/ld+json\"> 태그를 찾을 수 없습니다 -->" : null
    ),
    makeCheck(
      "meta_robots_indexable",
      "색인 허용 여부 (noindex 미설정)",
      10,
      !metaRobots.includes("noindex"),
      metaRobots.includes("noindex")
        ? "meta robots에 noindex가 설정되어 검색엔진에 노출되지 않습니다."
        : "색인이 허용되어 있습니다.",
      "meta robots 태그에서 noindex 설정을 제거해 검색엔진 색인을 허용하세요.",
      metaRobots.includes("noindex") ? `<meta name="robots" content="${truncate(metaRobotsRaw, 90)}">` : null
    ),
    makeCheck(
      "html_lang",
      "HTML 언어(lang) 속성",
      5,
      !!htmlLang,
      htmlLang ? `lang="${htmlLang}"` : "html 태그에 lang 속성이 없습니다.",
      "<html lang=\"ko\">와 같이 페이지의 기본 언어를 명시하세요.",
      !htmlLang ? truncate(htmlOpenTag, 90) : null
    ),
    makeCheck(
      "doctype",
      "HTML5 Doctype 선언",
      6,
      hasDoctype,
      hasDoctype
        ? "<!DOCTYPE html> 선언이 문서 최상단에 있습니다."
        : "HTML5 Doctype 선언을 찾을 수 없습니다.",
      "문서 맨 첫 줄에 <!DOCTYPE html>을 선언하여 브라우저가 표준 모드로 렌더링하도록 하세요.",
      !hasDoctype ? `실제 문서 시작 부분:\n${truncate(trimmedHtml.slice(0, 60), 60)}` : null
    ),
    makeCheck(
      "sitemap_content",
      "sitemap.xml 내용 유효성",
      6,
      sitemapAccessible && sitemapHasEntries,
      !sitemapAccessible
        ? "sitemap.xml이 없어 내용을 확인할 수 없습니다."
        : sitemapIndexCount > 0
        ? `sitemap 인덱스 파일입니다 (하위 sitemap ${sitemapIndexCount}개 연결됨).`
        : `sitemap.xml 내 URL 개수: ${sitemapUrlCount}개`,
      "sitemap.xml에 실제 페이지 URL 목록이 포함되도록 생성하거나 갱신하세요.",
      sitemapAccessible && !sitemapHasEntries ? truncate(sitemapXml, 150) : null
    ),
    makeCheck(
      "robots_sitemap_reference",
      "robots.txt 내 Sitemap 주소 명시",
      5,
      robotsAccessible && robotsReferencesSitemap,
      !robotsAccessible
        ? "robots.txt가 없어 확인할 수 없습니다."
        : robotsReferencesSitemap
        ? "robots.txt에 Sitemap 주소가 명시되어 있습니다."
        : "robots.txt에 Sitemap 주소가 명시되어 있지 않습니다.",
      "robots.txt 파일에 \"Sitemap: https://당신의도메인/sitemap.xml\" 줄을 추가하세요.",
      robotsAccessible && !robotsReferencesSitemap ? truncate(robotsTxt, 150) : null
    ),
  ]);

  // ============ SEARCH ENGINE FRIENDLINESS ============
  const viewport = $('meta[name="viewport"]').attr("content");
  const favicon =
    $('link[rel="icon"]').length > 0 || $('link[rel="shortcut icon"]').length > 0;
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDescription = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogType = $('meta[property="og:type"]').attr("content");
  const ogUrl = $('meta[property="og:url"]').attr("content");
  const ogSiteName = $('meta[property="og:site_name"]').attr("content");
  const twitterCard = $('meta[name="twitter:card"]').attr("content");
  const charset = $("meta[charset]").attr("charset") || (/<meta[^>]*charset=/i.test(html) ? "present" : null);

  const ogEvidenceLines = [
    ogTitle ? `<meta property="og:title" content="${truncate(ogTitle, 60)}">` : "<!-- og:title 없음 -->",
    ogDescription
      ? `<meta property="og:description" content="${truncate(ogDescription, 60)}">`
      : "<!-- og:description 없음 -->",
    ogImage ? `<meta property="og:image" content="${truncate(ogImage, 60)}">` : "<!-- og:image 없음 -->",
    ogType ? `<meta property="og:type" content="${truncate(ogType, 60)}">` : "<!-- og:type 없음 -->",
    ogUrl ? `<meta property="og:url" content="${truncate(ogUrl, 60)}">` : "<!-- og:url 없음 -->",
    ogSiteName
      ? `<meta property="og:site_name" content="${truncate(ogSiteName, 60)}">`
      : "<!-- og:site_name 없음 -->",
  ];

  const searchFriendliness = categoryScore([
    makeCheck(
      "viewport",
      "모바일 뷰포트 설정",
      12,
      !!viewport,
      viewport ? `viewport: ${viewport}` : "viewport 메타 태그가 없어 모바일 화면 최적화가 어려울 수 있습니다.",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">를 추가하세요."
    ),
    makeCheck(
      "favicon",
      "Favicon 아이콘",
      6,
      favicon,
      favicon ? "favicon이 설정되어 있습니다." : "favicon이 설정되어 있지 않습니다.",
      "브라우저 탭에 표시될 favicon 아이콘 파일을 추가하세요."
    ),
    makeCheck(
      "open_graph",
      "Open Graph 태그 (소셜 공유)",
      10,
      !!(ogTitle && ogDescription && ogImage && ogType && ogUrl && ogSiteName),
      ogTitle && ogDescription && ogImage && ogType && ogUrl && ogSiteName
        ? "og:title / og:description / og:image / og:type / og:url / og:site_name이 모두 설정되어 있습니다."
        : "Open Graph 태그가 일부 또는 전부 누락되었습니다. (title/description/image/type/url/site_name 중 확인 필요)",
      "og:title, og:description, og:image, og:type, og:url, og:site_name 태그를 모두 추가해 페이스북 등 SNS 공유 시 미리보기가 제대로 표시되게 하세요.",
      ogEvidenceLines.join("\n")
    ),
    makeCheck(
      "twitter_card",
      "Twitter Card 태그",
      6,
      !!twitterCard,
      twitterCard ? `twitter:card: ${twitterCard}` : "Twitter Card 태그가 없습니다.",
      "twitter:card 메타 태그를 추가해 X(트위터) 공유 시 미리보기를 최적화하세요."
    ),
    makeCheck(
      "charset",
      "문자 인코딩(charset) 선언",
      6,
      !!charset,
      charset ? "charset이 선언되어 있습니다." : "charset 선언이 없습니다.",
      "<meta charset=\"UTF-8\">을 문서 상단(<head> 맨 앞)에 명시하세요."
    ),
  ]);

  // ================= SPEED OPTIMIZATION =================
  const htmlSizeKb = Math.round((Buffer.byteLength(html || "", "utf8") / 1024) * 10) / 10;
  const headScriptEls = $("head script").filter((_, el) => {
    const $el = $(el);
    return !$el.attr("async") && !$el.attr("defer") && $el.attr("src");
  });
  const headScriptLines = headScriptEls
    .toArray()
    .map((el) => `<script src="${truncate($(el).attr("src"), 70)}">`);
  const imagesMissingDimensionsEls = imgs.filter((_, el) => {
    const $el = $(el);
    return !($el.attr("width") && $el.attr("height"));
  });
  const imagesMissingDimensionsLines = imagesMissingDimensionsEls
    .toArray()
    .map((el) => `<img src="${truncate($(el).attr("src") || "(src 없음)", 70)}">`);
  const contentEncoding = headers.get("content-encoding") || "";
  const cacheControl = headers.get("cache-control") || "";

  const speedOptimization = categoryScore([
    makeCheck(
      "html_size",
      "HTML 문서 크기",
      6,
      htmlSizeKb <= 150,
      `HTML 크기: 약 ${htmlSizeKb}KB (권장 150KB 이하)`,
      "불필요한 인라인 코드나 중복 마크업을 줄여 HTML 문서 크기를 최적화하세요."
    ),
    makeCheck(
      "render_blocking_scripts",
      "렌더링 차단 스크립트",
      10,
      headScriptEls.length <= 2,
      `<head>의 동기 로드 스크립트: ${headScriptEls.length}개 (async/defer 미사용)`,
      "<head>의 스크립트 태그에 async 또는 defer 속성을 추가해 렌더링 차단을 줄이세요.",
      formatCodeList(headScriptLines, 5, "개")
    ),
    makeCheck(
      "image_dimensions",
      "이미지 width/height 지정",
      7,
      imgs.length === 0 || imagesMissingDimensionsEls.length / imgs.length <= 0.3,
      imgs.length === 0
        ? "이미지가 없습니다."
        : `width/height 미지정 이미지: ${imagesMissingDimensionsEls.length}/${imgs.length}개 (레이아웃 밀림 원인이 될 수 있음)`,
      "이미지 태그에 width/height 속성을 지정해 레이아웃 밀림(CLS)을 방지하세요.",
      formatCodeList(imagesMissingDimensionsLines, 5, "개")
    ),
    makeCheck(
      "compression",
      "응답 압축 (gzip/br)",
      9,
      /gzip|br|deflate/i.test(contentEncoding),
      contentEncoding
        ? `Content-Encoding: ${contentEncoding}`
        : "응답이 압축되어 있지 않습니다 (Content-Encoding 헤더 없음).",
      "서버 또는 호스팅 설정에서 gzip이나 Brotli 압축을 활성화해 전송 용량을 줄이세요."
    ),
    makeCheck(
      "cache_control",
      "캐시 설정 (Cache-Control)",
      6,
      !!cacheControl,
      cacheControl ? `Cache-Control: ${cacheControl}` : "Cache-Control 헤더가 없습니다.",
      "정적 자원에 Cache-Control 헤더를 설정해 재방문 시 로딩 속도를 높이세요."
    ),
  ]);

  // ================= SECURITY =================
  const isHttps = finalUrl.startsWith("https://");
  const redirectedToHttps = targetUrl.startsWith("http://") && finalUrl.startsWith("https://");
  const hsts = headers.get("strict-transport-security");
  const xContentType = headers.get("x-content-type-options");
  const xFrame = headers.get("x-frame-options");
  const csp = headers.get("content-security-policy");
  const mixedContentMatches = isHttps
    ? [...(html || "").matchAll(/(src|href)=["'](http:\/\/(?!localhost)[^"']+)["']/gi)]
    : [];
  const mixedContent = mixedContentMatches.length > 0;
  const mixedContentLines = mixedContentMatches.map((m) => `${m[1]}="${truncate(m[2], 70)}"`);

  const security = categoryScore([
    makeCheck(
      "https",
      "HTTPS 사용",
      15,
      isHttps,
      isHttps ? "HTTPS로 서비스되고 있습니다." : "HTTPS가 아닌 HTTP로 서비스되고 있습니다.",
      "SSL 인증서를 발급받아 사이트를 HTTPS로 전환하세요."
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
        : "HTTP로 접속 시 HTTPS로 자동 전환되지 않습니다.",
      "HTTP로 접속했을 때 HTTPS로 자동 리다이렉트되도록 서버/호스팅 설정을 추가하세요."
    ),
    makeCheck(
      "hsts",
      "HSTS 헤더",
      6,
      !!hsts,
      hsts ? `Strict-Transport-Security: ${hsts}` : "HSTS 헤더가 없습니다.",
      "Strict-Transport-Security 헤더를 설정해 항상 HTTPS로만 접속되도록 강제하세요."
    ),
    makeCheck(
      "x_content_type_options",
      "X-Content-Type-Options 헤더",
      5,
      xContentType === "nosniff",
      xContentType
        ? `X-Content-Type-Options: ${xContentType}`
        : "X-Content-Type-Options 헤더가 없습니다.",
      "응답 헤더에 X-Content-Type-Options: nosniff를 추가하세요."
    ),
    makeCheck(
      "x_frame_options",
      "클릭재킹 방지 (X-Frame-Options / CSP)",
      5,
      !!xFrame || (!!csp && /frame-ancestors/i.test(csp)),
      xFrame || csp ? "클릭재킹 방지 설정이 되어 있습니다." : "클릭재킹 방지 설정이 없습니다.",
      "X-Frame-Options 헤더 또는 CSP의 frame-ancestors 지시어를 설정하세요."
    ),
    makeCheck(
      "csp",
      "Content-Security-Policy",
      5,
      !!csp,
      csp ? "CSP가 설정되어 있습니다." : "Content-Security-Policy 헤더가 없습니다.",
      "Content-Security-Policy 헤더를 설정해 XSS 등 공격 표면을 줄이세요."
    ),
    makeCheck(
      "mixed_content",
      "혼합 콘텐츠(Mixed Content)",
      6,
      !mixedContent,
      mixedContent ? "HTTPS 페이지에서 HTTP 리소스를 불러오고 있습니다." : "혼합 콘텐츠가 발견되지 않았습니다.",
      "HTTPS 페이지 내에서 http://로 시작하는 리소스 주소를 https://로 변경하세요.",
      formatCodeList(mixedContentLines, 5, "개")
    ),
  ]);

  const overallScore = Math.round(
    contentSeo.score * 0.3 +
      technicalSeo.score * 0.3 +
      searchFriendliness.score * 0.2 +
      speedOptimization.score * 0.2
  );

  // ============ TOP 5 우선 개선 사항 ============
  const taggedChecks = [
    ...contentSeo.checks.map((c) => ({ ...c, category: "콘텐츠 SEO" })),
    ...technicalSeo.checks.map((c) => ({ ...c, category: "테크니컬 SEO" })),
    ...searchFriendliness.checks.map((c) => ({ ...c, category: "검색엔진 친화도" })),
    ...speedOptimization.checks.map((c) => ({ ...c, category: "속도 최적화" })),
    ...security.checks.map((c) => ({ ...c, category: "보안" })),
  ];
  const priorityFixes = taggedChecks
    .filter((c) => !c.pass)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  return {
    ok: true,
    targetUrl,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    overallScore,
    priorityFixes,
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
