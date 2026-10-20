# 03 Remotion 制作与验收

> 阶段三文档。Remotion 代码实现、可复用组件、逐段制作、验收。

本文件维护 Remotion 技术细节；硬约束见根 `AGENTS.md`，风格选择与覆盖边界见[公共规则](./reference-styles/common-rules.md)。涉及具体外观只读目标风格，不继承旧案例默认皮肤。
> 本阶段不做内容规划，规划见 `02-content-planning.md`。

## 加工成片入口（模式 B）

仅进入包装制作时读取本文件。素材识别与自动启动见[素材入口](./workflows/intake.md)；字幕来源与校正见[字幕规则](./workflows/subtitles.md)，不要求预检或校字幕通读本文。

1. 明确片名，按[审片目录规则](../remotion-clone/review/workflow-flash/README.md)建立或复用同名项目；单纯系统文档维护不建审片项目。
2. 进入风格规划前读[公共规则](./reference-styles/common-rules.md)、[风格索引](./reference-styles/README.md)及选定风格；按[内容规划](./02-content-planning.md)做语义分段，再从包装索引选择该风格与共享基础可用的方案。
3. 先完成素材登记、校正字幕和语义规划，制作 5–8 张代表静帧，覆盖钩子、A/B-roll 切换、信息密集段与 CTA；先通过视觉检查再展示。
4. 展示后停在确认闸门，确认前不渲染整片。用户回复“可以 / 行 / 继续 / 按这个做”等肯定语句后直接继续，不重复确认。单纯风格样张不伪造逐字字幕，不代表正式字幕或动态已验收。
5. 除用户明确要求直接批量制作外，先做短开头或代表段；按“逐段实现 → 类型检查 → 分段预览／渲染 → 视觉检查 → 修复”循环。每段只按片名、组件名或故障关键词查设计日志的相近条目。
6. 所有段通过后核对衔接再输出整片，用 ffprobe 核对音视频流。可复用经验追加到设计日志；包装库确有缺项时转[模式 A](./packaging-library/extension-rules.md)。

### 素材与 B-roll 边界

- 口播与 B-roll 默认独立导出、按同一时间线对应，不要求合成一条视频再包装。已剪好 B-roll 仅跳过重复挑选/剪段，对齐核验、黑段、裁切与构图仍按本节执行；未处理源先按[包装衔接](./workflows/packaging-broll.md)选择片段，再回到同一包装流程，不生成剪映工程。

- 素材通过 `staticFile()` 从 `remotion-clone/public/` 读取，不使用 `file://` 或机器绝对路径；视频、音频保持相同固定源偏移。
- 脚本打包／渲染只暂存当前片实际引用的运行素材，不默认复制整个 `public/`；bundle 输出和进程级临时目录放在项目忽略的临时目录中，避免将历史素材重复拷入系统盘。原素材与其他项目缓存不因空间不足而擅自清理；片级 runner 不成为常驻上下文。
- B-roll 整幅黑屏空段视为没有视频，不覆盖口播、不延持前一幅。可裁掉有效录屏外围的纯黑比例边，但须与软件深色界面区分并保留信息主体。
- 用户明确说明黑底代表“没有素材”时，整幅黑段不作为黑色视频展示；有效内容外围／后方同属占位的黑色画布也不作为内容保留，可按镜头裁切到完整有效区域，必要时仅对已确认占位区做透明处理。不得全局抠掉黑色，误删软件深色界面、文字、图标、阴影或内容内部黑色区域；关键控件、烧入字幕与操作边界仍完整保留。
- 裁切使用每个镜头的稳定有效边界，并在变化前后核验；粗采样黑屏检测只是候选，不冒称逐帧通过。扩大 B-roll 的构图优先级见[内容规划](./02-content-planning.md#叙述视角语义图标与证据占比)，风格历史“保留黑底”不得覆盖用户对当前素材占位区的明确声明。
- 字幕与设计文字职责遵循字幕规则；B-roll 自带烧入字幕的区间避免双字幕。重点运镜使用下文 ROI 约束，不在风格或单片方案另维护一套几何规则。
- 无声、定格、倍速、重叠音轨或画面错位时，先查[常见陷阱](./packaging-library/pitfalls.md)并按故障关键词检索设计日志，再改代码；不把整份历史日志作为每段必读。

### 超过 120 秒的分段制作与无损拼接

1. 主视频超过 120 秒时主动建议分段，默认按语义与字幕句边界划分连续帧区间；不得在词中、动作中或转场中硬切。
2. 所有段统一分辨率、fps、编码器、profile、像素格式和时间基。区间必须首尾连续、无重帧也无漏帧。
3. 先逐段完成类型检查、短预览和交界帧检查，再渲染各段。不要用一次整片渲染替代分段排错。
4. 最终使用 concat demuxer 对视频流执行 `-c copy`，禁止使用会触发视频重编码的 concat filter。示例清单每行使用 `file '<仓库相对段文件>'`，并固定顺序。
   - 分段 duration 按实际帧数／fps 明确登记，不只依赖容器中被截短的小数时长；拼接后核查 PTS 步长及交界偏移，避免亚帧累计漂移。
5. 各段临时音轨全部忽略；无损拼接后仅挂载一条主音轨。音频编码与容器兼容时 `-c:a copy`，不兼容时只对主音轨做一次受控转码，视频始终 `-c:v copy`。
6. 用 `ffprobe` 核对最终总帧数、总时长、恰好一个视频流与一个主音频流；每个交界点检查前一帧、交界帧、后一帧及口播连续性。

## 一、Remotion 实现方案

本项目使用 Remotion，不使用 HyperFrames。优先采用：

- **React 组件**：场景结构与内容；
- **CSS / styled-components / Tailwind**：布局、颜色、圆角、阴影、基础动画；
- **CSS clip-path**：几何裁切与揭示动画；
- **CSS mask-image**：渐变羽化；
- **SVG clipPath / mask**：复杂曲线裁切与透明度蒙版；
- **SVG**：流程图、关系图、路径动画、图标；
- **Canvas**：必须逐帧绘制的复杂效果；
- **Remotion `interpolate` / `spring` / `Sequence`**：动画时间线；
- **Lottie（通过 `@remotion/lottie`）**：现成图标动画；
- **JSON**：保存每段文案、时间、组件配置。

动画必须使用 Remotion 的帧驱动机制（`useCurrentFrame`、`interpolate`、`spring`），**不依赖 `setTimeout` / `requestAnimationFrame` 等不可控实时计时**完成最终渲染。

## 二、可复用组件清单

不要为每段重写完全独立的组件。优先通过参数复用已有组件：

- `TitleBlock`（左上大标题）
- `SummaryBlock`（一句话摘要）
- `InfoCard`（信息卡，支持事实/观点/步骤/数字/对比/风险/结论/建议等类型）
- `FactCardGroup`（多张卡片组）
- `ChartPanel`（图表面板）
- `FlowDiagram`（流程图）
- `ScreenshotFrame`（截图或产品界面框）
- `PersonFrame`（人物画面容器）
- `PersonMask`（人物抠像与蒙版）
- `HighlightKeyword`（关键词强调）
- `SectionTransition`（段落转场）
- `MaskReveal`（蒙版揭示）
- `BackgroundLayer`（背景层）

> 字幕实现按当前素材决定：无烧入字幕的区间使用校正版权威时间轴；有烧入字幕的区间避免双字幕并避让原字幕。旧 `SubtitleLayer` 的删除记录不代表所有片都禁止 Remotion 字幕，也不要求使用历史 `CaptionBar` 底板。详见[字幕规则](./workflows/subtitles.md)。

每个组件需要说明：

- 输入参数（props）；
- 是否需要抠像素材；
- 是否需要透明 PNG / SVG / 截图 / 图标；
- 是否需要预先制作 Alpha 通道视频；
- 是否需要真实数据；
- 是否需要单独准备背景素材。

## 三、每段 Remotion 输出

每个信息段最终输出：

- 场景名称、开始时间、持续时间；
- 主构图、内容组件、蒙版、动效；
- 使用的 React 组件、props 配置；
- 是否需要 Canvas / Lottie / SVG；
- 所需素材、是否需要抠像；
- 验收关键帧、制作难度。

## 四、逐段制作流程

不要直接制作整条视频。按以下顺序执行：

1. 复用已归档风格时，只读公共规则、风格索引与选定风格，不重新拆参考视频。只有新风格、现有规则不足或用户明确要求参考分析／复刻时，才按[参考分析](./01-reference-analysis.md)读取相关素材与章节；局部修复不重跑无关阶段；
2. 按[字幕规则](./workflows/subtitles.md)完成时间轴校正，按[内容规划](./02-content-planning.md)完成信息段规划；已有已确认结果只核对当前受影响范围；
3. 新片先完成上文[加工成片入口](#加工成片入口模式-b)的代表静帧视觉检查、展示与用户确认，再选择 10-20 秒代表性信息段；同片已通过的确认不重复询问；
4. 使用 Remotion 制作该段；
5. 检查人物、卡片、图表、蒙版、动画，以及与原视频底部字幕的避让；
6. 修复问题；
7. 确认该段达到目标风格后；
8. 把可复用经验追加到 `04-design-log.md`；确需新增组件或扩展 API 时另走[扩展规则](./packaging-library/extension-rules.md)，不要求每段都新增组件；

### 用户时间码与实际修改边界

> **用户提供的时间码默认视为“审片定位区间”，除非用户明确要求按精确时间切割；实际修改边界必须根据 SRT、画面事件、Sequence 和帧号重新确定。**

执行时先用用户时间码定位问题附近，再交叉核对：字幕句子的真实起止点、画面事件完成点、所属 `Sequence` 的 `from / durationInFrames`、组合 fps 和对应绝对帧号。最终报告同时给出用户定位区间和实际采用的帧边界，避免把口头时间码直接当成剪切命令。

### 字幕时间轴硬性前置

制作／修复字幕及进入包装规划前读取[字幕规则](./workflows/subtitles.md)。该文件统一维护来源、校正证据、未决项、时间换算、裸排与烧入字幕边界；本节保留为既有链接的定位入口。

### 字幕与包装文案分层

文字角色与出现时机见[字幕规则](./workflows/subtitles.md#字幕与包装文字分层)，当前段设计见内容规划，不在这里复制规则。

代表段确认后逐段制作其余部分，最后按连续帧区间合成整片。

## 五、验收检查

每个信息段至少检查以下关键帧：

- 开头关键帧；
- 标题出现后的关键帧；
- 信息卡全部出现后的关键帧；
- 图表完整显示的关键帧；
- 构图切换前后关键帧；
- 蒙版动画中间关键帧；
- 段落结束前关键帧。

检查项：

- 人物是否被错误裁切；
- 蒙版边缘是否异常；
- Remotion 元素是否遮挡原视频底部字幕；
- Remotion 元素之间是否互相遮挡（人物面部/事实卡/关键数字/图表标签/产品界面核心区）；
- 卡片是否越界；
- 图表是否看不清；
- 标题是否过长；
- 信息密度是否过高；
- 动画是否与语音同步；
- 元素退出是否完整；
- 不同帧下渲染是否稳定（拖动时间轴检查）。

每次修改后执行：

1. 语法和项目检查；
2. Remotion 预览（`npx remotion studio`）；
3. 截取关键帧；
4. 视觉检查（按本节检查项与下方视觉结论执行）；
5. 修复问题；
6. 通过后再渲染（`npx remotion render`）。

### 视觉检查范围与结论

- 代码、类型、时间轴或渲染报错直接处理；只有画面质量需要判断时才查看关键帧或短预览，不用整片渲染排错。
- 用当前可用的图像查看能力检查少量代表帧。任务明确要求独立复核且环境允许时，才可委派有明确边界的视觉复核；不依赖 Claude 专用代理名、模型别名或 `.claude/` 配置。
- 结论至少覆盖遮挡、越界、文字可读性、信息密度、动画时机、段间衔接及不同关键帧稳定性；静态检查不能冒充动态验收。

## 六、全片统一规则

完成逐段规划后，输出整条视频的统一规范：

- 主构图模式的使用次数；
- 各类组件的使用频率；
- 人物在左、右、中间和退场状态的比例；
- 蒙版类型和使用频率；
- 标题字号体系；
- 卡片字号体系；
- 颜色变量；
- 圆角、描边和阴影变量；
- 常用动画时长；
- 常用缓动；
- 平均多久发生一次有效视觉变化；
- 哪些章节使用快节奏；
- 哪些章节使用慢节奏；
- 哪些组件不得连续重复出现；
- 如何避免整片看起来像同一个模板反复套用。

## 七、最终输出顺序（全片）

1. srt 读取结果；
2. 口播分段目录；
3. 每段核心传播目标；
4. 每段完整包装组合；
5. 每段画面时间轴；
6. 全片主构图变化路线；
7. 全片组件复用表；
8. 全片蒙版和视觉处理规则；
9. 全片动效与转场规则；
10. Remotion 组件清单；
11. 所需素材清单；
12. 不建议照搬的参考视频元素。

在分析与规划完成之前，不要直接生成或渲染整条成片。

## 八、Remotion 视频组件使用约束（强制，违反会导致无声/音轨重叠/人物加速定格）

> 本节由 CASE-002 第 1 段制作时踩坑总结。具体案例细节见 `04-design-log.md` PITFALL-002~004、LESSON-010~011。本节只列通用规则。

### 8.1 ffmpeg 抽取视频片段命令模板

抽取 A-roll / B-roll 物理片段时，源有音轨就必须保留视频和音频；原生无声的 B-roll 如实登记，不伪造音轨：

```bash
ffmpeg -y -ss {start_seconds} -i "{source}" -t {duration_seconds} \
  -c:v libx264 -crf 18 -preset slow -vf "scale=1920:1080" \
  -c:a aac -b:a 192k -movflags +faststart \
  "{output}.mp4"
```

关键约束：
- `-c:a aac -b:a 192k` 必须显式写，ffmpeg 默认可能不带音频流
- `-movflags +faststart` 让 moov atom 前置，便于 Remotion 流式读取
- 抽取后必须用 `ffprobe -select_streams a {file}` 验证源音轨未丢失再渲染；源本来无音轨的 B-roll 可声明无声，口播音轨仍必须存在。
- 抽取的片段起点必须对齐主时间轴起点（如 B-roll 5-15s 抽出来后，物理第 0 帧 = 主时间轴第 150 帧）

### 8.2 OffthreadVideo 使用规则

**规则 1：所有 OffthreadVideo 必须显式 `muted`，音轨由独立 `<Audio>` 组件采集**

```jsx
// ✅ 正确
import { Audio, OffthreadVideo } from 'remotion';
<OffthreadVideo src={videoSrc} muted style={...} />
<Audio src={videoSrc} />  {/* 唯一的音轨来源 */}

// ❌ 错误：OffthreadVideo 默认 muted={false}，多个同时渲染会音轨重叠
<OffthreadVideo src={videoSrc} />
<OffthreadVideo src={videoSrc} />  {/* 第二条音轨叠加 */}
```

原因：OffthreadVideo 默认 `muted={false}` 会采集音轨。同一视频源被多个组件引用（如全屏 + 圆形头像）时，N 个 OffthreadVideo 叠加 N 条音轨，声音混乱重复。

**规则 2：禁止手动 `startFrom={frame}` 或 `startFrom={frame - offset}`**

```jsx
// ❌ 错误：会导致视频 2 倍速播放，播完定格
const videoFrame = frame - startFrame;
<OffthreadVideo src={videoSrc} startFrom={videoFrame} />

// ✅ 正确：默认 startFrom=0，主时间轴 frame N 自动提取视频第 N 帧
<OffthreadVideo src={videoSrc} />
```

原因：OffthreadVideo 提取帧公式 = `(N - sequenceFrom) + startFrom`。没有 Sequence 包裹时 sequenceFrom=0，若再设 `startFrom={frame}`，提取帧 = `N + N = 2N`，视频帧推进速度变成主时间轴的 2 倍，导致加速播放、播完定格。

**规则 3：B-roll 物理片段已对齐主时间轴时，用 `<Sequence>` 包裹而非 `startFrom`**

```jsx
// ✅ 正确：Sequence 把内部时间轴 0 平移到主时间轴 from，视频从物理第 0 帧正常播放
<Sequence from={150} durationInFrames={300} layout="none">
  <OffthreadVideo src={bRollSrc} muted style={...} />
</Sequence>

// ❌ 错误：物理片段只有 300 帧，startFrom={150} 会跳到物理第 150 帧（原片第 10s）错位
<OffthreadVideo src={bRollSrc} startFrom={150} />
```

原因：`startFrom` 是"视频内部的起始偏移"，不是"主时间轴到视频时间的映射"。物理片段已用 ffmpeg 对齐主时间轴起点后，`startFrom` 必须保持 0，由 Sequence 负责主时间轴偏移。

### 8.2.1 B-roll 重点位置运镜：用 ROI 反算，不用单点目测

B-roll、软件录屏或网页录屏需要推近某个重点控件时，必须先在**原始分辨率**登记完整重点区域 `ROI(x, y, width, height)`。ROI 要覆盖观众理解该操作所需的完整语义对象，例如“字段标签 + 输入框起点 + 输入值 + 必要说明”，不能只登记文字中心点。

实施步骤：

1. 登记源画面尺寸、容器尺寸和原图像素 ROI；缩略图或联系表只用于找候选区域，不能作为几何真源。
2. 在容器内定义安全区，排除字幕、头像、标题、圆角裁切和边框内缩。
3. 将 ROI 从源坐标映射到容器坐标，按安全区宽高反算最大倍率，再由 ROI 与安全区中心反算 `left/top`；禁止“先随意放大，再凭单点居中”。
4. 长输入框、列表或表格默认保留左侧标签、输入起点和实际值；若业务语义依赖右侧状态，也必须扩大 ROI，不能通过裁掉语义来获得更大倍率。
5. 缩放、横移、纵移使用同一动画进度，避免推进过程中焦点漂移。
6. 分段验收必须覆盖入口、中段、到位、停留、退出五类关键帧；任一帧 ROI 越界、被遮挡、落入圆角裁切或不可读，都视为未通过，不得进入整片渲染。

推荐在代码中保留 `source / card / roi / safe / finalScale / finalLeft / finalTop` 等具名参数，使审片意见可以直接追溯到几何依据。

### 8.3 音轨采集规则

每段只能有一个 `<Audio>` 组件采集音轨，通常与 A-roll 同源：

```jsx
<AbsoluteFill>
  <Audio src={A_ROLL_SRC} />  {/* 主播口播贯穿整段 */}
  {/* 其他视觉元素... */}
</AbsoluteFill>
```

如果某段需要多音轨混合（如 B-roll 自带音效 + A-roll 口播），用 `<Series>` 或 `<Sequence>` 控制各音轨的起止帧，避免全程叠加。

### 8.4 审片登记与输出

建项目或执行 `render:review` 前读取[审片与交付目录规则](../remotion-clone/review/workflow-flash/README.md)：显式指定片名与 Composition，审片与正式交付分离。该入口维护目录、登记、命名、多风格与覆盖规则，本节不复制。

成片完成不自动生成发布资料；只有用户明确请求才进入[发布资料规则](./delivery-copy-and-tags.md)。

### 当前渲染入口

公开版不分发历史 FullVideo 快捷入口。使用 render:review 显式选择当前片 Composition；PublicSmoke 仅为技术演示。

每次 `npx remotion render` 完成后，必须执行：

1. **验证音轨存在**：
   ```bash
   ffprobe -v error -select_streams a -show_entries stream=codec_name {output}.mp4
   ```
   输出为空 = 无音轨，回查 8.1 的 ffmpeg 抽取命令和 8.2 的 muted 配置。

2. **动态复查从渲染 MP4 抽帧，不用 `npx remotion still`**：
   ```bash
   ffmpeg -y -i {output}.mp4 -vf "select='eq(n\,30)+eq(n\,150)+eq(n\,300)'" -fps_mode vfr /tmp/check_%d.png
   ```
   原因：`remotion still` 单帧渲染时 OffthreadVideo 有已知 bug，总是取视频第一帧，导致静态截图人物姿势不变。但从渲染输出的 MP4 抽帧能反映真实播放状态。视觉代理复查动态效果时，必须从 MP4 抽帧而非用 still 命令。

3. **音轨重复/混乱时排查**：grep 代码里所有 `<OffthreadVideo`，确认每个都有 `muted` 属性；确认 `<Audio>` 组件只有一个。

### 8.5 违反约束的典型症状速查

| 症状 | 根因 | 检查项 |
| --- | --- | --- |
| 渲染输出无声音 | ffmpeg 抽取漏音频流 / 没加 `<Audio>` | `ffprobe -select_streams a` 验证源文件 + 检查代码有无 `<Audio>` |
| 声音重复/混乱 | 多个 OffthreadVideo 都没 muted | grep 所有 `<OffthreadVideo` 必须有 `muted` |
| 圆形头像/分屏视频加速播放 | `startFrom={frame}` 导致 2 倍速 | grep `startFrom={` 必须是常量或 0，不能是 frame |
| 视频播完定格 | 加速播完后到达视频末尾 | 同上，修复 startFrom |
| `remotion still` 截图人物静止 | Remotion still 命令对 OffthreadVideo 的已知 bug | 改用从渲染 MP4 抽帧复查 |
