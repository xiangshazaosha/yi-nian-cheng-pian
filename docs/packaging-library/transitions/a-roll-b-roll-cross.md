# A-roll ↔ B-roll 交叉淡入淡出

## 使用场景

段内从 A-roll 主播全屏切到 B-roll 圆角 UI 框（或反向）。用于：
- 钩子段 5s 处 A-roll 切到 B-roll（S1）
- 任何段内需要从主播口播切到演示画面的场景

**与 [段间黑场过渡](./segment-handoff.md) 的区别**：
- 段内交叉淡入淡出：A-roll 和 B-roll 同时存在 5-8 帧重叠期，平滑过渡
- 段间黑场过渡：前段 B-roll 末段淡出 + 后段 A-roll 头段淡入，中间有短暂黑场

## 怎么使用

```tsx
import { AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame } from 'remotion';
import { RoundedUIFrame } from '../components/RoundedUIFrame';
import { CircularAvatar } from '../components/CircularAvatar';

const T = {
  transition: 150,        // 切换点（5s）
};

export const Segment1: React.FC = () => {
  const frame = useCurrentFrame();

  // A-roll 末段淡出（150-160，10 帧）
  const aRollOpacity = interpolate(
    frame,
    [T.transition, T.transition + 10],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // B-roll 滑入（153-171，18 帧，延后 3 帧开始）
  const bRollEnterProgress = interpolate(
    frame,
    [T.transition + 3, T.transition + 3 + 18],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill>
      {/* A-roll 全屏 + 暗角（淡出） */}
      <AbsoluteFill style={{ opacity: aRollOpacity }}>
        <OffthreadVideo src={A_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5,5,5,0.80) 100%)', pointerEvents: 'none' }} />
      </AbsoluteFill>

      {/* B-roll 圆角 UI 框（淡入） */}
      <AbsoluteFill style={{ opacity: bRollEnterProgress }}>
        <RoundedUIFrame x={BROLL_X} y={BROLL_Y} width={BROLL_W} height={BROLL_H} delay={0} enterDuration={18}>
          <Sequence from={0} durationInFrames={T.end - T.transition} layout="none">
            <OffthreadVideo src={B_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        </RoundedUIFrame>
      </AbsoluteFill>

      {/* 圆形头像（与 B-roll 同步滑入，延后到 168） */}
      <CircularAvatar videoSrc={A_ROLL_SRC} startFrame={0} appearFrame={T.transition + 18} x={AVATAR_X} y={AVATAR_Y} size={AVATAR_SIZE} enterDuration={18} />
    </AbsoluteFill>
  );
};
```

关键时序：
- **A-roll 淡出**：T.transition - T.transition+10（10 帧）
- **B-roll 滑入**：T.transition+3 - T.transition+21（18 帧，延后 3 帧开始）
- **重叠期**：T.transition+3 - T.transition+10（7 帧）
- **圆形头像入场**：T.transition+18（B-roll 稳定后 6-12 帧）

时序设计原则：
- A-roll 先开始淡出（10 帧），B-roll 延后 3 帧开始滑入（18 帧）
- 重叠期 7 帧（153-160），叠影明显减轻但仍保留平滑过渡感
- 圆形头像在 B-roll 框稳定后才开始入场（168），避免与 B-roll 框入场动画冲突

## Remotion 约束

### 1. 所有 OffthreadVideo 必须 muted
A-roll 全屏 + B-roll 圆角 UI 框 + 圆形头像（如果同源）三处 OffthreadVideo 都必须 muted。音轨由段顶层 `<Audio>` 统一采集。详见 [pitfalls.md#声音重复混乱](../pitfalls.md#声音重复混乱)。

### 2. B-roll 用 Sequence 包裹而非 startFrom
B-roll 物理片段已用 ffmpeg 对齐主时间轴起点后，必须用 `<Sequence from={0} durationInFrames={...} layout="none">` 包裹 OffthreadVideo。详见 [pitfalls.md#b-roll-用-startfrom-跳帧会错位](../pitfalls.md#b-roll-用-startfrom-跳帧会错位)。

### 3. CaptionBar 在切换点硬切
CaptionBar 用 `frame < T.transition` 硬切，frame T.transition 立即移除（避免与 B-roll 自带烧入字幕重叠）。详见 [CaptionBar 避坑#2](../components/caption-bar.md#2-b-roll-段双重字幕)。

## 避坑

### 1. 重叠期过长导致幽灵叠影
- **现象**：frame 150-165 约 15 帧内 A-roll 与 B-roll 同时半透明，形成"双重曝光/幽灵叠影"，视觉偏浑浊
- **根因**：A-roll 淡出 15 帧 + B-roll 滑入 18 帧，两者同时开始，半透明重叠期长达 15 帧
- **对策**：A-roll 淡出缩短为 10 帧（150-160）；B-roll 滑入延后 3 帧（153-171）。重叠期缩短到 7 帧（153-160）。**重叠期 5-8 帧较自然**，少于 5 帧切换太硬，多于 10 帧叠影明显
- **来源**：LESSON-009

### 2. 新标题入场早于 A-roll 淡出完成导致叠影
- **现象**：旧标题"装修设计的坑"与新标题"AI 时代新解法"在 frame 156-168 有 2-3 帧叠影
- **根因**：新标题 `delay=156`，A-roll 淡出期为 150-160。新标题在 156 开始入场时，A-roll 视频还没完全淡出
- **对策**：新标题入场帧要晚于 A-roll 淡出完成 + 2 帧缓冲。例如 A-roll 淡出 150-160，新标题 `delay=162`
- **来源**：LESSON-007

### 3. CaptionBar 跨过切换点导致双重字幕
- **现象**：A-roll 切到 B-roll 时，CaptionBar 还在显示，与 B-roll 自带烧入字幕重叠
- **对策**：CaptionBar 用 `frame < T.transition` 硬切
- **来源**：LESSON-005

### 4. 圆形头像与 B-roll 框同时入场导致视觉混乱
- **现象**：B-roll 框从右侧滑入的同时，圆形头像也从左侧滑入，两个动效同时进行视觉乱
- **对策**：圆形头像 `appearFrame = T.transition + 18`（B-roll 框稳定后 6-12 帧），让 B-roll 框先完成入场，再开始圆形头像入场
- **来源**：CASE-Segment1 实现

### 5. B-roll Sequence durationInFrames 写错
- **现象**：B-roll 视频播到一半就消失或定格
- **根因**：`<Sequence durationInFrames={T.end - T.transition}>` 写成 `durationInFrames={T.end}`，导致 Sequence 在 T.transition 帧就结束
- **对策**：B-roll Sequence 的 durationInFrames = 段总长 - 切换点（`T.end - T.transition`），因为 B-roll 从 T.transition 才开始显示

## 脚本参考

典型实现：[src/segments/Segment1.tsx（未随公开版分发）](../../public-release-scope.md)（A-roll 全屏 5s + 交叉淡入淡出 + B-roll 圆角 UI 框 + 圆形头像）
