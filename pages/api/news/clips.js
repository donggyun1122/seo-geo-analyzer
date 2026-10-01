// GET /api/news/clips?days=14&fresh=1
// 고객사별 최근 뉴스를 네이버 뉴스 검색 API로 모아서 돌려줘요.
// 키는 서버 환경변수(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)에서만 읽고, 응답에는 절대 넣지 않아요.
import { fetchNaverSearch } from "../../../lib/brandContent";

const { collectAllNews } = require("../../../lib/news/collectNews");
const { loadClients } = require("../../../lib/news/loadClients");

export const config = { maxDuration: 30 };

const CACHE_MS = 5 * 60 * 1000;
// 같은 서버 인스턴스가 살아있는 동안 5분간 결과를 재사용해요(네이버 API 호출 절약).
let memoryCache = { key: null, at: 0, body: null };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET 요청만 지원해요." });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({
      ok: false,
      error: "네이버 검색 API 키가 설정되어 있지 않아요. Vercel 환경변수에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET을 등록해주세요.",
    });
  }

  const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 14));
  const fresh = req.query.fresh === "1";

  try {
    const loaded = await loadClients();
    const cacheKey = `${days}|${JSON.stringify(loaded.clients.map((c) => [c.id, c.keywords, c.requireAny, c.excludeKeywords, c.ignoreTerms, c.matchScope]))}`;
    if (!fresh && memoryCache.key === cacheKey && Date.now() - memoryCache.at < CACHE_MS) {
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(200).json({ ...memoryCache.body, cached: true });
    }

    const now = new Date();
    const { clients, summary } = await collectAllNews(loaded.clients, {
      now,
      windowDays: days,
      concurrency: 6,
      fetchNews: (kw) => fetchNaverSearch("news", kw, clientId, clientSecret, { display: 100, sort: "date" }),
    });

    const body = {
      ok: true,
      collectedAt: now.toISOString(),
      windowDays: days,
      clientsSource: loaded.source,
      clientsSourceReason: loaded.reason || null,
      summary,
      clients: clients.map((c, i) => ({ ...c, sortOrder: loaded.clients[i].sortOrder })),
    };
    memoryCache = { key: cacheKey, at: Date.now(), body };
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).json(body);
  } catch (err) {
    return res.status(500).json({ ok: false, error: `뉴스를 모으는 중 오류가 났어요: ${String(err.message || err).slice(0, 200)}` });
  }
}
