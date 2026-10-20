# B-roll 全屏 + 遮罩

## 使用场景

强调结论/CTA 段，B-roll 视频全屏铺满 + [暗色半透明遮罩](../masks/dark-overlay.md) 压暗背景 + [GlowTitle](../components/glow-title.md) 居中大字。用于：
- 段尾收束（S12 CTA 段 2-3s 切到全屏 + GlowTitle"关注领提示词"）
- 任何需要从 B-roll 圆角 UI 框切到全屏 + 大字标题的强调点

视觉冲击力强但不适合长时间停留，通常 2-4 秒。

## 怎么使用

```tsx
import { AbsoluteFill, Audio, OffthreadVideo, interpolate, useCurrentFrame } from 'remotion';
import { TextureBackground } from '../components/TextureBackground';
import { CircularAvatar } from '../components/CircularAvatar';
import { A_ROLL_SEG12_SRC, B_ROLL_SEG12_SRC, COLORS, FONT_SIZE, VIDEO_W, VIDEO_H } from '../lib/theme';

const T = {
  transition: 60,        // 2.0s A-roll 淡出，B-roll + GlowTitle 淡入
  glowPulse: 75,         // 2.5s GlowTitle 脉冲
  end: 90,
};

const GLOW_X = VIDEO_W / 2 - 380;
const GLOW_Y = VIDEO_H / 2 - 80;

const AVATAR_SIZE = VIDEO_W * 0.14;
const AVATAR_X = 60;
const AVATAR_Y = VIDEO_H - AVATAR_SIZE - 80;

export const Segment12: React.FC = () => {
  const frame = useCurrentFrame();

  // B-roll + 遮罩 + GlowTitle 淡入（60-66，与 A-roll 同步交叉淡入）
  const bRollEnterProgress = interpolate(frame, [T.transition, T.transition + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // GlowTitle spring 入场 + 脉冲
  const glowEnterScale = bRollEnterProgress < 0.7
    ? interpolate(bRollEnterProgress, [0, 0.7], [0.9, 1.08])
    : interpolate(bRollEnterProgress, [0.7, 1], [1.08, 1.0]);
  const glowPulseScale = frame >= T.glowPulse && frame < T.glowPulse + 10
    ? interpolate(frame, [T.glowPulse, T.glowPulse + 5, T.glowPulse + 10], [1.0, 1.03, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const glowScale = glowEnterScale * glowPulseScale;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
      <Audio src={A_ROLL_SEG12_SRC} />
      <TextureBackground starCount={50} vignetteStrength={0.5} />

      {/* B-roll 全屏 + 暗色遮罩（2-3s） */}
      {bRollEnterProgress > 0 && (
        <AbsoluteFill style={{ opacity: bRollEnterProgress }}>
          <OffthreadVideo src={B_ROLL_SEG12_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <AbsoluteFill style={{ background: 'rgba(0, 0, 0, 0.60)', pointerEvents: 'none' }} />
        </AbsoluteFill>
      )}

      {/* GlowTitle：关注领提示词（2s 后全屏出现） */}
      {bRollEnterProgress > 0 && (
        <div style={{
          position: 'absolute', left: GLOW_X, top: GLOW_Y, width: 760,
          opacity: bRollEnterProgress,
          transform: `scale(${glowScale})`,
          transformOrigin: 'center',
          fontSize: FONT_SIZE.titleLg * 1.3,
          fontWeight: 900, color: COLORS.yellow, letterSpacing: '6px', textAlign: 'center',
          textShadow: ['0 0 12px rgba(255,230,0,0.90)', '0 0 24px rgba(255,230,0,0.70)', '0 0 48px rgba(255,230,0,0.40)'].join(', '),
          fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        }}>
          关注领提示词
        </div>
      )}

      {/* 圆形头像（与 B-roll 同步淡入） */}
      {bRollEnterProgress > 0 && (
        <CircularAvatar videoSrc={A_ROLL_SEG12_SRC} startFrame={0} appearFrame={T.transition} x={AVATAR_X} y={AVATAR_Y} size={AVATAR_SIZE} enterDuration={12} />
      )}
    </AbsoluteFill>
  );
};
```

关键结构：
- **底层**：`<AbsoluteFill backgroundColor={COLORS.bgDark}>` + `<TextureBackground>` + `<Audio>`
- **B-roll 全屏层**：`<AbsoluteFill opacity={bRollEnterProgress}>` 包裹 `<OffthreadVideo muted>` + 暗色遮罩 div
- **GlowTitle 层**：居中大字，spring 入场 + 脉冲强调
- **头像层**：左下 CircularAvatar，与 B-roll 同步淡入

关键参数：
- 遮罩强度：`rgba(0, 0, 0, 0.60)`（B-roll 自带字幕仍可见，但 GlowTitle 突出）
- GlowTitle 字号：`FONT_SIZE.titleLg * 1.3`（109.2，比段首大标题更大）
- GlowTitle 颜色：`COLORS.yellow` + 多层 text-shadow 强辉光
- GlowTitle 入场：spring scale 0.9 -> 1.08 -> 1.0（与 bRollEnterProgress 同步）
- GlowTitle 脉冲：scale 1.0 -> 1.03 -> 1.0 over 10 帧（frame 75-85）

## Remotion 约束

### 1. OffthreadVideo 必须 muted
B-roll 全屏的 OffthreadVideo 必须 `muted`，音轨由段顶层 `<Audio>` 统一采集。

### 2. B-roll 用 Sequence 包裹而非 startFrom
若 B-roll 物理片段已对齐主时间轴起点，用 `<Sequence>` 包裹。但本构图 B-roll 从段内 T.transition 帧才开始显示，可以直接用 `<OffthreadVideo>` 不包 Sequence（因为整个段内 B-roll 都是从物理第 0 帧开始播，T.transition 帧时 B-roll 物理第 T.transition 帧 = 主时间轴第 T.transition 帧，正好对齐）。

### 3. 与前段 A-roll 的交叉淡入淡出
若本段从 A-roll 主播全屏切到 B-roll 全屏 + 遮罩，A-roll opacity 1->0 over 6 帧（T.transition - T.transition+6）+ B-roll opacity 0->1 over 6 帧（T.transition - T.transition+6），重叠期 6 帧。

## 避坑

### 1. 遮罩强度过强导致 B-roll 不可见
- **现象**：遮罩 0.80 时 B-roll 画面几乎全黑，看不出 B-roll 内容
- **根因**：B-roll 全屏 + 遮罩的目的是"压暗背景突出 GlowTitle"，不是"完全遮挡 B-roll"
- **对策**：遮罩强度 0.55-0.60。0.60 是经过视觉复查的达标值，B-roll 自带字幕仍可见，GlowTitle 突出
- **来源**：CASE-Segment12 视觉复查

### 2. GlowTitle 字号过小不突出
- **现象**：GlowTitle 用 `FONT_SIZE.titleLg`（84），与段首大标题一样大，没有"全屏强调"的视觉冲击
- **对策**：B-roll 全屏 + 遮罩段的 GlowTitle 字号放大 1.3 倍（`FONT_SIZE.titleLg * 1.3` = 109.2），letterSpacing 加大到 6px，textShadow 多层强辉光

### 3. GlowTitle 位置不居中
- **现象**：GlowTitle 偏左或偏上，不在画面正中
- **根因**：用 `left + top` 定位时，GlowTitle 容器宽度未固定，文字偏移
- **对策**：固定 GlowTitle 容器 width（如 760），`left = VIDEO_W/2 - 380`，`top = VIDEO_H/2 - 80`，textAlign: center

### 4. 圆形头像未同步淡入
- **现象**：B-roll 全屏淡入时头像突然出现，视觉跳跃
- **对策**：CircularAvatar 的 `appearFrame` 设为 `T.transition`（与 B-roll 同步淡入），`enterDuration=12`（短于常规的 18，加快入场）

## 脚本参考

典型实现：[src/segments/Segment12.tsx（未随公开版分发）](../../public-release-scope.md)（A-roll 全屏 + B-roll 全屏 + 遮罩 + GlowTitle + 圆形头像）
