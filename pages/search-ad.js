import { useState, useRef, useEffect } from "react";

// 키워드를 검색하면 그 키워드로 노출되는 네이버 파워링크 광고(광고 업체, 광고 문안, 이미지 등
// 소재)를 정리해서 보여주는 화면이에요. 실제 조회는 GitHub Actions에서 실행되고(1~3분),
// 화면은 requestId로 결과를 폴링해요(키워드 순위표와 같은 방식).

const MAX_WAIT_MS = 480000; // 8분 — 첫 실행은 npm install/Playwright 설치까지 새로 해서 오래 걸릴 수 있어요.
const INTERVAL_MS = 5000;

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(keyword, ads) {
  const header = ["순위", "광고주", "표시 URL", "랜딩 URL", "제목", "서브타이틀", "설명", "확장소재", "서브링크", "배지", "광고집행기간", "이미지 URL", "광고 ID"];
  const lines = [header.map(csvEscape).join(",")];
  ads.forEach((a) => {
    lines.push(
      [
        a.rank,
        a.advertiser,
        a.displayUrl,
        a.landingUrl,
        a.headline,
        (a.subtitles || []).join(" / "),
        a.description,
        a.extension ? [a.extension.label, a.extension.text].filter(Boolean).join(" · ") : "",
        (a.sublinks || []).join(" / "),
        (a.badges || []).join(" / "),
        a.adPeriod,
        a.imageUrl,
        a.adId,
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙입니다.
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `검색광고분석_${keyword}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (e) {
    return url;
  }
}

function AdCard({ ad }) {
  return (
    <article className="ad-card">
      <div className="ad-card-rank" aria-label={`${ad.rank}위`}>
        {ad.rank}
      </div>

      <div className="ad-card-body">
        <div className="ad-card-advertiser">
          {ad.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ad-card-favicon" src={ad.favicon} alt="" width={16} height={16} referrerPolicy="no-referrer" loading="lazy" />
          )}
          <span className="ad-card-advertiser-name">{ad.advertiser || "(광고주명 없음)"}</span>
          {ad.landingUrl ? (
            <a className="ad-card-url" href={ad.landingUrl} target="_blank" rel="noopener noreferrer" title="광고 추적 링크가 아니라 실제 사이트 주소로 열려요">
              {ad.displayUrl || hostOf(ad.landingUrl)}
            </a>
          ) : (
            ad.displayUrl && <span className="ad-card-url">{ad.displayUrl}</span>
          )}
        </div>

        <h3 className="ad-card-headline">{ad.headline || "-"}</h3>
        {ad.subtitles && ad.subtitles.length > 0 && (
          <p className="ad-card-subtitles">
            {ad.subtitles.map((s, i) => (
              <span key={i} className="ad-card-subtitle">
                {s}
              </span>
            ))}
          </p>
        )}
        {ad.description && <p className="ad-card-desc">{ad.description}</p>}

        {ad.extension && (
          <div className="ad-card-ext">
            {ad.extension.label && <span className="ad-card-ext-label">{ad.extension.label}</span>}
            <span>{ad.extension.text}</span>
          </div>
        )}

        {ad.sublinks && ad.sublinks.length > 0 && (
          <div className="ad-card-chips">
            {ad.sublinks.map((s, i) => (
              <span key={i} className="ad-card-chip">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="ad-card-meta">
          {ad.adPeriod && (
            <span>
              광고집행기간 <strong>{ad.adPeriod}</strong>
            </span>
          )}
          {(ad.badges || []).map((b, i) => (
            <span key={i} className="ad-card-badge">
              {b}
            </span>
          ))}
          {ad.imageUrl && <span className="ad-card-badge ad-card-badge-soft">이미지 소재</span>}
          {ad.subtitles && ad.subtitles.length > 0 && <span className="ad-card-badge ad-card-badge-soft">서브타이틀</span>}
        </div>
      </div>

      {ad.imageUrl && (
        <a className="ad-card-thumb" href={ad.imageUrl} target="_blank" rel="noopener noreferrer" title="이미지 소재 크게 보기">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.imageUrl} alt={`${ad.advertiser || ""} 광고 이미지`} referrerPolicy="no-referrer" loading="lazy" />
        </a>
      )}
    </article>
  );
}

export default function SearchAdPage() {
  const [keyword, setKeyword] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | searching | done | empty | blocked | error | timeout
  const [message, setMessage] = useState("");
  const [ads, setAds] = useState([]);
  const [resultMeta, setResultMeta] = useState(null);
  const [imageOnly, setImageOnly] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollTimerRef = useRef(null);
  const clockRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, []);

  function stopTimers() {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    pollTimerRef.current = null;
    clockRef.current = null;
  }

  function pollForResult(requestId) {
    const startedAt = Date.now();
    setElapsed(0);
    clockRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);

    const tick = async () => {
      try {
        const res = await fetch(`/api/search-ad/status?requestId=${encodeURIComponent(requestId)}`);
        const data = await res.json();
        if (data.ok && data.done) {
          stopTimers();
          const r = data.result || {};
          setResultMeta({ keyword: r.keyword, requestedAt: r.requestedAt });
          if (r.status === "ok") {
            setAds(r.results || []);
            setPhase("done");
            setMessage("");
          } else {
            setAds([]);
            setPhase(r.status === "empty" || r.status === "blocked" ? r.status : "error");
            setMessage(r.errorMessage || "조회에 실패했어요.");
          }
          return;
        }
      } catch (err) {
        // 네트워크 순간 오류는 무시하고 다음 폴링에서 재시도
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        stopTimers();
        setPhase("timeout");
        setMessage("8분이 지나도 결과가 안 왔어요. GitHub 저장소의 Actions 탭에서 search-ad-list 워크플로가 실행 중인지, 에러로 멈추지 않았는지 확인해보세요.");
      }
    };

    pollTimerRef.current = setInterval(tick, INTERVAL_MS);
    tick();
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!keyword.trim()) return;
    stopTimers();
    setPhase("searching");
    setMessage("");
    setAds([]);
    setResultMeta(null);
    setImageOnly(false);
    try {
      const res = await fetch("/api/search-ad/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setPhase("error");
        setMessage(data.error || "요청에 실패했어요.");
        return;
      }
      pollForResult(data.requestId);
    } catch (err) {
      setPhase("error");
      setMessage("요청 중 오류가 발생했어요.");
    }
  }

  const busy = phase === "searching";
  const shown = imageOnly ? ads.filter((a) => a.imageUrl) : ads;
  const imageCount = ads.filter((a) => a.imageUrl).length;
  const extCount = ads.filter((a) => a.extension).length;
  const advertiserCount = new Set(ads.map((a) => a.advertiser).filter(Boolean)).size;

  return (
    <div className="container">
      <div className="header">
        <h1>검색광고 분석</h1>
        <p>키워드를 검색하면 네이버 파워링크에 노출되는 광고 업체와 광고 문안, 이미지 등 소재를 한 번에 정리해드려요.</p>
      </div>

      <div className="card">
        <form className="place-form" onSubmit={handleSearch}>
          <input type="text" placeholder="키워드 (예: 호텔예약)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <button type="submit" disabled={busy || !keyword.trim()}>
            {busy ? "분석 중..." : "분석하기"}
          </button>
        </form>
        <p className="search-hint">PC 검색 결과의 파워링크(광고 더보기 페이지) 1페이지 기준이에요. 한 번 조회하는 데 보통 1~3분 걸려요.</p>
        {busy && (
          <div className="ad-progress" role="status">
            <span className="ad-progress-dot" aria-hidden="true" />
            광고를 불러오는 중이에요… ({elapsed}초)
            {elapsed > 90 && <span className="ad-progress-sub">처음 실행이면 준비 과정 때문에 3~5분까지 걸릴 수 있어요.</span>}
          </div>
        )}
        {(phase === "error" || phase === "blocked" || phase === "timeout") && message && <div className="error-box">{message}</div>}
        {phase === "empty" && <div className="ad-empty-box">{message}</div>}
      </div>

      {phase === "done" && (
        <>
          <div className="card">
            <div className="card-header">
              <h2>&ldquo;{resultMeta ? resultMeta.keyword : keyword}&rdquo; 파워링크 광고</h2>
              <button type="button" className="place-checknow-btn" onClick={() => downloadCsv(resultMeta ? resultMeta.keyword : keyword, ads)}>
                엑셀(CSV) 다운로드
              </button>
            </div>
            <div className="ad-summary">
              <div className="ad-summary-item">
                <span className="ad-summary-num">{ads.length}</span>
                <span className="ad-summary-label">노출 광고</span>
              </div>
              <div className="ad-summary-item">
                <span className="ad-summary-num">{advertiserCount}</span>
                <span className="ad-summary-label">광고주</span>
              </div>
              <div className="ad-summary-item">
                <span className="ad-summary-num">{imageCount}</span>
                <span className="ad-summary-label">이미지 소재</span>
              </div>
              <div className="ad-summary-item">
                <span className="ad-summary-num">{extCount}</span>
                <span className="ad-summary-label">확장소재</span>
              </div>
            </div>
            {resultMeta && resultMeta.requestedAt && (
              <p className="search-hint">조회 시각: {new Date(resultMeta.requestedAt).toLocaleString("ko-KR")}</p>
            )}
            {imageCount > 0 && (
              <div className="ad-filter">
                <button type="button" className={!imageOnly ? "kw-page-btn active" : "kw-page-btn"} onClick={() => setImageOnly(false)}>
                  전체 {ads.length}
                </button>
                <button type="button" className={imageOnly ? "kw-page-btn active" : "kw-page-btn"} onClick={() => setImageOnly(true)}>
                  이미지 소재만 {imageCount}
                </button>
              </div>
            )}
          </div>

          <div className="ad-list">
            {shown.map((ad) => (
              <AdCard key={ad.adId || `${ad.rank}-${ad.advertiser}`} ad={ad} />
            ))}
          </div>

          <p className="footer-note">
            순위는 광고 더보기 페이지에 노출된 순서예요. 광고 링크(클릭하면 광고주에게 비용이 청구되는 추적 링크)는 쓰지
            않고, 광고의 실제 사이트 주소로만 연결해요. 실시간 입찰 결과라 조회할 때마다 순서가 달라질 수 있어요.
          </p>
        </>
      )}
    </div>
  );
}
