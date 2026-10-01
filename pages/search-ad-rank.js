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
    sub = r.pageLabel ? `${r.pageLabel}에 노출` : `광고 더보기 ${r.page}페이지에 노출`;
  } else if (r.status === "not_found") {
    tone = "warn";
    main = "노출 안 됨";
    sub = `광고 ${r.scannedAds || 0}개(${
      r.device === "mobile" ? r.loadSummary || "모바일 전체" : `${r.pagesFetched || 0}페이지`
    })를 모두 확인했는데 우리 광고가 없었어요.`;
  } else if (r.status === "empty") {
    main = "광고 없음";
    sub = "이 키워드로 노출된 파워링크 광고 자체를 찾지 못했어요.";
  } else if (r.status === "blocked") {
    tone = "bad";
    main = "접근 제한";
    sub = "네이버가 자동화된 접근으로 판단해 조회를 막았어요.";
  } else {
    tone = "bad";
    main = "조회 실패";
    sub = "조회 중 오류가 났어요.";
  }

  return (
    <div className={`rank-panel rank-panel-${tone}`}>
      <div className="rank-panel-head">{label}</div>
      <div className="rank-panel-main">{main}</div>
      <p className="rank-panel-sub">{sub}</p>
      {r.status === "found" && r.rankSource && (
        <p className="rank-panel-note">
          {r.rankSource === "naver" ? "네이버가 광고에 붙여둔 순위 번호 기준" : "화면에 나온 순서 기준"}
        </p>
      )}
      {r.note && <p className="rank-panel-note">{r.note}</p>}
      {(r.status === "blocked" || r.status === "error" || r.status === "empty") && r.errorMessage && (
        <details className="rank-panel-detail">
          <summary>자세히</summary>
          <p>{r.errorMessage}</p>
        </details>
      )}
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
        setMessage("10분이 지나도 결과가 안 왔어요. GitHub 저장소의 Actions 탭에서 search-ad-rank 워크플로가 실행 중인지 확인해보세요.");
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
        <p>우리 사이트 주소와 키워드를 입력하면, 네이버 파워링크에서 우리 광고가 PC와 모바일에서 각각 몇 위에 노출되는지 알려드려요.</p>
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
            {busy ? "확인 중..." : "노출 순위 확인"}
          </button>
        </form>
        <p className="search-hint">
          광고에 표시되는 사이트 주소로 우리 광고를 찾아요(www., m. 은 달라도 같은 사이트로 봐요). 스마트스토어는 스토어 이름까지 넣어주세요(예:
          smartstore.naver.com/스토어명). 플레이스로 연결되는 광고는 주소만으로 구분이 안 될 때가 많아서(특히 모바일), 광고에 표시되는
          광고주명을 함께 넣어주세요 — 주소나 광고주명 중 하나라도 맞으면 우리 광고로 봐요. PC·모바일을 차례로 확인해서 보통 2~4분 걸려요.
        </p>
        {busy && (
          <div className="ad-progress" role="status">
            <span className="ad-progress-dot" aria-hidden="true" />
            PC → 모바일 순서로 우리 광고를 찾는 중이에요… ({elapsed}초)
            {elapsed > 120 && <span className="ad-progress-sub">광고가 많은 키워드이거나 우리 광고가 없으면 마지막 페이지까지 확인하느라 더 걸려요.</span>}
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

          <p className="footer-note">
            순위는 광고 더보기 페이지(PC/모바일) 기준이에요. 네이버 광고는 실시간 입찰 결과라 조회할 때마다, 그리고 보는 위치·시간에 따라
            순위가 조금씩 달라질 수 있어요. 광고 링크(클릭하면 광고비가 청구되는 추적 링크)는 열지 않고 화면에 보이는 정보만 읽어요.
          </p>
        </>
      )}
    </div>
  );
}
