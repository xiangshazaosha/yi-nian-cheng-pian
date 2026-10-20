# StepList

## 使用场景

垂直步骤列表，承载"添加照片 -> 输入提示词"这类顺序操作段的需求。每步绿色卡片，激活态 1.1x scale + 黄色边框，非激活态 opacity 0.35。多步骤依次激活引导观众视线。

与 [StepFlowBar](./step-flow-bar.md) 互斥使用：
- StepList 是**详细列表**（垂直，每步一行文字）
- StepFlowBar 是**底部总览**（水平，圆形节点 + 标签）

## 怎么使用

```tsx
import { StepList } from '../components/StepList';

const T = {
  step1Enter: 24,      // 步骤 1 入场
  step1Active: 24,     // 步骤 1 激活
  step2Active: 105,    // 步骤 2 激活（步骤 1 自动失活）
  step1Deactive: 105,  // 步骤 1 取消激活
  step1Exit: 240,      // 步骤 1 退场
  step2Exit: 240,      // 步骤 2 退场
};

<StepList
  x={1200}
  y={200}
  cardWidth={480}
  cardHeight={70}
  gap={16}
  steps={[
    {
      text: '① 添加照片',
      enterFrame: T.step1Enter,
      activeFrame: T.step1Active,
      deactiveFrame: T.step1Deactive,
      exitFrame: T.step1Exit,
    },
    {
      text: '② 输入提示词',
      enterFrame: T.step2Enter,
      activeFrame: T.step2Active,
      exitFrame: T.step2Exit,
    },
  ]}
/>
```

关键 props：
- `x` / `y`：列表左上角坐标
- `steps`：步骤数组，每个步骤：
  - `text`：步骤文本
  - `enterFrame`：入场帧
  - `activeFrame`：激活帧（>= activeFrame 且 < deactiveFrame 时为激活态）
  - `deactiveFrame?`：取消激活帧（之后变灰）
  - `exitFrame?`：退场帧
- `cardWidth`：卡片宽度，默认 480
- `cardHeight`：卡片高度，默认 70
- `gap`：卡片间距，默认 16
- `sfxSrc`：步骤卡入场音效，默认不传。规则见 [sfx-rules.md](../sfx-rules.md)
- `sfxVolume`：音效音量，默认 1.0；内置 `tick.mp3` 源文件较轻

激活态视觉：
- scale: 1.1（放大 10%）
- opacity: 1.0
- border: 3px solid yellow（黄色边框）

非激活态视觉：
- scale: 1.0
- opacity: 0.35
- border: 3px solid transparent

入场动效：[spring 缩放入场](../animations/spring-scale-enter.md)（0.8 -> 1.15 -> 1.0 overshoot + opacity 0->1）
退场动效：[淡入淡出](../animations/fade.md) over 8 帧

视觉配方：`background: COLORS.green + color: #000 + borderRadius: 16 + boxShadow: SHADOW.card`（绿底黑字圆角 + 投影）

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 CSS + interpolate。

## 避坑

### 1. 步骤卡激活时序与 B-roll 画面切换不同步
- **现象**：步骤卡②"② 毛坯房/老房照片"在 frame 270（9s）弹出，但 B-roll 在 frame 360（12s）才切到实景画面，3 秒图文不同步
- **根因**：规划时按口播节奏定卡片弹出时间，但 B-roll 视频本身的画面切换在 12s。两者节奏不一致
- **对策**：卡片弹出时间应与 B-roll 画面切换时间对齐，不同步不超过 1 秒。若口播节奏与画面节奏冲突，**优先画面节奏**（视觉代理对图文同步敏感）
- **来源**：LESSON-012

### 2. 多步骤同时激活导致焦点丢失
- **现象**：步骤①②同时处于激活态（黄色边框 + 1.1x scale），观众不知道当前在哪一步
- **根因**：步骤①没设 `deactiveFrame`，步骤②激活时步骤①仍是激活态
- **对策**：每个步骤必须设 `deactiveFrame`，等于下一步骤的 `activeFrame`。例如步骤① `deactiveFrame = 步骤②.activeFrame`
- **来源**：CASE-Segment8 实现

### 3. enterFrame + 10 帧入场延迟导致视觉"出现"晚 5 帧
- **现象**：设 `enterFrame=24`，视觉代理看到卡片在 frame 29 才"出现"
- **根因**：StepList 内置 `enterProgress = interpolate(frame, [enterFrame, enterFrame + 10], [0, 1])`，frame 24 时 opacity 接近 0 肉眼几乎看不见；frame 29 才到 scale 峰值
- **对策**：规划"frame X 出现"时，代码 `enterFrame = X - 5`
- **来源**：LESSON-008（同 HighlightTag）

### 4. 步骤文字过长溢出卡片
- **现象**：步骤文字超过 cardWidth，被截断或溢出
- **对策**：组件内置 `whiteSpace: 'nowrap'` + `overflow: 'hidden'`，会截断。规划时控制步骤文字在 8-12 字内，超过则加大 cardWidth

## 音效 prop

StepList 内置 `sfxSrc` prop，组件内部对每个步骤的 `enterFrame` 触发一次音效，无需手写多个 Sequence。

### 触发逻辑

组件内部 `steps.map((step, i) => <Sequence from={step.enterFrame + 5} ...>)`，每个步骤卡 spring 弹出时自动触发一次音效。N 个步骤 = N 次音效，时序跟随 enterFrame。

### 用法

```tsx
import { SFX } from '../lib/theme';

<StepList
  x={STEPLIST_X}
  y={STEPLIST_Y}
  cardWidth={480}
  cardHeight={80}
  gap={20}
  steps={[
    { text: '① 添加照片', enterFrame: T.step1Enter, activeFrame: T.step1Active, ... },
    { text: '② 输入提示词', enterFrame: T.step2Enter, activeFrame: T.step2Active, ... },
  ]}
  sfxSrc={SFX.tick}        // 每个步骤入场时触发
  sfxVolume={1.0}
/>
```

### 音效选择

按 [sfx-rules.md](../sfx-rules.md) 规则，StepList 多步骤入场属于"多文字插入"场景：

- 步骤间隔 < 1s：整组只用 `tick` 或 `pop` 一种，不混用
- 步骤间隔 ≥ 1s：`tick` / `pop` / `swish` 三选一，整组不混用

StepList 视觉是"依次激活"（绿色卡片 + 黄色边框），与 StepFlowBar 类似的克制激活感，`tick` 是默认选择。

### 避坑

- **多步骤间隔过短导致音效叠加**：两步骤 enterFrame 间隔至少 30 帧（1s），否则声音糊在一起
- **StepList 与同段其他音效混用**：同段若还有 HighlightTag 或 StepFlowBar，整组必须用同种音效（都 tick 或都 pop），不混用

## 脚本

完整实现：[src/components/StepList.tsx](../../../remotion-clone/src/components/StepList.tsx)
