import { useState, useEffect, useRef, Fragment } from "react";
import { SHOPPING_ENABLED } from "../lib/featureFlags";

const MAX_WAIT_MS = 480000; // 8분 — 처음 실행은 npm install/Playwright 설치까지 새로 해서 오래 걸릴 수 있어요.
const INTERVAL_MS = 6000;

function formatWon(n) {
  return typeof n === "number" ? `${n.toLocaleString("ko-KR")}원` : "-";
}

function RankChangeBadge({ change }) {
  if (change === null || change === undefined) return <span className="rank-change rank-change-flat">-</span>;
  if (change === 0) return <span className="rank-change rank-change-flat">변동 없음</span>;
  if (change > 0) return <span className="rank-change rank-change-up">▲{change}</span>;
  return <span className="rank-change rank-change-down">▼{Math.abs(change)}</span>;
}

function PriceChangeBadge({ change }) {
  if (change === null || change === undefined) return <span className="rank-change rank-change-flat">-</span>;
  if (change === 0) return <span className="rank-change rank-change-flat">변동 없음</span>;
  // 가격은 오르면 나쁜 신호로 보이도록 위/아래 방향은 그대로 두되 색만 rank와 반대로 쓰진 않고
  // (해석은 사용자에 따라 다를 수 있어) 그냥 오름/내림 방향만 표시합니다.
  if (change > 0) return <span className="rank-change rank-change-down">▲{change.toLocaleString("ko-KR")}원</span>;
  return <span className="rank-change rank-change-up">▼{Math.abs(change).toLocaleString("ko-KR")}원</span>;
}

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(keyword, rows) {
  const header = [
    "순위",
    "구분",
    "상품명",
    "카테고리",
    "판매처(브랜드 대체)",
    "가격",
    "리뷰수",
    "찜수",
    "평점",
    "판매처수",
    "구매(배지, 참고용)",
    "전일 대비 순위",
    "전일 대비 가격",
  ];
  const lines = [header.map(csvEscape).join(",")];
  rows.forEach((r) => {
    lines.push(
      [
        r.isAd ? "광고" : r.rank,
        r.isAd ? "광고" : r.contentsGrp === "catalog" ? "카탈로그" : "개별상품",
        r.name,
        r.category,
        r.mallName,
        r.price,
        r.reviewCount,
        r.zzimCount,
        r.rating,
        r.sellerCount,
        r.purchaseText,
        r.rankChange === null || r.rankChange === undefined ? "" : r.rankChange,
        r.priceChange === null || r.priceChange === undefined ? "" : r.priceChange,
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙입니다.
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `네이버쇼핑_키워드분석_${keyword}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ShoppingResultTable({ row }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/shopping-keyword/results?shoppingKeywordId=${row.shoppingKeywordId}`);
        const json = await res.json();
        if (!cancelled) {
          if (!json.ok) setError(json.error || "결과를 불러오지 못했어요.");
          else setData(json);
        }
      } catch (err) {
        if (!cancelled) setError("결과 요청 중 오류가 발생했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [row.shoppingKeywordId]);

  if (loading) return <p className="brand-empty">불러오는 중이에요...</p>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data || !data.current) return <p className="brand-empty">아직 분석 결과가 없어요. &ldquo;지금 분석하기&rdquo;를 눌러주세요.</p>;

  if (data.current.status !== "ok") {
    return (
      <div className="error-box">
        {data.current.status === "blocked" ? "접근 제한: " : "오류: "}
        {data.current.errorMessage || "알 수 없는 오류예요."}
      </div>
    );
  }

  const rows = data.rows || [];

  return (
    <div>
      <div className="card-header">
        <h2>
          &ldquo;{row.keyword}&rdquo; — {new Date(data.current.measuredAt).toLocaleString("ko-KR")} 기준
          {data.previous ? ` (전일: ${new Date(data.previous.measuredAt).toLocaleDateString("ko-KR")})` : " (첫 분석 — 비교 대상 없음)"}
        </h2>
        <button type="button" className="place-checknow-btn" onClick={() => downloadCsv(row.keyword, rows)}>
          엑셀(CSV) 다운로드
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="brand-empty">노출된 상품을 찾지 못했어요.</p>
      ) : (
        <div className="kw-table-wrap">
          <table className="place-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>이미지</th>
                <th>상품명</th>
                <th>카테고리</th>
                <th>판매처(브랜드 대체)</th>
                <th>가격</th>
                <th>리뷰</th>
                <th>찜</th>
                <th>구매</th>
                <th>별점</th>
                <th>판매처수</th>
                <th>순위변동</th>
                <th>가격변동</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.catalogNvMid || r.nvMid || r.chnlProdNo || "noid"}-${i}`} style={r.isAd ? { opacity: 0.6 } : undefined}>
                  <td>{r.isAd ? "광고" : r.rank ?? "-"}</td>
                  <td>
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" width={40} height={40} style={{ objectFit: "cover", borderRadius: 6 }} />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    {r.productUrl ? (
                      <a href={r.productUrl} target="_blank" rel="noopener noreferrer">
                        {r.name || "-"}
                      </a>
                    ) : (
                      r.name || "-"
                    )}
                  </td>
                  <td>{r.category || "-"}</td>
                  <td>{r.mallName || "-"}</td>
                  <td>{formatWon(r.price)}</td>
                  <td>{r.reviewCount ?? "-"}</td>
                  <td>{r.zzimCount ?? "-"}</td>
                  <td>{r.purchaseText || "-"}</td>
                  <td>{r.rating ?? "-"}</td>
                  <td>{r.sellerCount ?? "-"}</td>
                  <td>
                    <RankChangeBadge change={r.rankChange} />
                  </td>
                  <td>
                    <PriceChangeBadge change={r.priceChange} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ShoppingKeywordAnalysisPage() {
  const [keywordRows, setKeywordRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newKeyword, setNewKeyword] = useState("");
  const [newMaxRank, setNewMaxRank] = useState(50);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const [expandedId, setExpandedId] = useState(null);
  const [checkState, setCheckState] = useState({});
  const pollTimers = useRef({});

  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach((t) => clearInterval(t));
    };
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/shopping-keyword/keywords");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "키워드 목록을 불러오지 못했어요.");
      setKeywordRows(data.keywords || []);
    } catch (err) {
      setError(err.message || "데이터를 불러오는 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleAddKeyword(e) {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    setFormLoading(true);
    setFormError("");
    try {
      const res = await fetch("/api/shopping-keyword/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newKeyword, maxRank: newMaxRank }),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.error || "키워드 등록에 실패했어요.");
        return;
      }
      setNewKeyword("");
      await loadAll();
    } catch (err) {
      setFormError("요청 중 오류가 발생했어요.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleRemove(id) {
    await fetch("/api/shopping-keyword/keywords", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadAll();
  }

  function pollForResult(shoppingKeywordId, requestId) {
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/shopping-keyword/analyze-status?shoppingKeywordId=${shoppingKeywordId}&requestId=${encodeURIComponent(requestId)}`
        );
        const data = await res.json();
        if (data.ok && data.done) {
          clearInterval(pollTimers.current[shoppingKeywordId]);
          delete pollTimers.current[shoppingKeywordId];
          const result = data.result || {};
          if (result.status === "error") {
            setCheckState((s) => ({ ...s, [shoppingKeywordId]: { phase: "error", message: `분석 실패: ${result.errorMessage || "원인 불명의 오류예요."}` } }));
          } else if (result.status === "blocked") {
            setCheckState((s) => ({ ...s, [shoppingKeywordId]: { phase: "blocked", message: `접근 제한: ${result.errorMessage || "네이버가 자동화 접근을 제한했어요."}` } }));
          } else {
            setCheckState((s) => ({ ...s, [shoppingKeywordId]: { phase: "done", message: "" } }));
          }
          await loadAll();
          setTimeout(() => {
            setCheckState((s) => {
              const next = { ...s };
              delete next[shoppingKeywordId];
              return next;
            });
          }, 6000);
          return;
        }
      } catch (err) {
        // 네트워크 순간 오류는 무시하고 다음 폴링에서 재시도
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        clearInterval(pollTimers.current[shoppingKeywordId]);
        delete pollTimers.current[shoppingKeywordId];
        setCheckState((s) => ({
          ...s,
          [shoppingKeywordId]: { phase: "timeout", message: "8분이 지나도 결과가 안 왔어요. GitHub 저장소의 Actions 탭을 확인해보세요." },
        }));
      }
    };
    pollTimers.current[shoppingKeywordId] = setInterval(tick, INTERVAL_MS);
    tick();
  }

  async function handleAnalyzeNow(shoppingKeywordId) {
    if (pollTimers.current[shoppingKeywordId]) {
      clearInterval(pollTimers.current[shoppingKeywordId]);
      delete pollTimers.current[shoppingKeywordId];
    }
    setCheckState((s) => ({ ...s, [shoppingKeywordId]: { phase: "checking", message: "" } }));
    try {
      const res = await fetch("/api/shopping-keyword/analyze-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shoppingKeywordId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setCheckState((s) => ({ ...s, [shoppingKeywordId]: { phase: "error", message: data.error || "요청에 실패했어요." } }));
        return;
      }
      pollForResult(shoppingKeywordId, data.requestId);
    } catch (err) {
      setCheckState((s) => ({ ...s, [shoppingKeywordId]: { phase: "error", message: "요청 중 오류가 발생했어요." } }));
    }
  }

  const CHECK_PHASE_LABEL = { checking: "분석 중...", done: "완료!", timeout: "시간 초과", error: "실패", blocked: "접근 제한" };

  return (
    <div className="container">
      <div className="header">
        <h1>네이버 쇼핑 키워드 분석</h1>
        <p>키워드를 등록하면 매일 한 번 네이버쇼핑 검색 결과를 조회해서 노출 상품 목록을 기록하고, 전일 대비 순위·가격 변동을 보여줘요.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>키워드 등록</h2>
        </div>
        <form className="place-form" onSubmit={handleAddKeyword}>
          <input
            type="text"
            placeholder="키워드 (예: 캐리어)"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
          />
          <select value={newMaxRank} onChange={(e) => setNewMaxRank(Number(e.target.value))}>
            <option value={50}>상위 50개</option>
            <option value={100}>상위 100개</option>
            <option value={200}>상위 200개</option>
          </select>
          <button type="submit" disabled={formLoading}>
            {formLoading ? "등록 중..." : "키워드 등록"}
          </button>
        </form>
        {formError && <div className="error-box">{formError}</div>}
        <p className="search-hint">
          PC 검색 결과 기준이에요(모바일은 아직 지원하지 않아요). 매일 자동으로 한 번씩 분석되고, 등록 직후에는
          &ldquo;지금 분석하기&rdquo;로 바로 첫 결과를 받아볼 수 있어요.
        </p>
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
          <table className="place-table">
            <thead>
              <tr>
                <th>키워드</th>
                <th>조회 개수</th>
                <th>마지막 분석</th>
                <th>상품 수</th>
                <th>지금 분석하기</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keywordRows.map((row) => {
                const state = checkState[row.shoppingKeywordId];
                const showMessage = state && (state.phase === "error" || state.phase === "timeout" || state.phase === "blocked") && state.message;
                const busy = state && state.phase === "checking";
                return (
                  <Fragment key={row.shoppingKeywordId}>
                    <tr
                      className="place-table-row"
                      onClick={() => setExpandedId(expandedId === row.shoppingKeywordId ? null : row.shoppingKeywordId)}
                    >
                      <td>{row.keyword}</td>
                      <td>{row.maxRank}개</td>
                      <td>{row.currentMeasuredAt ? new Date(row.currentMeasuredAt).toLocaleString("ko-KR") : "분석 전"}</td>
                      <td>{row.currentStatus === "ok" ? `${row.currentItemCount ?? 0}개` : "-"}</td>
                      <td>
                        <div className="place-checknow">
                          <button
                            type="button"
                            className="place-checknow-btn"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyzeNow(row.shoppingKeywordId);
                            }}
                          >
                            {busy ? "분석 중..." : "지금 분석하기"}
                          </button>
                          {state && state.phase !== "checking" && (
                            <span className={`place-checknow-status place-checknow-status-${state.phase}`} title={state.message || ""}>
                              {CHECK_PHASE_LABEL[state.phase] || ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="place-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(row.shoppingKeywordId);
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                    {showMessage && (
                      <tr>
                        <td colSpan={6}>
                          <p className="place-checknow-message">{state.message}</p>
                        </td>
                      </tr>
                    )}
                    {expandedId === row.shoppingKeywordId && (
                      <tr>
                        <td colSpan={6}>
                          <ShoppingResultTable row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="footer-note">
        순위는 네이버쇼핑이 검색결과 데이터에 직접 넣어준 값을 그대로 보여줘요(저희가 임의로 다시 세지 않아요). 광고 상품은
        &ldquo;광고&rdquo;로 표시되고 순위 비교 대상에서 별도로 취급돼요. 브랜드 정보가 검색결과에 없어서 판매처(몰) 이름으로
        대신 보여드리고, 카탈로그형 상품은 최저가 판매처 기준이에요.
      </p>
    </div>
  );
}

// 네이버 쇼핑 기능은 현재 미노출 상태예요(lib/featureFlags.js의 SHOPPING_ENABLED). 꺼져 있으면
// 이 주소로 직접 들어와도 404(페이지 없음)로 처리됩니다.
export async function getStaticProps() {
  if (!SHOPPING_ENABLED) return { notFound: true };
  return { props: {} };
}
