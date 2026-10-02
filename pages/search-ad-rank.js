import { useState, useRef, useEffect } from "react";
import AdCard from "../components/AdCard";

// "검색광고 분석 > 키워드 노출분석" 화면.
// 우리 사이트 URL과 키워드를 입력하면, 네이버 파워링크에서 우리 광고가 PC/모바일 각각 몇 위에
// 노출되는지 보여줘요. 실제 조회는 GitHub Actions(search-ad-rank.yml)에서 실행되고, 화면은
// requestId로 결과를 폴링해요. 우리 광고를 찾으면 그 자리에서 멈추고, 못 찾으면 광고 더보기
// 마지막 페이지까지 다 확인한 뒤 "노출 안 됨"으로 알려줘요.

const MAX_WAIT_MS = 600000; // 10분 — PC/모바일 두 번 조회 + 첫 실행 준비 시간까지 넉넉하게
const INTERVAL_MS = 5000;
const SITE_STORAGE_KEY = "searchAdRank.siteUrl";
const NAME_STORAGE_KEY = "searchAdRank.advertiserName";

const DEVICES = [
  { key: "pc", label: "PC 검색" },
  { key: "mobile", label: "MO 검색" },
];

function DeviceResult({ label, r }) {
  if (!r) {
    return (
      <div className="rank-panel">
        <div className="rank-panel-head">{label}</div>
        <p className="rank-panel-sub">결과가 없어요.</p>
      </div>
    );
  }

  let main;
  let sub;
  let tone = "muted";
  if (r.status === "found") {
    tone = "good";
    main = (
      <>
        <span className="rank-panel-num">{r.rank}</span>위
      </>
    );
    sub = "";
  } else if (r.status === "not_found") {
    tone = "warn";
    main = "노출 안 됨";
    sub = `광고 ${r.scannedAds || 0}개 중 우리 광고가 없어요.`;
  } else if (r.status === "empty") {
    main = "광고 없음";
    sub = "이 키워드에 노출된 광고가 없어요.";
  } else if (r.status === "blocked") {
    tone = "bad";
    main = "접근 제한";
    sub = "잠시 후 다시 시도해주세요.";
  } else {
    tone = "bad";
    main = "조회 실패";
    sub = "잠시 후 다시 시도해주세요.";
  }

  return (
    <div className={`rank-panel rank-panel-${tone}`}>
      <div className="rank-panel-head">{label}</div>
      <div className="rank-panel-main">{main}</div>
      {sub && <p className="rank-panel-sub">{sub}</p>}
    </div>
  );
}

export default function SearchAdRankPage() {
  const [siteUrl, setSiteUrl] = useState("");
  const [advertiserName, setAdvertiserName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | checking | done | error | timeout
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollTimerRef = useRef(null);
  const clockRef = useRef(null);

  // 마지막으로 입력한 사이트 주소를 기억해둬요(이 브라우저에만 저장).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SITE_STORAGE_KEY);
      if (saved) setSiteUrl(saved);
      const savedName = window.localStorage.getItem(NAME_STORAGE_KEY);
      if (savedName) setAdvertiserName(savedName);
    } catch (e) {
      // 저장소를 쓸 수 없는 환경이면 그냥 넘어가요.
    }
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
        const res = await fetch(`/api/search-ad-rank/status?requestId=${encodeURIComponent(requestId)}`);
        const data = await res.json();
        if (data.ok && data.done) {
          stopTimers();
          const r = data.result || {};
          setResult(r);
          if (r.status === "ok") {
            setPhase("done");
            setMessage("");
          } else {
            setPhase("error");
            setMessage("조회에 실패했어요. 잠시 후 다시 시도해주세요.");
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

  async function handleSubmit(e) {
    e.preventDefault();
    if ((!siteUrl.trim() && !advertiserName.trim()) || !keyword.trim()) return;
    stopTimers();
    setPhase("checking");
    setMessage("");
    setResult(null);
    try {
      window.localStorage.setItem(SITE_STORAGE_KEY, siteUrl.trim());
      window.localStorage.setItem(NAME_STORAGE_KEY, advertiserName.trim());
    } catch (err) {
      // 무시
    }
    try {
      const res = await fetch("/api/search-ad-rank/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: siteUrl.trim(), advertiserName: advertiserName.trim(), keyword: keyword.trim() }),
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

  const busy = phase === "checking";
  const results = (result && result.results) || {};
  const foundAds = DEVICES.map((d) => ({ ...d, r: results[d.key] })).filter((d) => d.r && d.r.status === "found" && d.r.ad);

  return (
    <div className="container">
      <div className="header">
        <h1>키워드 노출분석</h1>
        <p>우리 광고가 PC·모바일에서 몇 위에 노출되는지 확인하세요.</p>
      </div>

      <div className="card">
        <form className="place-form" onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="url"
            placeholder="우리 사이트 URL (예: www.mysite.co.kr)"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
          />
          <input
            type="text"
            placeholder="광고주명·업체명 (선택, 예: 몬스마리양평)"
            value={advertiserName}
            onChange={(e) => setAdvertiserName(e.target.value)}
          />
          <input type="text" placeholder="키워드 (예: 호텔예약)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <button type="submit" disabled={busy || (!siteUrl.trim() && !advertiserName.trim()) || !keyword.trim()}>
            {busy ? "수집 중..." : "노출 순위 확인"}
          </button>
        </form>
        {busy && (
          <div className="ad-progress" role="status">
            <span className="ad-progress-dot" aria-hidden="true" />
            수집 중… ({elapsed}초)
          </div>
        )}
        {(phase === "error" || phase === "timeout") && message && <div className="error-box">{message}</div>}
      </div>

      {phase === "done" && result && (
        <>
          <div className="card">
            <div className="card-header">
              <h2>&ldquo;{result.keyword}&rdquo; 노출 순위</h2>
            </div>
            <p className="search-hint" style={{ textAlign: "left", marginTop: 0 }}>
              {[result.siteUrl, result.advertiserName].filter(Boolean).join(" · ")} · 조회 시각{" "}
              {new Date(result.requestedAt).toLocaleString("ko-KR")}
            </p>
            <div className="rank-panels">
              {DEVICES.map((d) => (
                <DeviceResult key={d.key} label={d.label} r={results[d.key]} />
              ))}
            </div>
          </div>

          {foundAds.length > 0 && (
            <div className="ad-list">
              {foundAds.map((d) => (
                <div key={d.key}>
                  <p className="rank-ad-label">{d.label}에 노출된 우리 광고</p>
                  <AdCard ad={d.r.ad} highlight />
                </div>
              ))}
            </div>
          )}

        </>
      )}
    </div>
  );
}
