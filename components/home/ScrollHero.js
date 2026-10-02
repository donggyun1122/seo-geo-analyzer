import { useEffect, useRef, useState } from "react";

// 홈 첫 화면 — 스크롤 연출 Hero.
//
// PC(901px 이상)
//   1) 흰 배경 위 큰 글자(DG MKT / LAB) 안으로만 영상이 보여요.
//   2) 스크롤하면 화면은 고정된 채 글자가 점점 커지고,
//   3) 글자가 화면을 넘어서면 흰 배경이 사라져 영상이 화면 전체를 채워요.
//   4) 영상이 어두워지면서 카피가 떠올라요. 더 내리면 고정이 풀리고 다음 섹션으로 넘어가요.
// 모바일(900px 이하)
//   영상 없이 같은 흐름 — 큰 글자가 커지며 짙은 남색 화면으로 바뀌고 카피가 나와요.
//   (영상 파일은 모바일에서 아예 내려받지 않아요.)
//
// 동작 원리: 스크롤 위치를 0~1 값(--p)으로 바꿔 CSS에 넘기고, 나머지는 CSS가 계산해요.
// 영상 교체: public/videos/hero.mp4 (소리 없는 가로 영상, 5MB 안팎 권장) + hero-poster.jpg(영상이 뜨기 전 정지 화면)

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
  const anchorRef = useRef(null);
  const videoRef = useRef(null);
  const [desktop, setDesktop] = useState(false);

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

    // 글자를 키울 때 기준점 — 굵은 세로 획 한가운데로 잡아야 확대했을 때 화면이 영상으로 꽉 차요.
    function setOrigin() {
      const a = anchorRef.current;
      if (!a) return;
      // 글자가 화면 폭을 넘으면(글꼴이 늦게 뜨거나 대체 글꼴일 때) 폭에 맞게 줄여요.
      stage.style.setProperty("--fit", "1");
      const room = stage.clientWidth * 0.92;
      if (word.offsetWidth > room) stage.style.setProperty("--fit", (room / word.offsetWidth).toFixed(4));
      // offset* 값은 확대(transform)의 영향을 받지 않아서 언제 재도 같은 값이 나와요.
      let x = a.offsetLeft + a.offsetWidth * 0.26; // L의 세로 획은 글자 왼쪽에 있어요
      let y = a.offsetTop + a.offsetHeight * 0.45;
      let el = a.offsetParent;
      while (el && el !== word) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent;
      }
      word.style.transformOrigin = `${x}px ${y}px`;
    }

    function update() {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const travel = section.offsetHeight - stage.offsetHeight;
      const p = travel > 0 ? clamp(-rect.top / travel) : 0;
      if (Math.abs(p - lastP) < 0.0005) return;
      lastP = p;

      const zoom = range(p, 0, 0.56);
      const scale = 1 + Math.pow(zoom, 2.4) * 34; // 처음엔 천천히, 뒤로 갈수록 빠르게
      stage.style.setProperty("--scale", scale.toFixed(4));
      stage.style.setProperty("--mask", (1 - range(p, 0.34, 0.56)).toFixed(4)); // 흰 배경이 사라지는 정도
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
      setOrigin();
      lastP = -1;
      onScroll();
    };

    stage.classList.add("is-live");
    setOrigin();
    update();
    // 글꼴이 늦게 적용되면 글자 위치가 바뀌니 기준점을 다시 잡아요.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(() => {});
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      stage.classList.remove("is-live");
    };
  }, [desktop]);

  // 확대 기준이 되는 글자: 마지막 줄의 첫 글자(예: LAB의 L — 굵은 세로 획)
  const lastLine = lines[lines.length - 1];

  return (
    <section className="shero" ref={sectionRef} aria-label="DG MKT LAB">
      <div className="shero-stage" ref={stageRef}>
        <div className="shero-media" aria-hidden="true">
          {desktop && (
            <video ref={videoRef} className="shero-video" src={videoSrc} poster={posterSrc} autoPlay muted loop playsInline preload="auto" />
          )}
          <div className="shero-tint" />
        </div>

        {/* 흰 배경 + 검은 글자를 영상 위에 "스크린"으로 겹치면, 검은 글자 자리에만 영상이 비쳐요. */}
        <div className="shero-mask" aria-hidden="true">
          <div className="shero-word" ref={wordRef}>
            {lines.slice(0, -1).map((l) => (
              <span key={l} className="shero-line">
                {l}
              </span>
            ))}
            <span className="shero-line">
              <span ref={anchorRef} className="shero-anchor">
                {lastLine.charAt(0)}
              </span>
              {lastLine.slice(1)}
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
