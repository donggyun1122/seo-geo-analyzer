// 서버 전용 Supabase 클라이언트 (service role key 사용 — 절대 브라우저로 내려보내지 않습니다).
// API 라우트(pages/api/place/*.js)와 순위 측정 스크립트(scripts/run-place-rank-checks.mjs)에서만 사용하세요.
const { createClient } = require("@supabase/supabase-js");

let cachedClient = null;

function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    const err = new Error(
      "Supabase 환경변수가 설정되어 있지 않습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 등록해주세요."
    );
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

module.exports = { getSupabaseAdmin };
