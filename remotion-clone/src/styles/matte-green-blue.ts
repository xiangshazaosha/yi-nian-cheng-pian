// Independent style recipe; never changes the approved DUOTONE constants.
export const MATTE_GREEN_BLUE = {
  color: {canvas: '#284B40', text: '#F0F4F1', muted: '#B7CEC5', accent: '#A9D7F2', surface: '#335B4D', black: '#050505'},
  avatar: {radius: 16, border: 2, areaRatio: 3, baselineDiameter: 210},
  font: 'Microsoft YaHei, PingFang SC, Source Han Sans SC, sans-serif',
} as const;
// Rounded-square silhouette area = side² - (4-π)r², not simply side².
export const greenAvatarSide = (diameter = 210) => Math.sqrt(3 * Math.PI * (diameter / 2) ** 2 + (4 - Math.PI) * 16 ** 2);
