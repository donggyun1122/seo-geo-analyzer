const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");
const { extractPlaceIdFromUrl } = require("../../../lib/placeRank/extractPlaceId");

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase.from("places").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, places: data });
  }

  if (req.method === "POST") {
    const { name, naverPlaceUrl } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: "매장 이름을 입력해주세요." });
    }
    if (!naverPlaceUrl || !naverPlaceUrl.trim()) {
      return res.status(400).json({ ok: false, error: "네이버 플레이스 URL을 입력해주세요." });
    }
    const placeId = extractPlaceIdFromUrl(naverPlaceUrl.trim());
    if (!placeId) {
      return res.status(400).json({
        ok: false,
        error:
          "URL에서 매장 고유 ID를 찾지 못했어요. 네이버 플레이스 상세 페이지 URL(예: https://m.place.naver.com/restaurant/1234567890/home)을 입력해주세요.",
      });
    }

    const { data, error } = await supabase
      .from("places")
      .insert({ name: name.trim(), naver_place_id: placeId, naver_place_url: naverPlaceUrl.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ ok: false, error: "이미 등록된 매장이에요 (동일한 네이버 플레이스 ID)." });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true, place: data });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "id가 필요해요." });
    const { error } = await supabase.from("places").delete().eq("id", id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "지원하지 않는 메서드예요." });
}
