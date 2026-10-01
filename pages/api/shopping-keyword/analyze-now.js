const { SHOPPING_ENABLED } = require("../../../lib/featureFlags");
// "지금 분석하기" 버튼 — check-now.js와 동일한 구조(workflow_dispatch + request_id 폴링).
const crypto = require("crypto");
const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

const WORKFLOW_FILE = "shopping-keyword-analysis.yml";

export default async function handler(req, res) {
  if (!SHOPPING_ENABLED) {
    return res.status(404).json({ ok: false, error: "네이버 쇼핑 분석 기능은 현재 비활성화되어 있어요." });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 지원해요." });
  }

  const { shoppingKeywordId } = req.body || {};
  if (!shoppingKeywordId) {
    return res.status(400).json({ ok: false, error: "shoppingKeywordId가 필요해요." });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";

  if (!token || !repo) {
    return res.status(500).json({
      ok: false,
      error: "즉시 분석 기능이 아직 설정되지 않았어요. Vercel에 GITHUB_TOKEN, GITHUB_REPO 환경변수를 등록해주세요.",
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopping_keywords")
      .select("id")
      .eq("id", shoppingKeywordId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: "등록되지 않은 키워드예요." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
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
          "User-Agent": "seo-geo-analyzer-shopping-keyword",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref, inputs: { shopping_keyword_id: shoppingKeywordId, request_id: requestId } }),
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
