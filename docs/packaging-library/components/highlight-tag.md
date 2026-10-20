# HighlightTag

## 使用场景

色块信息卡，承载段内所有"关键词标签 / 事实卡 / 步骤卡 / 结论卡 / CTA"需求。三种颜色固定映射语义：

- **yellow** `#FFE600` 黑字：风险卡、关键词高亮、强调标签
- **green** `#CCFF00` 黑字：步骤卡、事实卡、操作指引
- **orange** `#FF6600` 白字：结论卡、CTA、最终建议

同屏不超过 3 张；同色同时常驻时，后卡弹出要把前卡 opacity 降到 0.4 让位。

## 怎么使用

```tsx
import { HighlightTag } from '../components/HighlightTag';
import { FONT_SIZE } from '../lib/theme';

// 风险卡（黄）
<HighlightTag
  text="几十万打水漂"
  x={1400}
  y={80}
  color="yellow"
  size={FONT_SIZE.cardLarge}
  delay={15}              // 入场延迟（帧）
  enterDuration={10}      // 入场持续（帧）
  exitStart={150}         // 出场起始
  exitDuration={6}
/>

// 步骤卡（绿）
<HighlightTag
  text="① 喜欢的效果图"
  x={1400}
  y={200}
  color="green"
  size={FONT_SIZE.card}
  delay={24}
  enterDuration={10}
/>

// 结论卡（橙）
<HighlightTag
  text="可落地"
  x={CARD_X}
  y={CARD_Y}
  color="orange"
  size={FONT_SIZE.cardLarge}
  delay={90}
  enterDuration={10}
/>
```

关键 props：
- `text` / `x` / `y`：文本与左上角坐标
- `color`：背景色，hex（如 `#FFE600`）或黄/绿/橙枚举，决定底色
- `textColor`：文字色（hex），默认按背景色（黄绿黑字、橙白字）
- `font`：字体，默认 PingFang SC / Microsoft YaHei
- `size`：字号，常用 `FONT_SIZE.card`（38）或 `FONT_SIZE.cardLarge`（48）
- `padding`：内边距，默认 14（实际 `${padding}px ${padding*1.4}px`）
- `delay` / `enterDuration`：入场时序，默认 0 / 10
- `exitStart` / `exitDuration`：出场时序，默认不退场 / 8
- `scaleMultiplier`：外部缩放因子（如高亮放大 1.1x），默认 1
- `sfxSrc`：入场音效文件路径，默认不传（无声）。按 [sfx-rules.md](../sfx-rules.md) 规则一选用 `SFX.pop` / `SFX.tick` / `SFX.swish`
- `sfxVolume`：音效音量，默认 0.65；已按内置 `pop.mp3` 的响度校准

入场动效：[spring 缩放入场](../animations/spring-scale-enter.md)（0.8 -> 1.15 -> 1.0 overshoot + opacity 0->1）
出场动效：[淡入淡出](../animations/fade.md)

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 CSS + interpolate。

## 避坑

### 1. delay + enterDuration 导致视觉"出现"比 delay 晚约 5 帧
- **现象**：设 `delay=375`，视觉代理看到卡片在 frame 380 才"出现"，比规划晚 5 帧
- **根因**：`delay=375 + enterDuration=10` 意味着 frame 375-385 是入场过程（scale 0.8->1.15->1.0）。frame 375 时 scale=0.8、opacity 接近 0 肉眼几乎看不见；frame 380 才到 scale 峰值，肉眼才"看到"
- **对策**：规划"frame X 出现"时，代码 `delay = X - enterDuration/2`。例如要在 frame 375 视觉出现，`delay=370`
- **来源**：LESSON-008

### 2. 同色卡片同时常驻时视觉权重过高
- **现象**：步骤卡①②都是绿底，同时常驻右上角，双绿卡层叠显得拥挤、焦点丢失
- **根因**：两张同色高饱和度卡片同时显示，颜色无法区分主次
- **对策**：后卡弹出时（frame 330），前卡 opacity 从 1 渐变到 0.4（frame 325-340，15 帧过渡）。前卡保留占位但视觉让位
  ```tsx
  const card1Opacity = interpolate(frame, [325, 340], [1, 0.4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  ```
- **来源**：LESSON-013。不同色卡片不需此处理（颜色本身已区分主次）

### 3. 卡片压 B-roll 烧入字幕
- **现象**：绿色结论卡 y=760 与 B-roll 框内底部烧入字幕"设计师更好更平的设计"压字重叠
- **根因**：B-roll 框占 y=89 到 y=931，框内底部 10-20% 是烧入字幕区（约 y=760-931）。Remotion 信息卡与 B-roll 自带字幕是两套独立文字层，位置重叠就压字
- **对策**：信息卡放在 B-roll 框外安全区。78% 尺寸 B-roll 框的安全区：上 0-89px（89px 高）、下 931-1080px（149px 高）、左 0-211px（211px 宽）、右 1709-1920px（211px 宽）。结论卡放底部安全区 `y=945`
- **来源**：LESSON-003

### 4. exitStart 默认 MAX_SAFE_INTEGER
- **现象**：忘记传 exitStart 时卡片不退场，叠在下段上
- **对策**：段末需退场的卡片必须显式传 `exitStart`，建议比段末早 8-12 帧

## 音效 prop

HighlightTag 内置 `sfxSrc` prop，组件内部用 `<Sequence>` + `<Audio>` 在视觉"出现"帧自动触发音效，无需手写音效代码。

### 触发逻辑

音效在 `delay + Math.floor(enterDuration / 2)` 帧触发，与卡片 spring scale 达到峰值（1.15）的瞬间对齐。此时卡片从无到有最显眼，pop 的"啪"声匹配弹出的视觉冲击。

### 用法

```tsx
import { SFX } from '../lib/theme';

<HighlightTag
  text="3 秒 AI 生成"
  delay={T.factCardIn}
  enterDuration={10}
  sfxSrc={SFX.pop}        // 自动在 delay + 5 帧触发
  sfxVolume={0.65}        // 默认 0.65
  ...
/>
```

### 音效选择

按 [sfx-rules.md](../sfx-rules.md) 规则，HighlightTag 属于"多文字插入"场景：

- 多卡间隔 < 1s：整组只用 `tick` 或 `pop` 一种，不混用
- 多卡间隔 ≥ 1s：`tick` / `pop` / `swish` 三选一，整组不混用
- 单卡插入（同段只此一张卡）：默认无声

### 不传 sfxSrc 的情况

- 段内只有单张卡（如 Segment6 "梁未变化"），不属于"多文字插入"，默认不传
- 段末淡出卡片（exitStart 触发的退场）不需要音效，淡出是被动退场不是主动入场

## 脚本

完整实现：[src/components/HighlightTag.tsx](../../../remotion-clone/src/components/HighlightTag.tsx)
