const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

function rankChangeOf(current, previous) {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  return previous - current; // 순위는 낮은 숫자가 더 좋은 위치라서, "전일 - 오늘"이 양수면 상승
}

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("place_keyword_latest")
      .select("*, places(name)")
      .order("keyword", { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rows = (data || []).map((r) => ({
      placeKeywordId: r.place_keyword_id,
      placeId: r.place_id,
      placeName: r.places ? r.places.name : null,
      keyword: r.keyword,
      searchLocation: r.search_location,
      device: r.device,
      isActive: r.is_active,
      currentRank: r.current_rank,
      currentStatus: r.current_status,
      currentMeasuredAt: r.current_measured_at,
      previousRank: r.previous_rank,
      previousStatus: r.previous_status,
      previousMeasuredAt: r.previous_measured_at,
      rankChange: rankChangeOf(r.current_rank, r.previous_rank),
    }));

    return res.status(200).json({ ok: true, keywords: rows });
  }

  if (req.method === "POST") {
    const { placeId, keyword, searchLocation, device } = req.body || {};
    if (!placeId) return res.status(400).json({ ok: false, error: "placeId가 필요해요." });
    if (!keyword || !keyword.trim()) return res.status(400).json({ ok: false, error: "키워드를 입력해주세요." });
    const dev = device === "pc" ? "pc" : "mobile";

    const { data, error } = await supabase
      .from("place_keywords")
      .insert({
        place_id: placeId,
        keyword: keyword.trim(),
        search_location: searchLocation ? searchLocation.trim() : null,
        device: dev,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ ok: false, error: "이미 등록된 키워드예요 (같은 매장·키워드·디바이스 조합)." });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true, keyword: data });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "id가 필요해요." });
    // 완전 삭제 대신 비활성화 — 순위 이력은 그대로 남겨둡니다.
    const { error } = await supabase.from("place_keywords").update({ is_active: false }).eq("id", id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "지원하지 않는 메서드예요." });
}
