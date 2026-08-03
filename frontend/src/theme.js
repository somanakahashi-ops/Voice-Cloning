// ============================================================
// デザイントークン
//
// コンセプト: 「紙とテープに残された過去の声を、AIが読み取っている」
// 土台は温かい紙とセピアのノスタルジア(見出しは明朝、カセットの質感)。
// そこに一箇所だけ異質な"信号"の色(phosphor teal)を差し込み、
// 生成中・再生中など「AIが今動いている」瞬間にだけ灯す。
// ============================================================

export const COLORS = {
  paper: '#F3EEE3',
  paperDeep: '#EAE2CF',
  card: '#FFFDF8',
  cardMuted: '#FBF7EE',
  ink: '#2A241E',
  inkSoft: '#6B6356',
  inkFaint: '#9C8F79',
  hairline: '#DDD3BB',
  hairlineSoft: '#EEE8D9',

  amber: '#BE7A3D',
  amberSoft: '#EBD8BC',
  amberDeep: '#5A3A1A',

  moss: '#4C5C43',
  mossSoft: '#D6DBCC',
  mossDeep: '#25301D',

  indigo: '#3B4A5E',
  indigoSoft: '#D0D8E2',
  indigoDeep: '#1D2733',

  // "信号"アクセント: AIが今処理している瞬間にだけ使う異質な色
  signal: '#2E9E86',
  signalSoft: '#D9EFE9',
  signalDeep: '#153229',

  recordRed: '#B8402E',
};

export const ERA_COLORS = {
  amber: { bg: COLORS.amber, bgSoft: COLORS.amberSoft, text: COLORS.amberDeep },
  pine: { bg: COLORS.moss, bgSoft: COLORS.mossSoft, text: COLORS.mossDeep },
  ink: { bg: COLORS.indigo, bgSoft: COLORS.indigoSoft, text: COLORS.indigoDeep },
};
export const ERA_PALETTE = ['amber', 'pine', 'ink'];

export const FONT_DISPLAY = "'Shippori Mincho', serif";
export const FONT_BODY = "'Noto Sans JP', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace";

// App.jsx で一度だけ注入するグローバルキーフレーム。
// 波形バー・信号パルス・リール回転は複数コンポーネントで共有するためここに集約する。
export const GLOBAL_KEYFRAMES = `
  * { box-sizing: border-box; }
  ::placeholder { color: ${COLORS.inkFaint}; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes reelSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes waveBar { 0%, 100% { transform: scaleY(0.32); } 50% { transform: scaleY(1); } }
  @keyframes signalPulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(46,158,134,0.4); }
    50% { opacity: 0.5; box-shadow: 0 0 0 5px rgba(46,158,134,0); }
  }
`;
