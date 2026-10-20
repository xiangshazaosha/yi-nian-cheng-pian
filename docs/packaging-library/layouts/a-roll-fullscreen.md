# A-roll 主播全屏

## 使用场景

主播口播主导段，A-roll 视频全屏铺满。用于：
- 开场钩子段（S1 前 5s）
- 段间过渡的 A-roll 段（S7 引出新方法、S12 CTA）
- 任何需要主播情绪表达强于 B-roll 演示的段

A-roll 全屏必须叠 [径向暗角](../masks/radial-vignette.md) 保持风格一致（秋芝风格核心是"暗色星空底 + 暗角聚光"）。

## 怎么使用

```tsx
import { AbsoluteFill, Audio, OffthreadVideo, interpolate, useCurrentFrame } from 'remotion';
import { TextureBackground } from '../components/TextureBackground';
import { GlowTitle } from '../components/GlowTitle';
import { HighlightTag } from '../components/HighlightTag';
import { CaptionBar } from '../components/CaptionBar';
import { A_ROLL_SEG7_SRC, COLORS, FONT_SIZE } from '../lib/theme';

const T = {
  titleIn: 6,
  transition: 150,    // A-roll 持续 5s 后切到 B-roll
  end: 240,
};

const CAPTION_FRAME_OFFSET = 2160;  // 01:12 = 72s * 30fps

export const Segment7: React.FC = () => {
  const frame = useCurrentFrame();

  // A-roll 入场淡入（前 6 帧，承接前段 B-roll 末段淡出）
  const aRollEnterOpacity = interpolate(frame, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // A-roll 末段淡出（切到 B-roll 前）
  const aRollExitOpacity = interpolate(frame, [T.transition, T.transition + 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const aRollOpacity = aRollEnterOpacity * aRollExitOpacity;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
      <Audio src={A_ROLL_SEG7_SRC} />

      <TextureBackground starCount={50} vignetteStrength={0.5} />

      {/* A-roll 全屏 + 暗角 */}
      <AbsoluteFill style={{ opacity: aRollOpacity }}>
        <OffthreadVideo src={A_ROLL_SEG7_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <AbsoluteFill style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5, 5, 5, 0.80) 100%)',
          pointerEvents: 'none',
        }} />
      </AbsoluteFill>

      {/* 底部字幕（A-roll 段全程显示） */}
      <CaptionBar frameOffset={CAPTION_FRAME_OFFSET} highlights={[...]} />

      {/* 包装元素容器 */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <GlowTitle text="第二个方法" x={80} y={80} variant="plain" size={FONT_SIZE.titleLg} delay={T.titleIn} enterDuration={12} />
        <HighlightTag text="可落地" x={CARD_X} y={CARD_Y} color="orange" size={FONT_SIZE.cardLarge} delay={90} enterDuration={10} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

关键结构：
- **底层**：`<AbsoluteFill backgroundColor={COLORS.bgDark}>` + `<TextureBackground>` + `<Audio>`
- **A-roll 层**：`<AbsoluteFill opacity={aRollOpacity}>` 包裹 `<OffthreadVideo muted>` + 暗角 div
- **字幕层**：`<CaptionBar frameOffset={...}>`（A-roll 段全程显示）
- **包装层**：`<AbsoluteFill pointerEvents="none">` 包裹 GlowTitle / HighlightTag 等

## Remotion 约束

### 1. OffthreadVideo 必须 muted
A-roll 全屏的 OffthreadVideo 必须 `muted`，音轨由段顶层 `<Audio src={A_ROLL_SRC} />` 统一采集。详见 [pitfalls.md#声音重复混乱](../pitfalls.md#声音重复混乱)。

### 2. 段首淡入承接前段 B-roll 末段淡出
若前段是 B-roll 段，本段 A-roll 前 6 帧必须淡入（`interpolate(frame, [0, 6], [0, 1])`），与前段 B-roll 末段 6 帧淡出组成 [段间黑场过渡](../transitions/segment-handoff.md)。

### 3. 段内 A-roll 切 B-roll 用交叉淡入淡出
若本段内 A-roll 切到 B-roll（如 S1 钩子段 5s 处），用 [A-roll ↔ B-roll 交叉淡入淡出](../transitions/a-roll-b-roll-cross.md)：A-roll opacity 1->0 over 10 帧 + B-roll opacity 0->1 over 18 帧，重叠期 7 帧。

## 避坑

### 1. 缺失暗角导致风格割裂
- **现象**：A-roll 全屏画面四角纯亮，与 B-roll 阶段风格不一致
- **根因**：A-roll 视频全屏不透明，盖住了 TextureBackground 的暗角
- **对策**：A-roll 全屏 AbsoluteFill 内部叠加暗角 div：`background: radial-gradient(ellipse at center, transparent 40%, rgba(5,5,5,0.80) 100%)`，pointerEvents: none。**暗角强度 0.80 达标，0.55 偏轻**
- **来源**：LESSON-004

### 2. 段首硬切导致段间过渡不自然
- **现象**：前段 B-roll 末段画面突然消失，本段 A-roll 首帧全亮出现，视觉跳跃
- **根因**：前段 B-roll 没做末段淡出，本段 A-roll 没做首段淡入
- **对策**：前段 B-roll 末段 6 帧淡出 + 本段 A-roll 头段 6 帧淡入。详见 [段间黑场过渡](../transitions/segment-handoff.md)
- **来源**：CASE-Segment6->S7、S11->S12 段间过渡修复

### 3. CaptionBar 跨过 A-roll/B-roll 切换点导致双重字幕
- **现象**：A-roll 切到 B-roll 时，CaptionBar 还在显示，与 B-roll 自带烧入字幕重叠
- **对策**：CaptionBar 用 `frame < T.transition` 硬切，frame T.transition 立即移除。详见 [CaptionBar 避坑#2](../components/caption-bar.md#2-b-roll-段双重字幕)

### 4. 标题对比度不足
- **现象**：白字标题压在 A-roll 浅色背景上看不清
- **对策**：用 GlowTitle plain variant（带 drop-shadow），或切到 glow variant。若仍不足，加 [暗色半透明遮罩](../masks/dark-overlay.md) 做标题背景

## 脚本参考

典型实现：[src/segments/Segment7.tsx（未随公开版分发）](../../public-release-scope.md)（A-roll 全屏 + 暗角 + 标题 + 副标题三段高亮 + 对比条 + 结论卡）
