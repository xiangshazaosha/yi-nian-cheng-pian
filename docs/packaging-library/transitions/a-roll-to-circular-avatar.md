# A-roll 全屏缩入圆形头像

## 使用场景

同一条口播视频从真人全屏构图连续收进左下或其他位置的圆形头像。适用于进入 B-roll、图表、纯文案包装或信息卡阶段时保留人物口型连接。

这是**跨风格共享的构图转场**：组件只负责几何变化和时间轴连续性，不内置秋芝紫、双色黄或其他风格颜色。

## 怎么使用

```tsx
import {ArollToCircularAvatarTransition} from '../../components/ArollToCircularAvatarTransition';

<ArollToCircularAvatarTransition
  videoSrc={A_ROLL_SRC}
  startFrame={79}
  endFrame={97}       // 18 帧
  targetX={58}
  targetY={770}
  targetSize={236}
  borderColor="#D8C94B"
  borderWidth={3}
  objectPosition="50% 30%"
/>
```

转场结束帧起，由常驻头像组件在完全相同的 `x / y / size / border` 参数上接管。全屏视频、转场视频和常驻头像都必须引用同一物理素材，并保持相同的固定源偏移。

## 动效语法

- 默认建议时长：16–22 帧；常用 18 帧。
- 缓动：`cubic-bezier(0.65, 0, 0.35, 1)`。
- 容器从 `1920×1080 @ (0,0)` 连续插值到目标正方形。
- 圆角在运动中后段逐步从 `0%` 变为 `50%`，避免一开始就出现突兀圆洞。
- 描边只在进度约 58% 后淡入；颜色、宽度和辉光由目标风格决定。

## 风格适配

- 双色类：`#D8C94B` 约 3px，无辉光。
- 秋芝风：紫色或紫色渐变描边，可由外层头像组件接管辉光。
- 纯文案类：无描边或中性灰细边。

## Remotion 约束

- 内部 `OffthreadVideo` 固定 `muted`，音频只由段顶层单独采集。
- 禁止使用随当前帧变化的 `startFrom`。如有源偏移，只传固定 `sourceStartFrom`。
- 转场末帧和常驻头像首帧必须使用相同素材时间点，不能重新起播，否则口型会跳。
- 转场下方应提前铺好下一构图背景，让全屏画面缩小时自然露出目标画布。

## 避坑

1. **假缩入**：全屏 A-roll 淡出、头像另行滑入，不属于连续缩入，会产生人物瞬移感。
2. **接管跳帧**：常驻头像重新从素材第 0 帧播放，会在转场完成时明显换口型。
3. **几何不重合**：转场目标与常驻头像的位置或尺寸不同，会在接管帧抖动。
4. **字幕颜色过早切换**：缩入前半仍以人物画面为主，字幕应继续服从视频背景；等目标画布充分露出后再切换字色。

## 实现

[`remotion-clone/src/components/ArollToCircularAvatarTransition.tsx`](../../../remotion-clone/src/components/ArollToCircularAvatarTransition.tsx)

