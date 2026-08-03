// カセットのテープリール。円+中央の点だけだと回転しても見た目が変わらず
// 「止まっているのか壊れているのか」分からなくなるため、
// 長さの違う2本のスポークを入れて回転が一目で分かるようにしている。
export function Reel({ spinning, color, size = 22 }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        animation: spinning ? 'reelSpin 2.2s linear infinite' : 'none',
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
        <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="2.2" />
        <line x1="12" y1="12" x2="12" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="12" x2="18" y2="15.5" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
        <circle cx="12" cy="12" r="2.2" fill={color} />
      </svg>
    </span>
  );
}
