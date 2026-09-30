import { useState, useRef, useEffect } from "react";

const MAX_WAIT_MS = 480000; // 8분 — 처음 실행은 npm install/Playwright 설치까지 새로 해서 오래 걸릴 수 있어요.
const INTERVAL_MS = 6000;

function formatWon(n) {
  return typeof n === "number" ? `${n.toLocaleString("ko-KR")}원` : "-";
}

const SPACE_LABEL = {
  nv_mid: "네이버쇼핑 상품 URL(nvMid)로 인식했어요.",
  catalog_nv_mid: "네이버쇼핑 카탈로그 URL로 인식했어요.",
  chnl_prod_no: "스마트스토어 상품 URL로 인식했어요.",
  unknown: "형식을 정확히 알 수 없어 숫자 ID로 최대한 매칭을 시도했어요.",
};

export default function ShoppingRankCheckPage() {
  const [keyword, setKeyword] = useState("");
  const [productIdInput, setProductIdInput] = useState("");
  const [areaMode, setAreaMode] = useState("organic");
  const [maxRank, setMaxRank] = useState(200);
  const [phase, setPhase] = useState("idle"); // idle | checking | done | not_found | blocked | error | timeout
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
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
        const res = await fetch(`/api/shopping-rank-check/status?requestId=${encodeURIComponent(requestId)}`);
        const data = await res.json();
        if (data.ok && data.done) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          const r = data.result || {};
          setResult(r);
          if (r.status === "ok") {
            setPhase("done");
            setMessage("");
          } else if (r.status === "not_found") {
            setPhase("not_found");
            setMessage(r.errorMessage || "");
          } else if (r.status === "blocked") {
            setPhase("blocked");
            setMessage(r.errorMessage || "");
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
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setPhase("timeout");
        setMessage("8분이 지나도 결과가 안 왔어요. GitHub 저장소의 Actions 탭에서 shopping-rank-check 워크플로 실행 상태를 확인해보세요.");
      }
    };
    pollTimerRef.current = setInterval(tick, INTERVAL_MS);
    tick();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!keyword.trim() || !productIdInput.trim()) return;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPhase("checking");
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/shopping-rank-check/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), productIdInput: productIdInput.trim(), areaMode, maxRank }),
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
  const item = result && result.matchedItem;

  return (
    <div className="container">
      <div className="header">
        <h1>네이버 쇼핑 순위 체크</h1>
        <p>키워드와 상품 URL(또는 ID)을 입력하면, 광고 영역과 광고 제외(일반) 영역 중 선택한 쪽에서 몇 위인지 확인해줘요.</p>
      </div>

      <div className="card">
        <form className="place-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="키워드 (예: 캐리어)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <input
            type="text"
            placeholder="상품 URL 또는 ID (스마트스토어 상품 URL, 카탈로그 URL, 숫자 ID 등)"
            value={productIdInput}
            onChange={(e) => setProductIdInput(e.target.value)}
            style={{ flex: "2 1 320px" }}
          />
          <select value={areaMode} onChange={(e) => setAreaMode(e.target.value)}>
            <option value="organic">광고 제외(일반) 영역에서 순위</option>
            <option value="ad">광고 영역에서 순위</option>
          </select>
          <select value={maxRank} onChange={(e) => setMaxRank(Number(e.target.value))}>
            <option value={50}>상위 50위까지 확인</option>
            <option value={100}>상위 100위까지 확인</option>
            <option value={200}>상위 200위까지 확인</option>
          </select>
          <button type="submit" disabled={busy}>
            {busy ? "확인 중..." : "확인하기"}
          </button>
        </form>
        <p className="search-hint">
          PC 검색 결과 기준이에요. 카탈로그로 묶여 노출되는 상품은 판매처별 상품번호가 검색결과 데이터에 없어서,
          스마트스토어 상품 URL을 붙여넣어도 찾지 못할 수 있어요 — 그럴 땐 네이버쇼핑 검색결과에서 그 상품을 직접 눌러
          나오는 카탈로그 URL을 사용해보세요.
        </p>
        {busy && <p className="brand-empty">조회 요청을 보냈어요. 처음 실행이라면 3~5분, 이후엔 더 빨라져요...</p>}
      </div>

      {phase !== "idle" && phase !== "checking" && (
        <div className="card">
          <div className="card-header">
            <h2>
              &ldquo;{keyword}&rdquo; — {areaMode === "ad" ? "광고 영역" : "광고 제외(일반) 영역"} 기준
            </h2>
          </div>

          {phase === "done" && result && (
            <>
              <div className="kw-stat-grid">
                <div className="kw-stat-card">
                  <div className="kw-stat-label">순위</div>
                  <div className="kw-stat-value">{result.rank}위</div>
                </div>
                {item && (
                  <>
                    <div className="kw-stat-card">
                      <div className="kw-stat-label">가격</div>
                      <div className="kw-stat-value">{formatWon(item.price)}</div>
                    </div>
                    <div className="kw-stat-card">
                      <div className="kw-stat-label">판매처</div>
                      <div className="kw-stat-value" style={{ fontSize: 16 }}>
                        {item.mallName || "-"}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {item && (
                <p className="brand-item-desc" style={{ marginTop: 16 }}>
                  <strong>{item.name}</strong>
                  {item.category ? ` · ${item.category}` : ""}
                  {item.productUrl ? (
                    <>
                      {" "}
                      —{" "}
                      <a href={item.productUrl} target="_blank" rel="noopener noreferrer">
                        상품 보러가기
                      </a>
                    </>
                  ) : null}
                </p>
              )}
              {result.productIdSpace && (
                <p className="search-hint" style={{ marginTop: 12 }}>{SPACE_LABEL[result.productIdSpace]}</p>
              )}
            </>
          )}

          {phase === "not_found" && (
            <div className="error-box">{message || "해당 순위 범위 안에서 상품을 찾지 못했어요."}</div>
          )}
          {(phase === "error" || phase === "blocked" || phase === "timeout") && (
            <div className="error-box">{message}</div>
          )}
        </div>
      )}
    </div>
  );
}
