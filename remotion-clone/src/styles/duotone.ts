// 双色风唯一代码令牌入口。
// 规范来源：docs/reference-styles/双色类/AI干进专业工作-阶段1-风格归档.md
// 注意：src/lib/theme.ts 是秋芝风历史主题，双色风成片不得从中取黄绿橙卡片或紫色头像预设。

export const DUOTONE = {
  color: {
    canvas: '#EEEAE1',
    ink: '#171813',
    muted: '#6F7069',
    accent: '#D8C94B',
    card: '#E5E0D6',
    brollBlack: '#050505',
    lightText: '#F2F2EE',
    lowBorder: 'rgba(23, 24, 19, 0.18)',
  },
  card: {
    radius: 14,
    shadow: '0 8px 22px rgba(23, 24, 19, 0.10)',
  },
  evidenceCard: {
    accentEdge: 4,
  },
  avatar: {
    defaultSize: 236,
    denseSize: 210,
    borderWidth: 3,
    shadow: '0 8px 18px rgba(23, 24, 19, 0.16)',
  },
  font: 'Microsoft YaHei, PingFang SC, Source Han Sans SC, sans-serif',
} as const;
