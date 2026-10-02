import { useState, useRef, useEffect } from "react";

const MAX_WAIT_MS = 480000; // 8분 — 처음 실행은 npm install/Playwright 설치까지 새로 해서 오래 걸릴 수 있어요.
const INTERVAL_MS = 6000;

// placeId만 있으면 기기(모바일/PC) 상관없이 이 모바일 상세페이지 URL로 늘 접속됩니다
// (모바일 전용 마크업에서 실제로 이 형식의 링크를 확인했어요 — PC로 검색한 결과의
// placeId를 넣어도 같은 업체의 상세페이지가 그대로 열려요).
function naverPlaceUrl(placeId) {
  return `https://m.place.naver.com/place/${placeId}/home`;
}

// 새 탭이 아니라 작은 팝업창으로 띄웁니다. onClick 핸들러 안에서 바로 호출해야(사용자의
// 클릭 동작과 동기적으로 실행) 브라우저 팝업 차단에 걸리지 않아요.
function openPlacePopup(placeId) {
  if (!placeId) return;
  window.open(
    naverPlaceUrl(placeId),
    "naverPlacePopup",
    "width=420,height=800,noopener,noreferrer,scrollbars=yes,resizable=yes"
  );
}

export default function KeywordPlaceListPage() {
  const [keyword, setKeyword] = useState("");
  const [device, setDevice] = useState("mobile");
  const [maxRank, setMaxRank] = useState(50);
  const [phase, setPhase] = useState("idle"); // idle | searching | done | blocked | error | timeout
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [resultMeta, setResultMeta] = useState(null); // { keyword, device }
  const pollTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  function pollForResult(requestId) {
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const res = await fetch(`/api/keyword-place-list/status?requestId=${encodeURIComponent(requestId)}`);
        const data = await res.json();
        if (data.ok && data.done) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          const result = data.result || {};
          if (result.status === "ok") {
            setRows(result.results || []);
            setResultMeta({ keyword: result.keyword, device: result.device });
            setPhase("done");
            setMessage("");
          } else {
            setRows([]);
            setResultMeta(null);
            setPhase(result.status === "blocked" ? "blocked" : "error");
            setMessage(result.status === "blocked" ? "접근이 제한됐어요. 잠시 후 다시 시도해주세요." : "분석에 실패했어요. 잠시 후 다시 시도해주세요.");
          }
          return;
        }
      } catch (err) {
        // 네트워크 순간 오류는 무시하고 다음 폴링에서 재시도
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setPhase("timeout");
        setMessage(
          "결과를 받지 못했어요. 잠시 후 다시 시도해주세요."
        );
      }
    };

    pollTimerRef.current = setInterval(tick, INTERVAL_MS);
    tick();
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!keyword.trim()) return;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPhase("searching");
    setMessage("");
    setRows([]);
    setResultMeta(null);
    try {
      const res = await fetch("/api/keyword-place-list/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), device, maxRank }),
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
  const showMessage = message && (phase === "error" || phase === "blocked" || phase === "timeout");
  const organicCount = rows.filter((r) => !r.isAd).length;
  const adCount = rows.filter((r) => r.isAd).length;

  return (
    <div className="container">
      <div className="header">
        <h1>키워드 분석 — 업체 순위표</h1>
        <p>키워드로 노출되는 네이버 플레이스 업체를 순위대로 확인하세요.</p>
      </div>

      <div className="card">
        <form className="place-form" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="키워드 (예: 홍대맛집)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="mobile">모바일</option>
            <option value="pc">PC</option>
          </select>
          <select value={maxRank} onChange={(e) => setMaxRank(Number(e.target.value))}>
            <option value={50}>상위 50개</option>
            <option value={100}>상위 100개</option>
            <option value={200}>상위 200개</option>
          </select>
          <button type="submit" disabled={busy}>
            {busy ? "수집 중..." : "분석하기"}
          </button>
        </form>
        {showMessage && <div className="error-box">{message}</div>}
        {busy && <p className="brand-empty">수집 중…</p>}
      </div>

      {phase === "done" && (
        <div className="card">
          <div className="card-header">
            <h2>
              &ldquo;{resultMeta ? resultMeta.keyword : keyword}&rdquo; 검색 결과 — 일반 노출 {organicCount}개
              {adCount > 0 ? `, 광고 ${adCount}개` : ""}
            </h2>
          </div>
          {rows.length === 0 ? (
            <p className="brand-empty">결과를 찾지 못했어요.</p>
          ) : (
            <div className="table-scroll">
            <p className="table-scroll-hint">← 표를 좌우로 밀어서 전체 내용을 볼 수 있어요</p>
            <table className="place-table">
              <thead>
                <tr>
                  <th>순위</th>
                  <th>플레이스명</th>
                  <th>카테고리</th>
                  <th>주소</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.placeId || "noid"}-${i}`} style={r.isAd ? { opacity: 0.55 } : undefined}>
                    <td>{r.isAd ? "광고" : r.rank}</td>
                    <td>
                      {r.name || "-"}
                      {r.placeId && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => openPlacePopup(r.placeId)}
                            title="클릭하면 네이버 플레이스 페이지가 작은 창으로 열려요"
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              marginLeft: 4,
                              color: "var(--accent-blue, #2a6df4)",
                              textDecoration: "underline",
                              cursor: "pointer",
                              fontSize: "0.85em",
                            }}
                          >
                            ({r.placeId})
                          </button>
                        </>
                      )}
                    </td>
                    <td>{r.category || "-"}</td>
                    <td>{r.address || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
