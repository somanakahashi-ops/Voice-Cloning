import { COLORS } from './theme';

// index から決定的な疑似乱数を作る(Math.randomだと再レンダーの度に値が変わるため)
function seeded(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// シグネチャー要素: スペクトルの光の帯。
// 「過去の声を、周波数の光として読み取っている」ことを示す唯一の大胆な意匠。
// 横位置に応じて紫→マゼンタ→珊瑚色のグラデーションを帯ごとに割り当て、
// 単一のアクセント色ではなく常に3色のスペクトルとして現れるようにする。
export function SpectralBloom({ bars = 40, height = 120, active = true }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: Math.max(1.5, height / 70),
        height,
        width: '100%',
      }}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, i) => {
        const t = i / (bars - 1); // 0(左)→1(右)
        const color = t < 0.5
          ? mix(COLORS.spectral1, COLORS.spectral2, t / 0.5)
          : mix(COLORS.spectral2, COLORS.spectral3, (t - 0.5) / 0.5);
        const rest = 0.12 + 0.5 * Math.sin(t * Math.PI); // 中央が高く両端が低い山なりの静止形
        const min = rest * (0.55 + seeded(i * 5 + 3) * 0.25);
        const max = Math.min(1, rest + 0.25 + seeded(i * 11 + 4) * 0.35);
        const duration = 1.4 + seeded(i * 3 + 1) * 1.8;
        const delay = seeded(i * 7 + 2) * -3;
        const variant = ['waveBarA', 'waveBarB', 'waveBarC'][i % 3];
        return (
          <span
            key={i}
            style={{
              display: 'block',
              flex: 1,
              height: '100%',
              borderRadius: 2,
              background: color,
              transformOrigin: 'bottom',
              transform: active ? undefined : `scaleY(${rest})`,
              opacity: active ? 0.92 : 0.4,
              boxShadow: active ? `0 0 10px ${color}55` : 'none',
              animationName: active ? variant : 'none',
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              '--wf-min': min,
              '--wf-max': max,
            }}
          />
        );
      })}
    </div>
  );
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// 「AIが今処理している」ことを示す信号灯。生成中インジケータで使う。
export function SignalDot({ style }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: COLORS.spectral2,
        animation: 'signalPulse 1.3s ease-in-out infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
