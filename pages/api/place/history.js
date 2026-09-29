const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET 요청만 지원해요." });
  }

  const { placeKeywordId, days } = req.query;
  if (!placeKeywordId) {
    return res.status(400).json({ ok: false, error: "placeKeywordId가 필요해요." });
  }
  const windowDays = days === "30" ? 30 : 7;

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  const since = new Date(Date.now() - windowDays * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("rank_checks")
    .select("measured_at, status, rank, error_message")
    .eq("place_keyword_id", placeKeywordId)
    .gte("measured_at", since)
    .order("measured_at", { ascending: true });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const history = (data || []).map((r) => ({
    measuredAt: r.measured_at,
    status: r.status,
    rank: r.rank,
    errorMessage: r.error_message,
  }));

  return res.status(200).json({ ok: true, windowDays, history });
}
