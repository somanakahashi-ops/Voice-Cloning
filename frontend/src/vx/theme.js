// ============================================================
// デザイントークン(バージョンX: 声の劇場)
//
// コンセプト: 「声を、ひとつの舞台にひとりずつ迎える」
// ダッシュボードでも本棚でもなく、緞帳の下りた暗闇に一つずつ
// 照明(スポットライト)を灯して声を迎える劇場。一度に見えるのは
// 常にひとつの声・ひとつの章だけ。色は3色のジェル(照明フィルター)
// として声紋ごとに割り当てる。
// ============================================================

export const COLORS = {
  stage: '#08070A',
  stageDeep: '#020203',
  stageRaised: '#141119',
  curtain: '#4A0E1A',
  curtainDeep: '#20050B',
  line: 'rgba(244,237,224,0.12)',
  lineBright: 'rgba(244,237,224,0.24)',

  ivory: '#F4EDE0',
  ivorySoft: 'rgba(244,237,224,0.62)',
  ivoryFaint: 'rgba(244,237,224,0.32)',

  // スポットライトの照明ジェル3色。声紋ごとに割り当て、
  // その声の「舞台上の色」として一貫して使う。
  gelGold: '#E8C77E',
  gelRose: '#D98A93',
  gelBlue: '#8FB6C9',
};

export const ERA_COLORS = {
  gold: { bg: COLORS.gelGold, bgSoft: 'rgba(232,199,126,0.16)', text: '#F6E2AE' },
  rose: { bg: COLORS.gelRose, bgSoft: 'rgba(217,138,147,0.16)', text: '#F0C0C6' },
  blue: { bg: COLORS.gelBlue, bgSoft: 'rgba(143,182,201,0.16)', text: '#C7DCE6' },
};
export const ERA_PALETTE = ['gold', 'rose', 'blue'];

export const FONT_STAGE = "'Zen Old Mincho', serif";
export const FONT_BODY = "'Zen Kaku Gothic New', 'Noto Sans JP', sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace";

export const GLOBAL_KEYFRAMES = `
  * { box-sizing: border-box; }
  ::placeholder { color: ${COLORS.ivoryFaint}; }
  ::selection { background: rgba(232,199,126,0.32); color: ${COLORS.ivory}; }
  a, button { -webkit-tap-highlight-color: transparent; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
    outline: 2px solid ${COLORS.gelGold};
    outline-offset: 2px;
  }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes waveBarA {
    0%, 100% { transform: scaleY(var(--wf-min, 0.3)); }
    50% { transform: scaleY(var(--wf-max, 1)); }
  }
  @keyframes waveBarB {
    0%, 100% { transform: scaleY(var(--wf-min, 0.3)); }
    30% { transform: scaleY(var(--wf-max, 1)); }
    55% { transform: scaleY(calc(var(--wf-min, 0.3) + 0.15)); }
    80% { transform: scaleY(var(--wf-max, 1)); }
  }
  @keyframes waveBarC {
    0%, 100% { transform: scaleY(var(--wf-min, 0.3)); }
    20% { transform: scaleY(var(--wf-max, 1)); }
    40% { transform: scaleY(calc(var(--wf-min, 0.3) + 0.12)); }
    62% { transform: scaleY(var(--wf-max, 1)); }
    83% { transform: scaleY(calc(var(--wf-min, 0.3) + 0.22)); }
  }
  @keyframes spotBreathe {
    0%, 100% { opacity: 0.85; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.035); }
  }
  @keyframes riseInX {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes curtainReveal {
    from { opacity: 0; transform: scale(0.985); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes emberPulse {
    0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  }
`;
