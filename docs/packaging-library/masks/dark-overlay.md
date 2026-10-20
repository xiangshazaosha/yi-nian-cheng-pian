# 暗色半透明遮罩

## 使用场景

两种用法：

**用法 1：B-roll 全屏段压暗背景**
[B-roll 全屏 + 遮罩](../layouts/b-roll-fullscreen-mask.md) 段用 `rgba(0, 0, 0, 0.60)` 全屏遮罩压暗 B-roll，突出 GlowTitle。B-roll 自带字幕仍可见，GlowTitle 突出。

**用法 2：标题/副标题/摘要文字背后**
浅色 B-roll 上叠 GlowTitle/大标题/副标题/摘要时，用 `rgba(0, 0, 0, 0.55)` + borderRadius + padding 做文字背景，保证对比度。是 [GlowTitle](../components/glow-title.md) plain variant 在浅色 B-roll 上的替代方案。

## 怎么使用

### 用法 1：B-roll 全屏段全屏遮罩

```tsx
import { AbsoluteFill, OffthreadVideo } from 'remotion';

<AbsoluteFill style={{ opacity: bRollEnterProgress }}>
  <OffthreadVideo src={B_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  {/* 全屏暗色遮罩 */}
  <AbsoluteFill style={{
    background: 'rgba(0, 0, 0, 0.60)',
    pointerEvents: 'none',
  }} />
</AbsoluteFill>
```

关键参数：
- 遮罩色：`rgba(0, 0, 0, 0.60)`（B-roll 自带字幕仍可见，GlowTitle 突出）
- 全屏铺满：`AbsoluteFill` 或 `position: absolute; inset: 0`
- `pointerEvents: 'none'`

强度建议：
- **0.40 偏轻**（B-roll 仍亮，GlowTitle 不突出）
- **0.60 达标**（B-roll 自带字幕仍可见，GlowTitle 突出）
- **0.80 过强**（B-roll 几乎全黑，看不出 B-roll 内容）

### 用法 2：标题文字背后半透明黑底

```tsx
// 替代 GlowTitle plain variant（浅色 B-roll 上）
{newTitleOpacity > 0 && (
  <div style={{
    position: 'absolute',
    left: TITLE_X, top: TITLE_Y,
    opacity: newTitleOpacity,
    padding: '12px 24px',                    // 内边距
    background: 'rgba(0, 0, 0, 0.55)',       // 半透明黑底
    borderRadius: 16,                        // 圆角
    fontSize: FONT_SIZE.titleLg,
    fontWeight: 900,
    color: COLORS.textMain,
    letterSpacing: '2px',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.80)',  // 加深文字阴影
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
  }}>
    为什么有用
  </div>
)}

// 副标题/摘要也可用同样配方
<div style={{
  position: 'absolute', left: TITLE_X, top: TITLE_Y + 110,
  opacity: subtitleOpacity,
  padding: '8px 16px',
  background: 'rgba(0, 0, 0, 0.55)',
  borderRadius: 12,
  fontSize: FONT_SIZE.subtitle,
  fontWeight: 700,
  color: COLORS.textMain,
  ...
}}>
  AI 保留房屋原结构
</div>
```

关键参数：
- 遮罩色：`rgba(0, 0, 0, 0.55)`（比全屏遮罩稍轻，避免文字背景过黑）
- 内边距：`12px 24px`（大标题）/ `8px 16px`（副标题）
- 圆角：16（大标题）/ 12（副标题）
- 文字阴影：`0 2px 8px rgba(0, 0, 0, 0.80)`（加深到 0.80，比 GlowTitle 默认 0.60 更强）

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 CSS background + borderRadius。

## 避坑

### 1. 全屏遮罩过强导致 B-roll 不可见
- **现象**：遮罩 0.80 时 B-roll 画面几乎全黑，看不出 B-roll 内容
- **根因**：B-roll 全屏 + 遮罩的目的是"压暗背景突出 GlowTitle"，不是"完全遮挡 B-roll"
- **对策**：遮罩强度 0.55-0.60。0.60 是经过视觉复查的达标值
- **来源**：CASE-Segment12 视觉复查

### 2. 标题文字背景遮罩与 B-roll 烧入字幕压字
- **现象**：标题背景遮罩盖住了 B-roll 框内的烧入字幕
- **根因**：标题位置与 B-roll 烧入字幕位置重叠
- **对策**：标题位置避开 B-roll 框内烧入字幕区。左上 (80, 80) 是安全位置（B-roll 框内烧入字幕通常在底部）

### 3. 半透明黑底圆角与 B-roll 框圆角不协调
- **现象**：标题背景圆角 16，B-roll 框圆角 28，视觉不协调
- **对策**：标题背景圆角用 16（与 [HighlightTag](../components/highlight-tag.md) 一致），B-roll 框圆角用 28（[RoundedUIFrame](../components/rounded-ui-frame.md) 默认）。两者不必一致，标题背景是"文字标签"性质，B-roll 框是"UI 录屏框"性质

### 4. 半透明黑底在深色背景上不可见
- **现象**：标题背景遮罩在深色 B-roll 上几乎看不到边界
- **根因**：深色 B-roll 上 `rgba(0, 0, 0, 0.55)` 与背景色接近
- **对策**：深色 B-roll 上不需要半透明黑底，直接用 GlowTitle plain variant（白字 + drop-shadow）。半透明黑底只用于浅色 B-roll

## 脚本参考

典型实现：
- [src/segments/Segment9.tsx（未随公开版分发）](../../public-release-scope.md)（用法 2：标题/副标题/摘要半透明黑底）
- [src/segments/Segment12.tsx（未随公开版分发）](../../public-release-scope.md)（用法 1：B-roll 全屏 + 0.60 遮罩）
