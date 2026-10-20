# AnnotationLine

## 使用场景

SVG 折线标注，从 [HighlightBox](./highlight-box.md) 框选区引到画面另一处的观点卡/标签，组成"框选 + 标注 + 观点"三件套。用于"B-roll 上某个细节 -> 引出 -> 主播观点"的视觉引导。

坐标系：**1920×1080 全屏坐标**（不是相对 B-roll 框）。SVG 铺满 AbsoluteFill，viewBox 固定 `0 0 1920 1080`，preserveAspectRatio="none"。

## 怎么使用

```tsx
import { AnnotationLine } from '../components/AnnotationLine';
import { COLORS } from '../lib/theme';

// 从 HighlightBox 右下角引到观点卡左侧（3 点折线）
const LINE_POINTS: Array<[number, number]> = [
  [BROLL_X + BOX_X + BOX_W, BROLL_Y + BOX_Y + BOX_H * 0.5],  // HighlightBox 右中
  [BROLL_X + BOX_X + BOX_W + 60, BROLL_Y + BOX_Y + BOX_H * 0.5],  // 水平延伸 60px
  [CARD_X - 20, CARD_Y + 30],  // 折到观点卡左侧
];

<AnnotationLine
  points={LINE_POINTS}
  enterFrame={60}          // 绘制起始帧
  exitFrame={180}          // 出场帧
  color={COLORS.green}     // 线条颜色，默认绿色
  strokeWidth={3}          // 线宽，默认 2
  drawDuration={12}        // 绘制时长（帧），默认 12
/>
```

关键 props：
- `points`：折线顶点数组，`Array<[number, number]>`，全屏 1920×1080 坐标
- `enterFrame` / `exitFrame`：绘制起始/出场帧
- `drawDuration`：绘制时长，默认 12 帧
- `color`：线条颜色，默认 `COLORS.green`。建议与配对的 HighlightBox 颜色一致
- `strokeWidth`：线宽，默认 2。浅色 B-roll 上提到 5

绘制动效：`strokeDashoffset` 从 1 到 `1 - drawProgress`（pathLength=1，strokeDasharray=1）
出场动效：[淡入淡出](../animations/fade.md) over 6 帧

实现细节：
- SVG `viewBox="0 0 1920 1080"` `preserveAspectRatio="none"`，铺满 AbsoluteFill
- `pathLength={1}` `strokeDasharray={1}` `strokeDashoffset={1 - drawProgress}`
- `if (drawProgress <= 0 || exitOpacity <= 0) return null` 避免渲染空 path
- `strokeLinecap="round"` `strokeLinejoin="round"` 圆角连接

## Remotion 约束

无 OffthreadVideo / Audio 调用。pointerEvents: none。

## 避坑

### 1. 浅色 B-roll 上不可见
- **现象**：绿色描边 + 默认 strokeWidth=2 在浅色 B-roll 上几乎看不清
- **根因**：绿色 #CCFF00 在浅色背景上对比度低；线宽 2 太细
- **对策**：浅色 B-roll 上 `strokeWidth=5`，颜色匹配 HighlightBox（同 yellow 或同 green）
- **来源**：CASE-Segment10 v1 视觉复查

### 2. 坐标系混淆
- **现象**：折线端点对不上 HighlightBox 和观点卡
- **根因**：AnnotationLine 永远用全屏坐标（1920×1080），但 HighlightBox 用相对父容器坐标。如果 HighlightBox 写在 B-roll 框 div 内部（相对坐标），折线端点要加上 B-roll 框偏移
- **对策**：端点用全屏坐标计算：
  ```tsx
  // HighlightBox 在 B-roll 框内（相对坐标 BOX_X, BOX_Y）
  // AnnotationLine 端点要加 B-roll 框偏移
  const LINE_POINTS = [
    [BROLL_X + BOX_X + BOX_W, BROLL_Y + BOX_Y + BOX_H * 0.5],  // 全屏坐标
    ...
  ];
  ```
- **来源**：CASE-Segment6 实现

### 3. 颜色与 HighlightBox 不匹配
- **现象**：HighlightBox 用 yellow，AnnotationLine 默认 green，视觉割裂
- **对策**：AnnotationLine 颜色必须与配对的 HighlightBox 颜色一致。建议在段常量里统一定义 `HIGHLIGHT_COLOR`，HighlightBox 和 AnnotationLine 都引用

## 脚本

完整实现：[src/components/AnnotationLine.tsx](../../../remotion-clone/src/components/AnnotationLine.tsx)
