import { useState, useRef, useEffect } from "react";

const MAX_WAIT_MS = 480000; // 8분 — 처음 실행은 npm install/Playwright 설치까지 새로 해서 오래 걸릴 수 있어요.
const INTERVAL_MS = 6000;

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
            setMessage(result.errorMessage || "분석에 실패했어요.");
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
          "8분이 지나도 결과가 안 왔어요. GitHub 저장소의 Actions 탭에서 keyword-place-list 워크플로가 실행 중인지, 에러로 멈추지 않았는지 확인해보세요."
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
        <p>키워드 하나를 검색하면, 네이버 플레이스에서 그 키워드로 노출되는 업체들을 순위대로 보여줘요.</p>
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
            <option value="mobile">모바일 (추천 — 카테고리·주소 포함)</option>
            <option value="pc">PC (주소 정보 없음)</option>
          </select>
          <select value={maxRank} onChange={(e) => setMaxRank(Number(e.target.value))}>
            <option value={50}>상위 50개</option>
            <option value={100}>상위 100개</option>
            <option value={200}>상위 200개</option>
          </select>
          <button type="submit" disabled={busy}>
            {busy ? "분석 중..." : "분석하기"}
          </button>
        </form>
        <p className="search-hint">
          방문자수·블로그 수·저장수는 업체마다 상세페이지를 하나씩 열어봐야 확인할 수 있는 정보라 이 목록에는
          포함하지 않았어요(50~200개를 전부 열어보면 시간이 오래 걸리고 네이버가 접근을 제한할 위험도 커져요).
          PC로 조회하면 실제 목록 페이지에 주소 정보가 없어서 주소 칸이 비어있어요 — 주소까지 필요하면 모바일로
          조회해주세요.
        </p>
        {showMessage && <div className="error-box">{message}</div>}
        {busy && <p className="brand-empty">분석 요청을 보냈어요. 처음 실행이라면 3~5분, 이후엔 더 빨라져요...</p>}
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
                    <td>{r.name || "-"}</td>
                    <td>{r.category || "-"}</td>
                    <td>{r.address || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
