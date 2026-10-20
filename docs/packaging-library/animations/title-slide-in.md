# 标题滑入

## 使用场景

[GlowTitle](../components/glow-title.md) 内置入场动效。大标题从左侧滑入 + 淡入，用于段首标题首次出现。

与 [spring 缩放入场](./spring-scale-enter.md) 的区别：
- spring 入场：scale 弹性 + opacity，用于卡片/标签
- 标题滑入：translateX 位移 + opacity，用于大标题（更稳重，不弹跳）

## 怎么使用

```tsx
// GlowTitle 内部已实现，外部只需传 delay / enterDuration
import { GlowTitle } from '../components/GlowTitle';
import { FONT_SIZE } from '../lib/theme';

<GlowTitle
  text="第二个方法"
  x={80}
  y={80}
  variant="plain"
  size={FONT_SIZE.titleLg}
  delay={6}              // 入场延迟（帧）
  enterDuration={12}     // 入场持续（帧），默认 12
/>

// 手动实现（如果不用 GlowTitle）
import { interpolate, useCurrentFrame } from 'remotion';

const enterProgress = interpolate(
  frame,
  [delay, delay + enterDuration],
  [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);
const opacity = enterProgress;
const translateX = (1 - enterProgress) * -40;  // 从 -40px 滑入到 0

<div style={{
  position: 'absolute',
  left: x, top: y,
  opacity,
  transform: `translateX(${translateX}px)`,
  fontSize: size,
  fontWeight: 900,
  ...
}} />
```

关键参数：
- `delay`：入场延迟（帧），默认 0
- `enterDuration`：入场持续（帧），默认 12
- 起始位移：translateX(-40)（从左侧 40px 外滑入）
- 最终位移：translateX(0)
- opacity：0 -> 1，与位移同步

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 interpolate + CSS transform。

## 避坑

### 1. 新标题入场帧早于旧标题退场导致叠影
- **现象**：旧标题"装修设计的坑"与新标题"AI 时代新解法"在 frame 156-168 有 2-3 帧叠影
- **根因**：新标题 `delay=156`，A-roll 淡出期为 150-160。新标题在 156 开始入场时，A-roll 视频还没完全淡出，视觉上旧标题残影与新标题重叠
- **对策**：新标题入场帧要晚于旧标题所在阶段的完全退出帧 + 2 帧缓冲。例如 A-roll 淡出 150-160，新标题 `delay=162`
- **来源**：LESSON-007

### 2. translateX 位移过小看不出来
- **现象**：标题几乎原地淡入，没有"滑入"感
- **根因**：translateX 起始值 -10 太小
- **对策**：起始位移 -40（默认值）。如需更明显的滑入感可提到 -60，但不超过 -80（会显得拖沓）

### 3. enterDuration 过长导致标题入场拖沓
- **现象**：enterDuration=30 时标题滑入持续 1 秒，视觉慢
- **对策**：enterDuration 12-18（0.4-0.6s）。GlowTitle 默认 12

### 4. delay + enterDuration 导致视觉"出现"晚 6 帧
- **现象**：设 `delay=6`，视觉代理看到标题在 frame 12 才"出现"
- **根因**：`delay=6 + enterDuration=12`，frame 6 时 opacity=0、translateX=-40，肉眼几乎看不见；frame 12 时 opacity=0.5、translateX=-20，才隐约可见；frame 18 时 opacity=1、translateX=0，完全显示
- **对策**：规划"frame X 出现"时，代码 `delay = X - enterDuration/2`。例如要在 frame 6 视觉出现，`delay=0`
- **来源**：LESSON-008（同 HighlightTag）

### 5. 标题切换时旧标题未退场
- **现象**：旧标题"AI 生成结果"在新标题"结构识别"出现时仍可见
- **根因**：旧标题没有 exitStart，默认不退场
- **对策**：旧标题用独立 div + opacity 控制，设 `oldTitleOpacity = interpolate(frame, [T.oldTitleOut, T.oldTitleOut + 6], [1, 0])`。新标题用 GlowTitle，`delay=T.newTitleIn`（晚于旧标题完全退场 + 2 帧）

## 搭配音效

标题滑入属于"单文字插入"，按 [sfx-rules.md](../sfx-rules.md) 规则默认无声。`swoosh` / `shimmer` 暂不使用（保留常量供未来扩展）。

## 脚本参考

典型实现：
- [src/components/GlowTitle.tsx](../../../remotion-clone/src/components/GlowTitle.tsx)（translateX(-40) + opacity 0->1）
- [src/segments/Segment6.tsx（未随公开版分发）](../../public-release-scope.md)（旧标题"AI 生成结果"退场 + 新标题"结构识别"入场）
