// "검색광고 분석 > 키워드 노출분석"의 "노출 순위 확인" 버튼.
// 노출 광고 현황(search-ad/start.js)과 같은 방식 — GitHub Actions(search-ad-rank.yml)에 조회를
// 요청하고, 화면은 requestId로 결과를 폴링해요(status.js).
// 필요한 환경변수(Vercel): GITHUB_TOKEN, GITHUB_REPO, GITHUB_WORKFLOW_REF(선택)

const crypto = require("crypto");
const { parseSite, placeIdOf } = require("../../../lib/searchAd/siteMatch");

const WORKFLOW_FILE = "search-ad-rank.yml";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 지원해요." });
  }

  const { keyword, siteUrl, advertiserName } = req.body || {};
  if (!keyword || !String(keyword).trim()) {
    return res.status(400).json({ ok: false, error: "키워드를 입력해주세요." });
  }
  const url = siteUrl ? String(siteUrl).trim() : "";
  const name = advertiserName ? String(advertiserName).trim().slice(0, 60) : "";
  if (!url && !name) {
    return res.status(400).json({ ok: false, error: "우리 사이트 URL이나 광고주명(업체명) 중 하나는 입력해주세요." });
  }
  if (url) {
    const site = parseSite(url);
    if (!site) {
      return res.status(400).json({ ok: false, error: "사이트 주소를 알아볼 수 없어요. 예: https://www.mysite.co.kr 또는 mysite.co.kr" });
    }
    if (site.shared && !site.firstSegment) {
      return res.status(400).json({
        ok: false,
        error: `${site.host}는 여러 업체가 함께 쓰는 주소라, 스토어 이름까지 입력해주세요. 예: smartstore.naver.com/스토어명`,
      });
    }
    if (site.isPlaceHost && !placeIdOf(url) && !name) {
      return res.status(400).json({
        ok: false,
        error: "네이버 플레이스 주소는 업체 번호가 들어간 주소(예: map.naver.com/p/entry/place/1234567)를 넣거나, 광고주명(업체명)을 같이 입력해주세요.",
      });
    }
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";
  if (!token || !repo) {
    return res.status(500).json({
      ok: false,
      error: "키워드 노출분석 기능이 아직 설정되지 않았어요. Vercel에 GITHUB_TOKEN, GITHUB_REPO 환경변수를 등록해주세요.",
    });
  }

  const requestId = crypto.randomUUID();
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "seo-geo-analyzer-search-ad-rank",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          request_id: requestId,
          keyword: String(keyword).trim().slice(0, 100),
          site_url: url.slice(0, 300),
          advertiser_name: name,
        },
      }),
    });

    if (ghRes.status === 204) return res.status(200).json({ ok: true, requestId });

    const text = await ghRes.text().catch(() => "");
    if (ghRes.status === 401 || ghRes.status === 403) {
      return res.status(500).json({ ok: false, error: "GITHUB_TOKEN 인증에 실패했어요. 토큰이 만료되었거나 권한(Actions: Read and write)이 부족할 수 있어요." });
    }
    if (ghRes.status === 404) {
      return res.status(500).json({
        ok: false,
        error: `저장소 또는 워크플로 파일을 찾지 못했어요. 저장소의 .github/workflows 폴더 안에 ${WORKFLOW_FILE} 파일이 있는지 확인해주세요.`,
      });
    }
    return res.status(500).json({ ok: false, error: `GitHub API 오류 (${ghRes.status}): ${text.slice(0, 300)}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `GitHub API 요청 중 오류: ${err.message}` });
  }
}
