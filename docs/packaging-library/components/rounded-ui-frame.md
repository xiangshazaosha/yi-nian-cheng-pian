# RoundedUIFrame

## 使用场景

B-roll 圆角 UI 框，包裹 OffthreadVideo 实现"录屏圆角化 + 浅色边框 + 柔和投影"三件套。用于所有 B-roll 段（演示/结果展示/对比）。

支持 4 种 variant：
- **`plain`（默认）**：原圆角 UI 框，行为与历史成片完全一致。录屏/效果图/通用 B-roll 用
- **`phone`**：手机物理样机，深色边框 + 顶部刘海 + 圆角屏幕。App 操作演示 / 微信聊天截图用（2号参考视频 K2/K5/K6）
- **`web`**：浏览器样机，顶栏（红黄绿三圆点 + 地址栏）+ 内容区。网页/AI 助手界面截图用（2号参考 K5）
- **`document`**：文档样机，白底 + 细灰边框 + 小圆角。合同/表格/文档截图用（2号参考 K3/K4/K7）

支持两种用法：
- **常驻场景**：B-roll 框从段首到段末常驻，enterDuration 设正常值（18）做入场动画
- **跨段延续场景**：从前段延续到本段，`enterDuration={1}` 跳过入场动画，从首帧即完全可见，避免首帧黑场

## 怎么使用

```tsx
import { RoundedUIFrame } from '../components/RoundedUIFrame';
import { OffthreadVideo, Sequence } from 'remotion';

// 常驻场景：B-roll 圆角 UI 框 + 入场动画
<div style={{ position: 'absolute', left: BROLL_X, top: BROLL_Y, width: BROLL_W, height: BROLL_H }}>
  <RoundedUIFrame x={0} y={0} width={BROLL_W} height={BROLL_H} delay={0} enterDuration={18}>
    <Sequence from={0} durationInFrames={T.end} layout="none">
      <OffthreadVideo src={B_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </Sequence>
  </RoundedUIFrame>
</div>

// 跨段延续场景：跳过入场动画
<RoundedUIFrame x={0} y={0} width={BROLL_W} height={BROLL_H} delay={0} enterDuration={1}>
  <Sequence from={0} durationInFrames={T.end} layout="none">
    <OffthreadVideo src={B_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </Sequence>
</RoundedUIFrame>

// 末段淡出（段间过渡）
const bRollExitOpacity = interpolate(frame, [T.end - 6, T.end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
<div style={{ position: 'absolute', left: BROLL_X, top: BROLL_Y, width: BROLL_W, height: BROLL_H, opacity: bRollExitOpacity }}>
  <RoundedUIFrame x={0} y={0} width={BROLL_W} height={BROLL_H} delay={0} enterDuration={1}>
    ...
  </RoundedUIFrame>
</div>
```

关键 props：
- `x` / `y` / `width` / `height`：框位置与尺寸（通常 x=0, y=0 写在父 div 内）
- `children`：子节点，通常是 `<Sequence><OffthreadVideo /></Sequence>`
- `radius`：圆角，默认 `RADIUS.uiFrame`（28）
- `borderWidth` / `borderColor`：边框，默认 2 / `COLORS.frameBorder`（#E0E0E0）
- `delay` / `enterDuration`：入场时序，默认 0 / 18。**enterDuration<=1 时跳过入场动画**
- `exitStart` / `exitDuration`：出场时序，默认不退场 / 10。**末段淡出建议用外层 div opacity 控制，不用 exitStart**（避免与段间过渡冲突）
- `glowColor`：可选外发光色（成品展示用），默认无

入场动效：`scale 0.95->1.0 + opacity 0->1` over enterDuration 帧
出场动效：`opacity 1->0 + scale 1.0->0.97` over exitDuration 帧

视觉配方：`border-radius + border + box-shadow`（圆角 + 2px 浅色边框 + 柔和投影 `0 8px 24px rgba(0,0,0,0.60)`）

## 设备样机 variant

`variant` prop 切换样机类型。所有 variant 共用同一套 enter/exit 动画（scale 0.95->1.0 + opacity），区别仅在外框装饰与内层屏幕区域。

```tsx
// 手机样机：App 操作演示
<RoundedUIFrame x={0} y={0} width={BROLL_W} height={BROLL_H} variant="phone" delay={0} enterDuration={18}>
  <Sequence from={0} durationInFrames={T.end} layout="none">
    <OffthreadVideo src={B_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </Sequence>
</RoundedUIFrame>

// 浏览器样机：网页/AI 助手界面
<RoundedUIFrame x={0} y={0} width={BROLL_W} height={BROLL_H} variant="web" delay={0} enterDuration={18}>
  ...
</RoundedUIFrame>

// 文档样机：合同/表格
<RoundedUIFrame x={0} y={0} width={BROLL_W} height={BROLL_H} variant="document" delay={0} enterDuration={18}>
  ...
</RoundedUIFrame>
```

各 variant 视觉配方（颜色常量在 `theme.ts` 的 `DEVICE` 组）：

| variant | 外框 | 内层屏幕 | 装饰层 |
| --- | --- | --- | --- |
| `plain` | 圆角 28 + 2px 浅边框 + 投影 + 黑底 | = 外框（无内缩） | 无 |
| `phone` | 深色边框 `DEVICE.phoneBezel` + padding 3.5% + 大圆角 12% | 内缩 padding，圆角 8% | 顶部中央刘海（黑色圆角矩形） |
| `web` | 顶栏灰 `DEVICE.webBar` + 圆角 12 | top 偏移顶栏高（6%），无圆角 | 顶栏：红黄绿三圆点 + 地址栏 |
| `document` | 白底 `DEVICE.docBg` + 1px 灰边框 + 圆角 6 | = 外框（无内缩） | 无 |

**尺寸建议**（2号参考基线）：
- 样机框占画面宽度 70-85%，居中放置
- `phone` 建议宽高比 9:16~9:19（竖屏手机），如 540×960
- `web` / `document` 建议宽高比 16:10~16:9（横屏），如 1200×750

**关键约束**：
- `variant="plain"` 是默认值，不传 variant 时行为与历史成片 100% 一致，现有代码无需改动
- 设备 variant 的 children 仍必须是 `<Sequence><OffthreadVideo muted /></Sequence>`，OffthreadVideo 的 muted / Sequence 包裹约束与 plain 完全一致（见下方 Remotion 约束）
- `phone` 刘海会悬浮在屏幕顶部中央，宽 22% / 高 3.5%--若 B-roll 顶部中央有关键内容会被遮挡，规划时避开或下移
- `web` 顶栏占顶部 6%，children 从顶栏下方开始渲染，B-roll 顶部 6% 内容被顶栏覆盖（模拟真实浏览器，可接受）

## Remotion 约束

### 1. OffthreadVideo 必须 muted
RoundedUIFrame 内部的 OffthreadVideo 必须显式 `muted`，音轨由段顶层的 `<Audio>` 组件统一采集。多个 OffthreadVideo 不 muted 会音轨重叠。

### 2. B-roll 用 Sequence 包裹而非 startFrom
物理片段已用 ffmpeg 对齐主时间轴起点后，必须用 `<Sequence from={0} durationInFrames={T.end} layout="none">` 包裹 OffthreadVideo，**不要用 `startFrom={frame}`**。详见 [Remotion 视频组件约束](../pitfalls.md#remotion-视频组件约束)。

## 避坑

### 1. 跨段延续场景首帧黑场
- **现象**：从前段延续到本段的 B-roll 框，本段首帧框是黑的（入场动画进行中，opacity=0）
- **根因**：默认 `enterDuration=18`，前 18 帧入场过程 opacity 从 0 渐变到 1
- **对策**：跨段延续场景设 `enterDuration={1}`，组件内判断 `enterDuration <= 1` 时跳过入场动画，从首帧即完全可见
- **来源**：CASE-Segment6 实现

### 2. 末段淡出与 exitStart 冲突
- **现象**：用 exitStart 控制末段淡出时，段间过渡的 B-roll 末段淡出动画叠在 exitStart 之上，时序混乱
- **根因**：RoundedUIFrame 的 exitStart 是组件内部退场，段间过渡是外层 div opacity 控制，两者叠加
- **对策**：段间过渡用外层 div opacity 控制（`interpolate(frame, [T.end-6, T.end], [1, 0])`），RoundedUIFrame 不传 exitStart（保持默认不退场）
- **来源**：CASE-Segment6/11 段间过渡实现

### 3. B-roll 框尺寸不统一
- **现象**：不同段 B-roll 框尺寸不一致，视觉跳跃
- **对策**：全片统一 `BROLL_W = VIDEO_W * 0.82`，`BROLL_H` 按需（500 或 BROLL_W * VIDEO_H/VIDEO_W），居中放置。框尺寸定义在段常量里，不写在 RoundedUIFrame props 里

### 4. variant 与 B-roll 宽高比不匹配
- **现象**：`variant="phone"` 但 B-roll 框宽高比是 16:9 横屏，手机样机被横向拉伸，刘海位置怪异；或 `variant="web"` 配 9:16 竖屏，浏览器顶栏过宽
- **根因**：设备 variant 的装饰（刘海、顶栏）按特定宽高比设计，框宽高比不匹配时装饰变形
- **对策**：`phone` 配竖屏宽高比（9:16~9:19，如 540×960）；`web`/`document` 配横屏宽高比（16:10~16:9，如 1200×750）；`plain` 无限制
- **来源**：2号参考视频扩展（模式 A）

### 5. phone 刘海 / web 顶栏遮挡 B-roll 顶部内容
- **现象**：B-roll 顶部中央的关键文字或按钮被 phone 刘海盖住，或顶部 6% 被 web 顶栏覆盖
- **根因**：设备装饰层悬浮在 children 之上（zIndex 2），不可避让
- **对策**：规划时确认 B-roll 顶部 6% 无关键内容；若有，下移 BROLL_Y 或换 `variant="plain"` + 外部 HighlightBox 框选
- **来源**：2号参考视频扩展（模式 A）

## 脚本

完整实现：[src/components/RoundedUIFrame.tsx](../../../remotion-clone/src/components/RoundedUIFrame.tsx)
