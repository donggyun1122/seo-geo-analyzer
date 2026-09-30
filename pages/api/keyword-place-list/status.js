// "키워드 분석하기" 요청 후 화면이 폴링하는 엔드포인트.
// requestId로 저장된 결과가 있는지 확인해요(플레이스 순위 기능의 check-status.js와 동일한
// 방식 — 측정/조회 시각 비교가 아니라 요청마다 고유한 requestId로 정확히 매칭합니다).

const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET 요청만 지원해요." });
  }

  const { requestId } = req.query;
  if (!requestId) {
    return res.status(400).json({ ok: false, error: "requestId가 필요해요." });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  const { data, error } = await supabase
    .from("keyword_place_lists")
    .select("requested_at, status, error_message, results, keyword, device, max_rank")
    .eq("request_id", requestId)
    .order("requested_at", { ascending: false })
    .limit(1);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const row = (data || [])[0];
  if (!row) {
    return res.status(200).json({ ok: true, done: false });
  }

  return res.status(200).json({
    ok: true,
    done: true,
    result: {
      status: row.status,
      errorMessage: row.error_message,
      results: row.results || [],
      keyword: row.keyword,
      device: row.device,
      maxRank: row.max_rank,
    },
  });
}
