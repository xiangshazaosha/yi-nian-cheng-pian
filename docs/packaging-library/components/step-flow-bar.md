# StepFlowBar

## 使用场景

底部步骤流程条，圆形节点 + 连接线 + 下方标签，节点按 activeFrame 从灰变绿点亮。用于多步骤段的**总览导航**，让观众一眼看到全局进度。

与 [StepList](./step-list.md) 互斥使用：
- StepFlowBar 是**底部总览**（水平，圆形节点 + 标签）
- StepList 是**详细列表**（垂直，每步一行文字）

适合 2-4 个步骤的段，超过 4 个节点会因 nodeGap 过大导致溢出画面。

## 怎么使用

```tsx
import { StepFlowBar } from '../components/StepFlowBar';

const T = {
  step1Active: 24,      // 节点 1 点亮
  step2Active: 330,     // 节点 2 点亮
};

// 居中放置在底部
<StepFlowBar
  x={(VIDEO_W - totalWidth) / 2}   // 居中（totalWidth = nodeGap * (steps.length - 1) + nodeSize）
  y={950}                          // 底部安全区
  nodeSize={64}
  nodeGap={400}
  steps={[
    { label: '准备素材', activeFrame: T.step1Active },
    { label: 'AI 生成', activeFrame: T.step2Active },
  ]}
/>
```

关键 props：
- `x` / `y`：流程条左上角坐标
- `steps`：步骤数组，每个步骤：
  - `label`：节点下方标签文本
  - `activeFrame`：节点点亮帧
- `nodeSize`：节点直径，默认 64
- `nodeGap`：两节点中心间距，默认 400
- `sfxSrc`：节点点亮音效，默认不传。按 [sfx-rules.md](../sfx-rules.md) 规则一选用，推荐 `SFX.tick`
- `sfxVolume`：音效音量，默认 1.0；内置 `tick.mp3` 源文件较轻

激活态视觉（`frame >= activeFrame`）：
- background: `COLORS.green`（绿底）
- color: `#000000`（黑字）
- boxShadow: `0 0 16px ${COLORS.green}80`（绿色外发光）
- border: `3px solid ${COLORS.green}`

未激活态视觉（`frame < activeFrame`）：
- background: `#333333`（灰底）
- color: `#888888`（灰字）
- boxShadow: none
- border: `3px solid #555555`

入场动效：节点从 scale 0.8 + opacity 0 -> scale 1.0 + opacity 1（ease-out cubic）over 8 帧
连接线：`#444444` 灰色 4px 高，固定显示（不随激活态变化）

视觉配方：圆形节点 + 连接线 + 标签三层叠加，节点内显示编号（1, 2, 3...）

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 CSS + interpolate。

## 避坑

### 1. 节点数过多导致溢出
- **现象**：4 个节点 + nodeGap=400，totalWidth = 400*3 + 64 = 1264，居中后两侧留白合理；5 个节点 totalWidth = 400*4 + 64 = 1664，接近画面宽 1920，标签可能溢出
- **对策**：超过 4 个节点改用 StepList（垂直列表），或减小 nodeGap 到 300。标签文字控制在 4-6 字内

### 2. 节点点亮时序与口播不同步
- **现象**：节点 2 在 frame 330 点亮，但口播"第二步"在 frame 300 就说了
- **根因**：activeFrame 按画面切换定，但口播节奏可能早于画面
- **对策**：activeFrame 应与口播关键词发音同步。可用 ffmpeg 抽帧定位口播"第二步"的精确帧。允许 0.3-0.5s（9-15 帧）偏差

### 3. 连接线在节点未全亮时显得突兀
- **现象**：节点 1 已点亮（绿），节点 2 未点亮（灰），但连接线全程灰色，看起来"断裂"
- **根因**：连接线是固定灰色，不随激活态变化
- **对策**：接受现状，这是流程条的常规设计。如需改进，可让连接线在两节点都点亮后变绿（但需改组件代码）

### 4. 节点编号字体在 nodeSize 较小时看不清
- **现象**：nodeSize=48 时节点内数字"1"看不清
- **根因**：组件内置 `fontSize: nodeSize * 0.45`，nodeSize=48 时字号 21.6，偏小
- **对策**：nodeSize 不低于 64（默认值）。如必须缩小，需改组件源码调整 fontSize 比例

## 音效 prop

StepFlowBar 内置 `sfxSrc` prop，组件内部对每个步骤的 `activeFrame` 触发一次音效，无需手写多个 Sequence。

### 触发逻辑

组件内部 `steps.map((step, i) => <Sequence from={step.activeFrame} ...>)`，每个节点点亮时自动触发一次音效。N 个节点 = N 次音效，时序完全跟随 activeFrame。

### 用法

```tsx
import { SFX } from '../lib/theme';

<StepFlowBar
  x={FLOW_BAR_X}
  y={FLOW_BAR_Y}
  nodeSize={64}
  nodeGap={400}
  steps={[
    { label: '喜欢的效果图', activeFrame: T.step1FlowActive },
    { label: '毛坯房/老房照片', activeFrame: T.step2FlowActive },
  ]}
  sfxSrc={SFX.tick}        // 每个节点点亮时触发
  sfxVolume={1.0}
/>
```

### 音效选择

按 [sfx-rules.md](../sfx-rules.md) 规则，StepFlowBar 多节点点亮属于"多文字插入"场景：

- 节点间隔 < 1s：整组只用 `tick` 或 `pop` 一种，不混用
- 节点间隔 ≥ 1s：`tick` / `pop` / `swish` 三选一，整组不混用

StepFlowBar 视觉是"克制点亮"（灰变绿），`tick` 比 `pop` 更匹配这种低调激活感，是默认选择。

### 避坑

- **多节点间隔过短导致音效叠加**：两节点 activeFrame 间隔至少 30 帧（1s），否则声音糊在一起
- **StepFlowBar 与同段 HighlightTag 音效同时触发**：如 Segment2 frame 24 同时有节点 1 点亮 + HighlightTag 弹出。两者应使用同种音效（都 tick 或都 pop），整组不混用

## 脚本

完整实现：[src/components/StepFlowBar.tsx](../../../remotion-clone/src/components/StepFlowBar.tsx)
