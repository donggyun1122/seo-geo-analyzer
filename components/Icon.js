// 사이트 전체에서 쓰는 아웃라인 아이콘(선 굵기·크기 통일). Lucide 계열과 같은 규격이에요:
// 24×24 기준, 선 굵기 1.75, 둥근 끝. 별도 패키지 설치 없이 여기서 직접 그려요.
// 새 아이콘이 필요하면 ICONS에 이름과 도형만 추가하면 돼요.

const ICONS = {
  search: [["circle", { cx: 11, cy: 11, r: 7 }], ["path", { d: "M20 20l-3.6-3.6" }]],
  sparkles: [
    ["path", { d: "M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8L11 3z" }],
    ["path", { d: "M19 15v4M17 17h4" }],
  ],
  hash: [["path", { d: "M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" }]],
  monitor: [["rect", { x: 3, y: 4, width: 18, height: 12, rx: 2 }], ["path", { d: "M8 20h8M12 16v4" }]],
  bell: [["path", { d: "M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z" }], ["path", { d: "M10 21h4" }]],
  target: [["circle", { cx: 12, cy: 12, r: 9 }], ["circle", { cx: 12, cy: 12, r: 5 }], ["circle", { cx: 12, cy: 12, r: 1 }]],
  image: [
    ["rect", { x: 3, y: 4, width: 18, height: 16, rx: 2 }],
    ["circle", { cx: 9, cy: 10, r: 1.6 }],
    ["path", { d: "M21 16l-5-5-8 9" }],
  ],
  barChart: [["path", { d: "M4 20V10M10 20V4M16 20v-7M21 20H3" }]],
  panelTop: [["rect", { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ["path", { d: "M3 9h18M7 14h6" }]],
  mapPin: [["path", { d: "M12 21s7-6.1 7-11a7 7 0 10-14 0c0 4.9 7 11 7 11z" }], ["circle", { cx: 12, cy: 10, r: 2.5 }]],
  listOrdered: [["path", { d: "M10 6h10M10 12h10M10 18h10M4 5h1v3M4 11h2l-2 3h2M4 17h2v3H4" }]],
  messageSquare: [["path", { d: "M4 5h16v11H9l-5 4V5z" }]],
  newspaper: [
    ["path", { d: "M4 5h13v14H6a2 2 0 01-2-2V5z" }],
    ["path", { d: "M17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5M8 16h3" }],
  ],
  trendingUp: [["path", { d: "M3 17l6-6 4 4 8-8" }], ["path", { d: "M15 7h6v6" }]],
  alertCircle: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 8v5M12 16.5v.01" }]],
  eye: [["path", { d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
  layoutDashboard: [
    ["rect", { x: 3, y: 3, width: 8, height: 10, rx: 1.5 }],
    ["rect", { x: 13, y: 3, width: 8, height: 6, rx: 1.5 }],
    ["rect", { x: 13, y: 11, width: 8, height: 10, rx: 1.5 }],
    ["rect", { x: 3, y: 15, width: 8, height: 6, rx: 1.5 }],
  ],
  fileText: [["path", { d: "M6 3h8l4 4v14H6V3z" }], ["path", { d: "M14 3v4h4M9 12h6M9 16h6" }]],
  download: [["path", { d: "M12 4v11M7 11l5 5 5-5M4 20h16" }]],
  arrowRight: [["path", { d: "M5 12h14M13 6l6 6-6 6" }]],
  arrowUpRight: [["path", { d: "M7 17L17 7M9 7h8v8" }]],
  chevronDown: [["path", { d: "M6 9l6 6 6-6" }]],
  compass: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M15.5 8.5l-2 5-5 2 2-5 5-2z" }]],
  lineChart: [["path", { d: "M4 4v16h16" }], ["path", { d: "M8 15l3.5-4 3 2.5L19 8" }]],
  lightbulb: [["path", { d: "M9 18h6M10 21h4" }], ["path", { d: "M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0012 3z" }]],
  zap: [["path", { d: "M13 3L5 13h6l-1 8 8-10h-6l1-8z" }]],
  gauge: [["path", { d: "M4 17a8 8 0 1116 0" }], ["path", { d: "M12 17l4-5" }], ["circle", { cx: 12, cy: 17, r: 1 }]],
  layers: [["path", { d: "M12 3l9 5-9 5-9-5 9-5z" }], ["path", { d: "M3 12.5l9 5 9-5M3 17l9 5 9-5" }]],
  check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]],
};

export default function Icon({ name, size = 20, strokeWidth = 1.75, className = "" }) {
  const shapes = ICONS[name];
  if (!shapes) return null;
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map(([Tag, attrs], i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}
