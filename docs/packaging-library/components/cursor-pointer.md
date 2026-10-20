# CursorPointer

## 使用场景

鼠标 / 手指指针，B-roll 交互演示段从起点移动到目标点强调「点击这里 / 输入这里」类操作。指针指尖（热点）对齐目标元素，到达后指尖处 pulse 圆环扩散强调。用于 App 操作演示、AI 助手界面引导、表单填写引导（2号参考视频 K5 橙色手型指针指向「创意视频」选项）。

坐标系：**1920×1080 全屏坐标**（与 [AnnotationLine](./annotation-line.md) 一致，不是相对 B-roll 框）。指尖落点 `targetX/targetY` 直接用全屏坐标。

## 怎么使用

```tsx
import { CursorPointer } from '../components/CursorPointer';
import { COLORS } from '../lib/theme';

// 指针从画面外左上移入，指向 B-roll 内某个按钮（全屏坐标 1100, 620）
<CursorPointer
  targetX={1100}
  targetY={620}
  fromX={900}                // 起点 X，默认 = targetX
  fromY={500}                // 起点 Y，默认 = targetY - 120（从上方移入）
  moveStartFrame={60}        // 开始移动帧（与口播「点击这里」对齐）
  moveDuration={10}          // 移动持续 10 帧，默认 10
  pulseStartFrame={70}       // pulse 起始，默认 = moveStartFrame + moveDuration
  pulseDuration={14}         // 单次 pulse 周期，默认 14
  pulseCount={2}             // pulse 2 次（停留强调），默认 2
  disappearFrame={120}       // 消失帧，默认不消失
  color={COLORS.orange}      // 指针颜色，默认橙 #FF6600
  pulseColor={COLORS.yellow} // 点击扩散环可单独指定颜色
  size={64}                  // 指针高度（像素），默认 64
  variant="hand"            // hand / arrow
/>
```

关键 props：
- `targetX` / `targetY`：指尖落点（全屏坐标），指针热点对齐此处
- `fromX` / `fromY`：起点，默认从 `targetY - 120` 上方移入。设 `fromX=targetX, fromY=targetY` 则原地出现不移动
- `moveStartFrame` / `moveDuration`：移动起止，默认 10 帧。ease-in-out 缓动
- `pulseStartFrame` / `pulseDuration` / `pulseCount`：到达后指尖圆环扩散，默认起始于移动结束、周期 14 帧、2 次
- `appearFrame` / `disappearFrame`：出现/消失，默认出现=moveStartFrame、不消失
- `color`：指针颜色，默认 `COLORS.orange`（#FF6600）。匹配段内强调色：橙段用 orange、关键词段用 yellow
- `pulseColor`：点击扩散环颜色；省略时跟随 `color`
- `size`：指针高度像素，默认 64。浅色 B-roll 上提到 80 增强存在感
- `variant`：`hand` 为手型指针；`arrow` 为标准鼠标箭头，适合跟随录屏中原生小鼠标

动效：
- 移动：`ease-in-out`（cubic-bezier(0.65,0,0.35,1) 近似），10 帧从起点到目标
- pulse 圆环：指尖处 `r` 从 `size*0.08` 扩散到 `size*0.32`，opacity 0->0.85->0，每周期 14 帧
- 点击瞬间指针以热点为锚点压缩到 0.84 再回弹，避免只有扩散环而没有“按下”反馈
- 出现/消失：[淡入淡出](../animations/fade.md) over 4-6 帧

实现细节：
- SVG `viewBox="0 0 40 56"`，食指 rect + 拳头 ellipse + 指尖 circle，指尖在 (20, 50)
- 定位：`left = curX - 20*scale, top = curY - 50*scale`，让指尖对齐 `(curX, curY)`
- `filter: drop-shadow(0 3px 4px rgba(0,0,0,0.45))` 增强与 B-roll 的层次
- `pointerEvents: none`，不拦截交互
- `if (opacity <= 0) return null` 避免渲染不可见指针

## Remotion 约束

无 OffthreadVideo / Audio 调用。pointerEvents: none。与 [HighlightBox](./highlight-box.md) / [AnnotationLine](./annotation-line.md) 同层，写在段顶层 AbsoluteFill 内、B-roll 之上。

## 避坑

### 1. 坐标系混淆
- **现象**：指尖没对准 B-roll 里的目标按钮
- **根因**：`targetX/targetY` 是全屏 1920×1080 坐标，但目标按钮在 B-roll 框内（相对坐标）。若直接用相对坐标会偏移整个 B-roll 框的位置
- **对策**：目标在 B-roll 框内时，全屏坐标 = `BROLL_X + 相对X, BROLL_Y + 相对Y`
  ```tsx
  // 按钮在 B-roll 框内相对坐标 (BOX_X, BOX_Y)
  <CursorPointer targetX={BROLL_X + BOX_X} targetY={BROLL_Y + BOX_Y} ... />
  ```
- **来源**：2号参考视频扩展（模式 A），坐标系规则对齐 [AnnotationLine 避坑#2](./annotation-line.md#2-坐标系混淆)

### 2. 移动时序与口播不同步
- **现象**：指针移动早于或晚于口播「点击这里」超过 0.5s，视觉割裂
- **根因**：moveStartFrame 没对齐口播动词发音帧
- **对策**：`moveStartFrame` 与口播操作动词（「点击」「输入」「选择」）发音同步，允许 9-15 帧偏差。参考 [StepFlowBar 避坑#2](./step-flow-bar.md) 的同步规则
- **来源**：2号参考视频扩展（模式 A）

### 3. pulse 过多分散注意力
- **现象**：指针停留期间 pulse 3+ 次，圆环不断扩散，喧宾夺主盖过 B-roll 内容
- **对策**：`pulseCount` 默认 2 已够强调；长停留段（>3s）可设 3，不要超过 3。停留结束后用 `disappearFrame` 及时消失
- **来源**：2号参考视频扩展（模式 A）

### 4. 浅色 B-roll 上指针偏小
- **现象**：默认 size=64 在浅色 B-roll 上存在感不足
- **对策**：浅色 B-roll 上 `size={80}`，颜色用 `COLORS.orange`（橙在浅底上对比强于黄）
- **来源**：2号参考视频扩展（模式 A）

## 脚本

完整实现：[src/components/CursorPointer.tsx](../../../remotion-clone/src/components/CursorPointer.tsx)
