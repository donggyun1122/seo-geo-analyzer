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
    .from("shopping_rank_checks")
    .select(
      "requested_at, keyword, product_id_input, product_id_value, product_id_space, area_mode, max_rank, status, error_message, rank, max_rank_checked, matched_item"
    )
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
      keyword: row.keyword,
      productIdInput: row.product_id_input,
      productIdValue: row.product_id_value,
      productIdSpace: row.product_id_space,
      areaMode: row.area_mode,
      maxRank: row.max_rank,
      status: row.status,
      errorMessage: row.error_message,
      rank: row.rank,
      maxRankChecked: row.max_rank_checked,
      matchedItem: row.matched_item,
    },
  });
}
