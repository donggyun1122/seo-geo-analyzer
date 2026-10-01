// "검색광고 분석" 화면의 "분석하기" 버튼이 호출하는 엔드포인트.
// 키워드 순위표(keyword-place-list/start.js)와 같은 방식이에요 — Vercel 서버리스 함수는 헤드리스
// 브라우저를 돌리기에 적합하지 않아서, GitHub Actions의 workflow_dispatch API로 "이 키워드의
// 파워링크 광고를 조회해줘"라고 요청만 보냅니다. 결과는 1~3분 뒤 Supabase에 쌓이고, 화면은
// requestId로 그 결과를 폴링해서 보여줘요(status.js).
//
// 필요한 환경변수(Vercel — 다른 기능과 같은 값을 그대로 씁니다): GITHUB_TOKEN, GITHUB_REPO,
// GITHUB_WORKFLOW_REF(선택, 기본 main)

const crypto = require("crypto");

const WORKFLOW_FILE = "search-ad-list.yml";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 지원해요." });
  }

  const { keyword, device } = req.body || {};
  if (!keyword || !String(keyword).trim()) {
    return res.status(400).json({ ok: false, error: "키워드를 입력해주세요." });
  }
  const kw = String(keyword).trim().slice(0, 100);
  const dev = device === "mobile" ? "mobile" : "pc";

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";
  if (!token || !repo) {
    return res.status(500).json({
      ok: false,
      error: "검색광고 분석 기능이 아직 설정되지 않았어요. Vercel에 GITHUB_TOKEN, GITHUB_REPO 환경변수를 등록해주세요.",
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
        "User-Agent": "seo-geo-analyzer-search-ad",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs: { request_id: requestId, keyword: kw, device: dev } }),
    });

    if (ghRes.status === 204) {
      return res.status(200).json({ ok: true, requestId });
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
        error: `저장소 또는 워크플로 파일을 찾지 못했어요. 저장소의 .github/workflows 폴더 안에 ${WORKFLOW_FILE} 파일이 있는지 확인해주세요.`,
      });
    }
    return res.status(500).json({ ok: false, error: `GitHub API 오류 (${ghRes.status}): ${text.slice(0, 300)}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `GitHub API 요청 중 오류: ${err.message}` });
  }
}
