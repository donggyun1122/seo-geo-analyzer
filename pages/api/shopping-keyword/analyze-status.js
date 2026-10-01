const { SHOPPING_ENABLED } = require("../../../lib/featureFlags");
const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

export default async function handler(req, res) {
  if (!SHOPPING_ENABLED) {
    return res.status(404).json({ ok: false, error: "네이버 쇼핑 분석 기능은 현재 비활성화되어 있어요." });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET 요청만 지원해요." });
  }

  const { shoppingKeywordId, requestId } = req.query;
  if (!shoppingKeywordId || !requestId) {
    return res.status(400).json({ ok: false, error: "shoppingKeywordId와 requestId가 필요해요." });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  const { data, error } = await supabase
    .from("shopping_keyword_snapshots")
    .select("measured_at, status, error_message, results")
    .eq("request_id", requestId)
    .eq("shopping_keyword_id", shoppingKeywordId)
    .order("measured_at", { ascending: false })
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
      measuredAt: row.measured_at,
      status: row.status,
      errorMessage: row.error_message,
      itemCount: Array.isArray(row.results) ? row.results.length : 0,
    },
  });
}
