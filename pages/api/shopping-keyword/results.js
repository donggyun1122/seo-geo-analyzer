const { SHOPPING_ENABLED } = require("../../../lib/featureFlags");
// 특정 쇼핑 키워드의 "최신 분석 결과"를, 바로 이전 스냅샷과 상품 ID 기준으로 비교해서
// 순위/가격 변동(▲▼)까지 계산해 반환합니다. 상품이 여러 개인 배열(jsonb)이라 SQL 뷰 대신
// 여기서 매칭합니다(파일 schema.sql의 shopping_keyword_latest 뷰 주석 참고).
//
// 상품 ID 매칭 우선순위: catalogNvMid → nvMid → chnlProdNo. 어느 것도 없는 상품(추출
// 실패 등)은 전일 대비를 계산하지 않고 "-"로 표시합니다(추측하지 않음).

const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");

function bestId(item) {
  return item.catalogNvMid || item.nvMid || item.chnlProdNo || null;
}

export default async function handler(req, res) {
  if (!SHOPPING_ENABLED) {
    return res.status(404).json({ ok: false, error: "네이버 쇼핑 분석 기능은 현재 비활성화되어 있어요." });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET 요청만 지원해요." });
  }

  const { shoppingKeywordId } = req.query;
  if (!shoppingKeywordId) {
    return res.status(400).json({ ok: false, error: "shoppingKeywordId가 필요해요." });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  const { data, error } = await supabase
    .from("shopping_keyword_snapshots")
    .select("measured_at, status, error_message, max_rank, results")
    .eq("shopping_keyword_id", shoppingKeywordId)
    .order("measured_at", { ascending: false })
    .limit(2);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data || data.length === 0) {
    return res.status(200).json({ ok: true, current: null, rows: [] });
  }

  const current = data[0];
  const previous = data[1] || null;

  const prevMap = new Map();
  if (previous && Array.isArray(previous.results)) {
    for (const item of previous.results) {
      const id = bestId(item);
      if (id) prevMap.set(id, item);
    }
  }

  const rows = (current.results || []).map((item) => {
    const id = bestId(item);
    const prevItem = id ? prevMap.get(id) : null;
    let rankChange = null;
    let priceChange = null;
    if (prevItem) {
      if (typeof item.rank === "number" && typeof prevItem.rank === "number") {
        rankChange = prevItem.rank - item.rank; // 양수면 순위 상승(더 낮은 숫자로 이동)
      }
      if (typeof item.price === "number" && typeof prevItem.price === "number") {
        priceChange = item.price - prevItem.price; // 양수면 가격 인상
      }
    }
    return { ...item, rankChange, priceChange, hasPrevious: !!prevItem };
  });

  return res.status(200).json({
    ok: true,
    current: {
      measuredAt: current.measured_at,
      status: current.status,
      errorMessage: current.error_message,
      maxRank: current.max_rank,
    },
    previous: previous
      ? { measuredAt: previous.measured_at, status: previous.status }
      : null,
    rows,
  });
}
