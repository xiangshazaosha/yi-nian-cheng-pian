# CircularAvatar

## 使用场景

秋芝风历史圆头像实现：B-roll 左下口播连接，直径 14% 画面宽度（约 268px），紫色渐变描边与外发光。它不是所有 B-roll 或所有风格必用的外观；其他风格按其规则及当前片要求选择头像形状、位置和区间，不直接继承本组件紫色皮肤。代码与旧 API 保留。

支持两种用法：
- **首次入场**：从前段 A-roll 切到 B-roll 时，头像从左侧滑入 + spring scale 入场
- **跨段延续**：从前段 B-roll 延续到本段，`appearFrame=-100` 跳过入场，从首帧即完全可见

## 怎么使用

```tsx
import { CircularAvatar } from '../components/CircularAvatar';

const AVATAR_SIZE = VIDEO_W * 0.14;  // 268.8
const AVATAR_X = 60;
const AVATAR_Y = VIDEO_H - AVATAR_SIZE - 80;  // 731.2

// 首次入场（从前段 A-roll 切到 B-roll）
<CircularAvatar
  videoSrc={A_ROLL_SRC}
  startFrame={0}            // 视频起始帧（A-roll 在主时间轴的起始帧）
  appearFrame={150}         // 头像开始显示为头像的时间点
  x={AVATAR_X}
  y={AVATAR_Y}
  size={AVATAR_SIZE}
  enterDuration={18}        // 入场持续（帧）
/>

// 跨段延续（从前段 B-roll 延续）
<CircularAvatar
  videoSrc={A_ROLL_SEG2_SRC}
  startFrame={0}
  appearFrame={-100}        // 负值跳过入场，从首帧即完全可见
  x={AVATAR_X}
  y={AVATAR_Y}
  size={AVATAR_SIZE}
  enterDuration={18}
/>
```

关键 props：
- `videoSrc`：头像视频源，与 A-roll 同源
- `startFrame`：A-roll 在主时间轴的起始帧（本项目 A-roll 从主时间轴 0 开始，不需用）
- `appearFrame`：头像开始显示为头像的时间点。**负值（如 -100）跳过入场**，从首帧即完全可见
- `x` / `y` / `size`：左上角坐标与直径
- `borderWidth`：紫色描边宽度，默认 4
- `enterDuration`：入场持续，默认 18

入场动效：从左侧滑入 + spring scale 0.7->1.1->1.0（ease-out cubic + 轻微过冲）

视觉配方（三层叠加）：
1. **外层紫色外发光底层**：`inset: -borderWidth*2`，`radial-gradient(circle, rgba(160,32,240,0.40) 0%, rgba(255,0,255,0.20) 50%, transparent 80%)`，`filter: blur(8px)`
2. **紫色渐变描边圈**：`inset: -borderWidth`，`linear-gradient(135deg, #A020F0 0%, #FF00FF 100%)`，`boxShadow: SHADOW.glowPurple`
3. **视频画面圆形裁切**：`clipPath: 'circle(50% at 50% 50%)'` + `borderRadius: 50%` + `overflow: hidden`

## Remotion 约束

### 1. OffthreadVideo 必须 muted
CircularAvatar 内部的 OffthreadVideo 必须显式 `muted`。同一 A-roll 源被全屏 OffthreadVideo + 圆形头像 OffthreadVideo + 段顶层 `<Audio>` 三处引用，所有 OffthreadVideo 必须 muted，音轨由独立 `<Audio>` 统一采集。详见 [Remotion 视频组件约束](../pitfalls.md#remotion-视频组件约束)。

### 2. 禁止手动 startFrom={frame}
**不要写 `startFrom={videoFrame}`**。OffthreadVideo 默认按主时间轴同步（frame N 提取视频第 N 帧），加 startFrom 会变成 2*frame（2 倍速播放），播完定格。详见 [pitfalls.md#offthreadvideo-加速播放](../pitfalls.md#offthreadvideo-加速播放)。

### 3. 视频源用 staticFile 包装
`videoSrc` 必须是 `staticFile('xxx.mp4')` 返回的 URL，不能是 file:// 路径或绝对路径。详见 [pitfalls.md#file-url-不支持](../pitfalls.md#file-url-不支持)。

## 避坑

### 1. 视频加速播放 + 定格
- **现象**：圆形头像里的 A-roll 视频在 5-7s 加速播放（2 倍速），7.5s 后定格在视频末尾
- **根因**：原代码 `<OffthreadVideo src={videoSrc} startFrom={videoFrame} />`，其中 `videoFrame = frame - startFrame = frame`（startFrame=0）。OffthreadVideo 提取帧公式 = `(N - sequenceFrom) + startFrom`，没有 Sequence 包裹时 sequenceFrom=0，再加 `startFrom={frame}` 后提取帧 = `N + N = 2N`，视频变成 2 倍速
- **对策**：去掉 `startFrom={videoFrame}`，让 OffthreadVideo 默认同步主时间轴。如果视频需要从主时间轴非 0 位置开始，用 `<Sequence from={X}>` 包裹
- **来源**：LESSON-010 / PITFALL-003

### 2. 跨段延续场景首帧不可见
- **现象**：从前段 B-roll 延续到本段，本段首帧头像不可见（入场动画进行中，opacity=0）
- **根因**：默认 `appearFrame=0 + enterDuration=18`，前 18 帧入场过程 opacity 从 0 渐变到 1
- **对策**：跨段延续场景设 `appearFrame=-100`（负值），组件判断 `appearFrame < 0` 时跳过入场动画，从首帧即完全可见
- **来源**：CASE-Segment2 实现

### 3. 圆形头像模糊（待排查）
- **现象**：圆形头像内的视频画面在某些段显得比全屏 A-roll 模糊
- **根因**：未最终定位。可能原因：objectFit: cover 在小尺寸下的缩放算法、source 视频分辨率与显示尺寸不匹配、ChromeHeadless 渲染时的图像处理
- **对策**：暂未修复。如遇此问题，可尝试提高 source 视频分辨率或改用更高码率 ffmpeg 重新抽取
- **来源**：Task #23（pending）

### 4. 视频源与段不匹配
- **现象**：头像视频内容与当前段口播不对齐
- **根因**：`videoSrc` 传错了段的 A-roll 源（如 Segment6 用了 `A_ROLL_SEG5_SRC`）
- **对策**：每段 CircularAvatar 的 `videoSrc` 必须传本段的 `A_ROLL_SEG{N}_SRC`，与段 `<Audio src={A_ROLL_SEG{N}_SRC} />` 一致

## 脚本

完整实现：[src/components/CircularAvatar.tsx](../../../remotion-clone/src/components/CircularAvatar.tsx)
