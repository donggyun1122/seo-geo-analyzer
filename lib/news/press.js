// 기사 원문 주소 → 언론사 이름. 목록에 없는 곳은 사이트 주소(도메인)를 그대로 보여줘요.
// 필요하면 자유롭게 추가하세요("도메인": "언론사명").

const PRESS_BY_DOMAIN = {
  "yna.co.kr": "연합뉴스",
  "yonhapnewstv.co.kr": "연합뉴스TV",
  "newsis.com": "뉴시스",
  "news1.kr": "뉴스1",
  "chosun.com": "조선일보",
  "biz.chosun.com": "조선비즈",
  "joongang.co.kr": "중앙일보",
  "donga.com": "동아일보",
  "hani.co.kr": "한겨레",
  "khan.co.kr": "경향신문",
  "hankookilbo.com": "한국일보",
  "seoul.co.kr": "서울신문",
  "segye.com": "세계일보",
  "kmib.co.kr": "국민일보",
  "munhwa.com": "문화일보",
  "mk.co.kr": "매일경제",
  "hankyung.com": "한국경제",
  "wowtv.co.kr": "한국경제TV",
  "sedaily.com": "서울경제",
  "sentv.co.kr": "서울경제TV",
  "mt.co.kr": "머니투데이",
  "edaily.co.kr": "이데일리",
  "fnnews.com": "파이낸셜뉴스",
  "heraldcorp.com": "헤럴드경제",
  "asiae.co.kr": "아시아경제",
  "ajunews.com": "아주경제",
  "newspim.com": "뉴스핌",
  "etnews.com": "전자신문",
  "zdnet.co.kr": "지디넷코리아",
  "dt.co.kr": "디지털타임스",
  "inews24.com": "아이뉴스24",
  "ddaily.co.kr": "디지털데일리",
  "bloter.net": "블로터",
  "thebell.co.kr": "더벨",
  "businesspost.co.kr": "비즈니스포스트",
  "ebn.co.kr": "EBN",
  "viva100.com": "브릿지경제",
  "metroseoul.co.kr": "메트로서울",
  "newdaily.co.kr": "뉴데일리",
  "dailian.co.kr": "데일리안",
  "kukinews.com": "쿠키뉴스",
  "nocutnews.co.kr": "노컷뉴스",
  "ohmynews.com": "오마이뉴스",
  "pressian.com": "프레시안",
  "sisajournal.com": "시사저널",
  "econovill.com": "이코노믹리뷰",
  "enewstoday.co.kr": "이뉴스투데이",
  "wikitree.co.kr": "위키트리",
  "insight.co.kr": "인사이트",
  "sbs.co.kr": "SBS",
  "kbs.co.kr": "KBS",
  "imbc.com": "MBC",
  "jtbc.co.kr": "JTBC",
  "ytn.co.kr": "YTN",
  "mbn.co.kr": "MBN",
  "tvchosun.com": "TV조선",
  "ichannela.com": "채널A",
  "sportschosun.com": "스포츠조선",
  "sportsseoul.com": "스포츠서울",
  "osen.co.kr": "OSEN",
  "xportsnews.com": "엑스포츠뉴스",
  "mydaily.co.kr": "마이데일리",
  "starnewskorea.com": "스타뉴스",
  "tenasia.co.kr": "텐아시아",
  "newsen.com": "뉴스엔",
  "dispatch.co.kr": "디스패치",
  "topstarnews.net": "톱스타뉴스",
  "sportsworldi.com": "스포츠월드",
  "isplus.com": "일간스포츠",
  "ttimes.co.kr": "티타임즈",
  "hankyung.co.kr": "한국경제",
  "news.naver.com": "네이버뉴스",
  "n.news.naver.com": "네이버뉴스",
};

function hostOf(url) {
  const m = String(url || "").match(/^https?:\/\/([^/?#]+)/i);
  if (!m) return "";
  return m[1].toLowerCase().replace(/:\d+$/, "").replace(/^(www|m|mobile)\./, "");
}

function pressNameOf(url) {
  const host = hostOf(url);
  if (!host) return "";
  // 하위 도메인까지 차례로 줄여가며 찾기: news.mt.co.kr → mt.co.kr
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const cand = parts.slice(i).join(".");
    if (PRESS_BY_DOMAIN[cand]) return PRESS_BY_DOMAIN[cand];
  }
  return host;
}

module.exports = { PRESS_BY_DOMAIN, hostOf, pressNameOf };
