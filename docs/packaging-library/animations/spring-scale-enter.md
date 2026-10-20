# spring 缩放入场

## 使用场景

卡片/标签弹出，模拟 spring overshoot 弹性入场。用于 [HighlightTag](../components/highlight-tag.md)、[StepList](../components/step-list.md) 的入场动效。

不是真正的 Remotion `spring()` 函数，而是用 `interpolate` 模拟 spring overshoot：进度 0->0.7 对应 scale 0.8->1.15，进度 0.7->1.0 对应 scale 1.15->1.0。视觉上是"先冲过 1.0 再回弹到 1.0"的弹性感。

## 怎么使用

```tsx
import { interpolate, useCurrentFrame } from 'remotion';

// 标准用法（在组件内部实现）
const enterRaw = interpolate(
  frame,
  [delay, delay + enterDuration],  // 默认 delay=0, enterDuration=10
  [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);
const enterScale = enterRaw < 0.7
  ? interpolate(enterRaw, [0, 0.7], [0.8, 1.15])
  : interpolate(enterRaw, [0.7, 1], [1.15, 1.0]);

const enterOpacity = interpolate(
  frame,
  [delay, delay + Math.max(4, enterDuration / 2)],
  [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);

<div style={{
  transform: `scale(${enterScale})`,
  opacity: enterOpacity,
  ...
}} />
```

关键参数：
- `delay`：入场延迟（帧），默认 0
- `enterDuration`：入场持续（帧），默认 10
- 起始 scale：0.8
- 峰值 scale：1.15（在进度 0.7 时达到）
- 最终 scale：1.0
- opacity：从 0 渐变到 1，持续 `max(4, enterDuration/2)` 帧（比 scale 短，先看不见再看见缩放过程）

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 interpolate + CSS transform。

`extrapolateLeft: 'clamp'` 和 `extrapolateRight: 'clamp'` 必须加，否则 frame < delay 或 frame > delay+enterDuration 时进度会外推到负数或大于 1，scale 异常。

## 避坑

### 1. delay + enterDuration 导致视觉"出现"比 delay 晚约 5 帧
- **现象**：设 `delay=375`，视觉代理看到卡片在 frame 380 才"出现"
- **根因**：`delay=375 + enterDuration=10`，frame 375 时 scale=0.8、opacity 接近 0 肉眼几乎看不见；frame 380 才到 scale 峰值，肉眼才"看到"
- **对策**：规划"frame X 出现"时，代码 `delay = X - enterDuration/2`。例如要在 frame 375 视觉出现，`delay=370`
- **来源**：LESSON-008

### 2. enterDuration 过短导致动画生硬
- **现象**：enterDuration=4 时卡片瞬间出现，没有弹性感
- **根因**：4 帧太短，scale 0.8->1.15->1.0 的过程被压缩到 4 帧，肉眼看不到中间过程
- **对策**：enterDuration 不低于 8。常用值 10-15。StepList 用 10，HighlightTag 用 10，StepFlowBar 节点用 8

### 3. opacity 持续帧数与 scale 不一致导致"先看见缩放过程"
- **现象**：卡片从 scale 0.8 开始就可见，缩放过程肉眼可见，不够"弹出"
- **根因**：opacity 持续 = enterDuration（10 帧），frame delay 时 opacity=0，frame delay+10 时 opacity=1，与 scale 同步完成。但 scale 在 frame delay+7 时已到峰值 1.15，opacity 此时只有 0.7，肉眼能看到缩放过程
- **对策**：opacity 持续帧数 = `max(4, enterDuration/2)`（5 帧），比 scale 短。frame delay 时 opacity=0，frame delay+5 时 opacity=1，此时 scale 还在 1.05 附近。视觉效果是"卡片先快速淡入到接近峰值，再回弹到 1.0"，更有弹出感
- **来源**：HighlightTag 组件实现

### 4. 与外层 opacity 控制冲突
- **现象**：组件内部 enterOpacity 与外层 div opacity 相乘后，淡入动画失效
- **对策**：外层 div 用 opacity 控制"段内整体淡出"（如 `uiOpacity`），组件内部 enterOpacity 控制"入场弹性"。两者相乘即可：
  ```tsx
  <AbsoluteFill style={{ opacity: uiOpacity }}>
    <HighlightTag delay={T.card1In} ... />  {/* 内部 enterOpacity */}
  </AbsoluteFill>
  ```

## 搭配音效

spring 弹出视觉与音效同步触发，强化"卡片弹出"的物理感。

### 触发时机

音效在视觉"出现"帧触发，即 `delay + enterDuration/2`（同 LESSON-008 视觉出现帧）。早于 scale 峰值帧（delay + enterDuration * 0.7），与卡片"冲过 1.0"的瞬间对齐。

### 配置方式

通过组件 prop 注入，组件内部用 `<Sequence>` + `<Audio>` 包裹，无需手写音效代码：

```tsx
import { SFX } from '../lib/theme';

<HighlightTag
  text="AI 3 秒出图"
  delay={T.cardIn}
  enterDuration={10}
  sfxSrc={SFX.pop}        // 自动在 delay + 5 帧触发
  sfxVolume={0.3}         // 默认 0.3
  ...
/>
```

### 音效选择

按 [sfx-rules.md](../sfx-rules.md) 规则，spring 缩放入场属于"多文字插入"场景：

- 多元素间隔 < 1s：整组只用 `tick` 或 `pop` 一种，不混用
- 多元素间隔 ≥ 1s：`tick` / `pop` / `swish` 三选一，整组不混用
- 单元素插入（同段只此一个 spring 入场）：默认无声

典型映射：
- HighlightTag（卡片/标签）：`pop` 或 `tick`，按整组规则选一
- StepList（步骤卡）：`tick` 或 `pop`，按整组规则选一
- StepFlowBar 节点（非 spring，但同属多文字插入）：`tick`（默认）

### 避坑

- **音量过大盖过口播**：sfxVolume 不超过 0.4，默认 0.3。A-roll 主播口播是主音轨，音效只是点缀
- **多卡同时弹出音效叠加嘈杂**：2x2 卡片网格（如 Segment11 四张卡）依次入场时，delay 间隔至少 30 帧（1s），让每个音效听得清
- **整组混用 tick 和 pop**：违反 [sfx-rules.md](../sfx-rules.md) 规则一。同段多卡必须整组同种音效

## 脚本参考

典型实现：
- [src/components/HighlightTag.tsx](../../../remotion-clone/src/components/HighlightTag.tsx)（标准 spring overshoot）
- [src/components/StepList.tsx](../../../remotion-clone/src/components/StepList.tsx)（同上）
- [src/components/StepFlowBar.tsx](../../../remotion-clone/src/components/StepFlowBar.tsx)（节点 spring 入场，scale 0.8->1.0 无 overshoot）
