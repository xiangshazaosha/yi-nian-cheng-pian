// Exact role swap of the approved matte-green-blue palette.
// The original accent blue becomes the canvas; the original canvas green becomes the emphasis color.
export const MATTE_BLUE_GREEN = {
  color: {
    canvas: '#A9D7F2',
    ink: '#284B40',
    muted: '#335B4D',
    accent: '#284B40',
    card: '#F0F4F1',
    brollBlack: '#050505',
    lightText: '#F0F4F1',
    lowBorder: 'rgba(40, 75, 64, 0.24)',
    fullScreenInk: '#284B40',
    fullScreenMuted: '#335B4D',
  },
  card: {
    radius: 16,
    shadow: '0 10px 28px rgba(40, 75, 64, 0.16)',
  },
  avatar: {
    denseSize: 323,
    radius: 16,
    borderWidth: 2,
    areaRatio: 3,
  },
  font: 'Microsoft YaHei, PingFang SC, Source Han Sans SC, sans-serif',
} as const;
