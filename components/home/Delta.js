// 증감 표시(▲/▼ + 수치). 색만으로 구분하지 않도록 화살표를 같이 써요.
// good: 이 변화가 좋은 방향인지(예: CPC 하락은 좋은 변화) / neutral: 좋고 나쁨이 없는 변화
export default function Delta({ value, suffix = "%", good, neutral = false, label }) {
  const up = value >= 0;
  const tone = neutral ? "neutral" : (good === undefined ? up : good) ? "good" : "bad";
  return (
    <span className={`delta delta-${tone}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {label || `${Math.abs(value)}${suffix}`}
    </span>
  );
}
