// 全局主题：颜色、缓动、尺寸常量
// 参考 docs/reference-styles/秋芝风/秋芝-拆解.md 与 docs/04-design-log.md CASE-001

import { staticFile } from 'remotion';

export const COLORS = {
  // 背景
  bgDark: '#050505',
  bgGradientStart: '#0A0A14',
  bgGradientEnd: '#050505',

  // 文字
  textMain: '#FFFFFF',
  textSub: '#B0B0B0',
  textMeta: '#888888',

  // 标签
  yellow: '#FFE600',   // 黄底黑字（风险卡/关键词高亮）
  green: '#CCFF00',    // 绿底黑字（步骤卡/事实卡）
  orange: '#FF6600',   // 橙底白字（结论卡/CTA）

  // 描边/发光
  purpleA: '#A020F0',
  purpleB: '#FF00FF',

  // 字幕
  captionBg: 'rgba(0, 0, 0, 0.80)',
  captionText: '#FFFFFF',

  // 边框
  frameBorder: '#E0E0E0',
} as const;

// 缓动曲线
export const EASE = {
  // 主进入：开始慢、末段快、最后稍缓
  primary: 'cubic-bezier(0.16, 1, 0.3, 1)',
  // ease-in-out：用于缩放/位移过渡
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  // 线性：用于蒙版擦除、标注线绘制
  linear: 'linear',
} as const;

// 输出尺寸（Full HD 16:9）
export const VIDEO_W = 1920;
export const VIDEO_H = 1080;
export const FPS = 30;

// 字号体系（基于 1080p）
export const FONT_SIZE = {
  // 大标题（左上）：占画面高 6-9%
  titleLg: 84,
  titleMd: 64,
  // 副标题：大标题的 40-50%
  subtitle: 36,
  // 摘要
  summary: 32,
  // 信息卡文字
  card: 38,
  cardLarge: 48,
  // 字幕
  caption: 44,
} as const;

// 圆角
export const RADIUS = {
  uiFrame: 28,      // B-roll 圆角 UI 框
  tag: 16,          // 标签卡
  caption: 12,      // 字幕条
  avatar: 0,        // 圆形头像（用 clip-path）
} as const;

// 设备样机色（RoundedUIFrame 的 phone/web/document variant 用）
// 这些是「模拟真实设备」的通用色，不属于品牌黄绿橙体系
export const DEVICE = {
  // 手机样机
  phoneBezel: '#1A1A1A',     // 物理边框深色
  phoneScreen: '#000000',    // 屏幕底色
  // 浏览器样机
  webBar: '#E8E8E8',         // 顶栏灰
  webBarBorder: '#D0D0D0',
  webAddrBg: '#FFFFFF',      // 地址栏白底
  webAddrBorder: '#D8D8D8',
  webDotRed: '#FF5F56',
  webDotYellow: '#FFBD2E',
  webDotGreen: '#27C93F',
  // 文档样机
  docBg: '#FFFFFF',
  docBorder: '#D0D0D0',
} as const;

// 阴影
export const SHADOW = {
  // UI 框柔和投影
  uiFrame: '0 8px 24px rgba(0, 0, 0, 0.60)',
  // 圆形头像投影
  avatar: '0 4px 12px rgba(0, 0, 0, 0.50)',
  // 卡片投影
  card: '0 6px 18px rgba(0, 0, 0, 0.45)',
  // GlowTitle 黄色强辉光
  glowYellow: [
    '0 0 8px rgba(255, 230, 0, 0.90)',
    '0 0 20px rgba(255, 230, 0, 0.70)',
    '0 0 40px rgba(255, 230, 0, 0.40)',
  ].join(', '),
  // 紫色外发光（圆形头像描边）
  glowPurple: [
    '0 0 12px rgba(160, 32, 240, 0.80)',
    '0 0 24px rgba(255, 0, 255, 0.50)',
  ].join(', '),
} as const;

// 音效文件路径（放 public/sfx/ 下，文件需用户自行下载）
// 详见 docs/packaging-library/pitfalls.md 音效章节
export const SFX = {
  pop: staticFile('sfx/pop.mp3'),          // 卡片/标签弹出（HighlightTag）
  swoosh: staticFile('sfx/swoosh.mp3'),    // 标题滑入（GlowTitle）
  tick: staticFile('sfx/tick.mp3'),        // HighlightBox 出现 / StepFlowBar 节点点亮
  ding: staticFile('sfx/ding.mp3'),        // 脉冲强调（HighlightBox pulseFrame）
  shimmer: staticFile('sfx/shimmer.mp3'),  // CTA GlowTitle 出现
  swish: staticFile('sfx/swish.mp3'),      // 段间转场
} as const;

// 针对当前内置音效文件的听感校准值。tick 的源文件平均响度明显低于 pop/shimmer，
// 因此步骤类组件使用更高的增益；这些值仍给口播保留了足够余量。
export const SFX_VOLUME = {
  pop: 0.65,
  tick: 1.0,
  shimmer: 0.65,
} as const;
