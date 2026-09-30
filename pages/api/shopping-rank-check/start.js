// "네이버 쇼핑 순위 체크" 화면의 "조회하기" 버튼 — keyword-place-list/start.js와 동일한 구조.
const crypto = require("crypto");

const WORKFLOW_FILE = "shopping-rank-check.yml";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 지원해요." });
  }

  const { keyword, productIdInput, areaMode, maxRank } = req.body || {};
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ ok: false, error: "키워드를 입력해주세요." });
  }
  if (!productIdInput || !productIdInput.trim()) {
    return res.status(400).json({ ok: false, error: "상품 URL 또는 ID를 입력해주세요." });
  }
  const area = areaMode === "ad" ? "ad" : "organic";
  const mr = [50, 100, 200].includes(Number(maxRank)) ? Number(maxRank) : 200;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";

  if (!token || !repo) {
    return res.status(500).json({
      ok: false,
      error: "순위 체크 기능이 아직 설정되지 않았어요. Vercel에 GITHUB_TOKEN, GITHUB_REPO 환경변수를 등록해주세요.",
    });
  }

  const requestId = crypto.randomUUID();

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "seo-geo-analyzer-shopping-rank-check",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref,
          inputs: {
            request_id: requestId,
            keyword: keyword.trim(),
            product_id_input: productIdInput.trim(),
            area_mode: area,
            max_rank: String(mr),
          },
        }),
      }
    );

    if (ghRes.status === 204) {
      return res.status(200).json({ ok: true, requestId });
    }

    const text = await ghRes.text().catch(() => "");
    if (ghRes.status === 401 || ghRes.status === 403) {
      return res.status(500).json({
        ok: false,
        error: "GITHUB_TOKEN 인증에 실패했어요. 토큰이 만료되었거나 권한이 부족할 수 있어요.",
      });
    }
    if (ghRes.status === 404) {
      return res.status(500).json({
        ok: false,
        error: `저장소 또는 워크플로 파일을 찾지 못했어요. .github/workflows/${WORKFLOW_FILE} 경로를 확인해주세요.`,
      });
    }
    return res.status(500).json({ ok: false, error: `GitHub API 오류 (${ghRes.status}): ${text.slice(0, 300)}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `GitHub API 요청 중 오류: ${err.message}` });
  }
}
