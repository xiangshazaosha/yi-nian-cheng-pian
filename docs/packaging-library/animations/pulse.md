# 脉冲强调

## 使用场景

元素短暂放大再回弹，强调"这一点很重要"。用于：
- [HighlightBox](../components/highlight-box.md) 框选区域强调（对应口播"这一点真的很厉害"）
- [GlowTitle](../components/glow-title.md) CTA 标题脉冲（"关注领提示词"）

与 [spring 缩放入场](./spring-scale-enter.md) 的区别：
- spring 入场：从 0.8 -> 1.15 -> 1.0，一次性，元素首次出现
- 脉冲强调：从 1.0 -> 1.05 -> 1.0，一次性，元素已存在，短暂强调

## 怎么使用

```tsx
import { interpolate, useCurrentFrame } from 'remotion';

// 标准用法（HighlightBox 内部实现）
const pulseScale = pulseFrame !== undefined && frame >= pulseFrame && frame < pulseFrame + 12
  ? interpolate(
      frame,
      [pulseFrame, pulseFrame + 6, pulseFrame + 12],
      [1.0, 1.05, 1.0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    )
  : 1;

<div style={{
  transform: `scale(${pulseScale})`,
  transformOrigin: 'center',
  ...
}} />

// GlowTitle 脉冲（持续 10 帧，峰值 1.03）
const glowPulseScale = frame >= T.glowPulse && frame < T.glowPulse + 10
  ? interpolate(frame, [T.glowPulse, T.glowPulse + 5, T.glowPulse + 10], [1.0, 1.03, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  : 1;
const glowScale = glowEnterScale * glowPulseScale;  // 与入场 scale 相乘
```

关键参数：
- `pulseFrame`：脉冲触发帧
- 持续帧数：HighlightBox 12 帧，GlowTitle 10 帧
- 峰值 scale：HighlightBox 1.05，GlowTitle 1.03（CTA 标题更克制）
- 三段插值：`[pulseFrame, pulseFrame + duration/2, pulseFrame + duration]` 对应 `[1.0, 峰值, 1.0]`

`transformOrigin: 'center'` 必须设，否则缩放会偏移。

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 interpolate + CSS transform。

## 避坑

### 1. 脉冲峰值过大导致元素溢出
- **现象**：脉冲 scale 1.15 时 HighlightBox 边框溢出 B-roll 框
- **根因**：1.15 是 spring 入场的峰值，不是脉冲的合适值
- **对策**：脉冲峰值用 1.05（HighlightBox）或 1.03（GlowTitle）。脉冲是"短暂强调"不是"再次入场"，幅度要小

### 2. 脉冲持续帧数过长导致视觉拖沓
- **现象**：脉冲持续 30 帧（1s），元素来回缩放感觉慢
- **对策**：脉冲持续 10-12 帧（0.33-0.4s）。短促有力，符合"强调"语义

### 3. 脉冲与入场动画冲突
- **现象**：元素入场过程中触发脉冲，scale 相乘后异常
- **根因**：入场 scale（0.8->1.15->1.0）与脉冲 scale（1.0->1.05->1.0）相乘，frame 在两者重叠期会产生 1.15*1.05=1.21 等异常值
- **对策**：`pulseFrame` 必须晚于入场完成帧。例如入场 `delay=60 + enterDuration=10`，完成于 frame 70；脉冲 `pulseFrame=120`，留 50 帧缓冲
- **来源**：HighlightBox 组件实现

### 4. transformOrigin 未设导致缩放偏移
- **现象**：脉冲时元素向左上角偏移，不是中心放大
- **对策**：所有用 scale 的元素必须设 `transformOrigin: 'center'`（或 'center center'）

### 5. 脉冲触发时机与口播不对齐
- **现象**：脉冲在口播"这一点真的很厉害"之前就触发了，视觉与语音脱节
- **对策**：`pulseFrame` 应与口播重音帧对齐。用 ffmpeg 抽帧定位口播关键词的精确帧

## 搭配音效

脉冲强调属于"视觉强调"非"文字插入"，按 [sfx-rules.md](../sfx-rules.md) 规则默认无声。`ding` 暂不使用（保留常量供未来扩展）。

## 脚本参考

典型实现：
- [src/components/HighlightBox.tsx](../../../remotion-clone/src/components/HighlightBox.tsx)（pulseFrame 触发 scale 1.0->1.05->1.0 over 12 帧）
- [src/segments/Segment12.tsx（未随公开版分发）](../../public-release-scope.md)（GlowTitle 脉冲 scale 1.0->1.03->1.0 over 10 帧）
