import { useState, useEffect, useMemo, useRef, useCallback } from "react";

// "뉴스 클리핑" 화면 — 고객사별 최근 기사를 한눈에 봐요.
// 기사는 화면을 열 때 /api/news/clips 가 네이버 뉴스 검색 API(공식)로 바로 모아와요.
// 카드 순서(직접 정렬)와 정렬 방식은 이 브라우저에만 저장돼요.

const ORDER_KEY = "newsClipping.order";
const SORT_KEY = "newsClipping.sortMode";
const CARD_PREVIEW = 30;

function readStore(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}
function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 저장소를 못 쓰는 환경이면 무시
  }
}

function formatKst(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => (p.find((x) => x.type === t) || {}).value || "";
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

function relTime(iso, nowMs) {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return formatKst(iso).slice(5, 10).replace(".", "/");
}

const AVATAR_COLORS = ["#0071e3", "#7a5af8", "#0ca30c", "#d97706", "#db2777", "#0891b2", "#4f46e5", "#b45309"];
function colorOf(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function ClientLogo({ name, domain, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const initial = String(name || "?").trim().charAt(0).toUpperCase();
  if (domain && !failed) {
    return (
      <span className="news-logo" style={{ width: size, height: size }}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          alt=""
          width={size - 12}
          height={size - 12}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span className="news-logo news-logo-initial" style={{ width: size, height: size, background: colorOf(name) }} aria-hidden="true">
      {initial}
    </span>
  );
}

function RiskTag({ level }) {
  if (level === "critical") return <span className="news-tag news-tag-critical">즉시 확인</span>;
  if (level === "watch") return <span className="news-tag news-tag-watch">관찰 항목</span>;
  return null;
}

function ArticleRow({ a, nowMs, showDesc = false, clientName }) {
  return (
    <li className={`news-article${a.risk ? ` news-article-${a.risk}` : ""}`}>
      <a href={a.link} target="_blank" rel="noopener noreferrer" className="news-article-link">
        {(a.risk || clientName) && (
          <span className="news-article-tags">
            <RiskTag level={a.risk} />
            {clientName && <span className="news-tag news-tag-client">{clientName}</span>}
          </span>
        )}
        <span className="news-article-title">{a.title}</span>
        {showDesc && a.description && <span className="news-article-desc">{a.description}</span>}
        <span className="news-article-meta">
          {a.isNew && <span className="news-new-dot" title="24시간 안에 올라온 새 기사" />}
          <span>{a.press || a.domain}</span>
          <span aria-hidden="true">·</span>
          <span>{relTime(a.publishedAt, nowMs)}</span>
          {a.risk && a.riskWords && a.riskWords.length > 0 && (
            <span className="news-article-words">({a.riskWords.slice(0, 3).join(", ")})</span>
          )}
        </span>
      </a>
    </li>
  );
}

function Modal({ title, onClose, children, wide }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (panelRef.current) panelRef.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="news-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`news-modal${wide ? " news-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panelRef}>
        <div className="news-modal-head">
          <h3>{title}</h3>
          <button type="button" className="news-modal-close" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="news-modal-body">{children}</div>
      </div>
    </div>
  );
}

function ClientCard({ c, windowDays, nowMs, onOpenAll, menuOpen, onToggleMenu, onMove, dragProps, isDragOver }) {
  const preview = c.articles.slice(0, CARD_PREVIEW);
  const failed = c.status === "error";
  return (
    <section
      className={`news-card${c.criticalCount > 0 ? " news-card-critical" : ""}${isDragOver ? " news-card-dragover" : ""}`}
      onDragOver={dragProps.onDragOver}
      onDragLeave={dragProps.onDragLeave}
      onDrop={dragProps.onDrop}
    >
      <header className="news-card-head">
        <ClientLogo name={c.name} domain={c.domain} />
        <div className="news-card-title">
          <h3>{c.name}</h3>
          <div className="news-card-badges">
            {c.newCount > 0 && <span className="news-badge news-badge-new">새 기사 {c.newCount}</span>}
            {c.criticalCount > 0 && <span className="news-badge news-badge-critical">즉시 확인 {c.criticalCount}</span>}
            {c.watchCount > 0 && <span className="news-badge news-badge-watch">관찰 {c.watchCount}</span>}
          </div>
        </div>
        <div className="news-handle-wrap">
          <button
            type="button"
            className="news-handle"
            draggable
            onDragStart={dragProps.onDragStart}
            onDragEnd={dragProps.onDragEnd}
            aria-label={`${c.name} 카드 순서 바꾸기`}
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            ⠿
          </button>
          {menuOpen && (
            <div className="news-handle-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => onMove("top")}>
                맨 위로
              </button>
              <button type="button" role="menuitem" onClick={() => onMove("up")}>
                한 칸 위로
              </button>
              <button type="button" role="menuitem" onClick={() => onMove("down")}>
                한 칸 아래로
              </button>
              <button type="button" role="menuitem" onClick={() => onMove("bottom")}>
                맨 아래로
              </button>
            </div>
          )}
        </div>
      </header>

      {preview.length > 0 ? (
        <ul className="news-card-list">
          {preview.map((a) => (
            <ArticleRow key={a.id} a={a} nowMs={nowMs} />
          ))}
        </ul>
      ) : (
        <div className="news-card-empty">{failed ? "기사를 불러오지 못했어요" : `최근 ${windowDays}일 내 기사가 없습니다`}</div>
      )}

      <footer className="news-card-foot">
        <span className="news-card-count">{c.articleCount}건</span>
        {c.articleCount > 0 && (
          <button type="button" className="news-link-btn" onClick={onOpenAll}>
            전체 기사 보기 →
          </button>
        )}
      </footer>
    </section>
  );
}

const ARTICLE_FILTERS = [
  { key: "all", label: "전체" },
  { key: "critical", label: "즉시 확인" },
  { key: "watch", label: "관찰 항목" },
  { key: "new", label: "새 기사" },
];

function AllArticles({ c, nowMs, windowDays }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const counts = {
    all: c.articles.length,
    critical: c.criticalCount,
    watch: c.watchCount,
    new: c.newCount,
  };
  const list = c.articles.filter((a) => {
    if (filter === "critical" && a.risk !== "critical") return false;
    if (filter === "watch" && a.risk !== "watch") return false;
    if (filter === "new" && !a.isNew) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      return `${a.title} ${a.description} ${a.press}`.toLowerCase().includes(s);
    }
    return true;
  });
  return (
    <>
      <p className="news-modal-sub">
        최근 {windowDays}일 · 검색어 {c.keywords.join(", ")}
      </p>
      <div className="news-filter-row">
        <div className="news-chips">
          {ARTICLE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`news-chip${filter === f.key ? " active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>
        <input className="news-search" type="search" placeholder="제목·언론사 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length > 0 ? (
        <ul className="news-card-list news-modal-list">
          {list.map((a) => (
            <ArticleRow key={a.id} a={a} nowMs={nowMs} showDesc />
          ))}
        </ul>
      ) : (
        <div className="news-card-empty">조건에 맞는 기사가 없어요.</div>
      )}
    </>
  );
}

const EMPTY_FORM = { id: null, name: "", keywords: "", requireAny: "", excludeKeywords: "", ignoreTerms: "", titleOnly: false, domain: "", isActive: true };

function ClientManager({ onChanged }) {
  const [state, setState] = useState({ loading: true, source: null, reason: null, clients: [] });
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/news/clients");
      const data = await res.json();
      setState({ loading: false, source: data.source, reason: data.reason, clients: data.clients || [] });
    } catch (e) {
      setState({ loading: false, source: null, reason: null, clients: [] });
      setMsg("기업 목록을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send(method, body) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/news/clients", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error || "저장하지 못했어요.");
        return false;
      }
      if (data.message) setMsg(data.message);
      await load();
      onChanged();
      return true;
    } catch (e) {
      setMsg("요청 중 오류가 났어요.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    const body = {
      name: form.name,
      keywords: form.keywords,
      requireAny: form.requireAny,
      excludeKeywords: form.excludeKeywords,
      ignoreTerms: form.ignoreTerms,
      matchScope: form.titleOnly ? "title" : "title_desc",
      domain: form.domain,
      isActive: form.isActive,
    };
    const ok = form.id ? await send("PUT", { id: form.id, ...body }) : await send("POST", body);
    if (ok) setForm(null);
  }

  const editable = state.source === "db";
  const join = (v) => (v || []).join(", ");

  return (
    <div className="news-manager">
      {state.loading ? (
        <p className="news-modal-sub">불러오는 중…</p>
      ) : (
        <>
          {!editable && state.reason === "table_empty" && (
            <button type="button" className="news-btn news-btn-primary" disabled={busy} onClick={() => send("POST", { action: "seed" })}>
              기본 목록 불러오기
            </button>
          )}
          {editable && !form && (
            <button type="button" className="news-btn news-btn-primary" onClick={() => setForm({ ...EMPTY_FORM })}>
              + 기업 추가
            </button>
          )}
          {msg && <div className="news-manager-msg">{msg}</div>}
          {form && (
            <form className="news-form" onSubmit={save}>
              <label>
                기업명
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 호텔스컴바인" required />
              </label>
              <label>
                검색 키워드 <small>쉼표로 구분 · 비우면 기업명으로 검색</small>
                <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="예: 호텔스컴바인, HotelsCombined" />
              </label>
              <label>
                문맥 단어 <small>선택 · 이 중 하나가 함께 나와야 인정</small>
                <input value={form.requireAny} onChange={(e) => setForm({ ...form, requireAny: e.target.value })} placeholder="예: 여행, 항공, 호텔" />
              </label>
              <label>
                제외 단어 <small>선택 · 이 단어가 있는 기사는 제외</small>
                <input value={form.excludeKeywords} onChange={(e) => setForm({ ...form, excludeKeywords: e.target.value })} placeholder="예: 교향곡, 작곡가" />
              </label>
              <label>
                키워드를 품은 다른 단어 <small>선택 · 예: 하이브 → 하이브리드</small>
                <input value={form.ignoreTerms} onChange={(e) => setForm({ ...form, ignoreTerms: e.target.value })} />
              </label>
              <label>
                공식 사이트 <small>선택 · 로고 표시용</small>
                <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="예: hotelscombined.co.kr" />
              </label>
              <label className="news-form-check">
                <input type="checkbox" checked={form.titleOnly} onChange={(e) => setForm({ ...form, titleOnly: e.target.checked })} />
                제목에 이름이 있는 기사만 보기 <small>기사가 아주 많은 대기업 추천</small>
              </label>
              {form.id && (
                <label className="news-form-check">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  모니터링 사용
                </label>
              )}
              <div className="news-form-actions">
                <button type="submit" className="news-btn news-btn-primary" disabled={busy}>
                  {busy ? "저장 중…" : form.id ? "수정 저장" : "추가"}
                </button>
                <button type="button" className="news-btn" onClick={() => setForm(null)}>
                  취소
                </button>
              </div>
            </form>
          )}
          <ul className="news-client-list">
            {state.clients.map((c) => (
              <li key={c.id} className={c.isActive === false ? "inactive" : ""}>
                <ClientLogo name={c.name} domain={c.domain} size={30} />
                <div className="news-client-info">
                  <b>
                    {c.name}
                    {c.isActive === false && <span className="news-client-off"> · 사용 안 함</span>}
                  </b>
                  <span>검색어: {join(c.keywords)}</span>
                  {c.requireAny.length > 0 && <span>문맥 단어: {join(c.requireAny)}</span>}
                  {c.excludeKeywords.length > 0 && <span>제외: {join(c.excludeKeywords)}</span>}
                  {c.ignoreTerms.length > 0 && <span>무시: {join(c.ignoreTerms)}</span>}
                  {c.matchScope === "title" && <span>제목에서만 찾기</span>}
                </div>
                {editable && (
                  <div className="news-client-actions">
                    <button
                      type="button"
                      className="news-btn news-btn-sm"
                      onClick={() =>
                        setForm({
                          id: c.id,
                          name: c.name,
                          keywords: join(c.keywords),
                          requireAny: join(c.requireAny),
                          excludeKeywords: join(c.excludeKeywords),
                          ignoreTerms: join(c.ignoreTerms),
                          titleOnly: c.matchScope === "title",
                          domain: c.domain || "",
                          isActive: c.isActive !== false,
                        })
                      }
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="news-btn news-btn-sm news-btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`${c.name}을(를) 모니터링 목록에서 삭제할까요?`)) send("DELETE", { id: c.id });
                      }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function prioritySort(list) {
  return [...list].sort((a, b) => {
    const tier = (c) => (c.criticalCount > 0 ? 0 : c.articleCount > 0 ? 1 : 2);
    return tier(a) - tier(b) || b.articleCount - a.articleCount || (a.sortOrder || 0) - (b.sortOrder || 0);
  });
}

export default function NewsClippingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortMode, setSortMode] = useState("priority");
  const [customOrder, setCustomOrder] = useState([]);
  const [modal, setModal] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [dragName, setDragName] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [showAllPriority, setShowAllPriority] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async (fresh) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/news/clips${fresh ? "?fresh=1" : ""}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "뉴스를 불러오지 못했어요.");
      } else {
        setData(json);
      }
    } catch (e) {
      setError("뉴스를 불러오는 중 오류가 났어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setNowMs(Date.now());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSortMode(readStore(SORT_KEY, "priority") === "custom" ? "custom" : "priority");
    const o = readStore(ORDER_KEY, []);
    setCustomOrder(Array.isArray(o) ? o : []);
    load(false);
  }, [load]);

  // 카드 메뉴 바깥을 누르면 닫기
  useEffect(() => {
    if (!menuFor) return undefined;
    function close(e) {
      if (!e.target.closest || !e.target.closest(".news-handle-wrap")) setMenuFor(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [menuFor]);

  const clients = useMemo(() => (data && data.clients) || [], [data]);

  const ordered = useMemo(() => {
    const base = prioritySort(clients);
    if (sortMode !== "custom" || customOrder.length === 0) return base;
    const pos = new Map(customOrder.map((n, i) => [n, i]));
    // 저장된 순서에 없는 새 기업은 맨 뒤(중요도 순)에 붙여요.
    return [...base].sort((a, b) => (pos.has(a.name) ? pos.get(a.name) : 1e6) - (pos.has(b.name) ? pos.get(b.name) : 1e6));
  }, [clients, sortMode, customOrder]);

  function applyOrder(names) {
    setCustomOrder(names);
    setSortMode("custom");
    writeStore(ORDER_KEY, names);
    writeStore(SORT_KEY, "custom");
  }

  function changeSort(mode) {
    setSortMode(mode);
    writeStore(SORT_KEY, mode);
  }

  function move(name, how) {
    const names = ordered.map((c) => c.name);
    const i = names.indexOf(name);
    if (i === -1) return;
    names.splice(i, 1);
    let j = i;
    if (how === "top") j = 0;
    if (how === "up") j = Math.max(0, i - 1);
    if (how === "down") j = Math.min(names.length, i + 1);
    if (how === "bottom") j = names.length;
    names.splice(j, 0, name);
    applyOrder(names);
    setMenuFor(null);
  }

  function dropOn(target) {
    if (!dragName || dragName === target) return;
    const names = ordered.map((c) => c.name).filter((n) => n !== dragName);
    const j = names.indexOf(target);
    const from = ordered.findIndex((c) => c.name === dragName);
    const to = ordered.findIndex((c) => c.name === target);
    // 아래쪽 카드에 놓으면 그 뒤로, 위쪽 카드에 놓으면 그 앞으로
    names.splice(from < to ? j + 1 : j, 0, dragName);
    applyOrder(names);
  }

  const priorityItems = useMemo(() => {
    const items = [];
    for (const c of clients) for (const a of c.articles) if (a.risk === "critical") items.push({ ...a, clientName: c.name });
    items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    return items;
  }, [clients]);
  const summary = (data && data.summary) || null;
  const windowDays = (data && data.windowDays) || 14;
  const openClient = modal && modal.type === "articles" ? clients.find((c) => c.id === modal.clientId) : null;
  const visiblePriority = showAllPriority ? priorityItems : priorityItems.slice(0, 6);

  return (
    <div className="container news-container">
      <div className="news-top">
        <div>
          <p className="news-eyebrow">INTELLIGENCE / NEWS CLIPPING</p>
          <h1 className="news-h1">고객사 뉴스 클리핑</h1>
        </div>
        <div className="news-top-actions">
          <button type="button" className="news-btn" onClick={() => load(true)} disabled={loading}>
            <span className={`news-refresh-icon${loading ? " spinning" : ""}`} aria-hidden="true">
              ↻
            </span>
            {loading ? "수집 중…" : "새로고침"}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading && !data && (
        <div className="news-loading" role="status">
          <span className="ad-progress-dot" aria-hidden="true" />
          수집 중…
        </div>
      )}

      {summary && (
        <div className="news-hero">
          <div className="news-hero-main">
            <span className="news-hero-period">최근 {windowDays}일</span>
            <span className="news-hero-sep">·</span>
            고객사 기사 <b>{summary.totalArticles.toLocaleString()}</b>건
          </div>
          <div className="news-hero-sub">
            {summary.clientCount}개 기업 · 새 기사 <b>{summary.newArticles.toLocaleString()}</b>건
            {summary.criticalArticles > 0 && (
              <>
                {" "}
                · <span className="news-hero-critical">즉시 확인 {summary.criticalArticles}건</span>
              </>
            )}
            {summary.watchArticles > 0 && <> · 관찰 항목 {summary.watchArticles}건</>}
            <span className="news-hero-time">업데이트 {formatKst(data.collectedAt)}</span>
          </div>
        </div>
      )}

      {data && (
        <div className="news-priority">
          <div className="news-priority-head">
            <h2>우선 확인</h2>
            <span>{priorityItems.length}건</span>
          </div>
          {priorityItems.length === 0 && <p className="news-priority-empty">지금 바로 확인할 기사는 없어요.</p>}
          {priorityItems.length > 0 && (
            <ul className="news-priority-list">
              {visiblePriority.map((a) => (
                <ArticleRow key={`${a.clientName}-${a.id}`} a={a} nowMs={nowMs} clientName={a.clientName} />
              ))}
            </ul>
          )}
          {priorityItems.length > 6 && (
            <button type="button" className="news-link-btn" onClick={() => setShowAllPriority((v) => !v)}>
              {showAllPriority ? "접기" : `즉시 확인 기사 ${priorityItems.length - 6}건 더 보기`}
            </button>
          )}
        </div>
      )}

      {data && (
        <>
          <div className="news-section-head">
            <div>
              <h2>기업별 뉴스 클리핑</h2>
              <p>
                카드 오른쪽 위 ⠿ 를 끌거나 눌러서 순서를 바꿀 수 있어요.
              </p>
            </div>
            <div className="news-section-actions">
              <select className="news-select" value={sortMode} onChange={(e) => changeSort(e.target.value)} aria-label="정렬 방식">
                <option value="priority">중요도 우선 · 기사 많은 순</option>
                <option value="custom">직접 정한 순서</option>
              </select>
              <button type="button" className="news-btn" onClick={() => setModal({ type: "clients" })}>
                모니터링 기업 {clients.length}곳 보기
              </button>
            </div>
          </div>

          <div className="news-grid">
            {ordered.map((c) => (
              <ClientCard
                key={c.id}
                c={c}
                windowDays={windowDays}
                nowMs={nowMs}
                onOpenAll={() => setModal({ type: "articles", clientId: c.id })}
                menuOpen={menuFor === c.name}
                onToggleMenu={() => setMenuFor(menuFor === c.name ? null : c.name)}
                onMove={(how) => move(c.name, how)}
                isDragOver={dragOver === c.name && dragName && dragName !== c.name}
                dragProps={{
                  onDragStart: (e) => {
                    setDragName(c.name);
                    setMenuFor(null);
                    try {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.name);
                      const card = e.currentTarget.closest(".news-card");
                      if (card) e.dataTransfer.setDragImage(card, 24, 24);
                    } catch (err) {
                      // 일부 브라우저는 setDragImage를 지원하지 않아요.
                    }
                  },
                  onDragEnd: () => {
                    setDragName(null);
                    setDragOver(null);
                  },
                  onDragOver: (e) => {
                    if (!dragName) return;
                    e.preventDefault();
                    if (dragOver !== c.name) setDragOver(c.name);
                  },
                  onDragLeave: () => {
                    if (dragOver === c.name) setDragOver(null);
                  },
                  onDrop: (e) => {
                    e.preventDefault();
                    dropOn(c.name);
                    setDragName(null);
                    setDragOver(null);
                  },
                }}
              />
            ))}
          </div>

        </>
      )}

      {modal && modal.type === "clients" && (
        <Modal title={`모니터링 기업 ${clients.length}곳`} onClose={() => setModal(null)} wide>
          <ClientManager onChanged={() => load(true)} />
        </Modal>
      )}
      {openClient && (
        <Modal title={`${openClient.name} · 기사 ${openClient.articleCount}건`} onClose={() => setModal(null)} wide>
          <AllArticles c={openClient} nowMs={nowMs} windowDays={windowDays} />
        </Modal>
      )}
    </div>
  );
}
