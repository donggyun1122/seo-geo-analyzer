import { useState, useEffect, useRef, Fragment } from "react";

const STATUS_META = {
  ok: { label: "정상", color: "#0ca30c", bg: "#e7f7e7" },
  not_found: { label: "순위 밖", color: "#b9790a", bg: "#fef3dd" },
  blocked: { label: "접근 제한", color: "#d03b3b", bg: "#fbe9e8" },
  error: { label: "오류", color: "#d03b3b", bg: "#fbe9e8" },
};

function formatRank(rank) {
  return typeof rank === "number" ? `${rank}위` : "-";
}

function RankChangeBadge({ change }) {
  if (change === null || change === undefined) {
    return <span className="rank-change rank-change-flat">-</span>;
  }
  if (change === 0) {
    return <span className="rank-change rank-change-flat">변동 없음</span>;
  }
  if (change > 0) {
    return <span className="rank-change rank-change-up">▲{change}</span>;
  }
  return <span className="rank-change rank-change-down">▼{Math.abs(change)}</span>;
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.error;
  return (
    <span className="score-pill" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

// 순위 이력을 꺾은선으로 보여줍니다. 순위는 숫자가 작을수록 좋은 위치라서,
// y축을 뒤집어 "위로 갈수록 순위가 좋다"는 직관에 맞게 그립니다.
// status가 'ok'가 아닌 날은 선을 잇지 않고 회색 점으로만 표시합니다(그 날은 측정 실패).
function RankTrendChart({ history }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const W = 640;
  const H = 180;
  const PAD_X = 20;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 28;
  const n = history.length;

  const okRanks = history.filter((d) => d.status === "ok" && typeof d.rank === "number").map((d) => d.rank);
  const minRank = okRanks.length ? Math.min(...okRanks) : 1;
  const maxRank = okRanks.length ? Math.max(...okRanks) : 10;
  const range = Math.max(1, maxRank - minRank);

  const xAt = (i) => PAD_X + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD_X * 2));
  const yAt = (rank) => PAD_TOP + ((rank - minRank) / range) * (H - PAD_TOP - PAD_BOTTOM);
  const baselineY = H - PAD_BOTTOM;

  const linePoints = history
    .map((d, i) => (d.status === "ok" && typeof d.rank === "number" ? `${xAt(i)},${yAt(d.rank)}` : null))
    .filter(Boolean)
    .join(" ");

  function handleMove(e) {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHoverIdx(idx);
  }

  if (n === 0) {
    return <p className="brand-empty">아직 측정 이력이 없어요. 다음 예정된 측정을 기다려주세요.</p>;
  }

  const hovered = hoverIdx !== null ? history[hoverIdx] : null;

  return (
    <div className="kw-linechart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="kw-linechart-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="순위 추이"
      >
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={PAD_TOP + t * (H - PAD_TOP - PAD_BOTTOM)}
            y2={PAD_TOP + t * (H - PAD_TOP - PAD_BOTTOM)}
            stroke="var(--border-hairline)"
            strokeWidth="1"
          />
        ))}
        {linePoints && <polyline points={linePoints} fill="none" stroke="var(--accent-blue)" strokeWidth="2" />}
        {history.map((d, i) => {
          const cx = xAt(i);
          if (d.status === "ok" && typeof d.rank === "number") {
            return <circle key={i} cx={cx} cy={yAt(d.rank)} r={hoverIdx === i ? 5 : 3} fill="var(--accent-blue)" />;
          }
          return <circle key={i} cx={cx} cy={baselineY} r={hoverIdx === i ? 5 : 3} fill="#d0d0d5" />;
        })}
      </svg>
      {hovered && (
        <p className="brand-trend-note">
          {new Date(hovered.measuredAt).toLocaleDateString("ko-KR")} ·{" "}
          {hovered.status === "ok" ? formatRank(hovered.rank) : STATUS_META[hovered.status]?.label || hovered.status}
          {hovered.errorMessage ? ` (${hovered.errorMessage})` : ""}
        </p>
      )}
    </div>
  );
}

const CHECK_PHASE_LABEL = {
  checking: "측정 중...",
  done: "완료!",
  timeout: "시간 초과",
  error: "실패",
  blocked: "접근 제한",
};

function CheckNowCell({ row, state, onCheckNow }) {
  const phase = state && state.phase;
  const busy = phase === "checking";
  return (
    <div className="place-checknow">
      <button
        type="button"
        className="place-checknow-btn"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onCheckNow(row.placeKeywordId);
        }}
      >
        {busy ? "측정 중..." : "지금 측정하기"}
      </button>
      {phase && phase !== "checking" && (
        <span className={`place-checknow-status place-checknow-status-${phase}`} title={state.message || ""}>
          {CHECK_PHASE_LABEL[phase] || ""}
        </span>
      )}
    </div>
  );
}

function KeywordDetail({ row }) {
  const [windowDays, setWindowDays] = useState(7);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/place/history?placeKeywordId=${row.placeKeywordId}&days=${windowDays}`);
        const data = await res.json();
        if (!cancelled) {
          if (!data.ok) setError(data.error || "이력을 불러오지 못했어요.");
          else setHistory(data.history);
        }
      } catch (err) {
        if (!cancelled) setError("이력 요청 중 오류가 발생했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [row.placeKeywordId, windowDays]);

  return (
    <div className="card place-detail-card">
      <div className="card-header">
        <h2>
          {row.placeName} — &ldquo;{row.keyword}&rdquo;
        </h2>
        <div className="place-window-toggle">
          <button
            type="button"
            className={windowDays === 7 ? "kw-page-btn active" : "kw-page-btn"}
            onClick={() => setWindowDays(7)}
          >
            7일
          </button>
          <button
            type="button"
            className={windowDays === 30 ? "kw-page-btn active" : "kw-page-btn"}
            onClick={() => setWindowDays(30)}
          >
            30일
          </button>
        </div>
      </div>
      {loading && <p className="brand-empty">추이를 불러오는 중이에요...</p>}
      {error && <div className="error-box">{error}</div>}
      {!loading && !error && history && <RankTrendChart history={history} />}
    </div>
  );
}

export default function PlacePage() {
  const [places, setPlaces] = useState([]);
  const [keywordRows, setKeywordRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceUrl, setNewPlaceUrl] = useState("");
  const [placeFormLoading, setPlaceFormLoading] = useState(false);
  const [placeFormError, setPlaceFormError] = useState("");

  const [selectedPlaceId, setSelectedPlaceId] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDevice, setNewDevice] = useState("mobile");
  const [keywordFormLoading, setKeywordFormLoading] = useState(false);
  const [keywordFormError, setKeywordFormError] = useState("");

  const [expandedKeywordId, setExpandedKeywordId] = useState(null);

  // "지금 측정하기" 버튼 상태 — { [placeKeywordId]: { phase: 'checking'|'done'|'timeout'|'error', message } }
  const [checkState, setCheckState] = useState({});
  const pollTimers = useRef({});

  useEffect(() => {
    // 언마운트 시 폴링 타이머 정리
    return () => {
      Object.values(pollTimers.current).forEach((timerId) => clearInterval(timerId));
    };
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [placesRes, keywordsRes] = await Promise.all([
        fetch("/api/place/places").then((r) => r.json()),
        fetch("/api/place/keywords").then((r) => r.json()),
      ]);
      if (!placesRes.ok) throw new Error(placesRes.error || "매장 목록을 불러오지 못했어요.");
      if (!keywordsRes.ok) throw new Error(keywordsRes.error || "키워드 목록을 불러오지 못했어요.");
      setPlaces(placesRes.places || []);
      setKeywordRows(keywordsRes.keywords || []);
      if (!selectedPlaceId && placesRes.places && placesRes.places.length > 0) {
        setSelectedPlaceId(placesRes.places[0].id);
      }
    } catch (err) {
      setError(err.message || "데이터를 불러오는 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddPlace(e) {
    e.preventDefault();
    setPlaceFormLoading(true);
    setPlaceFormError("");
    try {
      const res = await fetch("/api/place/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPlaceName, naverPlaceUrl: newPlaceUrl }),
      });
      const data = await res.json();
      if (!data.ok) {
        setPlaceFormError(data.error || "매장 등록에 실패했어요.");
        return;
      }
      setNewPlaceName("");
      setNewPlaceUrl("");
      await loadAll();
    } catch (err) {
      setPlaceFormError("요청 중 오류가 발생했어요.");
    } finally {
      setPlaceFormLoading(false);
    }
  }

  async function handleAddKeyword(e) {
    e.preventDefault();
    if (!selectedPlaceId) {
      setKeywordFormError("먼저 매장을 등록/선택해주세요.");
      return;
    }
    setKeywordFormLoading(true);
    setKeywordFormError("");
    try {
      const res = await fetch("/api/place/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: selectedPlaceId,
          keyword: newKeyword,
          searchLocation: newLocation,
          device: newDevice,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setKeywordFormError(data.error || "키워드 등록에 실패했어요.");
        return;
      }
      setNewKeyword("");
      setNewLocation("");
      await loadAll();
    } catch (err) {
      setKeywordFormError("요청 중 오류가 발생했어요.");
    } finally {
      setKeywordFormLoading(false);
    }
  }

  async function handleDeactivateKeyword(id) {
    await fetch("/api/place/keywords", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadAll();
  }

  function pollForCheckResult(placeKeywordId, requestId) {
    const startedAt = Date.now();
    // GitHub Actions가 큐에서 대기하다 실행되고, 캐시가 없는 첫 실행은 npm install +
    // Playwright 브라우저 설치까지 새로 해서 3~5분씩 걸릴 수 있어요. 그래서 넉넉하게 8분까지
    // 기다려요(두 번째 실행부터는 캐시 덕분에 훨씬 빨라져요).
    const MAX_WAIT_MS = 480000; // 8분 — 이보다 오래 걸리면 타임아웃으로 안내
    const INTERVAL_MS = 6000;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/place/check-status?placeKeywordId=${placeKeywordId}&requestId=${encodeURIComponent(requestId)}`
        );
        const data = await res.json();
        if (data.ok && data.done) {
          clearInterval(pollTimers.current[placeKeywordId]);
          delete pollTimers.current[placeKeywordId];

          const result = data.result || {};
          // rank_checks에 결과가 저장됐다는 건 GitHub Actions/Playwright까지는 실행이
          // 끝났다는 뜻이에요. 다만 status가 error/blocked면 "측정 자체는 끝났지만 실패"인
          // 거라, 무조건 "완료!"로 표시하지 않고 실제 원인을 그대로 보여줘요.
          if (result.status === "error") {
            setCheckState((s) => ({
              ...s,
              [placeKeywordId]: { phase: "error", message: "측정에 실패했어요. 잠시 후 다시 시도해주세요." },
            }));
          } else if (result.status === "blocked") {
            setCheckState((s) => ({
              ...s,
              [placeKeywordId]: {
                phase: "blocked",
                message: "접근이 제한됐어요. 잠시 후 다시 시도해주세요.",
              },
            }));
          } else {
            // ok 또는 not_found — 둘 다 "측정은 정상적으로 끝난" 상태라 표 갱신만 하면 돼요.
            // (not_found는 표에서 이미 "순위 밖"으로 표시돼요.)
            setCheckState((s) => ({ ...s, [placeKeywordId]: { phase: "done", message: "" } }));
          }

          await loadAll();
          setTimeout(() => {
            setCheckState((s) => {
              const next = { ...s };
              delete next[placeKeywordId];
              return next;
            });
          }, 6000);
          return;
        }
      } catch (err) {
        // 네트워크 순간 오류는 무시하고 다음 폴링에서 재시도
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        clearInterval(pollTimers.current[placeKeywordId]);
        delete pollTimers.current[placeKeywordId];
        setCheckState((s) => ({
          ...s,
          [placeKeywordId]: {
            phase: "timeout",
            message:
              "결과를 받지 못했어요. 잠시 후 다시 시도해주세요.",
          },
        }));
      }
    };

    pollTimers.current[placeKeywordId] = setInterval(tick, INTERVAL_MS);
    tick(); // 요청 직후 한 번 즉시 확인
  }

  async function handleCheckNow(placeKeywordId) {
    if (pollTimers.current[placeKeywordId]) {
      clearInterval(pollTimers.current[placeKeywordId]);
      delete pollTimers.current[placeKeywordId];
    }
    setCheckState((s) => ({ ...s, [placeKeywordId]: { phase: "checking", message: "" } }));
    try {
      const res = await fetch("/api/place/check-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeKeywordId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setCheckState((s) => ({ ...s, [placeKeywordId]: { phase: "error", message: data.error || "요청에 실패했어요." } }));
        return;
      }
      pollForCheckResult(placeKeywordId, data.requestId);
    } catch (err) {
      setCheckState((s) => ({ ...s, [placeKeywordId]: { phase: "error", message: "요청 중 오류가 발생했어요." } }));
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>플레이스 순위</h1>
        <p>매장과 키워드를 등록하고 네이버 플레이스 순위 변화를 확인하세요.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>1. 매장 등록</h2>
        </div>
        <form className="place-form" onSubmit={handleAddPlace}>
          <input
            type="text"
            placeholder="매장 이름 (예: OO식당)"
            value={newPlaceName}
            onChange={(e) => setNewPlaceName(e.target.value)}
          />
          <input
            type="text"
            placeholder="네이버 플레이스 URL (예: https://m.place.naver.com/restaurant/1234567890/home)"
            value={newPlaceUrl}
            onChange={(e) => setNewPlaceUrl(e.target.value)}
          />
          <button type="submit" disabled={placeFormLoading}>
            {placeFormLoading ? "등록 중..." : "매장 등록"}
          </button>
        </form>
        {placeFormError && <div className="error-box">{placeFormError}</div>}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>2. 키워드 등록</h2>
        </div>
        {places.length === 0 ? (
          <p className="brand-empty">먼저 매장을 등록해주세요.</p>
        ) : (
          <form className="place-form" onSubmit={handleAddKeyword}>
            <select value={selectedPlaceId} onChange={(e) => setSelectedPlaceId(e.target.value)}>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="키워드 (예: 강남역 맛집)"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
            />
            <input
              type="text"
              placeholder="검색 위치 (선택)"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
            />
            <select value={newDevice} onChange={(e) => setNewDevice(e.target.value)}>
              <option value="mobile">모바일</option>
              <option value="pc">PC</option>
            </select>
            <button type="submit" disabled={keywordFormLoading}>
              {keywordFormLoading ? "등록 중..." : "키워드 추가"}
            </button>
          </form>
        )}
        {keywordFormError && <div className="error-box">{keywordFormError}</div>}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h2>등록된 키워드</h2>
        </div>
        {loading ? (
          <p className="brand-empty">불러오는 중이에요...</p>
        ) : keywordRows.length === 0 ? (
          <p className="brand-empty">아직 등록된 키워드가 없어요.</p>
        ) : (
          <div className="table-scroll">
          <p className="table-scroll-hint">← 표를 좌우로 밀어서 전체 내용을 볼 수 있어요</p>
          <table className="place-table">
            <thead>
              <tr>
                <th>매장</th>
                <th>키워드</th>
                <th>현재 순위</th>
                <th>전일 순위</th>
                <th>변화</th>
                <th>상태</th>
                <th>마지막 측정</th>
                <th>즉시 측정</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keywordRows.map((row) => {
                const state = checkState[row.placeKeywordId];
                const showMessage =
                  state &&
                  (state.phase === "error" || state.phase === "timeout" || state.phase === "blocked") &&
                  state.message;
                return (
                  <Fragment key={row.placeKeywordId}>
                    <tr
                      className="place-table-row"
                      onClick={() =>
                        setExpandedKeywordId(expandedKeywordId === row.placeKeywordId ? null : row.placeKeywordId)
                      }
                    >
                      <td>{row.placeName}</td>
                      <td>{row.keyword}</td>
                      <td>{row.currentStatus === "ok" ? formatRank(row.currentRank) : "-"}</td>
                      <td>{row.previousStatus === "ok" ? formatRank(row.previousRank) : "-"}</td>
                      <td>
                        <RankChangeBadge change={row.rankChange} />
                      </td>
                      <td>
                        <StatusPill status={row.currentStatus || "error"} />
                      </td>
                      <td>{row.currentMeasuredAt ? new Date(row.currentMeasuredAt).toLocaleString("ko-KR") : "측정 전"}</td>
                      <td>
                        <CheckNowCell row={row} state={state} onCheckNow={handleCheckNow} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="place-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeactivateKeyword(row.placeKeywordId);
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                    {showMessage && (
                      <tr>
                        <td colSpan={9}>
                          <p className="place-checknow-message">{state.message}</p>
                        </td>
                      </tr>
                    )}
                    {expandedKeywordId === row.placeKeywordId && (
                      <tr>
                        <td colSpan={9}>
                          <KeywordDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

    </div>
  );
}
