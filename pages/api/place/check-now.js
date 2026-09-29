// "지금 측정하기" 버튼이 호출하는 엔드포인트.
// 실제 크롤링(Playwright)은 여기서 직접 하지 않고 — Vercel 서버리스 함수는 헤드리스
// 브라우저를 돌리기에 적합하지 않아서 매일 배치와 동일하게 GitHub Actions에서 실행해요 —
// 대신 GitHub의 workflow_dispatch API를 호출해서 "이 키워드 하나만 지금 측정해줘"라고
// 요청만 보냅니다. 실제 결과는 몇 초~1분 뒤 Supabase에 쌓이고, 화면은 그걸 폴링해서 보여줘요.
//
// 필요한 환경변수 (Vercel에 등록):
//  - GITHUB_TOKEN: 이 저장소에 대해 Actions 실행 권한(fine-grained면 "Actions: Read and write")이 있는 토큰
//  - GITHUB_REPO: "owner/repo" 형식 (예: dawoori/seo-geo-analyzer)
//  - GITHUB_WORKFLOW_REF (선택): 실행할 브랜치/ref, 기본값 "main"

const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

const WORKFLOW_FILE = "place-rank-check.yml";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 지원해요." });
  }

  const { placeKeywordId } = req.body || {};
  if (!placeKeywordId) {
    return res.status(400).json({ ok: false, error: "placeKeywordId가 필요해요." });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";

  if (!token || !repo) {
    return res.status(500).json({
      ok: false,
      error:
        "즉시 측정 기능이 아직 설정되지 않았어요. Vercel에 GITHUB_TOKEN, GITHUB_REPO 환경변수를 등록해주세요. (README.md 참고)",
    });
  }

  // 존재하지 않는 키워드에 대해 워크플로를 낭비 실행하지 않도록 먼저 확인.
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("place_keywords")
      .select("id")
      .eq("id", placeKeywordId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: "등록되지 않은 키워드예요." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  const requestedAt = new Date().toISOString();

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "seo-geo-analyzer-place-rank",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref, inputs: { place_keyword_id: placeKeywordId } }),
      }
    );

    if (ghRes.status === 204) {
      return res.status(200).json({ ok: true, requestedAt });
    }

    const text = await ghRes.text().catch(() => "");
    if (ghRes.status === 401 || ghRes.status === 403) {
      return res.status(500).json({
        ok: false,
        error: "GITHUB_TOKEN 인증에 실패했어요. 토큰이 만료되었거나 권한(Actions: Read and write)이 부족할 수 있어요.",
      });
    }
    if (ghRes.status === 404) {
      return res.status(500).json({
        ok: false,
        error:
          "저장소 또는 워크플로 파일을 찾지 못했어요. GITHUB_REPO 값(owner/repo)과 .github/workflows/place-rank-check.yml 경로를 확인해주세요.",
      });
    }
    return res.status(500).json({ ok: false, error: `GitHub API 오류 (${ghRes.status}): ${text.slice(0, 300)}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `GitHub API 요청 중 오류: ${err.message}` });
  }
}
