import { useState, useRef, useEffect } from "react";
import AdCard, { hasImage, pageLabelOf } from "../components/AdCard";

// "검색광고 분석 > 노출 광고 현황" 화면.
// 키워드를 검색하면 그 키워드로 노출되는 네이버 파워링크 광고(광고 업체, 광고 문안, 이미지 등
// 소재)를 정리해서 보여주는 화면이에요. PC/모바일 검색을 고를 수 있고, 광고 더보기 페이지를
// 끝까지(&pagingIndex=2, 3 ...) 넘겨서 전체 광고를 모아요. 실제 조회는 GitHub Actions에서 실행되고(1~3분),
// 화면은 requestId로 결과를 폴링해요(키워드 순위표와 같은 방식).

const DEVICE_LABEL = { pc: "PC", mobile: "모바일" };

const MAX_WAIT_MS = 480000; // 8분 — 첫 실행은 npm install/Playwright 설치까지 새로 해서 오래 걸릴 수 있어요.
const INTERVAL_MS = 5000;

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(keyword, device, ads) {
  const header = ["순위", "기기", "노출 위치", "광고주", "표시 URL", "랜딩 URL", "제목", "서브타이틀", "설명", "확장소재", "서브링크", "이미지 서브링크", "플레이스 정보", "플레이스 사진", "배지", "광고집행기간", "이미지 URL", "광고 ID"];
  const lines = [header.map(csvEscape).join(",")];
  ads.forEach((a) => {
    lines.push(
      [
        a.rank,
        DEVICE_LABEL[device] || device,
        pageLabelOf(a),
        a.advertiser,
        a.displayUrl,
        a.landingUrl,
        a.headline,
        (a.subtitles || []).join(" / "),
        a.description,
        a.extension ? [a.extension.label, a.extension.text].filter(Boolean).join(" · ") : "",
        (a.sublinks || []).join(" / "),
        (a.imageSublinks || []).map((x) => [x.text, x.imageUrl].filter(Boolean).join(" ")).join(" / "),
        a.placeInfo ? [a.placeInfo.price, ...(a.placeInfo.items || [])].filter(Boolean).join(" · ") : "",
        (a.placeImages || []).join(" "),
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
  link.download = `검색광고분석_${keyword}_${DEVICE_LABEL[device] || device}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SearchAdPage() {
  const [keyword, setKeyword] = useState("");
  const [device, setDevice] = useState("pc");
  const [notice, setNotice] = useState("");
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
          setResultMeta({
            keyword: r.keyword,
            requestedAt: r.requestedAt,
            device: r.device || "pc",
            pagesFetched: r.pagesFetched,
            rankSource: r.rankSource,
            mergedDuplicates: r.mergedDuplicates || 0,
            loadSummary: r.loadSummary || null,
          });
          if (r.status === "ok") {
            setAds(r.results || []);
            setPhase("done");
            setMessage("");
            // 중간에 멈춘 경우 — 결과는 보여주되 짧게 안내해요.
            setNotice(r.errorMessage ? "일부 광고만 수집됐어요." : "");
          } else {
            setAds([]);
            setPhase(r.status === "empty" || r.status === "blocked" ? r.status : "error");
            setMessage(
              r.status === "empty"
                ? "이 키워드에 노출된 광고가 없어요."
                : r.status === "blocked"
                ? "접근이 제한됐어요. 잠시 후 다시 시도해주세요."
                : "조회에 실패했어요. 잠시 후 다시 시도해주세요."
            );
          }
          return;
        }
      } catch (err) {
        // 네트워크 순간 오류는 무시하고 다음 폴링에서 재시도
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        stopTimers();
        setPhase("timeout");
        setMessage("결과를 받지 못했어요. 잠시 후 다시 시도해주세요.");
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
    setNotice("");
    try {
      const res = await fetch("/api/search-ad/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), device }),
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
  const shown = imageOnly ? ads.filter(hasImage) : ads;
  const imageCount = ads.filter(hasImage).length;
  const extCount = ads.filter((a) => a.extension).length;
  const advertiserCount = new Set(ads.map((a) => a.advertiser).filter(Boolean)).size;

  return (
    <div className="container">
      <div className="header">
        <h1>노출 광고 현황</h1>
        <p>키워드별 파워링크 광고 업체와 소재를 한눈에 확인하세요.</p>
      </div>

      <div className="card">
        <div className="seg" role="radiogroup" aria-label="검색 기기">
          {["pc", "mobile"].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              className={`seg-btn${device === d ? " active" : ""}`}
              onClick={() => setDevice(d)}
              disabled={busy}
            >
              {d === "pc" ? "PC 검색" : "MO 검색"}
            </button>
          ))}
        </div>
        <form className="place-form" onSubmit={handleSearch}>
          <input type="text" placeholder="키워드 (예: 호텔예약)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <button type="submit" disabled={busy || !keyword.trim()}>
            {busy ? "수집 중..." : "분석하기"}
          </button>
        </form>
        {busy && (
          <div className="ad-progress" role="status">
            <span className="ad-progress-dot" aria-hidden="true" />
            수집 중… ({elapsed}초)
          </div>
        )}
        {(phase === "error" || phase === "blocked" || phase === "timeout") && message && <div className="error-box">{message}</div>}
        {phase === "empty" && <div className="ad-empty-box">{message}</div>}
      </div>

      {phase === "done" && (
        <>
          <div className="card">
            <div className="card-header">
              <h2>
                &ldquo;{resultMeta ? resultMeta.keyword : keyword}&rdquo; 파워링크 광고
                <span className="ad-device-tag">{DEVICE_LABEL[(resultMeta && resultMeta.device) || device]}</span>
              </h2>
              <button
                type="button"
                className="place-checknow-btn"
                onClick={() => downloadCsv(resultMeta ? resultMeta.keyword : keyword, (resultMeta && resultMeta.device) || device, ads)}
              >
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
              <p className="search-hint">
                조회 시각: {new Date(resultMeta.requestedAt).toLocaleString("ko-KR")}
              </p>
            )}
            {notice && <div className="ad-notice">{notice}</div>}
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

        </>
      )}
    </div>
  );
}
