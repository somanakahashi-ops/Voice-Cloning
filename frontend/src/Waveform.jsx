// indexから決定的な疑似乱数を作る(Math.randomだと再レンダーの度に値が変わり、
// ポーリング中にバーの高さが毎回リセットされたように見えてしまうため)
function seeded(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const VARIANTS = ['waveBarA', 'waveBarB', 'waveBarC'];
const BASE_HEIGHTS = [0.45, 0.85, 0.6, 1, 0.5, 0.7, 0.4, 0.9, 0.55, 0.75, 0.35, 0.65];

// シグネチャー要素: 波形バー。
// 静止時はテープに刻まれた過去の波形のように固定表示、
// 再生・生成が始まった瞬間だけ「信号」として生きて動く。
// 全バーが同じ周期で位相だけずれる単調な動きにならないよう、
// バーごとに周期・遅延・振幅・波形パターンをずらしている。
export function Waveform({ active, bars = 5, size = 'md', color }) {
  const dims = size === 'lg'
    ? { w: 3, gap: 4, h: 56 }
    : size === 'sm' ? { w: 2, gap: 2, h: 13 } : { w: 2.5, gap: 2.5, h: 17 };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: dims.gap, height: dims.h, flexShrink: 0 }}>
      {Array.from({ length: bars }, (_, i) => {
        const restHeight = BASE_HEIGHTS[i % BASE_HEIGHTS.length];
        const min = 0.14 + seeded(i * 5 + 3) * 0.22;
        const max = 0.62 + seeded(i * 11 + 4) * 0.38;
        const duration = 0.55 + seeded(i * 3 + 1) * 0.95;
        const delay = seeded(i * 7 + 2) * -1.4; // 負の遅延で開始時点からすでにバラバラの位相にする
        const variant = VARIANTS[i % VARIANTS.length];
        const timing = variant === 'waveBarC' ? 'steps(6, end)' : 'ease-in-out';
        return (
          <span
            key={i}
            style={{
              display: 'block',
              width: dims.w,
              height: '100%',
              borderRadius: 1,
              background: color || 'currentColor',
              transformOrigin: 'bottom',
              transform: active ? undefined : `scaleY(${restHeight})`,
              opacity: active ? 1 : 0.5,
              animationName: active ? variant : 'none',
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
              animationTimingFunction: timing,
              animationIterationCount: 'infinite',
              '--wf-min': min,
              '--wf-max': max,
            }}
          />
        );
      })}
    </span>
  );
}
