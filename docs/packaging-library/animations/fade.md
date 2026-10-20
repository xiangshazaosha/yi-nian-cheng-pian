# 淡入淡出

## 使用场景

通用透明度过渡，所有元素的入场/退场默认动效。用于：
- [GlowTitle](../components/glow-title.md) 出场
- [HighlightTag](../components/highlight-tag.md) 出场
- [HighlightBox](../components/highlight-box.md) 入场/出场
- [AnnotationLine](../components/annotation-line.md) 出场
- A-roll ↔ B-roll 交叉过渡
- 段间黑场过渡（B-roll 末段淡出 + A-roll 头段淡入）

是最朴素也最常用的动效。视觉上"元素从无到有"或"从有到无"的平滑过渡。

## 怎么使用

```tsx
import { interpolate, useCurrentFrame } from 'remotion';

// 入场淡入（从 frame=start 开始，持续 duration 帧）
const enterOpacity = interpolate(
  frame,
  [start, start + duration],  // 通常 duration=6-10
  [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);

// 退场淡出（从 frame=exitStart 开始，持续 duration 帧）
const exitOpacity = interpolate(
  frame,
  [exitStart, exitStart + duration],
  [1, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);

// 组合（取最小值，确保入场完成前不退场）
const opacity = Math.min(enterOpacity, exitOpacity);

<div style={{ opacity, ... }} />
```

关键参数：
- 持续帧数：常用 6-10 帧（0.2-0.33s）
- `extrapolateLeft: 'clamp'` 和 `extrapolateRight: 'clamp'` 必须加，否则 frame 超出范围时 opacity 会外推到负数或大于 1
- 入场 + 退场组合用 `Math.min(enterOpacity, exitOpacity)`

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 interpolate。

## 避坑

### 1. 忘记加 extrapolate: 'clamp' 导致 opacity 异常
- **现象**：frame 超出 interpolate 范围时，opacity 变成负数或大于 1，元素消失或全白
- **根因**：interpolate 默认 `extrapolateLeft: 'extend'` 和 `extrapolateRight: 'extend'`，会外推
- **对策**：所有 opacity interpolate 必须加 `{ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }`

### 2. A-roll/B-roll 交叉淡入淡出重叠期过长
- **现象**：frame 150-165 约 15 帧内 A-roll 与 B-roll 同时半透明，形成"双重曝光/幽灵叠影"，视觉偏浑浊
- **根因**：A-roll 淡出 15 帧 + B-roll 滑入 18 帧，两者同时开始，半透明重叠期长达 15 帧
- **对策**：A-roll 淡出缩短为 10 帧（150-160）；B-roll 滑入延后 3 帧（153-171）。重叠期缩短到 7 帧（153-160），叠影明显减轻但仍保留平滑过渡感。**重叠期 5-8 帧较自然**，少于 5 帧切换太硬，多于 10 帧叠影明显
- **来源**：LESSON-009

### 3. B-roll 段 CaptionBar 淡出导致双重字幕
- **现象**：B-roll 段 Remotion 字幕条与 B-roll 自带烧入字幕同时显示
- **根因**：CaptionBar 在 A-roll/B-roll 切换点用淡出（10 帧），但 B-roll 在切换点就带烧入字幕，淡出过程中两者重叠
- **对策**：B-roll 段 CaptionBar 必须**硬切**不能淡出。详见 [CaptionBar 避坑#2](../components/caption-bar.md#2-b-roll-段双重字幕)
- **来源**：LESSON-005

### 4. 段间过渡硬切导致视觉跳跃
- **现象**：前段 B-roll 末段画面突然消失，下段 A-roll 首帧全亮出现
- **对策**：前段 B-roll 末段 6 帧淡出 + 下段 A-roll 头段 6 帧淡入。详见 [段间黑场过渡](../transitions/segment-handoff.md)

### 5. exitStart 默认值导致元素不退场
- **现象**：忘记传 exitStart 时元素不退场，叠在下段上
- **根因**：组件默认 `exitStart = Number.MAX_SAFE_INTEGER`，意为永不退场
- **对策**：段末需退场的元素必须显式传 `exitStart`，建议比段末早 8-12 帧

## 搭配音效

淡入淡出是通用透明度过渡，按 [sfx-rules.md](../sfx-rules.md) 规则默认无声。`swish` 暂不用于段间转场（保留常量供未来扩展）。

## 脚本参考

典型实现：
- [src/components/GlowTitle.tsx](../../../remotion-clone/src/components/GlowTitle.tsx)（入场 + 退场）
- [src/components/HighlightBox.tsx](../../../remotion-clone/src/components/HighlightBox.tsx)（入场 + 退场 + 闪烁）
- [src/segments/Segment6.tsx（未随公开版分发）](../../public-release-scope.md)（B-roll 末段淡出做段间过渡）
