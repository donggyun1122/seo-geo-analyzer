const { analyzeUrl } = require("../../lib/analyze");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 지원합니다." });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ ok: false, error: "URL을 입력해주세요." });
  }

  try {
    const result = await analyzeUrl(url);
    if (!result.ok) {
      return res.status(422).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    });
  }
}
