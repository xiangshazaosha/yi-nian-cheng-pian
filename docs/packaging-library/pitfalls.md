# 避坑速查表

> 跨方案避坑索引。按症状定位到具体方案文档。
> 每条避坑含：症状 / 根因 / 对策 / 来源。

## 目录

- [Remotion 视频组件约束](#remotion-视频组件约束)
- [临时 AAC 固定延迟](#临时-aac-固定延迟)
- [CaptionBar 避坑](#captionbar-避坑)
- [GlowTitle 避坑](#glowtitle-避坑)
- [HighlightTag 避坑](#highlighttag-避坑)
- [HighlightBox 避坑](#highlightbox-避坑)
- [AnnotationLine 避坑](#annotationline-避坑)
- [CursorPointer 避坑](#cursorpointer-避坑)
- [RoundedUIFrame 避坑](#roundeduiframe-避坑)
- [CircularAvatar 避坑](#circularavatar-避坑)
- [TextureBackground 避坑](#texturebackground-避坑)
- [StepList 避坑](#steplist-避坑)
- [StepFlowBar 避坑](#stepflowbar-避坑)
- [构图与信息容器避坑](#构图与信息容器避坑)
- [信息卡定位避坑](#信息卡定位避坑)
- [转场避坑](#转场避坑)
- [视觉代理配置避坑](../03-remotion-production.md#视觉检查范围与结论)
- [ffmpeg 抽取避坑](#ffmpeg-抽取避坑)

---

## Remotion 视频组件约束

> 违反这些约束会导致无声 / 音轨重叠 / 视频加速定格。来自 03-remotion-production.md 第八节 + 04-design-log.md PITFALL-002~004、LESSON-010~011。

### 渲染输出无声音

- **症状**：渲染出的 MP4 播放时没有声音，但原 A-roll 视频明明有人声
- **根因**：ffmpeg 抽取视频片段时漏了 `-c:a aac`，输出文件只有视频流；或代码里没加 `<Audio>` 组件
- **检查项**：
  1. `ffprobe -v error -select_streams a -show_entries stream=codec_name {file}.mp4` 验证源文件有音频流
  2. grep 代码确认段顶层有 `<Audio src={A_ROLL_SRC} />`
- **对策**：ffmpeg 抽取命令必须显式 `-c:a aac -b:a 192k -movflags +faststart`。详见 [ffmpeg 抽取避坑](#ffmpeg-抽取避坑)
- **来源**：PITFALL-004

### 声音重复/混乱

- **症状**：渲染出的视频声音混乱、重复，像多个音轨叠加
- **根因**：多个 OffthreadVideo 都没 `muted`，默认 `muted={false}` 会采集音轨。N 个 OffthreadVideo 叠加 N 条音轨
- **检查项**：`grep -r "<OffthreadVideo" src/` 确认每个都有 `muted` 属性
- **对策**：所有 OffthreadVideo 显式加 `muted`，只保留一个 `<Audio src={...} />` 组件负责音轨
- **来源**：LESSON-011

### OffthreadVideo 加速播放

- **症状**：圆形头像里的 A-roll 视频在 5-7s 加速播放（2 倍速），7.5s 后定格在视频末尾
- **根因**：写了 `<OffthreadVideo src={videoSrc} startFrom={videoFrame} />`，其中 `videoFrame = frame - startFrame = frame`（startFrame=0）。OffthreadVideo 提取帧公式 = `(N - sequenceFrom) + startFrom`，没有 Sequence 包裹时 sequenceFrom=0，再加 `startFrom={frame}` 后提取帧 = `N + N = 2N`，视频变成 2 倍速
- **检查项**：`grep -r "startFrom=" src/` 必须是常量或 0，不能是 frame 变量
- **对策**：去掉 `startFrom={videoFrame}`，让 OffthreadVideo 默认同步主时间轴。如果视频需要从主时间轴非 0 位置开始，用 `<Sequence from={X}>` 包裹
- **来源**：LESSON-010 / PITFALL-003

### 视频播完定格

- **症状**：视频播到一半突然定格在最后一帧
- **根因**：同上，`startFrom={frame}` 导致 2 倍速播放，frame 225 时提取第 450 帧（视频末尾），之后定格
- **对策**：同上，去掉 `startFrom={frame}`
- **来源**：LESSON-010

### 用末帧冻结补齐旧口播槽位

- **症状**：替换后的口播源长度不足旧段长，为了保留原切点而冻结人物末帧；观众会把连续静止直接判断为卡帧。
- **根因**：错误地把旧段界当成硬约束，没有让时间轴服从新口播和新视频的真实有效帧数。
- **对策**：口播人物不得使用末帧冻结补足时长。除非用户明确要求保留总时长，否则缩短本段并同步更新后续全局起点、单一主音轨拼接点、SRT 固定偏移和分段登记；所有烧入字幕的后续段必须按新全局时间重渲染。只有录屏退出、证据停留等非口播对象，且语义明确需要“停住看结果”时，才允许受控使用尾帧静图。
- **检查项**：对疑似区间导出逐帧哈希或帧差；连续重复帧长跑不得只靠肉眼抽两张图判断。
- **来源**：LESSON-020 / 《AI干进专业工作》开篇替换。

### file:// URL 不支持

- **症状**：渲染时报错 `Can only download URLs starting with http:// or https://, got file:///remotion-clone/public/example.mp4`
- **根因**：Remotion 的 OffthreadVideo / Video 组件基于浏览器媒体管道，只接受 http(s) 协议或 `staticFile()` 包装的 public/ 目录资源
- **检查项**：`grep -r "src=\"file:" src/` / `grep -r "src=\"E:" src/` / `grep -r "src=\"D:" src/`
- **对策**：把视频用 ffmpeg 抽取到 `public/` 目录，在 theme.ts 中用 `staticFile('xxx.mp4')` 引用
- **来源**：PITFALL-002

### B-roll 用 startFrom 跳帧会错位

- **症状**：B-roll 视频在主时间轴第 150 帧开始播放，但用 `startFrom={150}` 后画面跳到了视频的中段，而不是开头
- **根因**：B-roll 物理文件 `b-roll-seg1.mp4` 只有 300 帧（10s，已用 ffmpeg 抽取了原 B-roll 5-15s 的片段）。再用 `startFrom={150}` 等于跳过物理文件的前 150 帧，从物理文件第 150 帧（原 B-roll 第 10s）开始播，画面错位
- **检查项**：B-roll 的 OffthreadVideo 是否有 `startFrom`
- **对策**：用 `<Sequence from={150} durationInFrames={300} layout="none">` 包装普通 `<OffthreadVideo src={B_ROLL_SRC} muted />`。Sequence 把内部时间轴的 0 平移到主时间轴的 150，视频从物理文件第 0 帧（即抽取时的起点）正常播放
- **来源**：PITFALL-003

### remotion still 截图人物静止

- **症状**：用 `npx remotion still` 抽帧复查时，OffthreadVideo 的人物姿势不变（总是第一帧）
- **根因**：Remotion still 命令对 OffthreadVideo 有已知 bug，单帧渲染时总是取视频第一帧
- **对策**：动态复查从渲染输出的 MP4 抽帧，不用 still 命令：
  ```bash
  ffmpeg -y -i {output}.mp4 -vf "select='eq(n\,30)+eq(n\,150)+eq(n\,300)'" -fps_mode vfr /tmp/check_%d.png
  ```
- **来源**：03-remotion-production.md 第 8.4 节

### ffmpeg -ss seeking 不帧精确

- **症状**：用 `ffmpeg -ss 0.1 -i segment7.mp4 -frames:v 1` 抽帧，发现 A-roll 不是 opacity 0（应该是首帧淡入 opacity=0）
- **根因**：ffmpeg `-ss` seeking 不是帧精确的，0.1s = frame 3（30fps），不是 frame 0
- **对策**：抽帧验证时用精确帧号 `ffmpeg -i segment7.mp4 -vf "select='eq(n\,0)+eq(n\,1)+eq(n\,2)'" -fps_mode vfr /tmp/check_%d.png`

---

## CaptionBar 避坑

详见 [CaptionBar 方案](./components/caption-bar.md)。

### 字幕无高亮

- **症状**：第 30 帧字幕"如果你家是装修公司免费设计"看不到黄色高亮，但第 150 帧才出现"几十万""打水漂"高亮
- **根因**：highlights 数组只配了 `几十万` `打水漂`，但第 30 帧字幕的关键词是 `免费设计`，不匹配
- **对策**：highlights 数组按"整段所有关键词"配，不要按"当前帧关键词"配
- **来源**：LESSON-002

### 双重字幕

- **症状**：B-roll 段 Remotion 字幕条与 B-roll 自带烧入字幕同时显示
- **根因**：CaptionBar 在 A-roll/B-roll 切换点用淡出（10 帧），但 B-roll 在切换点就带烧入字幕，淡出过程中两者重叠
- **对策**：B-roll 段 CaptionBar 必须**硬切**不能淡出。`frame < T.transition` 时渲染，否则不渲染
- **来源**：LESSON-005

### frameOffset 计算错误

- **症状**：字幕与口播不对齐
- **根因**：frameOffset 算错了
- **对策**：frameOffset = 段起始秒数 * 30。常用值见 [CaptionBar 方案#3](./components/caption-bar.md#3-frameoffset-计算错误)

### 用策划摘要代替时间轴字幕

- **症状**：字幕意思大致相近，但用词与口播不同，切换时间也提前或延后。
- **根因**：没有读取项目已有 SRT，直接根据策划文档或听感手写了 `cues`；或把终端乱码误判为字幕文件损坏。
- **硬性对策**：字幕只能来自 `SRT / VTT / ASS / 带时码 JSON / 剪辑软件字幕轨`。分段时保留原文，只计算 `源字幕时间 - 段起点` 的固定偏移。若无时间轴字幕，先转写并对齐生成文件，同时告知用户新建原因和路径，之后才能渲染。
- **编码检查**：用显式编码读取并检查原始字节；PowerShell/Python 终端显示乱码时，不能直接认定源文件不可用。

### 把字幕与包装动效文字当成同一种文案

- **症状**：字幕虽然同步，但大标题只是把字幕重复放大；或包装标题提前使用后两句才出现的结论，导致当前口播和画面没有关系。
- **根因**：没有区分 `subtitle` 与 `title / keyword / summary / label` 两个信息层。
- **对策**：字幕逐字使用时间轴原文；包装文字只提炼当前已经成立的语义，并按视觉职责另行设计。所有屏幕文字在规划和代码中必须标注角色。
- **检查方法**：逐帧分别提问：字幕是否与正在说的话一致？包装标题是否解释当前句，而不是重复字幕或预告后句？

### 0s 首帧字幕缺失

- **症状**：段首 frame 0 字幕不显示，从 frame 4 才出现
- **根因**：fadeFrames 默认 4，字幕从 frame 0 开始淡入，frame 0 时 opacity=0
- **对策**：若段首必须立即显示字幕，把 srt 条目的 startFrame 设为 frameOffset - 4
- **来源**：CASE-Segment12 v1 视觉复查

---

## GlowTitle 避坑

详见 [GlowTitle 方案](./components/glow-title.md)。

### 浅色 B-roll 上对比度不足

- **症状**：白字标题压在浅色 B-roll 上，肉眼几乎看不清
- **根因**：plain variant 只有单层 drop-shadow，浅色背景下阴影不足以保证对比度
- **对策**：浅色 B-roll 上不用 GlowTitle，改用自定义 div + `background: rgba(0,0,0,0.55)` + borderRadius 16 + padding 12px 24px
- **来源**：CASE-Segment9 v1 视觉复查

### 标题切换叠影

- **症状**：旧标题与新标题在切换期有 2-3 帧叠影
- **根因**：新标题入场帧早于 A-roll 淡出完成帧
- **对策**：新标题入场帧要晚于旧标题所在阶段完全退出帧 + 2 帧缓冲
- **来源**：LESSON-007

### exitStart 默认不退场

- **症状**：忘记传 exitStart 时标题不退场，末段叠在下段上
- **对策**：段末需退场的标题必须显式传 `exitStart`，建议比段末早 8-12 帧

---

## HighlightTag 避坑

详见 [HighlightTag 方案](./components/highlight-tag.md)。

### delay + enterDuration 视觉晚 5 帧

- **症状**：设 `delay=375`，视觉代理看到卡片在 frame 380 才"出现"
- **根因**：`delay + enterDuration` 期间 scale 0.8->1.15->1.0，frame 375 时 scale=0.8、opacity 接近 0 肉眼几乎看不见；frame 380 才到 scale 峰值
- **对策**：规划"frame X 出现"时，代码 `delay = X - enterDuration/2`
- **来源**：LESSON-008

### 同色卡片同时常驻

- **症状**：两张绿底卡片同时常驻，视觉权重过高、焦点丢失
- **根因**：两张同色高饱和度卡片同时显示，颜色无法区分主次
- **对策**：后卡弹出时，前卡 opacity 从 1 渐变到 0.4（15 帧过渡）
- **来源**：LESSON-013

### 卡片压 B-roll 烧入字幕

- **症状**：信息卡与 B-roll 框内底部烧入字幕压字重叠
- **根因**：B-roll 框内底部 10-20% 是烧入字幕区
- **对策**：信息卡放在 B-roll 框外安全区。78% 尺寸 B-roll 框的安全区见 [信息卡定位避坑](#信息卡定位避坑)
- **来源**：LESSON-003

---

## HighlightBox 避坑

详见 [HighlightBox 方案](./components/highlight-box.md)。

### 空框无效

- **症状**：黄色强调框出现但里面没包裹任何文字，脉冲动画像装饰性闪动
- **根因**：框内没有实际文字或目标元素
- **对策**：移除空框。如需强调，框内必须包含文字或精确对齐 B-roll 中的目标元素
- **来源**：LESSON-006

### 浅色 B-roll 上不可见

- **症状**：黄色描边 + 默认 borderWidth=3 在浅色 B-roll 上几乎看不清
- **对策**：浅色 B-roll 上 `borderWidth=5`，配合 `pulseFrame` 让框周期性放大吸引视线
- **来源**：CASE-Segment10 v1 视觉复查

### B-roll 实际布局与规划相反

- **症状**：HighlightBox 框选位置对不上 B-roll 实际目标元素
- **根因**：规划时假设 B-roll 布局，未用 ffmpeg 抽帧确认实际画面
- **对策**：实现前用 `ffmpeg -ss {start} -i {src} -frames:v 1 -q:v 2 output.jpg` 抽帧确认 B-roll 实际布局
- **来源**：CASE-Segment10 v2 视觉复查

### 坐标系混淆

- **症状**：HighlightBox 坐标对不上 B-roll 中的目标元素
- **根因**：HighlightBox 的 `x/y` 是相对父容器坐标，不是全屏坐标
- **对策**：HighlightBox 写在 B-roll 框 div 内部时用相对坐标（`BROLL_W * 0.25`）；写在 B-roll 框外部时用全屏坐标。AnnotationLine 永远用全屏坐标

---

## AnnotationLine 避坑

详见 [AnnotationLine 方案](./components/annotation-line.md)。

### 浅色 B-roll 上不可见

- **症状**：绿色描边 + 默认 strokeWidth=2 在浅色 B-roll 上几乎看不清
- **对策**：浅色 B-roll 上 `strokeWidth=5`
- **来源**：CASE-Segment10 v1 视觉复查

### 坐标系混淆

- **症状**：折线端点对不上 HighlightBox 和观点卡
- **根因**：AnnotationLine 永远用全屏坐标（1920×1080），但 HighlightBox 用相对父容器坐标
- **对策**：端点用全屏坐标计算，HighlightBox 在 B-roll 框内时端点要加 B-roll 框偏移

### 颜色与 HighlightBox 不匹配

- **症状**：HighlightBox 用 yellow，AnnotationLine 默认 green，视觉割裂
- **对策**：AnnotationLine 颜色必须与配对的 HighlightBox 颜色一致

---

## RoundedUIFrame 避坑

详见 [RoundedUIFrame 方案](./components/rounded-ui-frame.md)。

### 跨段延续场景首帧黑场

- **症状**：从前段延续到本段的 B-roll 框，本段首帧框是黑的
- **根因**：默认 `enterDuration=18`，前 18 帧入场过程 opacity 从 0 渐变到 1
- **对策**：跨段延续场景设 `enterDuration={1}`，组件判断 `enterDuration <= 1` 时跳过入场动画

### 末段淡出与 exitStart 冲突

- **症状**：用 exitStart 控制末段淡出时，与段间过渡的 B-roll 末段淡出动画叠加，时序混乱
- **根因**：RoundedUIFrame 的 exitStart 是组件内部退场，段间过渡是外层 div opacity 控制
- **对策**：段间过渡用外层 div opacity 控制，RoundedUIFrame 不传 exitStart

### B-roll 框尺寸不统一

- **症状**：不同段 B-roll 框尺寸不一致，视觉跳跃
- **对策**：全片统一 `BROLL_W = VIDEO_W * 0.82`，BROLL_H 按段需求但保持视觉一致

### variant 与 B-roll 宽高比不匹配

- **症状**：`variant="phone"` 配 16:9 横屏，手机样机被横向拉伸、刘海位置怪异；或 `variant="web"` 配 9:16 竖屏，浏览器顶栏过宽
- **根因**：设备 variant 的装饰（刘海、顶栏）按特定宽高比设计
- **对策**：`phone` 配竖屏（9:16~9:19，如 540×960）；`web`/`document` 配横屏（16:10~16:9，如 1200×750）；`plain` 无限制
- **来源**：2号参考视频扩展（模式 A）

### phone 刘海 / web 顶栏遮挡 B-roll 顶部

- **症状**：B-roll 顶部中央的关键文字/按钮被 phone 刘海盖住，或顶部 6% 被 web 顶栏覆盖
- **根因**：设备装饰层 zIndex=2 悬浮在 children 之上
- **对策**：规划时确认 B-roll 顶部 6% 无关键内容；若有，下移 BROLL_Y 或换 `variant="plain"` + 外部 HighlightBox 框选
- **来源**：2号参考视频扩展（模式 A）

---

## CursorPointer 避坑

详见 [CursorPointer 方案](./components/cursor-pointer.md)。

### 指尖对不齐目标

- **症状**：指针指尖没对准 B-roll 里的目标按钮
- **根因**：`targetX/targetY` 是全屏 1920×1080 坐标，但目标在 B-roll 框内（相对坐标），直接用相对坐标会偏移整个 B-roll 框位置
- **对策**：目标在 B-roll 框内时，全屏坐标 = `BROLL_X + 相对X, BROLL_Y + 相对Y`。规则同 AnnotationLine 坐标系避坑
- **来源**：2号参考视频扩展（模式 A）

### 移动与口播不同步

- **症状**：指针移动早于或晚于口播「点击这里」超过 0.5s，视觉割裂
- **对策**：`moveStartFrame` 与口播操作动词（点击/输入/选择）发音同步，允许 9-15 帧偏差
- **来源**：2号参考视频扩展（模式 A）

### pulse 过多分散注意力

- **症状**：指针停留期间 pulse 3+ 次，圆环不断扩散盖过 B-roll 内容
- **对策**：`pulseCount` 默认 2 已够强调；长停留段（>3s）可设 3，不超过 3。停留结束后用 `disappearFrame` 及时消失
- **来源**：2号参考视频扩展（模式 A）

### 浅色 B-roll 上指针偏小

- **症状**：默认 `size=64` 在浅色 B-roll 上存在感不足
- **对策**：浅色 B-roll 上 `size={80}`，颜色用 `COLORS.orange`（橙在浅底上对比强于黄）
- **来源**：2号参考视频扩展（模式 A）

---

## CircularAvatar 避坑

详见 [CircularAvatar 方案](./components/circular-avatar.md)。

### 视频加速播放

- **症状**：圆形头像里的 A-roll 视频在 5-7s 加速播放（2 倍速），7.5s 后定格
- **根因**：写了 `startFrom={videoFrame}`，导致 2 倍速播放
- **对策**：去掉 `startFrom`，让 OffthreadVideo 默认同步主时间轴
- **来源**：LESSON-010 / PITFALL-003

### 跨段延续场景首帧不可见

- **症状**：从前段 B-roll 延续到本段，本段首帧头像不可见
- **根因**：默认 `appearFrame=0 + enterDuration=18`，前 18 帧入场过程 opacity 从 0 渐变到 1
- **对策**：跨段延续场景设 `appearFrame=-100`（负值），跳过入场动画

### 圆形头像模糊

- **症状**：圆形头像内的视频画面比全屏 A-roll 模糊
- **根因**：未最终定位。可能原因：objectFit: cover 缩放算法、source 视频分辨率不匹配
- **对策**：暂未修复。如遇此问题，可尝试提高 source 视频分辨率或改用更高码率 ffmpeg 重新抽取
- **来源**：Task #23（pending）

### 视频源与段不匹配

- **症状**：头像视频内容与当前段口播不对齐
- **根因**：`videoSrc` 传错了段的 A-roll 源
- **对策**：每段 CircularAvatar 的 `videoSrc` 必须传本段的 `A_ROLL_SEG{N}_SRC`

---

## TextureBackground 避坑

详见 [TextureBackground 方案](./components/texture-background.md)。

### A-roll 全屏缺失暗角

- **症状**：A-roll 全屏画面四角纯亮，与 B-roll 阶段风格割裂
- **根因**：A-roll 视频全屏不透明，盖住了 TextureBackground 的暗角
- **对策**：A-roll 全屏 AbsoluteFill 内部叠加暗角 div，强度 0.80
- **来源**：LESSON-004

### 星星位置帧间闪烁

- **症状**：星星位置每帧变化，像噪点而不是星空
- **根因**：随机数生成器没有固定种子
- **对策**：useMemo 缓存星星位置，LCG 算法 seed=42 固定。组件已实现，不要改成 Math.random()

### vignetteStrength 过强

- **症状**：B-roll 段画面整体偏暗，看不清 B-roll 内容
- **对策**：B-roll 段 `vignetteStrength=0.5`（默认值），A-roll 全屏段额外叠的暗角用 0.80

---

## StepList 避坑

详见 [StepList 方案](./components/step-list.md)。

### 步骤卡激活时序与 B-roll 画面切换不同步

- **症状**：步骤卡弹出时间与 B-roll 画面切换时间相差超过 1 秒，视觉代理判为"严重不同步"
- **根因**：规划时按口播节奏定卡片弹出时间，但 B-roll 视频本身的画面切换时间不同
- **对策**：卡片弹出时间应与 B-roll 画面切换时间对齐，不同步不超过 1 秒。若口播节奏与画面节奏冲突，**优先画面节奏**
- **来源**：LESSON-012

### 多步骤同时激活

- **症状**：步骤①②同时处于激活态，观众不知道当前在哪一步
- **根因**：步骤①没设 `deactiveFrame`，步骤②激活时步骤①仍是激活态
- **对策**：每个步骤必须设 `deactiveFrame`，等于下一步骤的 `activeFrame`

### enterFrame + 10 帧延迟

- **症状**：设 `enterFrame=24`，视觉代理看到卡片在 frame 29 才"出现"
- **对策**：规划"frame X 出现"时，代码 `enterFrame = X - 5`

---

## StepFlowBar 避坑

详见 [StepFlowBar 方案](./components/step-flow-bar.md)。

### 节点数过多溢出

- **症状**：5 个节点 + nodeGap=400 时标签溢出画面
- **对策**：超过 4 个节点改用 StepList，或减小 nodeGap 到 300

### 节点点亮时序与口播不同步

- **症状**：节点点亮时间与口播"第二步"不对齐
- **对策**：activeFrame 应与口播关键词发音同步。允许 0.3-0.5s（9-15 帧）偏差

---

## 构图与信息容器避坑

### 原画有自然留白仍覆盖半屏色层

- **症状**：人物右侧像盖了一块白板，肩膀、墙面纹理和空间光线突然消失，包装层与真人画面割裂。
- **根因**：把“保证文字可读”机械实现为横跨全画面的高透明渐变，并在边缘达到完全不透明，没有先判断原画是否已有可用负空间。
- **对策**：优先直接使用自然留白；确需处理时只在文字局部做低透明柔化或轻微暗化，逐帧检查人物轮廓和环境纹理仍然连续。禁止遮罩在一侧达到不必要的 100% 不透明。
- **来源**：LESSON-038。

### 所有包装文字都被做成圆角卡片

- **症状**：观点、总结、关键词、步骤和 CTA 都变成相似卡片，画面像通用仪表盘，缺少与内容相匹配的视觉语法。
- **根因**：把卡片当成默认设计容器，而不是一种只适合独立对象、证据或多层信息的语义组件。
- **对策**：先在边注、流程轨、定位标签、观点重音、编号、直接排版和证据卡之间选择。简短观点与总结默认不用卡片；已有成熟 B-roll UI 时，包装层优先做页边注释和目标定位。
- **来源**：LESSON-037。

### 卡片文字像第二条字幕

- **症状**：卡片与字幕使用相同字体、接近字号和字重，并各自显示一条完整口语句，观众无法判断信息层级。
- **根因**：只改变了文字容器，没有重新设计文案结构和排版角色。
- **对策**：字幕保留 40–44px 口播原文；卡片或证据对象使用更小字号，并拆为“编号 / 眉题 / 主标题 / 元信息”至少两级。卡片不得复制字幕完整句，标题与说明也不能都使用最高字重。
- **来源**：LESSON-037。

### 逐字字幕被误做成信息卡

- **症状**：每条字幕都出现暖白圆角底板、细边和阴影，随口播频繁闪现，遮住 B-roll 并把转写层误读成证据卡。
- **根因**：只从风格规范读取字幕字号和对比度，没有给字幕层写明“禁止继承卡片容器”的边界；实现时把可读性问题直接交给半透明卡片解决。
- **对策**：字幕层默认裸排；按原画亮暗选近黑/暖白字，以克制字形描边、投影及安全区位置保可读。卡片只用于有独立对象身份且必要的证据/状态信息，不能套给逐字字幕。确需字幕底板时必须有用户明确要求并记录片级例外。
- **来源**：方寸双色风审片修正（2026-09-26）。

### 局部卡片规则被误当成全局默认

- **症状**：每张卡片都出现相同黄色边线、状态色或阴影，即使卡片并非同一语义角色。
- **根因**：从某个具体章节或组件读取了一条局部规则，却没有保留其适用范围，随后把它写进全局令牌或通用组件。
- **对策**：任何颜色、边线和动效规则都必须同时记录“适用对象”。例如双色风的黄色识别边只属于 Skill / 文件 / 证据卡；普通观点、总结和步骤不得继承。共享令牌按 `evidence / status / annotation` 分角色，而不是提供一个万能 `accentEdge`。
- **来源**：LESSON-036。

### 跨段复用同一个卡片固定槽位

- **症状**：不同 B-roll 上的卡片全部固定在右下或底部，持续与字幕、头像和原生 UI 争抢空间，画面上下分层僵硬。
- **根因**：组件位置先于素材构图确定，布局只复用坐标，没有复用语义。
- **对策**：每个代表帧先标注原画视觉重心、负空间、操作区、头像区和字幕区，再选择落点。复用的是栅格与安全区规则，不是一个跨段不变的 `right / bottom` 数值。
- **来源**：LESSON-037。

---

## 信息卡定位避坑

### 卡片压 B-roll 烧入字幕

- **症状**：信息卡与 B-roll 框内底部烧入字幕压字重叠
- **根因**：B-roll 框内底部 10-20% 是烧入字幕区
- **对策**：信息卡放在 B-roll 框外安全区

**78% 尺寸 B-roll 框的安全区**（BROLL_W=1574, BROLL_H=500, BROLL_X=173, BROLL_Y=30）：
- 上：0 - 30（30px 高，太窄，不放卡片）
- 下：530 - 1080（550px 高，主要放卡区）
- 左：0 - 173（173px 宽，放头像 + 标题）
- 右：1747 - 1920（173px 宽，不放卡片）

**78% 尺寸 B-roll 框的安全区**（BROLL_W=1574, BROLL_H=842, BROLL_X=173, BROLL_Y=119）：
- 上：0 - 119（119px 高，放标题）
- 下：961 - 1080（119px 高，放结论卡）
- 左：0 - 173（173px 宽，放头像 + 标题）
- 右：1747 - 1920（173px 宽，不放卡片）

**圆形头像占位**：左下 (60, 731.2) - (328.8, 1000)，卡片避开此区域

- **来源**：LESSON-003

---

## 转场避坑

### 重叠期过长幽灵叠影

- **症状**：frame 150-165 约 15 帧内 A-roll 与 B-roll 同时半透明，形成"双重曝光/幽灵叠影"
- **根因**：A-roll 淡出 + B-roll 滑入同时开始，重叠期 15 帧
- **对策**：A-roll 淡出 10 帧 + B-roll 滑入延后 3 帧开始 18 帧。**重叠期 5-8 帧较自然**
- **来源**：LESSON-009

### 段间硬切

- **症状**：前段 B-roll 末帧画面突然消失，后段 A-roll 首帧全亮出现，视觉跳跃
- **根因**：前段没做末段淡出 + 后段没做头段淡入
- **对策**：前段 B-roll 末段 6 帧淡出 + 后段 A-roll 头段 6 帧淡入。详见 [段间黑场过渡](./transitions/segment-handoff.md)
- **来源**：CASE-Segment6->S7、S11->S12 修复

### 新标题入场早于旧标题退场

- **症状**：旧标题与新标题在切换期有 2-3 帧叠影
- **根因**：新标题入场帧早于旧标题所在阶段完全退出帧
- **对策**：新标题入场帧要晚于旧标题完全退出 + 2 帧缓冲
- **来源**：LESSON-007

详见 [A-roll ↔ B-roll 交叉淡入淡出](./transitions/a-roll-b-roll-cross.md) 和 [段间黑场过渡](./transitions/segment-handoff.md)。

---

## ffmpeg 抽取避坑

### 漏 -c:a aac 导致无声音

- **症状**：渲染出的 MP4 播放时没有声音
- **根因**：ffmpeg 抽取时命令只写了 `-c:v libx264 -crf 18`，没写 `-c:a aac`。ffmpeg 默认不带音频流
- **对策**：ffmpeg 抽取命令模板：
  ```bash
  ffmpeg -y -ss {start_seconds} -i "{source}" -t {duration_seconds} \
    -c:v libx264 -crf 18 -preset slow -vf "scale=1920:1080" \
    -c:a aac -b:a 192k -movflags +faststart \
    "{output}.mp4"
  ```
  关键约束：
  - `-c:a aac -b:a 192k` 必须显式写
  - `-movflags +faststart` 让 moov atom 前置，便于 Remotion 流式读取
  - 抽取后必须用 `ffprobe -select_streams a {file}` 验证有音频流再渲染
  - 抽取的片段起点必须对齐主时间轴起点
- **来源**：PITFALL-004 / 03-remotion-production.md 第 8.1 节

---

## 已有成片片段的替换避坑

### 要替换成片中的一段画面时，不要再回到 Remotion 叠视频层

- **症状**：用户已经提供可直接使用的 7.10 秒成片片段，主片也已经完成，但实现仍回到 Remotion，用 `OffthreadVideo` 在旧画面上再叠一层并重新输出，导致替换结果与已确认片段不一致，排查方向又被误导到路径、缓存或图层顺序。
- **错误做法**：把“剪掉旧片段并插入新片段”的剪辑任务继续当作包装渲染任务；保留旧画面层，再用新视频覆盖；随后凭路径、哈希或静态图层顺序判断替换成功。
- **正确做法**：
  1. 先直接播放用户指定的具体成片文件，确认它就是待插入画面。
  2. 在已完成主片中按准确时间剪掉旧画面段；本例为 `10.20–17.30s`，长度与插入片 `7.10s` 完全一致。
  3. 使用剪辑拼接方式组成“前段 + 新成片片段 + 后段”，而不是把新片作为覆盖层压在旧片之上。
  4. 主片音频独立保留并直接映射，插入片只取画面；若替换前后时长一致，主音轨时间线无需改动。
  5. 导出后抽取片头、片中、片尾以及两个切点进行核对，并用 `ffprobe` 检查最终画面流、主音轨和总时长。
- **术语要求**：这种操作应称为“剪辑替换并导出”，不要误称为重新制作或重新渲染 Remotion 动画。
- **来源**：CASE-004 工作流快闪成片直接替换。

### 审片完成后清理错误输出和一次性截图

- **应删除**：用户已判错的成片、短审片、对应抽帧、联系表和临时对比图；正确但已完成当前审片任务、且没有被文档或项目引用的一次性截图也应删除。
- **应保留**：最新确认成片、仍在等待用户确认的最小审片证据、原始素材、用户确认的插入片、音频、字幕、代码和 `public/` 运行时素材。
- **删除前检查**：确认目标位于当前项目的 `renders/`、`frames/` 或 `contact-sheets/`，并检查 `project.json` 和文档是否仍引用它。若有引用，先更新登记或保留文件。
- **特殊情况**：文件即使位于 `renders/`，只要它被当作用户确认的输入源，就属于素材，不能按错误输出删除。例如 `工作流快闪/renders/成片片段/` 中的确认片段。
- **可再生性**：抽帧和联系表可由保留的成片重新生成；Remotion 成片可由代码和运行素材重新生成；硬剪替换片可由主片基础版、确认插入片和保留的剪辑时间点重新导出。

---

## 动态连线避坑

### 路径、移动点和箭头使用不同公式导致脱节

- **症状**：移动点漂在线条之外；箭头提前出现在终点，而线条尚未绘制到箭头；入口看似正常，中间帧明显穿帮。
- **根因**：SVG 连线使用折线或贝塞尔路径，但移动点另用正弦曲线或线性坐标；箭头固定在最终端点，仅通过透明度入场。三个元素没有共享同一套几何和进度。
- **正确对策**：
  - 一条语义连线只能有一个几何真源。路径、移动点和箭头都由同一组控制点和同一个 `progress` 计算。
  - 贝塞尔路径上的移动点必须使用同一贝塞尔公式求坐标，不能凭感觉另写 `sin()` 轨迹。
  - 箭头必须绑定当前线头移动；或者在线条完整到达后再一次性出现，禁止提前固定在终点等待线条。
  - 入场、中段、到达和退出至少各抽一帧检查，不能只看最终静帧。

### 用删除文字解决穿线属于错误修复

- **症状**：线条不再穿字，但原本承担结论或指向关系的文字也消失，语义被破坏。
- **根因**：把信息冲突当作元素冗余，没有区分“装饰分隔线”和“承担方向关系的动态连接线”。
- **正确对策**：保留原有核心信息，通过重新规划端点、绕线路径、专用连线通道、层级或留白解决。连线必须停在卡片、胶囊或文字安全区边界，不能从文字内部穿过。若用户要求“指向线”，不得擅自改成无方向的静态分隔线。
- **来源**：CASE-004 Skill 卡片、MD 引用线和“方法论已经整理成 Skill”指向线修复。

### 清除旧B-roll字幕后必须恢复本片权威字幕

- 用户指出旧烧入字幕会误导，并明确要求清除时，不能只隐藏本片字幕来避免双字幕，否则当前口播的重要字词也会消失。先保留原素材，另存清字幕运行素材，核对原分辨率ROI和真实显示窗；旧文字清除后恢复当前SRT字幕。
- 旧视频缩回页面、出现浅色圆角或边框时，整块delogo会从白色边界取样拉出灰色块。需要缩小为字形及描边掩膜，避开与图像边框连通的背景，抽查稳定、移位、缩回和切出帧。不得靠缩略图估计ROI或用不透明大块覆盖评论证据。
- 情绪重音优先在同一subtitle层对用户确认的原词做字号、颜色和一次性落稳处理，不复制成第二个相同标题，不添加原话没有的标点或态度文案。句内触发须记录依据，不能把音量波峰包装成强制对齐的词级时间轴。
- 来源：《画布》2026-10-01“不给”修复。

## 临时 AAC 固定延迟

- **症状**：MP4 有音轨且 `start_time=0`，但解码波形与目标主WAV存在固定偏移；仅查流数量无法证明音画同步。
- **检查**：取原主音轨对应的帧/采样区间，使用相关性核首中尾延迟；单声道参照须显式平均左右声道，避免下混增益影响峰值判断。编码、priming及裁切都有可能参与，不能把一个项目的毫秒数写成全局补偿值。
- **对策**：保留画面；丢弃渲染器临时AAC，按帧对应采样区间从唯一主WAV挂载音轨，视频使用 `-c:v copy`。检查视频包hash不变、解码音轨相关性及延迟、唯一音轨和峰值。长片仍先拼纯视频，再只挂一次主音轨。
- **来源**：《GITHUB口播》两段笑点审片，技术证据 `remotion-clone/review/workflow-flash/GITHUB口播/opening-preview-validation.json` 与 `opening-audio-mux.json`。
