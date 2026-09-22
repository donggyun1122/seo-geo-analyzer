// GEO(생성형 엔진 최적화) 엔티티 점수 — 사이트의 JSON-LD 구조화 데이터를 분석해
// AI 검색엔진(챗GPT, 제미나이, 퍼플렉시티 등)이 사이트를 하나의 "엔티티"로
// 정확히 이해할 수 있는지를 점검합니다.
//
// 점수 구성 (총 100점):
//   1. 핵심 엔티티 구성 (55점) — 서버 응답 HTML에 필요한 엔티티들이 실제로 존재하는지
//   2. 속성 완성도 (30점)   — 각 엔티티에 필요한 속성이 충분히 채워져 있는지
//   3. 엔티티 연결성 (15점) — @id / sameAs로 엔티티들이 서로, 그리고 외부와 연결되는지
//
// SEO 페이지(lib/analyze.js)와 동일하게 cheerio로 서버가 응답한 HTML만 파싱합니다.
// (브라우저 JS 실행 후 DOM이 아니라 "크롤러가 실제로 받는 원본 응답"을 기준으로 봐야
//  AI 검색엔진 관점의 진단이 되기 때문이에요.)

const cheerio = require("cheerio");

const FETCH_TIMEOUT_MS = 9000;
const UA = "Mozilla/5.0 (compatible; SEOGeoAnalyzer/1.0; +https://example.com/bot)";

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

function truncate(str, max = 90) {
  if (!str) return "";
  const s = String(str).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function formatCodeList(lines, limit = 5, unitLabel = "개") {
  if (!lines || lines.length === 0) return null;
  const shown = lines.slice(0, limit);
  const remaining = lines.length - shown.length;
  let out = shown.join("\n");
  if (remaining > 0) out += `\n... 외 ${remaining}${unitLabel} 더`;
  return out;
}

// recommendation & evidence는 항목이 fail일 때만 화면에 표시됩니다.
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

// ---------------- JSON-LD 파싱 ----------------

function extractJsonLdBlocks($) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  return scripts.map((el) => {
    const raw = $(el).contents().text();
    let parsed = null;
    let valid = false;
    let error = null;
    if (raw && raw.trim()) {
      try {
        parsed = JSON.parse(raw);
        valid = true;
      } catch (e) {
        error = e.message;
      }
    } else {
      error = "스크립트 내용이 비어 있습니다.";
    }
    return { raw: raw || "", valid, parsed, error };
  });
}

// 각 블록을 평탄화해서 { node, context } 목록으로 만듭니다. (최상위 객체 / 배열 / @graph 모두 지원)
function flattenNodes(blocks) {
  const entries = [];
  blocks.forEach((block) => {
    if (!block.valid || !block.parsed) return;
    const roots = Array.isArray(block.parsed) ? block.parsed : [block.parsed];
    roots.forEach((root) => {
      if (!root || typeof root !== "object") return;
      if (Array.isArray(root["@graph"])) {
        root["@graph"].forEach((n) => {
          if (n && typeof n === "object") entries.push({ node: n, context: root["@context"] });
        });
      } else {
        entries.push({ node: root, context: root["@context"] });
      }
    });
  });
  return entries;
}

function typeStringOf(node) {
  const t = node && node["@type"];
  if (!t) return "";
  return Array.isArray(t) ? t.join(",") : String(t);
}

function findNode(entries, typeRe) {
  const found = entries.find(({ node }) => typeRe.test(typeStringOf(node)));
  return found ? found.node : null;
}

function has(node, prop) {
  if (!node) return false;
  const v = node[prop];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function countPresent(node, specs) {
  let present = 0;
  const missing = [];
  specs.forEach((s) => {
    if (s.check(node)) present++;
    else missing.push(s.label);
  });
  return { present, total: specs.length, missing };
}

// ---------------- 엔티티 타입 매칭 규칙 ----------------
// 발행 주체: Organization 계열(하위 타입 포함) 또는 Person
const PUBLISHER_TYPE_RE =
  /organization|corporation|localbusiness|ngo|governmentorganization|educationalorganization|newsmediaorganization|^person$/i;
const WEBSITE_TYPE_RE = /^website$/i;
// WebPage 및 그 하위 타입들 (FAQPage/QAPage 등은 주제 엔티티와도 겹칠 수 있음)
const WEBPAGE_TYPE_RE =
  /webpage|itempage|collectionpage|aboutpage|contactpage|searchresultspage|profilepage|faqpage|qapage/i;
const BREADCRUMB_TYPE_RE = /breadcrumblist/i;
// "기대 엔티티" — 페이지가 실제로 다루는 주제를 나타내는, WebPage보다 더 구체적인 타입들
const TOPICAL_TYPE_RE =
  /article|blogposting|newsarticle|techarticle|\breport\b|product|faqpage|qapage|howto|\bevent\b|localbusiness|review|videoobject|recipe|jobposting|\bcourse\b|softwareapplication|\bbook\b|\bmovie\b|musicrecording|creativework|imagegallery|profilepage|\bservice\b|\boffer\b/i;

const TRUSTED_SAMEAS_RE =
  /wikipedia\.org|wikidata\.org|instagram\.com|facebook\.com|youtube\.com|linkedin\.com|(?:^|\.)x\.com|twitter\.com|pinterest\.com|tiktok\.com/i;

function hasSchemaContext(entries) {
  return entries.some(({ context }) => {
    if (!context) return false;
    const str = typeof context === "string" ? context : JSON.stringify(context);
    return /schema\.org/i.test(str);
  });
}

function hasCrossReference(entries) {
  const idSet = new Set();
  entries.forEach(({ node }) => {
    if (typeof node["@id"] === "string" && node["@id"].trim()) idSet.add(node["@id"].trim());
  });
  if (idSet.size < 2) return false;
  for (const { node } of entries) {
    const selfId = typeof node["@id"] === "string" ? node["@id"].trim() : null;
    for (const key of Object.keys(node)) {
      if (key === "@id") continue;
      const val = node[key];
      const candidates = Array.isArray(val) ? val : [val];
      for (const c of candidates) {
        if (c && typeof c === "object" && typeof c["@id"] === "string") {
          const ref = c["@id"].trim();
          if (idSet.has(ref) && ref !== selfId) return true;
        }
      }
    }
  }
  return false;
}

function sameAsInfo(node) {
  if (!node || !node.sameAs) return { count: 0, trusted: 0 };
  const arr = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
  const strs = arr.filter((s) => typeof s === "string" && s.trim());
  const trusted = strs.filter((s) => TRUSTED_SAMEAS_RE.test(s));
  return { count: strs.length, trusted: trusted.length };
}

async function analyzeGeoEntity(rawUrl) {
  const targetUrl = normalizeUrl(rawUrl);

  const mainRes = await safeFetch(targetUrl);
  if (!mainRes) {
    return {
      ok: false,
      error: "사이트에 접속할 수 없었습니다. URL 주소가 정확한지, 사이트가 정상 작동 중인지 확인해주세요.",
      targetUrl,
    };
  }

  const finalUrl = mainRes.url || targetUrl;
  const html = await mainRes.text().catch(() => "");
  const $ = cheerio.load(html || "");

  const jsonLdBlocks = extractJsonLdBlocks($);
  const validBlocks = jsonLdBlocks.filter((b) => b.valid);
  const invalidBlocks = jsonLdBlocks.filter((b) => !b.valid);
  const nodeEntries = flattenNodes(jsonLdBlocks);

  const orgNode = findNode(nodeEntries, PUBLISHER_TYPE_RE);
  const websiteNode = findNode(nodeEntries, WEBSITE_TYPE_RE);
  const webpageNode = findNode(nodeEntries, WEBPAGE_TYPE_RE);
  const breadcrumbNode = findNode(nodeEntries, BREADCRUMB_TYPE_RE);
  const topicalNode = findNode(nodeEntries, TOPICAL_TYPE_RE);
  const schemaContextOk = hasSchemaContext(nodeEntries);

  // ================= 1. 핵심 엔티티 구성 (55점) =================
  const coreEntity = categoryScore([
    makeCheck(
      "jsonld_present",
      "JSON-LD 존재 (서버 렌더링)",
      10,
      jsonLdBlocks.length > 0,
      jsonLdBlocks.length > 0
        ? `서버가 응답한 HTML에서 JSON-LD 스크립트 ${jsonLdBlocks.length}개를 발견했습니다.`
        : "서버 응답 HTML에서 JSON-LD(<script type=\"application/ld+json\">)를 찾을 수 없습니다.",
      "AI 검색엔진과 크롤러는 자바스크립트를 실행하지 않고 서버가 내려준 HTML만 읽는 경우가 많습니다. 클라이언트 스크립트로 나중에 주입하지 말고, 서버 렌더링 단계에서 JSON-LD를 포함하세요.",
      jsonLdBlocks.length === 0 ? "<!-- <script type=\"application/ld+json\"> 태그를 찾을 수 없습니다 -->" : null
    ),
    makeCheck(
      "jsonld_valid",
      "JSON-LD 문법 유효성",
      8,
      jsonLdBlocks.length > 0 && invalidBlocks.length === 0,
      jsonLdBlocks.length === 0
        ? "JSON-LD가 없어 문법을 확인할 수 없습니다."
        : `${validBlocks.length}/${jsonLdBlocks.length}개 스크립트가 유효한 JSON입니다.`,
      "하나라도 JSON 문법 오류(따옴표·쉼표 누락 등)가 있으면 검색엔진과 AI가 해당 블록 전체를 무시합니다. 오류를 수정하세요.",
      invalidBlocks.length > 0
        ? formatCodeList(invalidBlocks.map((b) => truncate(b.error || "parse error", 90)), 5)
        : null
    ),
    makeCheck(
      "schema_context",
      "schema.org 컨텍스트 명시 (@context)",
      5,
      schemaContextOk,
      schemaContextOk
        ? "@context에 schema.org가 올바르게 명시되어 있습니다."
        : "@context에서 schema.org 참조를 확인할 수 없습니다.",
      "각 JSON-LD 블록 최상위에 \"@context\": \"https://schema.org\"를 명시하세요."
    ),
    makeCheck(
      "publisher_entity",
      "발행 주체 엔티티 (Organization/Person)",
      8,
      !!orgNode,
      orgNode
        ? `발행 주체 엔티티를 찾았습니다. (@type: ${typeStringOf(orgNode)})`
        : "Organization 또는 Person 타입의 발행 주체 엔티티가 없습니다.",
      "콘텐츠를 발행하는 주체(회사·브랜드·개인)를 Organization 또는 Person 타입으로 명시하세요."
    ),
    makeCheck(
      "website_entity",
      "웹사이트 엔티티 (WebSite)",
      7,
      !!websiteNode,
      websiteNode ? "WebSite 타입 엔티티를 찾았습니다." : "WebSite 타입 엔티티가 없습니다.",
      "사이트 전체를 대표하는 WebSite 엔티티를 추가하세요. (보통 공통 레이아웃에 한 번만 넣으면 됩니다.)"
    ),
    makeCheck(
      "webpage_entity",
      "웹페이지 엔티티 (WebPage)",
      7,
      !!webpageNode,
      webpageNode
        ? `WebPage 계열 엔티티를 찾았습니다. (@type: ${typeStringOf(webpageNode)})`
        : "WebPage 계열 엔티티가 없습니다.",
      "현재 페이지 자체를 나타내는 WebPage(또는 그 하위 타입) 엔티티를 추가하세요."
    ),
    makeCheck(
      "breadcrumb_entity",
      "이동경로 (BreadcrumbList)",
      5,
      !!breadcrumbNode && has(breadcrumbNode, "itemListElement"),
      breadcrumbNode
        ? has(breadcrumbNode, "itemListElement")
          ? "BreadcrumbList와 itemListElement가 확인됩니다."
          : "BreadcrumbList는 있지만 itemListElement가 비어 있습니다."
        : "BreadcrumbList 엔티티가 없습니다.",
      "사이트 계층 구조(예: 홈 > 카테고리 > 현재 페이지)를 보여주는 BreadcrumbList를 itemListElement와 함께 추가하세요."
    ),
    makeCheck(
      "expected_entity",
      "기대 엔티티 (페이지 주제 엔티티)",
      5,
      !!topicalNode,
      topicalNode
        ? `페이지 주제를 나타내는 엔티티를 찾았습니다. (@type: ${typeStringOf(topicalNode)})`
        : "Article/Product/FAQPage 등 페이지가 실제로 다루는 주제를 나타내는 엔티티가 없습니다. (WebPage만으로는 부족해요.)",
      "페이지 내용에 맞는 구체적인 타입(Article, Product, FAQPage, HowTo, LocalBusiness 등)으로 핵심 주제 엔티티를 명시하세요."
    ),
  ]);

  // ================= 2. 속성 완성도 (30점) =================
  const orgAttrSpecs = [
    { label: "name", check: (n) => has(n, "name") },
    { label: "url", check: (n) => has(n, "url") },
    { label: "logo/image", check: (n) => has(n, "logo") || has(n, "image") },
    { label: "description", check: (n) => has(n, "description") },
  ];
  const websiteAttrSpecs = [
    { label: "name", check: (n) => has(n, "name") },
    { label: "url", check: (n) => has(n, "url") },
    {
      label: "potentialAction(SearchAction)",
      check: (n) => {
        if (!n.potentialAction) return false;
        const arr = Array.isArray(n.potentialAction) ? n.potentialAction : [n.potentialAction];
        return arr.some((a) => a && /searchaction/i.test(typeStringOf(a)));
      },
    },
    { label: "inLanguage", check: (n) => has(n, "inLanguage") },
  ];
  const webpageAttrSpecs = [
    { label: "name", check: (n) => has(n, "name") },
    { label: "url/@id", check: (n) => has(n, "url") || has(n, "@id") },
    { label: "description", check: (n) => has(n, "description") },
    { label: "isPartOf", check: (n) => has(n, "isPartOf") },
  ];

  const orgAttr = orgNode ? countPresent(orgNode, orgAttrSpecs) : null;
  const websiteAttr = websiteNode ? countPresent(websiteNode, websiteAttrSpecs) : null;
  const webpageAttr = webpageNode ? countPresent(webpageNode, webpageAttrSpecs) : null;
  const dateCarrier = topicalNode || webpageNode;
  const hasDateAttr = dateCarrier ? has(dateCarrier, "datePublished") || has(dateCarrier, "dateModified") : false;

  const attributeCompleteness = categoryScore([
    makeCheck(
      "org_attributes",
      "발행 주체(Organization/Person) 필수 속성",
      10,
      !!orgAttr && orgAttr.present >= 3,
      !orgNode
        ? "발행 주체 엔티티가 없어 속성을 확인할 수 없습니다."
        : `${orgAttr.present}/${orgAttr.total}개 속성 확인 (name, url, logo/image, description 중 ${
            orgAttr.missing.length > 0 ? `누락: ${orgAttr.missing.join(", ")}` : "모두 존재"
          }).`,
      "발행 주체 엔티티에 name, url, logo(또는 image), description 속성을 모두 채워주세요."
    ),
    makeCheck(
      "website_attributes",
      "WebSite 필수 속성",
      8,
      !!websiteAttr && websiteAttr.present >= 3,
      !websiteNode
        ? "WebSite 엔티티가 없어 속성을 확인할 수 없습니다."
        : `${websiteAttr.present}/${websiteAttr.total}개 속성 확인 (name, url, potentialAction(SearchAction), inLanguage 중 ${
            websiteAttr.missing.length > 0 ? `누락: ${websiteAttr.missing.join(", ")}` : "모두 존재"
          }).`,
      "WebSite 엔티티에 name, url, potentialAction(SearchAction), inLanguage 속성을 채워주세요. SearchAction은 검색결과 사이트링크 검색창 노출에도 도움이 됩니다."
    ),
    makeCheck(
      "webpage_attributes",
      "WebPage 필수 속성",
      7,
      !!webpageAttr && webpageAttr.present >= 3,
      !webpageNode
        ? "WebPage 엔티티가 없어 속성을 확인할 수 없습니다."
        : `${webpageAttr.present}/${webpageAttr.total}개 속성 확인 (name, url/@id, description, isPartOf 중 ${
            webpageAttr.missing.length > 0 ? `누락: ${webpageAttr.missing.join(", ")}` : "모두 존재"
          }).`,
      "WebPage 엔티티에 name, url(또는 @id), description, isPartOf 속성을 채워주세요."
    ),
    makeCheck(
      "date_attributes",
      "발행/수정일 속성 (datePublished/dateModified)",
      5,
      hasDateAttr,
      dateCarrier
        ? hasDateAttr
          ? "datePublished 또는 dateModified가 확인됩니다."
          : "datePublished/dateModified 속성이 없습니다."
        : "날짜 속성을 확인할 대상 엔티티(WebPage 또는 주제 엔티티)가 없습니다.",
      "콘텐츠의 발행일(datePublished)과 수정일(dateModified)을 명시해 AI 검색엔진에 최신성 신호를 제공하세요."
    ),
  ]);

  // ================= 3. 엔티티 연결성 (15점) =================
  const majorEntities = [orgNode, websiteNode, webpageNode].filter(Boolean);
  const withId = majorEntities.filter((n) => has(n, "@id"));
  const crossReferenced = hasCrossReference(nodeEntries);
  const sameAsCarrier = orgNode || websiteNode;
  const sameAs = sameAsInfo(sameAsCarrier);

  const entityConnectivity = categoryScore([
    makeCheck(
      "id_assignment",
      "@id 식별자 부여",
      6,
      majorEntities.length > 0 && withId.length > 0 && withId.length / majorEntities.length >= 0.5,
      majorEntities.length === 0
        ? "@id를 확인할 주요 엔티티(발행주체/웹사이트/웹페이지)가 없습니다."
        : `${withId.length}/${majorEntities.length}개 주요 엔티티에 @id가 부여되어 있습니다.`,
      "Organization, WebSite, WebPage 등 주요 엔티티마다 고유한 @id(예: \"https://example.com/#organization\")를 부여하세요."
    ),
    makeCheck(
      "cross_reference",
      "엔티티 간 상호 참조 (@id 연결)",
      5,
      crossReferenced,
      crossReferenced
        ? "엔티티들이 @id를 통해 서로 참조하고 있습니다. (예: WebPage → isPartOf → WebSite)"
        : "엔티티끼리 @id로 서로 참조하는 구조가 확인되지 않습니다.",
      "WebPage의 isPartOf가 WebSite의 @id를, 콘텐츠의 publisher가 Organization의 @id를 참조하도록 연결하세요. @graph 구조를 쓰면 관리하기 쉬워집니다."
    ),
    makeCheck(
      "sameas_external",
      "sameAs 외부 신뢰 링크",
      4,
      sameAs.count >= 2,
      sameAsCarrier
        ? `sameAs 링크 ${sameAs.count}개 확인 (신뢰 도메인 ${sameAs.trusted}개: 위키피디아/위키데이터/공식 SNS 등).`
        : "sameAs를 확인할 발행 주체 엔티티가 없습니다.",
      "위키피디아, 위키데이터, 공식 SNS(인스타그램·유튜브·링크드인 등) 프로필을 sameAs 배열로 연결해 엔티티의 신뢰도를 높이세요."
    ),
  ]);

  const overallScore = Math.round(
    coreEntity.score * 0.55 + attributeCompleteness.score * 0.3 + entityConnectivity.score * 0.15
  );

  const taggedChecks = [
    ...coreEntity.checks.map((c) => ({ ...c, category: "핵심 엔티티 구성" })),
    ...attributeCompleteness.checks.map((c) => ({ ...c, category: "속성 완성도" })),
    ...entityConnectivity.checks.map((c) => ({ ...c, category: "엔티티 연결성" })),
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
    jsonLdBlockCount: jsonLdBlocks.length,
    categories: {
      coreEntity,
      attributeCompleteness,
      entityConnectivity,
    },
  };
}

module.exports = { analyzeGeoEntity };
