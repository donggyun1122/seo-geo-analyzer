// "지금 측정하기" 버튼을 누른 뒤 화면이 폴링하는 엔드포인트.
// requestId로 저장된 결과가 있는지 확인해요.
//
// (예전에는 "요청 시각(since) 이후에 새로 생긴 결과가 있는가"로 판단했는데, 이 방식은
//  서버 시간과 Supabase 시간이 살짝 다르거나, 같은 키워드를 짧은 간격으로 여러 번 측정
//  요청했을 때 다른 요청의 결과를 잘못 가져올 수 있는 문제가 있었어요. check-now.js가
//  매 요청마다 고유 UUID(requestId)를 만들어 GitHub Actions에 넘기고, 여기서는 그 ID로
//  정확히 그 요청의 결과만 찾도록 바꿨어요.)

const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET 요청만 지원해요." });
  }

  const { placeKeywordId, requestId } = req.query;
  if (!placeKeywordId || !requestId) {
    return res.status(400).json({ ok: false, error: "placeKeywordId와 requestId가 필요해요." });
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
    .eq("request_id", requestId)
    .eq("place_keyword_id", placeKeywordId)
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
