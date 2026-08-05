import { COLORS } from './theme';

// シグネチャー要素: 波形バー。
// 静止時はテープに刻まれた過去の波形のように固定表示、
// 再生・生成が始まった瞬間だけ「信号」として生きて動く。
export function Waveform({ active, bars = 5, size = 'md', color }) {
  const heights = [0.45, 0.85, 0.6, 1, 0.5, 0.7, 0.4].slice(0, bars);
  const dims = size === 'sm' ? { w: 2, gap: 2, h: 13 } : { w: 2.5, gap: 2.5, h: 17 };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: dims.gap, height: dims.h, flexShrink: 0 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            display: 'block',
            width: dims.w,
            height: '100%',
            borderRadius: 1,
            background: color || 'currentColor',
            transformOrigin: 'bottom',
            transform: active ? undefined : `scaleY(${h})`,
            animation: active ? `waveBar 0.85s ease-in-out ${i * 0.11}s infinite` : 'none',
            opacity: active ? 1 : 0.5,
          }}
        />
      ))}
    </span>
  );
}

// 「AIが今処理している」ことを示す信号灯。生成中インジケータで使う。
export function SignalDot({ style }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: COLORS.signal,
        animation: 'signalPulse 1.3s ease-in-out infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
