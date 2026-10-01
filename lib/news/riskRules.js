// 뉴스 클리핑 "우선 확인" 규칙 — 기사 제목/요약에 아래 단어가 있으면 표시해요.
//
//  - 즉시 확인(빨강): CRITICAL 단어가 "제목"에 있을 때
//  - 관찰 항목(주황): WATCH 단어가 제목에 있거나, CRITICAL 단어가 요약에만 있을 때
//
// 단어는 자유롭게 고쳐도 돼요. 너무 흔하거나 다른 뜻이 있는 단어(예: "사고 싶은", "사과", "고소한", "장애인", "설문조사")는 엉뚱한 기사까지 걸려서 뺐어요.
// 단어 비교는 띄어쓰기를 무시해요("개인정보 유출" = "개인정보유출").

const CRITICAL_WORDS = [
  "해킹", "랜섬웨어", "개인정보유출", "정보유출", "고객정보유출", "유출사고", "디도스", "서버마비",
  "압수수색", "구속", "체포", "기소", "송치", "입건", "검찰수사", "경찰수사", "수사착수", "고발", "피소",
  "집단소송", "손해배상소송", "과징금", "영업정지", "공정위제재", "제재심", "중징계",
  "리콜", "사망", "화재", "폭발", "식중독",
  "횡령", "배임", "분식회계", "탈세", "세무조사", "주가조작", "불공정거래", "사기혐의", "투자사기",
  "불매", "파산", "회생절차", "법정관리", "부도", "상장폐지", "거래정지",
  "갑질", "성희롱", "성추행", "성폭력", "마약", "음주운전",
  "먹통", "서비스장애", "접속장애", "결제오류", "전산장애", "환불대란",
];

const WATCH_WORDS = [
  "논란", "의혹", "환불", "환불불가", "취소수수료", "위약금", "민원", "불만", "항의", "피해", "소비자피해",
  "비판", "지적", "경고", "우려", "해명", "공방", "분쟁", "갈등", "소송",
  "노조", "파업", "구조조정", "희망퇴직", "감원", "철수", "중단", "지연", "오류", "결함",
  "적자", "급락", "하락", "감소", "부진", "이탈", "해지", "표절", "루머", "악플", "폭로", "불법", "규제",
];

const squash = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

function findWords(text, words) {
  const t = squash(text);
  if (!t) return [];
  return words.filter((w) => t.includes(squash(w)));
}

// 짧은 단어가 긴 단어에 포함되면 긴 쪽만 남겨요(예: "유출사고"와 "사고" 같은 중복 표시 방지).
function dedupeWords(list) {
  const uniq = [...new Set(list)];
  return uniq.filter((w) => !uniq.some((o) => o !== w && squash(o).includes(squash(w))));
}

// 반환: { level: "critical" | "watch" | null, words: [...] }
function classifyRisk(title, description) {
  const critTitle = findWords(title, CRITICAL_WORDS);
  if (critTitle.length) return { level: "critical", words: dedupeWords(critTitle) };
  const watchTitle = findWords(title, WATCH_WORDS);
  const critDesc = findWords(description, CRITICAL_WORDS);
  if (watchTitle.length || critDesc.length) {
    return { level: "watch", words: dedupeWords([...watchTitle, ...critDesc]) };
  }
  return { level: null, words: [] };
}

module.exports = { CRITICAL_WORDS, WATCH_WORDS, classifyRisk };
