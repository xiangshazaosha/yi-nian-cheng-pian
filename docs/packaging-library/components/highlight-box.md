# HighlightBox

## 使用场景

B-roll 局部区域描边框选，用于在 B-roll 界面上框选当前操作区域（按钮、输入框、房梁、参考图等）。配合 [AnnotationLine](./annotation-line.md) 引到观点卡，组成"框选 + 标注 + 观点"三件套。

**核心原则**：框内必须包含实际文字或精确对齐 B-roll 中的目标元素。空框无效。

## 怎么使用

```tsx
import { HighlightBox } from '../components/HighlightBox';
import { COLORS } from '../lib/theme';

// 基础用法：框选 B-roll 中房梁区域
<HighlightBox
  x={BROLL_W * 0.25}      // 相对父容器坐标
  y={BROLL_H * 0.08}
  width={BROLL_W * 0.50}
  height={BROLL_H * 0.18}
  enterFrame={60}          // 入场帧
  exitFrame={180}          // 出场帧
  color={COLORS.green}     // 描边颜色，默认黄色
  borderWidth={3}          // 描边宽度，默认 3
  pulseFrame={120}         // 脉冲强调帧
/>

// 浅色 B-roll 上提高可见性
<HighlightBox
  x={BOX.x}
  y={BOX.y}
  width={BOX.w}
  height={BOX.h}
  enterFrame={T.card1In}
  exitFrame={T.box1Out}
  color={COLORS.yellow}
  borderWidth={5}          // 浅色背景上提到 5
  pulseFrame={T.card1In + 10}
/>
```

关键 props：
- `x` / `y` / `width` / `height`：框位置与尺寸（相对父容器坐标）
- `enterFrame` / `exitFrame`：入场/出场帧，默认入场 6 帧、出场 6 帧
- `color`：描边颜色，默认 `COLORS.yellow`。可传 `COLORS.green` / `COLORS.orange`
- `borderWidth`：描边宽度，默认 3。浅色背景上提到 5
- `borderRadius`：圆角，默认 12
- `pulseFrame`：脉冲帧，触发 scale 1.0->1.05->1.0 over 12 帧
- `blinkFrame`：闪烁帧，触发 opacity 1->0.3->1 over 10 帧（用得少）
- `sfxSrc` / `pulseSfxSrc` / `sfxVolume`：组件保留 prop，**当前不使用**。规则见 [sfx-rules.md](../sfx-rules.md)

入场动效：[淡入淡出](../animations/fade.md) over 6 帧
强调动效：[脉冲强调](../animations/pulse.md)（scale 1.0->1.05->1.0 over 12 帧）
出场动效：[淡入淡出](../animations/fade.md) over 6 帧

视觉配方：`border + box-shadow`（描边 + 同色外发光 `0 0 16px {color}80, 0 0 32px {color}40`）

## Remotion 约束

无 OffthreadVideo / Audio 调用。pointerEvents: none 避免拦截点击。

## 避坑

### 1. 空框无效
- **现象**：黄色强调框出现但里面没包裹任何文字，脉冲动画像装饰性闪动，无强调作用
- **根因**：原设计想把"AI 时代"关键词用黄框强调，但"AI 时代"四个字实际在 B-roll 烧入字幕里，不在框内。框单独存在没有信息量
- **对策**：移除空框。如果关键词已在 B-roll 烧入字幕中，不再用 Remotion 框强调；如需额外强调，框内必须包含文字（如把"AI 时代"作为黄色文字 + 框一起渲染），或精确对齐 B-roll 中的目标元素位置
- **来源**：LESSON-006

### 2. 浅色 B-roll 上不可见
- **现象**：黄色描边 + 默认 borderWidth=3 在浅色 B-roll 上几乎看不清
- **根因**：黄色 #FFE600 在浅色背景上对比度低；外发光 `0 0 16px {color}80` 在亮背景下被淹没
- **对策**：浅色 B-roll 上 `borderWidth=5`，配合 `pulseFrame` 让框周期性放大吸引视线。颜色仍用 yellow（与项目色系一致）
- **来源**：CASE-Segment10 v1 视觉复查

### 3. B-roll 实际布局与规划相反
- **现象**：原规划 BOX1 在上方框选参考图，BOX2 在右下框选替换结果，但 B-roll 实际画面是参考图在下方、替换结果在右上
- **根因**：规划时假设 B-roll 布局，未用 ffmpeg 抽帧确认实际画面
- **对策**：实现前用 `ffmpeg -ss {start} -i {src} -frames:v 1 -q:v 2 output.jpg` 抽帧确认 B-roll 实际布局。坐标写相对 B-roll 容器的比例值（如 `BROLL_W * 0.34`），便于 B-roll 框尺寸调整时自动跟随
- **来源**：CASE-Segment10 v2 视觉复查

### 4. 坐标系混淆
- **现象**：HighlightBox 坐标对不上 B-roll 中的目标元素
- **根因**：HighlightBox 的 `x/y` 是相对父容器坐标，不是全屏坐标。如果父容器是 B-roll 框（`position: absolute; left: BROLL_X; top: BROLL_Y`），则 HighlightBox 的 `x/y` 是相对 B-roll 框左上角
- **对策**：HighlightBox 写在 B-roll 框 div 内部时用相对坐标（`BROLL_W * 0.25`）；写在 B-roll 框外部时用全屏坐标。AnnotationLine 永远用全屏坐标（1920×1080）
- **来源**：CASE-Segment6 实现

## 音效 prop

HighlightBox 保留 `sfxSrc` / `pulseSfxSrc` / `sfxVolume` prop，**当前不传**。

按 [sfx-rules.md](../sfx-rules.md) 规则，框选/脉冲属于"视觉强调"非"文字插入"，默认无声。`tick` / `ding` 暂不使用（保留常量供未来扩展）。

## 脚本

完整实现：[src/components/HighlightBox.tsx](../../../remotion-clone/src/components/HighlightBox.tsx)
