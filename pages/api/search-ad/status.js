// "검색광고 분석" 요청 후 화면이 폴링하는 엔드포인트 — requestId로 그 요청의 결과만 정확히 찾습니다.

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
    .from("search_ad_lists")
    .select("requested_at, keyword, device, pages_fetched, status, error_message, results")
    .eq("request_id", requestId)
    .order("requested_at", { ascending: false })
    .limit(1);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const row = (data || [])[0];
  if (!row) return res.status(200).json({ ok: true, done: false });

  return res.status(200).json({
    ok: true,
    done: true,
    result: {
      keyword: row.keyword,
      device: row.device || "pc",
      pagesFetched: row.pages_fetched,
      requestedAt: row.requested_at,
      status: row.status,
      errorMessage: row.error_message,
      results: row.results || [],
    },
  });
}
