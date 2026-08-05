// ============================================================
// デザイントークン
//
// コンセプト: 「過去の声を、暗闇の中でスペクトルの光として読み取る観測ステーション」
// 紙やテープの温かい懐古ではなく、微弱な信号を精密に検出する計器の世界観。
// 3色のスペクトル(紫→マゼンタ→珊瑚色)を音の強度のグラデーションとして扱い、
// 年代タグ・「AIが今動いている」瞬間・ボタンなど、至るところにこの一本の
// スペクトルを通す。単一のアクセント色に頼らず、常に3色のグラデーションとして現れる。
// ============================================================

export const COLORS = {
  void: '#0A0A14',
  voidDeep: '#050509',
  panel: '#14141F',
  panelRaised: '#1C1C2E',
  line: 'rgba(199,201,218,0.12)',
  lineBright: 'rgba(199,201,218,0.26)',

  mist: '#E7E7F2',
  mistSoft: '#A8AABC',
  mistFaint: '#65667C',

  // スペクトル3色: 音の強度(弱→強)を表すグラデーション。単色のアクセントとしては使わない。
  spectral1: '#7C6CFF',
  spectral2: '#D946C4',
  spectral3: '#FF7A45',
  spectralGradient: 'linear-gradient(90deg, #7C6CFF 0%, #D946C4 52%, #FF7A45 100%)',
  spectralGradientSoft: 'linear-gradient(90deg, rgba(124,108,255,0.22) 0%, rgba(217,70,196,0.22) 52%, rgba(255,122,69,0.22) 100%)',

  // 完成(成功)の意味を持つ色。スペクトルとは独立させ、意味の混乱を避ける。
  mint: '#4FE3C1',
  mintSoft: 'rgba(79,227,193,0.14)',
  mintDeep: '#0B3B32',

  // 録音中・エラーの意味を持つ色。
  rose: '#FF4D6D',
  roseSoft: 'rgba(255,77,109,0.14)',
  roseDeep: '#3B0B18',
};

// 年代タグの色はスペクトルの3点そのものを割り当てる(装飾ではなく、
// 「声紋ごとに違う周波数を読み取っている」という設計上の意味を持たせる)。
export const ERA_COLORS = {
  violet: { bg: COLORS.spectral1, bgSoft: 'rgba(124,108,255,0.16)', text: '#CDC5FF' },
  magenta: { bg: COLORS.spectral2, bgSoft: 'rgba(217,70,196,0.16)', text: '#F5B9EA' },
  coral: { bg: COLORS.spectral3, bgSoft: 'rgba(255,122,69,0.16)', text: '#FFCBAC' },
};
export const ERA_PALETTE = ['violet', 'magenta', 'coral'];

// 巨大な見出し1箇所だけに使う、性格の強い表示専用書体(節度を守るためここだけに絞る)
export const FONT_HERO = "'Dela Gothic One', 'Zen Kaku Gothic New', sans-serif";
// セクション見出し・モーダルタイトルなど、太字で使う中間の見出し書体
export const FONT_DISPLAY = "'Zen Kaku Gothic New', sans-serif";
export const FONT_BODY = "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace";

// App.jsx で一度だけ注入するグローバルキーフレーム。
export const GLOBAL_KEYFRAMES = `
  * { box-sizing: border-box; }
  ::placeholder { color: ${COLORS.mistFaint}; }
  ::selection { background: rgba(217,70,196,0.35); color: ${COLORS.mist}; }
  a, button { -webkit-tap-highlight-color: transparent; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
    outline: 2px solid ${COLORS.spectral2};
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
  @keyframes signalPulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(217,70,196,0.45); }
    50% { opacity: 0.55; box-shadow: 0 0 0 5px rgba(217,70,196,0); }
  }
  @keyframes riseIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes driftGlow {
    0%, 100% { opacity: 0.55; transform: translateY(0); }
    50% { opacity: 1; transform: translateY(-3px); }
  }
  @keyframes scanLine {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  }
`;
