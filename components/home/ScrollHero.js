import { useEffect, useRef, useState } from "react";

// 홈 첫 화면 — 스크롤 연출 Hero.
//
// PC(901px 이상)
//   1) 흰 배경 위 큰 글자(DG MKT / LAB) 안으로만 영상이 보여요.
//   2) 스크롤하면 화면은 고정된 채 글자가 문구 한가운데를 기준으로 점점 커지고,
//   3) 글자가 화면을 넘어서면 흰 배경이 사라져 영상이 화면 전체를 채워요.
//   4) 영상이 어두워지면서 카피가 떠올라요. 더 내리면 고정이 풀리고 다음 섹션으로 넘어가요.
// 모바일(900px 이하)
//   영상 없이 — 들어오면 글자가 조각조각 나타나 "DG MKT LAB"이 완성되고(약 1.5초),
//   스크롤하면 글자가 잘리지 않고 그대로 남색 화면 속으로 사라진 뒤 카피가 나와요.
//   (영상 파일은 모바일에서 아예 내려받지 않아요.)
//
// 동작 원리: 스크롤 위치를 0~1 값(--p)으로 바꿔 CSS에 넘기고, 나머지는 CSS가 계산해요.
// 첫 화면: 영상이 준비되기 전에는 영상의 첫 장면(hero-poster.jpg)을 바로 보여주고, 재생이 시작되면
//          그 위로 자연스럽게 넘어가요(검은 화면이 보이지 않도록). 포스터는 반드시 영상의 첫 장면이어야 해요.
// 영상 교체: public/videos/hero.mp4 (소리 없는 가로 영상, 5MB 안팎 권장) + hero-poster.jpg(영상이 뜨기 전 정지 화면)

// 모바일 첫 등장 모션용 조각(가로 18칸 × 세로 10칸).
// 흰 조각들이 글자를 덮고 있다가 제각각 다른 순서로 사라지면서, 글자가 조각조각 나타나 완성돼요.
// 순서는 "정해진 무작위"예요(서버와 브라우저에서 같은 값이 나와야 해서 Math.random을 쓰지 않아요).
const PIECE_COLS = 18;
const PIECE_ROWS = 10;
const PIECES = Array.from({ length: PIECE_COLS * PIECE_ROWS }, (_, i) => {
  const r = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
  return (0.12 + Math.pow(r, 1.25) * 1.25).toFixed(2); // 0.12초 ~ 1.37초 사이에 하나씩
});

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
// a~b 구간을 0~1로 바꿔요(구간 밖은 0 또는 1).
const range = (p, a, b) => clamp((p - a) / (b - a));

export default function ScrollHero({
  lines = ["DG MKT", "LAB"],
  label = "MARKETING INTELLIGENCE PLATFORM",
  title = ["데이터를 보면,", "다음 마케팅이 보입니다."],
  description = "SEO · 검색 · 광고 · 플레이스 · 경쟁사 데이터를 한 곳에서 분석하고 마케팅 의사결정에 필요한 인사이트를 발견하세요.",
  videoSrc = "/videos/hero.mp4",
  posterSrc = "/videos/hero-poster.jpg",
}) {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const wordRef = useRef(null);
  const videoRef = useRef(null);
  const [desktop, setDesktop] = useState(false);
  const [videoReady, setVideoReady] = useState(false); // 영상이 실제로 재생되기 시작했는지

  // PC에서만 영상을 불러와요.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const word = wordRef.current;
    if (!section || !stage || !word) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let raf = 0;
    let lastP = -1;
    let lastW = window.innerWidth;
    const isDesktop = window.matchMedia("(min-width: 901px)").matches;

    // 글자가 화면 폭을 넘으면(글꼴이 늦게 뜨거나 대체 글꼴일 때) 폭에 맞게 줄여요.
    // 확대 기준점은 CSS에서 문구 한가운데(50% 50%)로 고정돼 있어요.
    function fitWord() {
      stage.style.setProperty("--fit", "1");
      const room = stage.clientWidth * 0.92;
      if (word.offsetWidth > room) stage.style.setProperty("--fit", (room / word.offsetWidth).toFixed(4));
    }

    function update() {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const travel = section.offsetHeight - stage.offsetHeight;
      const p = travel > 0 ? clamp(-rect.top / travel) : 0;
      if (Math.abs(p - lastP) < 0.0005) return;
      lastP = p;

      const zoom = range(p, 0, 0.56);
      if (isDesktop) {
        const scale = 1 + Math.pow(zoom, 2.2) * 17; // 처음엔 천천히, 뒤로 갈수록 빠르게
        stage.style.setProperty("--scale", scale.toFixed(4));
        // 문구 한가운데로 확대하면 가운데가 글자 사이 흰 여백이라, 글자가 커지는 동안 흰 배경을 함께 걷어내요.
        stage.style.setProperty("--mask", (1 - range(p, 0.2, 0.52)).toFixed(4)); // 흰 배경이 사라지는 정도
      } else {
        // 모바일: 글자를 키우지 않아요(화면이 좁아 글자가 잘려 보여서). 글자는 온전한 모습 그대로
        // 살짝 작아지며 남색 화면 속으로 사라지고, 이어서 카피가 나와요.
        stage.style.setProperty("--scale", (1 - zoom * 0.06).toFixed(4));
        stage.style.setProperty("--mask", (1 - range(p, 0.12, 0.5)).toFixed(4));
      }
      stage.style.setProperty("--dim", range(p, 0.42, 0.7).toFixed(4)); // 영상이 어두워지는 정도
      stage.style.setProperty("--copy", range(p, 0.6, 0.8).toFixed(4)); // 카피가 나타나는 정도
      stage.style.setProperty("--cue", (1 - range(p, 0, 0.08)).toFixed(4)); // "Scroll" 안내
      stage.classList.toggle("is-copy", p > 0.6);

      // 화면에서 완전히 벗어나면 영상을 잠깐 멈춰요(배터리·성능 절약).
      const v = videoRef.current;
      if (v) {
        const visible = rect.bottom > 0 && rect.top < window.innerHeight;
        if (visible && v.paused) v.play().catch(() => {});
        if (!visible && !v.paused) v.pause();
      }
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      // 모바일은 스크롤할 때 주소창이 접히면서 "높이만" 바뀌는 resize가 계속 와요.
      // 그때마다 글자 크기를 다시 재면 글자가 튀어 보이니, 폭이 바뀔 때만 다시 맞춰요.
      if (window.innerWidth !== lastW) {
        lastW = window.innerWidth;
        fitWord();
      }
      lastP = -1;
      onScroll();
    };
    const onFonts = () => {
      fitWord();
      lastP = -1;
      onScroll();
    };

    stage.classList.add("is-live");
    fitWord();
    update();
    // 글꼴이 늦게 적용되면 글자 위치가 바뀌니 기준점을 다시 잡아요.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onFonts).catch(() => {});
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      stage.classList.remove("is-live");
    };
  }, [desktop]);

  return (
    <section className="shero" ref={sectionRef} aria-label="DG MKT LAB">
      <div className="shero-stage" ref={stageRef}>
        <div className="shero-media" aria-hidden="true">
          {desktop && (
            <video
              ref={videoRef}
              className={`shero-video${videoReady ? " is-ready" : ""}`}
              src={videoSrc}
              poster={posterSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onPlaying={() => setVideoReady(true)}
            />
          )}
          <div className="shero-tint" />
        </div>

        {/* 흰 배경 + 검은 글자를 영상 위에 "스크린"으로 겹치면, 검은 글자 자리에만 영상이 비쳐요. */}
        <div className="shero-mask" aria-hidden="true">
          <div className="shero-word" ref={wordRef}>
            {lines.map((l) => (
              <span key={l} className="shero-line">
                {l}
              </span>
            ))}
            {/* 모바일 전용: 글자 조각 등장(PC에서는 CSS로 숨김) */}
            <span className="shero-pieces" style={{ "--cols": PIECE_COLS, "--rows": PIECE_ROWS }}>
              {PIECES.map((delay, i) => (
                <i key={i} style={{ animationDelay: `${delay}s` }} />
              ))}
            </span>
          </div>
        </div>

        <div className="shero-dim" aria-hidden="true" />

        <div className="shero-copy">
          <span className="shero-label">{label}</span>
          <h1>
            {title.map((t, i) => (
              <span key={t}>
                {t}
                {i < title.length - 1 && <br />}
              </span>
            ))}
          </h1>
          <p>{description}</p>
        </div>

        <div className="shero-cue" aria-hidden="true">
          <span>SCROLL</span>
          <i />
        </div>
      </div>
    </section>
  );
}
