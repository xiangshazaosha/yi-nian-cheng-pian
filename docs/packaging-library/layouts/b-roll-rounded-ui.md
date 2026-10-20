# B-roll 圆角 UI 框

## 使用场景

演示/结果展示段，B-roll 视频用 [RoundedUIFrame](../components/rounded-ui-frame.md) 圆角化居中显示（78% 尺寸），左下 [CircularAvatar](../components/circular-avatar.md) 常驻，左上大标题 + 右侧/中下信息卡。用于：
- 软件操作演示段（S2 准备素材、S4 生图操作）
- 结果展示段（S5 演示结果、S6 点评、S10 沙发替换）
- 多步骤流程段（S8 修改落地、S11 其他替换场景）

是本项目使用频率最高的构图（12 段中约 8 段用此构图）。

## 怎么使用

```tsx
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { TextureBackground } from '../components/TextureBackground';
import { GlowTitle } from '../components/GlowTitle';
import { HighlightTag } from '../components/HighlightTag';
import { RoundedUIFrame } from '../components/RoundedUIFrame';
import { CircularAvatar } from '../components/CircularAvatar';
import { A_ROLL_SEG6_SRC, B_ROLL_SEG6_SRC, COLORS, FONT_SIZE, VIDEO_W, VIDEO_H } from '../lib/theme';

const T = {
  titleIn: 6,
  cardIn: 60,
  cardOut: 180,
  end: 210,
};

const BROLL_W = VIDEO_W * 0.82;       // 1574
const BROLL_H = 500;                  // 演示段常用 500 高
const BROLL_X = (VIDEO_W - BROLL_W) / 2;
const BROLL_Y = 30;

const AVATAR_SIZE = VIDEO_W * 0.14;   // 268.8
const AVATAR_X = 60;
const AVATAR_Y = VIDEO_H - AVATAR_SIZE - 80;  // 731.2

export const Segment6: React.FC = () => {
  const frame = useCurrentFrame();

  // B-roll 末段淡出（最后 6 帧，避免切到下段 A-roll 时硬切）
  const bRollExitOpacity = interpolate(frame, [T.end - 6, T.end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

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

      {/* 圆形头像（左下常驻） */}
      <CircularAvatar videoSrc={A_ROLL_SEG6_SRC} startFrame={0} appearFrame={-100} x={AVATAR_X} y={AVATAR_Y} size={AVATAR_SIZE} enterDuration={18} />

      {/* 左上大标题 */}
      <GlowTitle text="结构识别" x={80} y={80} variant="plain" size={FONT_SIZE.titleLg} delay={T.titleIn} enterDuration={12} />

      {/* 信息卡（B-roll 框外安全区） */}
      <HighlightTag text="梁未变化" x={CARD_X} y={CARD_Y} color="green" size={FONT_SIZE.cardLarge} delay={T.cardIn} enterDuration={10} exitStart={T.cardOut} exitDuration={8} />
    </AbsoluteFill>
  );
};
```

关键尺寸：
- **B-roll 框**：`BROLL_W = VIDEO_W * 0.82`（1574），`BROLL_H` 按段需求（500 / BROLL_W * VIDEO_H/VIDEO_W），居中 + 上偏 30px
- **圆形头像**：`AVATAR_SIZE = VIDEO_W * 0.14`（268.8），位置 (60, 731.2)
- **大标题**：(80, 80)
- **信息卡**：B-roll 框外安全区

B-roll 框外安全区（78% 尺寸 BROLL_W=1574 居中时）：
- 上：0 - BROLL_Y（30px 高，太窄，不放卡片）
- 下：BROLL_Y + BROLL_H - 1080（取决于 BROLL_H）
- 左：0 - BROLL_X（173px 宽，放头像 + 标题）
- 右：BROLL_X + BROLL_W - 1920（173px 宽，不放卡片）

## Remotion 约束

### 1. OffthreadVideo 必须 muted
B-roll 的 OffthreadVideo 必须 `muted`，音轨由段顶层 `<Audio src={A_ROLL_SRC} />` 统一采集。详见 [pitfalls.md#声音重复混乱](../pitfalls.md#声音重复混乱)。

### 2. B-roll 用 Sequence 包裹而非 startFrom
物理片段已用 ffmpeg 对齐主时间轴起点后，必须用 `<Sequence from={0} durationInFrames={T.end} layout="none">` 包裹 OffthreadVideo。详见 [pitfalls.md#b-roll-用-startfrom-跳帧会错位](../pitfalls.md#b-roll-用-startfrom-跳帧会错位)。

### 3. RoundedUIFrame 跨段延续时 enterDuration=1
从前段 B-roll 延续到本段时，`enterDuration={1}` 跳过入场动画，避免首帧黑场。详见 [RoundedUIFrame 避坑#1](../components/rounded-ui-frame.md#1-跨段延续场景首帧黑场)。

### 4. B-roll 末段淡出做段间过渡
若下段是 A-roll 段，本段 B-roll 末段 6 帧淡出（`interpolate(frame, [T.end-6, T.end], [1, 0])`），与下段 A-roll 头段 6 帧淡入组成 [段间黑场过渡](../transitions/segment-handoff.md)。

## 避坑

### 1. 信息卡压 B-roll 烧入字幕
- **现象**：信息卡与 B-roll 框内底部烧入字幕压字重叠
- **根因**：B-roll 框内底部 10-20% 是烧入字幕区
- **对策**：信息卡放在 B-roll 框外安全区。详见 [HighlightTag 避坑#3](../components/highlight-tag.md#3-卡片压-b-roll-烧入字幕)
- **来源**：LESSON-003

### 2. B-roll 实际布局与规划相反
- **现象**：HighlightBox 框选位置对不上 B-roll 实际目标元素
- **对策**：实现前用 ffmpeg 抽帧确认 B-roll 实际布局。详见 [HighlightBox 避坑#3](../components/highlight-box.md#3-b-roll-实际布局与规划相反)

### 3. 图文不同步
- **现象**：步骤卡弹出时间与 B-roll 画面切换时间相差超过 1 秒
- **对策**：卡片弹出时间与 B-roll 画面切换时间对齐，不同步不超过 1 秒。详见 [StepList 避坑#1](../components/step-list.md#1-步骤卡激活时序与-b-roll-画面切换不同步)
- **来源**：LESSON-012

### 4. B-roll 框尺寸不统一
- **现象**：不同段 B-roll 框尺寸不一致，视觉跳跃
- **对策**：全片统一 `BROLL_W = VIDEO_W * 0.82`，BROLL_H 按段需求但保持视觉一致。框尺寸定义在段常量里

## 脚本参考

典型实现：[src/segments/Segment6.tsx（未随公开版分发）](../../public-release-scope.md)（B-roll 圆角 UI + 圆形头像 + HighlightBox + AnnotationLine + 观点卡）
