import { analyzeKeyword } from "../../lib/keywordAnalysis";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "POST 요청만 지원합니다." });
  }

  const { keyword } = req.body || {};
  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    return res.status(422).json({ ok: false, error: "키워드를 입력해주세요." });
  }

  try {
    const result = await analyzeKeyword(keyword);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: "분석 중 서버 오류가 발생했습니다." });
  }
}
