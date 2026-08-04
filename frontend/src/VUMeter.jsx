import { COLORS } from './theme';

// シグネチャー要素: 音声レベルを示すアナログVUメーター。
// 「AIが過去の声を読み取っている」ことを、テープデッキの実機のように
// 針が振れる物理的な手応えで見せる。静止時は針が左に垂れ、
// 動いている(active)ときだけ不規則に振れて生きた信号に見える。
export function VUMeter({ active, size = 220 }) {
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = h * 0.92;
  const r = h * 0.82;

  const ticks = [-50, -35, -20, -8, 0, 8, 20, 35, 50];

  return (
    <div style={{ position: 'relative', width: w, height: h + 14 }}>
      <svg viewBox={`0 0 ${w} ${h + 14}`} width={w} height={h + 14} style={{ overflow: 'visible' }}>
        <path
          d={arcPath(cx, cy, r, -58, 58)}
          fill="none"
          stroke="rgba(243,238,227,0.16)"
          strokeWidth="1.5"
        />
        {ticks.map((deg) => {
          const major = deg === 0 || Math.abs(deg) === 50;
          const p1 = polar(cx, cy, r - 2, deg);
          const p2 = polar(cx, cy, r - (major ? 12 : 7), deg);
          return (
            <line
              key={deg}
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={deg > 20 ? COLORS.recordRed : 'rgba(243,238,227,0.4)'}
              strokeWidth={major ? 1.6 : 1}
            />
          );
        })}
        <text x={polar(cx, cy, r - 22, -50).x} y={polar(cx, cy, r - 22, -50).y}
          fill="rgba(243,238,227,0.45)" fontSize="8" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">-</text>
        <text x={polar(cx, cy, r - 22, 0).x} y={polar(cx, cy, r - 22, 0).y}
          fill="rgba(243,238,227,0.45)" fontSize="8" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">0</text>
        <text x={polar(cx, cy, r - 24, 50).x} y={polar(cx, cy, r - 24, 50).y}
          fill={COLORS.recordRed} fontSize="8" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">+</text>

        <g style={{
          transformOrigin: `${cx}px ${cy}px`,
          animation: active ? 'needleSwing 2.6s ease-in-out infinite' : 'none',
          transform: active ? undefined : 'rotate(-46deg)',
          transition: 'transform 0.4s ease',
        }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 6} stroke={COLORS.signal} strokeWidth="1.75" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="4.5" fill={COLORS.brass} stroke={COLORS.brassDeep} strokeWidth="1" />
      </svg>
      <div style={{
        position: 'absolute', top: 2, right: 2,
        width: 6, height: 6, borderRadius: '50%',
        background: active ? COLORS.signal : 'rgba(243,238,227,0.25)',
        boxShadow: active ? `0 0 6px ${COLORS.signal}` : 'none',
        animation: active ? 'ledBlink 1.1s steps(2, end) infinite' : 'none',
      }} />
    </div>
  );
}

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, fromDeg, toDeg) {
  const p1 = polar(cx, cy, r, fromDeg);
  const p2 = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}
