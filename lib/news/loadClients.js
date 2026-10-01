// 서버 전용 — 모니터링할 고객사 목록을 불러와요.
// Supabase news_clients 테이블이 있고 행이 있으면 그걸 쓰고, 아니면 기본 22곳(defaultClients.js)을 써요.
const { getSupabaseAdmin } = require("../supabaseAdmin");
const { getDefaultClients, normalizeClient } = require("./defaultClients");

// 테이블이 아직 없을 때 Supabase가 돌려주는 오류인지
function isMissingTable(error) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message || "");
}

async function loadClients({ includeInactive = false } = {}) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return { source: "default", reason: "supabase_not_configured", clients: getDefaultClients() };
  }
  let query = supabase.from("news_clients").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) {
    return {
      source: "default",
      reason: isMissingTable(error) ? "table_missing" : "db_error",
      error: isMissingTable(error) ? null : error.message,
      clients: getDefaultClients(),
    };
  }
  if (!data || data.length === 0) {
    return { source: "default", reason: "table_empty", clients: getDefaultClients() };
  }
  return {
    source: "db",
    clients: data.map((row, i) => ({ ...normalizeClient(row, i), isActive: row.is_active !== false })),
  };
}

module.exports = { loadClients, isMissingTable };
