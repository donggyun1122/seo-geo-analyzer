// "키워드 분석하기" 버튼이 호출하는 엔드포인트.
// 플레이스 순위 기능의 check-now.js와 완전히 같은 방식이에요 — Vercel 서버리스 함수는
// 헤드리스 브라우저를 돌리기에 적합하지 않아서, GitHub Actions의 workflow_dispatch API를
// 호출해서 "이 키워드로 업체 목록을 조회해줘"라고 요청만 보냅니다. 실제 결과는 몇 분 뒤
// Supabase에 쌓이고, 화면은 그걸 폴링해서 보여줘요(status.js 참고).
//
// 필요한 환경변수 (Vercel에 등록 — 플레이스 순위 기능과 동일한 값을 그대로 씁니다):
//  - GITHUB_TOKEN: 이 저장소에 대해 Actions 실행 권한이 있는 토큰
//  - GITHUB_REPO: "owner/repo" 형식
//  - GITHUB_WORKFLOW_REF (선택): 실행할 브랜치/ref, 기본값 "main"

const crypto = require("crypto");

const WORKFLOW_FILE = "keyword-place-list.yml";
const ALLOWED_MAX_RANKS = [50, 100, 200];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 지원해요." });
  }

  const { keyword, device, maxRank } = req.body || {};
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ ok: false, error: "keyword가 필요해요." });
  }
  const safeDevice = device === "pc" ? "pc" : "mobile";
  const safeMaxRank = ALLOWED_MAX_RANKS.includes(Number(maxRank)) ? Number(maxRank) : 50;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";

  if (!token || !repo) {
    return res.status(500).json({
      ok: false,
      error:
        "키워드 분석 기능이 아직 설정되지 않았어요. Vercel에 GITHUB_TOKEN, GITHUB_REPO 환경변수를 등록해주세요. (플레이스 순위 기능을 이미 설정했다면 같은 값이 그대로 쓰여요.)",
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
          "User-Agent": "seo-geo-analyzer-keyword-place-list",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref,
          inputs: {
            request_id: requestId,
            keyword: keyword.trim(),
            device: safeDevice,
            max_rank: String(safeMaxRank),
          },
        }),
      }
    );

    if (ghRes.status === 204) {
      // 204는 "GitHub이 실행 요청을 접수했다"는 뜻일 뿐, 워크플로가 실제로 시작되거나
      // 끝까지 성공했다는 보장은 아니에요(플레이스 순위 기능과 동일한 특성).
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
        error:
          "저장소 또는 워크플로 파일을 찾지 못했어요. GITHUB_REPO 값(owner/repo)과 .github/workflows/keyword-place-list.yml 경로를 확인해주세요.",
      });
    }
    return res.status(500).json({ ok: false, error: `GitHub API 오류 (${ghRes.status}): ${text.slice(0, 300)}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `GitHub API 요청 중 오류: ${err.message}` });
  }
}
