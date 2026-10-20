# GlowTitle

## 使用场景

段首大标题，左上角占位（约画面高 8%）。两种 variant 覆盖所有标题需求：
- **glow**：黄色强辉光（开场钩子段、CTA 段、情绪强调标题）
- **plain**：白字 + 黑色 drop-shadow（段落内常规大标题、副标题配对的主标题）

浅色 B-roll 上不要直接用 plain variant（对比度不足），改用带 [半透明黑底](../masks/dark-overlay.md) 的自定义 div 或切到 glow variant。

## 怎么使用

```tsx
import { GlowTitle } from '../components/GlowTitle';
import { FONT_SIZE } from '../lib/theme';

// plain variant（段落内常规大标题）
<GlowTitle
  text="关注领提示词"
  x={80}
  y={80}
  variant="plain"
  size={FONT_SIZE.titleLg}
  delay={6}              // 入场延迟（帧）
  enterDuration={12}     // 入场持续（帧）
  exitStart={60}         // 出场起始（帧）
  exitDuration={6}       // 出场持续（帧）
/>

// glow variant（开场/CTA 标题）
<GlowTitle
  text="0 门槛"
  x={80}
  y={80}
  variant="glow"
  size={FONT_SIZE.titleLg}
  delay={0}
  enterDuration={18}
/>
```

关键 props：
- `text` / `x` / `y`：文本与左上角坐标
- `variant`：`'glow'`（黄色 + 多层 text-shadow 强辉光）| `'plain'`（白字 + 单层黑色 drop-shadow）
- `color`：文字色（hex），默认 glow->黄 / plain->白
- `font`：字体，默认 PingFang SC / Microsoft YaHei
- `size`：字号，默认 `FONT_SIZE.titleLg`（84）
- `delay` / `enterDuration`：入场时序，默认 0 / 12
- `exitStart` / `exitDuration`：出场时序，默认不退场 / 8
- `sfxSrc` / `sfxVolume`：组件保留 prop，**当前不使用**。规则见 [sfx-rules.md](../sfx-rules.md)

入场动效：`translateX(-40) + opacity 0->1`（[标题滑入](../animations/title-slide-in.md)）
出场动效：`opacity 1->0`（[淡入淡出](../animations/fade.md)）

## Remotion 约束

无 OffthreadVideo / Audio 调用，无特殊约束。纯 CSS + interpolate，渲染稳定。

## 避坑

### 1. 浅色 B-roll 上 plain variant 对比度不足
- **现象**：白字标题压在浅色 B-roll 上，肉眼几乎看不清
- **根因**：plain variant 只有 `0 2px 8px rgba(0,0,0,0.60)` 单层 drop-shadow，浅色背景下阴影不足以保证对比度
- **对策**：浅色 B-roll 上不用 GlowTitle，改用自定义 div：
  ```tsx
  <div style={{
    position: 'absolute', left: TITLE_X, top: TITLE_Y,
    opacity: newTitleOpacity,
    padding: '12px 24px',
    background: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 16,
    fontSize: FONT_SIZE.titleLg, fontWeight: 900,
    color: COLORS.textMain,
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.80)',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
  }}>{text}</div>
  ```
- **来源**：CASE-Segment9 v1 视觉复查

### 2. 标题切换叠影
- **现象**：旧标题"装修设计的坑"与新标题"AI 时代新解法"在 frame 156-168 有 2-3 帧叠影
- **根因**：新标题入场帧（156）早于 A-roll 淡出完成帧（160），A-roll 视频没完全淡出时新标题已开始入场
- **对策**：新标题入场帧要晚于旧标题所在阶段完全退出帧 + 2 帧缓冲。例如 A-roll 淡出 150-160，新标题 `delay=162`
- **来源**：LESSON-007

### 3. exitStart 默认值是 MAX_SAFE_INTEGER
- **现象**：忘记传 exitStart 时标题不退场，末段叠在下一段上
- **根因**：默认 `exitStart = Number.MAX_SAFE_INTEGER`，意为永不退场
- **对策**：段末需要退场的标题必须显式传 `exitStart={T.end - 12}`，建议 `exitStart` 比段末早 8-12 帧给退场动画留时间
- **来源**：CASE-Segment4/6 修复

## 音效 prop

GlowTitle 保留 `sfxSrc` / `sfxVolume` prop，**当前不传**。

按 [sfx-rules.md](../sfx-rules.md) 规则，标题滑入属于"单文字插入"，默认无声。`swoosh` / `shimmer` 暂不使用（保留常量供未来扩展）。

## 脚本

完整实现：[src/components/GlowTitle.tsx](../../../remotion-clone/src/components/GlowTitle.tsx)
