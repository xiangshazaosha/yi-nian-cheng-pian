// Independent visual tokens. Never overwrite shared theme / other styles.
export const GEOMETRY = {
  bg: '#F5F1E7', ink: '#242440', red: '#E75C43', blue: '#3D55B4',
  yellow: '#F3CE49', muted: '#686777',
  font: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
  width: 1920, height: 1080, fps: 30,
  outline: 7, uiOutline: 5, uiRadius: 26,
  title: 88, label: 42, caption: 48,
  // Motion is intentionally modest, no continuously oscillating decoration.
  titleFrames: 12, nodeFrames: 14, pathFrames: 20, chartFrames: 22,
} as const;
