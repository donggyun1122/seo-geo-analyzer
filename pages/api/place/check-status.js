// "지금 측정하기" 버튼을 누른 뒤 화면이 폴링하는 엔드포인트.
// since(ISO 시각) 이후에 새로 기록된 rank_checks가 있는지만 확인해요.
// (GitHub workflow_dispatch API는 실행 ID를 바로 돌려주지 않기 때문에,
//  "요청 시각 이후에 새 결과가 생겼는가"로 완료 여부를 판단하는 방식입니다.)

const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET 요청만 지원해요." });
  }

  const { placeKeywordId, since } = req.query;
  if (!placeKeywordId || !since) {
    return res.status(400).json({ ok: false, error: "placeKeywordId와 since가 필요해요." });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  const { data, error } = await supabase
    .from("rank_checks")
    .select("measured_at, status, rank, error_message")
    .eq("place_keyword_id", placeKeywordId)
    .gt("measured_at", since)
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
      rank: row.rank,
      errorMessage: row.error_message,
    },
  });
}
