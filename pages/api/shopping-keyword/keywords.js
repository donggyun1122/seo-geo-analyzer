const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("shopping_keyword_latest")
      .select("*")
      .order("keyword", { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rows = (data || []).map((r) => ({
      shoppingKeywordId: r.shopping_keyword_id,
      keyword: r.keyword,
      maxRank: r.max_rank,
      isActive: r.is_active,
      currentStatus: r.current_status,
      currentMeasuredAt: r.current_measured_at,
      currentErrorMessage: r.current_error_message,
      currentItemCount: r.current_item_count,
    }));

    return res.status(200).json({ ok: true, keywords: rows });
  }

  if (req.method === "POST") {
    const { keyword, maxRank } = req.body || {};
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ ok: false, error: "키워드를 입력해주세요." });
    }
    const mr = [50, 100, 200].includes(Number(maxRank)) ? Number(maxRank) : 50;

    const { data, error } = await supabase
      .from("shopping_keywords")
      .insert({ keyword: keyword.trim(), max_rank: mr })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ ok: false, error: "이미 등록된 키워드예요." });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true, keyword: data });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "id가 필요해요." });
    // 완전 삭제 대신 비활성화 — 분석 이력(스냅샷)은 그대로 남겨둡니다.
    const { error } = await supabase.from("shopping_keywords").update({ is_active: false }).eq("id", id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "지원하지 않는 메서드예요." });
}
