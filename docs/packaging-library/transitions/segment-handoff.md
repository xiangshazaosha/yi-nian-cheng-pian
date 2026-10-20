# 段间黑场过渡

## 使用场景

前段 B-roll 末段 6 帧淡出 + 后段 A-roll 头段 6 帧淡入，组成段间平滑过渡。用于：
- B-roll 段切到 A-roll 段（如 S6 B-roll -> S7 A-roll、S11 B-roll -> S12 A-roll）
- 任何需要避免段间硬切的场景

**与 [A-roll ↔ B-roll 交叉淡入淡出](./a-roll-b-roll-cross.md) 的区别**：
- 段内交叉淡入淡出：A-roll 和 B-roll 同时存在 5-8 帧重叠期
- 段间黑场过渡：前段淡出 + 后段淡入，中间有短暂黑场（TextureBackground 显现）

## 怎么使用

### 前段 B-roll 末段淡出

```tsx
// 在前段（B-roll 段）Segment6.tsx 内
import { interpolate, useCurrentFrame } from 'remotion';

const T = {
  end: 210,    // 段末帧
};

export const Segment6: React.FC = () => {
  const frame = useCurrentFrame();

  // B-roll 末段淡出（最后 6 帧，避免切到 S7 A-roll 时硬切）
  const bRollExitOpacity = interpolate(
    frame,
    [T.end - 6, T.end],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
      <Audio src={A_ROLL_SEG6_SRC} />
      <TextureBackground starCount={50} vignetteStrength={0.5} />

      {/* B-roll 圆角 UI 框（末段淡出） */}
      <div style={{ position: 'absolute', left: BROLL_X, top: BROLL_Y, width: BROLL_W, height: BROLL_H, opacity: bRollExitOpacity }}>
        <RoundedUIFrame x={0} y={0} width={BROLL_W} height={BROLL_H} delay={0} enterDuration={1}>
          <Sequence from={0} durationInFrames={T.end} layout="none">
            <OffthreadVideo src={B_ROLL_SEG6_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        </RoundedUIFrame>
      </div>

      {/* 其他元素（圆形头像、大标题、观点卡等）可不淡出，让 B-roll 框单独淡出 */}
    </AbsoluteFill>
  );
};
```

### 后段 A-roll 头段淡入

```tsx
// 在后段（A-roll 段）Segment7.tsx 内
import { interpolate, useCurrentFrame } from 'remotion';

const T = {
  titleIn: 6,
  end: 240,
};

export const Segment7: React.FC = () => {
  const frame = useCurrentFrame();

  // A-roll 入场淡入（前 6 帧，承接前段 B-roll 末段淡出）
  const aRollEnterOpacity = interpolate(
    frame,
    [0, 6],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
      <Audio src={A_ROLL_SEG7_SRC} />
      <TextureBackground starCount={50} vignetteStrength={0.5} />

      {/* A-roll 主播全屏（前 6 帧淡入） */}
      <AbsoluteFill style={{ opacity: aRollEnterOpacity }}>
        <OffthreadVideo src={A_ROLL_SEG7_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <AbsoluteFill style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5, 5, 5, 0.80) 100%)',
          pointerEvents: 'none',
        }} />
      </AbsoluteFill>

      {/* 包装元素（标题、卡片等）正常 delay 入场，不需额外淡入 */}
      <GlowTitle text="第二个方法" x={80} y={80} variant="plain" size={FONT_SIZE.titleLg} delay={T.titleIn} enterDuration={12} />
    </AbsoluteFill>
  );
};
```

关键时序：
- **前段 B-roll 末段淡出**：`[T.end - 6, T.end]` over 6 帧
- **后段 A-roll 头段淡入**：`[0, 6]` over 6 帧
- **过渡期**：前段最后 6 帧 + 后段前 6 帧 = 12 帧（0.4s）

前段最后 6 帧时 TextureBackground 显现（B-roll 框淡出后露出底层暗色星空），后段前 6 帧时 TextureBackground 仍可见（A-roll 视频淡入到全屏）。视觉上是"暗色星空短暂显现 -> A-roll 主播淡入"。

## Remotion 约束

### 1. 所有 OffthreadVideo 必须 muted
前段 B-roll 的 OffthreadVideo + 后段 A-roll 的 OffthreadVideo 都必须 muted。音轨由各自段顶层 `<Audio>` 统一采集。详见 [pitfalls.md#声音重复混乱](../pitfalls.md#声音重复混乱)。

### 2. 段间不需要 Sequence 跨段
每段是独立的 Composition（在 Root.tsx 里用 `<Sequence from={offset} durationInFrames={...}>` 拼接）。段间过渡靠各段自己的 opacity 控制，不需要跨段 Sequence。

### 3. TextureBackground 必须在两段都存在
前段 B-roll 末段淡出时，TextureBackground 显现；后段 A-roll 头段淡入时，TextureBackground 仍可见。两段都必须有 TextureBackground，且参数一致（starCount=50, vignetteStrength=0.5），否则过渡时星空不一致。

## 避坑

### 1. 前段没做末段淡出导致硬切
- **现象**：前段 B-roll 末帧画面突然消失，后段 A-roll 首帧全亮出现，视觉跳跃
- **根因**：前段 B-roll 没做末段淡出
- **对策**：前段 B-roll 末段 6 帧淡出（`interpolate(frame, [T.end-6, T.end], [1, 0])`）。**注意是外层 div opacity 控制，不是 RoundedUIFrame 的 exitStart**（避免与段间过渡冲突）
- **来源**：CASE-Segment6->S7 修复

### 2. 后段没做头段淡入导致硬切
- **现象**：后段 A-roll 首帧全亮出现，与前段 B-roll 末帧画面冲突
- **根因**：后段 A-roll 没做头段淡入
- **对策**：后段 A-roll 头段 6 帧淡入（`interpolate(frame, [0, 6], [0, 1])`）
- **来源**：CASE-Segment6->S7 修复

### 3. 用 RoundedUIFrame 的 exitStart 控制末段淡出导致时序混乱
- **现象**：RoundedUIFrame 的 exitStart 与外层 div opacity 同时控制淡出，叠在一起 opacity 计算混乱
- **根因**：RoundedUIFrame 的 exitStart 是组件内部退场，外层 div opacity 是段间过渡，两者叠加
- **对策**：段间过渡用外层 div opacity 控制，RoundedUIFrame 不传 exitStart（保持默认不退场）。详见 [RoundedUIFrame 避坑#2](../components/rounded-ui-frame.md#2-末段淡出与-exitstart-冲突)

### 4. 前段其他元素（标题、卡片）没淡出导致残留
- **现象**：前段 B-roll 框淡出后，标题/卡片仍在画面上，后段 A-roll 淡入时叠在前段元素上
- **根因**：前段只淡出了 B-roll 框，没淡出其他元素
- **对策**：前段所有元素都做末段淡出。最简单做法是把所有元素包在一个 AbsoluteFill 里，统一用 opacity 控制：
  ```tsx
  const allOpacity = interpolate(frame, [T.end - 6, T.end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  <AbsoluteFill style={{ opacity: allOpacity }}>
    {/* B-roll 框 + 圆形头像 + 标题 + 卡片 */}
  </AbsoluteFill>
  ```
  但 Audio 不要包在内（Audio 不受 opacity 影响，且音轨应持续到段末）

### 5. ffmpeg -ss 抽帧验证时偏移
- **现象**：用 `ffmpeg -ss 0.1 -i segment7.mp4 -frames:v 1` 抽帧，发现 A-roll 不是 opacity 0
- **根因**：ffmpeg `-ss` seeking 不是帧精确的，0.1s = frame 3（30fps），不是 frame 0
- **对策**：抽帧验证时用精确帧号 `ffmpeg -i segment7.mp4 -vf "select='eq(n\,0)+eq(n\,1)+eq(n\,2)'" -fps_mode vfr /tmp/check_%d.png`
- **来源**：CASE-Segment7->S8 段间过渡验证

## 脚本参考

典型实现：
- 前段（B-roll 末段淡出）：[src/segments/Segment6.tsx（未随公开版分发）](../../public-release-scope.md)、[src/segments/Segment11.tsx（未随公开版分发）](../../public-release-scope.md)
- 后段（A-roll 头段淡入）：[src/segments/Segment7.tsx（未随公开版分发）](../../public-release-scope.md)、[src/segments/Segment12.tsx（未随公开版分发）](../../public-release-scope.md)
