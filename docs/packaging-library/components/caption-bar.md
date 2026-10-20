# CaptionBar

## 使用场景

保留的装修案例字幕实现：根据历史 srt 模块渲染当前帧字幕，含半透明黑底、白字与黄绿关键词高亮，位置约底部 85–92%。不直接作为新片默认字幕；现行规则要求校正版时间轴与裸排样式，特殊底板须用户明确要求并记录片级例外。此文保留旧 API 供历史维护，没有声称代码已升级成裸排组件。

原案例只在 A-roll 使用，因为该案例的 B-roll 自带烧入字幕。有烧入字幕的区间要避免叠加第二条字幕；无烧入字幕的 B-roll 不因此禁止 Remotion 时间轴字幕。

## 怎么使用

```tsx
import { CaptionBar } from '../components/CaptionBar';

// 基础用法（A-roll 段全程显示）
<CaptionBar
  frameOffset={0}          // 字幕在主时间轴的偏移
  highlights={[
    { keyword: '免费设计', color: 'yellow' },
    { keyword: '几千块', color: 'yellow' },
    { keyword: '几十万', color: 'yellow' },
    { keyword: '打水漂', color: 'yellow' },
  ]}
/>

// 段内偏移（A-roll 在主时间轴非 0 起始）
<CaptionBar
  frameOffset={2160}       // 01:12 = 72s * 30fps
  highlights={[
    { keyword: '更重要', color: 'yellow' },
    { keyword: '更好用', color: 'yellow' },
    { keyword: '可以落地', color: 'yellow' },
  ]}
/>

// B-roll 切换前硬切
{frame < T.transition && (
  <CaptionBar frameOffset={CAPTION_FRAME_OFFSET} highlights={[...]} />
)}
```

关键 props：
- `frameOffset`：字幕在主时间轴的偏移。A-roll 从主时间轴 0 起始则 `frameOffset=0`；从主时间轴 2160 起始则 `frameOffset=2160`。组件内 `actualFrame = frame + frameOffset`，传给 `getCaptionAt`
- `highlights`：关键词高亮数组，每个元素 `{ keyword, color }`。**必须覆盖整段所有关键词**，不是当前帧的
- `widthRatio`：字幕条宽度占画面宽度比例，默认 0.6
- `bottomRatio`：字幕条底部位置（相对画面高度），默认 0.88
- `highlightMode`：`'keyword'`（关键词高亮，默认）| `'all'`（整条字幕高亮）
- `highlightColor`：highlightMode='all' 时的高亮色
- `fadeFrames`：每条字幕首尾淡入淡出帧数，默认 4

渲染逻辑：
- `getCaptionAt(actualFrame)` 返回当前帧对应的 srt 条目，无则返回 null（不渲染）
- 每条字幕首尾 `fadeFrames` 帧淡入淡出
- 关键词高亮：`renderHighlightedText` 按所有 highlights 拆分文本，匹配到的关键词包裹黄/绿底 span

## Remotion 约束

无 OffthreadVideo / Audio 调用。依赖 `../data/srt` 模块的 `getCaptionAt(frame)` 函数。

## 避坑

### 1. highlights 数组只配部分关键词导致部分字幕无高亮
- **现象**：第 30 帧字幕"如果你家是装修公司免费设计"看不到黄色高亮，但第 150 帧才出现"几十万""打水漂"高亮
- **根因**：highlights 数组只配了 `几十万` `打水漂`，但第 30 帧字幕的关键词是 `免费设计`，不匹配所以不插入高亮 span。每条字幕只匹配自己的关键词，全局只配一部分会导致部分字幕无高亮
- **对策**：highlights 数组按"整段所有关键词"配，不要按"当前帧关键词"配。`renderHighlightedText` 内部对每条字幕遍历 highlights，匹配不到的关键词自动跳过，不会误高亮
- **来源**：LESSON-002

### 2. B-roll 段双重字幕
- **现象**：B-roll 段（frame 150+）Remotion 字幕条与 B-roll 自带烧入字幕同时显示
- **根因**：原代码 `frame < T.transition + 10` 让 CaptionBar 在 frame 150-160 之间继续渲染并淡出，但 B-roll 在 frame 153 就开始入场并带烧入字幕，两者在 150-160 重叠
- **对策**：改为 `frame < T.transition` 硬切，frame 150 立即移除 CaptionBar。A-roll 视频本身在 150 开始淡出，字幕条与之同步消失，不需要独立淡出动画
- **来源**：LESSON-005

### 3. frameOffset 计算错误
- **现象**：字幕与口播不对齐
- **根因**：frameOffset 算错了。例如段从 01:12 开始，frameOffset 应为 72s * 30fps = 2160，但传了 2160/2=1080
- **对策**：frameOffset = 段起始秒数 * 30。常用值：
  - S1 (00:00): 0
  - S2 (00:15): 450
  - S3 (00:30): 900
  - S4 (00:37): 1110
  - S5 (00:46): 1380
  - S6 (01:05): 1950
  - S7 (01:12): 2160
  - S8 (01:20): 2400
  - S9 (01:35): 2850
  - S10 (01:51): 3330
  - S11 (02:02): 3630
  - S12 (02:09): 3870

### 4. 0s 首帧字幕缺失
- **现象**：段首 frame 0 字幕不显示，从 frame 4 才出现
- **根因**：fadeFrames 默认 4，字幕从 frame 0 开始淡入，frame 0 时 opacity=0
- **对策**：保留权威字幕时间码，不为淡入效果修改条目的 startFrame。需要首帧立即可见时，使用 fadeFrames=0 或在渲染层调整透明度；只按固定段偏移换算时间轴。
- **来源**：CASE-Segment12 v1 视觉复查

## 脚本

完整实现：[src/components/CaptionBar.tsx](../../../remotion-clone/src/components/CaptionBar.tsx)

依赖的 srt 模块：[src/data/srt.ts](../../../remotion-clone/src/data/srt.ts)（`getCaptionAt(frame)` 函数）
