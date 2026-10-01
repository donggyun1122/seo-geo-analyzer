// 뉴스 클리핑 모니터링 기업 관리 API
//  GET    → 목록(Supabase 테이블이 없으면 기본 22곳 + source: "default")
//  POST   → 추가 { name, keywords, requireAny, excludeKeywords, ignoreTerms, matchScope, domain }
//  PUT    → 수정 { id, ...같은 항목, isActive }
//  DELETE → 삭제 { id }
//  POST { action: "seed" } → 테이블이 비어 있으면 기본 22곳을 넣어줘요.
// 추가·수정·삭제는 Supabase에 news_clients 테이블이 있어야 해요(supabase/schema.sql).
const { getSupabaseAdmin } = require("../../../lib/supabaseAdmin");
const { loadClients, isMissingTable } = require("../../../lib/news/loadClients");
const { DEFAULT_CLIENTS, normalizeClient } = require("../../../lib/news/defaultClients");

const TABLE_HELP =
  "Supabase에 news_clients 테이블이 아직 없어요. Supabase → SQL Editor에서 supabase/schema.sql 전체를 다시 실행한 뒤 시도해주세요.";

function toList(v) {
  return (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
}

function toRow(body) {
  const row = {};
  if (body.name !== undefined) row.name = String(body.name || "").trim().slice(0, 60);
  if (body.keywords !== undefined) row.keywords = toList(body.keywords);
  if (body.requireAny !== undefined) row.require_any = toList(body.requireAny);
  if (body.excludeKeywords !== undefined) row.exclude_keywords = toList(body.excludeKeywords);
  if (body.ignoreTerms !== undefined) row.ignore_terms = toList(body.ignoreTerms);
  if (body.matchScope !== undefined) row.match_scope = body.matchScope === "title" ? "title" : "title_desc";
  if (body.domain !== undefined) {
    row.domain = String(body.domain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").slice(0, 120) || null;
  }
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) row.sort_order = Number(body.sortOrder);
  if (body.isActive !== undefined) row.is_active = !!body.isActive;
  return row;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const loaded = await loadClients({ includeInactive: true });
    return res.status(200).json({ ok: true, source: loaded.source, reason: loaded.reason || null, clients: loaded.clients });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
  const body = req.body || {};

  if (req.method === "POST" && body.action === "seed") {
    const { count, error: cErr } = await supabase.from("news_clients").select("id", { count: "exact", head: true });
    if (cErr) return res.status(isMissingTable(cErr) ? 400 : 500).json({ ok: false, error: isMissingTable(cErr) ? TABLE_HELP : cErr.message });
    if (count > 0) return res.status(200).json({ ok: true, inserted: 0, message: "이미 기업 목록이 있어서 그대로 뒀어요." });
    const rows = DEFAULT_CLIENTS.map((c, i) => {
      const n = normalizeClient(c, i);
      return {
        name: n.name,
        keywords: n.keywords,
        require_any: n.requireAny,
        exclude_keywords: n.excludeKeywords,
        ignore_terms: n.ignoreTerms,
        match_scope: n.matchScope,
        domain: n.domain,
        sort_order: i,
        is_active: true,
      };
    });
    const { error } = await supabase.from("news_clients").insert(rows);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, inserted: rows.length });
  }

  if (req.method === "POST") {
    const row = toRow(body);
    if (!row.name) return res.status(400).json({ ok: false, error: "기업명을 입력해주세요." });
    if (!row.keywords || row.keywords.length === 0) row.keywords = [row.name];
    if (row.sort_order === undefined) row.sort_order = 999;
    const { data, error } = await supabase.from("news_clients").insert(row).select().single();
    if (error) {
      if (isMissingTable(error)) return res.status(400).json({ ok: false, error: TABLE_HELP });
      if (error.code === "23505") return res.status(409).json({ ok: false, error: "이미 같은 이름의 기업이 있어요." });
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true, client: normalizeClient(data, 0) });
  }

  if (req.method === "PUT") {
    if (!body.id || String(body.id).startsWith("default-")) {
      return res.status(400).json({ ok: false, error: "기본 목록은 바로 고칠 수 없어요. 먼저 '기본 22곳을 DB로 가져오기'를 눌러주세요." });
    }
    const row = toRow(body);
    if (row.name === "") return res.status(400).json({ ok: false, error: "기업명을 입력해주세요." });
    if (row.keywords && row.keywords.length === 0) return res.status(400).json({ ok: false, error: "검색 키워드를 1개 이상 입력해주세요." });
    const { data, error } = await supabase.from("news_clients").update(row).eq("id", body.id).select().single();
    if (error) {
      if (isMissingTable(error)) return res.status(400).json({ ok: false, error: TABLE_HELP });
      if (error.code === "23505") return res.status(409).json({ ok: false, error: "이미 같은 이름의 기업이 있어요." });
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true, client: normalizeClient(data, 0) });
  }

  if (req.method === "DELETE") {
    if (!body.id || String(body.id).startsWith("default-")) return res.status(400).json({ ok: false, error: "삭제할 기업 id가 필요해요." });
    const { error } = await supabase.from("news_clients").delete().eq("id", body.id);
    if (error) return res.status(isMissingTable(error) ? 400 : 500).json({ ok: false, error: isMissingTable(error) ? TABLE_HELP : error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ ok: false, error: "지원하지 않는 메서드예요." });
}
