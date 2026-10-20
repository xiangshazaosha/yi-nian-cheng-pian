# 剪辑数据协议 v1

> 历史协议，仅供已有 v1 项目及旧工具读取。当前新增流水线使用[最小协议](./editing-contract.md)，不扩展本协议，不将旧工具当作新格式执行器。

仅在已有 v1 剪辑项目、维护旧协议或准备旧格式交接数据时读取。阶段判定统一按[素材入口](./intake.md)；已剪视频的包装请求不强制创建本协议，也不加载达芬奇说明。

本阶段完成数据约定、校验、字幕重映射及数据交接；不执行媒体剪切，不控制达芬奇，不自动向 Remotion 导入。可执行字段校验以 `scripts/editing/contract.cjs` 的 `validatePlan()` 为准；不要在技能、风格或单片脚本维护另一套 schema。

## 文件与身份

继续使用同片名审片项目，在其根层保存 `edit-plan.json`。先通过已有 `review:project` 建立／定位同名项目；协议不另建日期或轮次目录，不修改现有 `project.json` schema。所有登记路径是 UTF-8、使用 `/` 的仓库相对路径；外部源文件先按项目素材规则登记到仓库内，不把机器路径写进协议。

`revision` 标识本次剪辑计划，实质改动应更新它。生成资料绑定 `title + revision + planSha256`；计划哈希由解析后完整对象的 `JSON.stringify()` 结果生成（不是原始文件字节哈希）。媒体、字幕和交接数据必须属于同一计划，不凭文件名判断同步。哈希不等于用户批准或实际媒体验收。

## 计划字段

顶层只允许以下字段，字段拼错、未知字段、隐式倍速都报错。

| 字段 | 约定 |
| --- | --- |
| `schemaVersion` | 当前为 `1` |
| `title` / `revision` | 片名与非空计划身份；片名与审片目录一致 |
| `intent` | `packaging`、`editing-only` 或 `editing-then-packaging`；根据素材入口语义判定填写，不从目录名猜授权 |
| `fps` | `{num, den}` 正整数有理帧率，例如 `30000/1001`，不使用四舍五入后的 `29.97` 作为几何真源 |
| `totalFrames` | 剪辑后口播主时间轴的总帧数 |
| `sources` | 素材索引，稳定 ID、一文件一身份、相对路径和媒体元数据 |
| `subtitles` | 各口播源的原字幕、校正版、校正记录、校正版字节 SHA-256 和未决数量 |
| `clips` | 保留／重排后的口播段，每段带固定源区间、目标起点、保留理由及唯一主口播音源 |
| `removedRanges` | 删除的口播源区间、理由和音频／审片依据 |
| `broll` | B-roll 源区间、目标位置、语义理由、烧入字幕状态、可选原分辨率 ROI |
| `review` | `{status: "pending"}`，或 `{status: "approved", evidence: "实际确认依据"}`；数据声明不代替媒体验收 |

### 素材索引

- 视频：`{id, path, kind: "video", role: "a-roll" | "b-roll", fps, durationFrames, width, height, hasAudio}`。
- 独立人声：`{id, path, kind: "audio", role: "voice", sampleRate, durationSamples}`。时长用采样数登记，不把音频采样率冒充视频帧率。
- 校验器检查元数据的关系、文件存在和路径边界；**不证明元数据与真实媒体一致**。素材预检与后续媒体回读仍需核验帧率、实际帧数、流、黑屏及同步证据。

### 权威字幕索引

`{sourceId, originalPath, correctedPath, correctionLogPath, correctedSha256, unresolvedCount}`。原件与校正版不得是同一路径；每个实际使用的口播源都必须有字幕绑定。校正依据沿用[字幕规则](./subtitles.md)，协议不改写原句。

v1 自动重映射只接受明确编码的 UTF-8／UTF-8 BOM SRT。已有 VTT、ASS 或时码 JSON 仍是有效权威输入，但须先保留原件、显式转换并核验后再交给工具；遇到 GB18030 等编码不能误判损坏或猜改文字。工具拒绝不合法编码、重复编号、时间异常或重叠条目。

### 口播段与删除决定

口播段：`{id, sourceId, inFrame, outFrame, atFrame, reason, audio}`。

- 所有帧区间为 **`[start, end)`，含起点、不含终点**；持续帧数为 `outFrame - inFrame`。
- 源到目标的固定换算为 `targetFrame = sourceFrame - inFrame + atFrame`。重排通过目标位置表达，不改变源偏移，也不使用随当前帧变化的 offset。
- 口播目标时间轴从 0 开始，首尾连续、无重帧／漏帧／空隙；最后一段终点等于 `totalFrames`。
- 删除决定：`{sourceId, inFrame, outFrame, reason, evidence}`。对实际使用的口播源，每个源帧须被保留或有明确删除决定；删除不能与保留区间重叠。重复使用保留素材可表达，但每次均须有保留理由，不静默把重复句当作误识别删掉。
- 用户时间码仍只是定位；区间填写前核对真实句边界、画面事件和帧号，不把口头时间码直接变成删除清单。

音频绑定二选一：

- 同源内嵌音频：`{kind: "embedded"}`，继承同一视频源的固定区间；源必须有音轨。
- 独立音频：`{kind: "external", sourceId, inSample, alignmentEvidence}`，明确对应段的采样起点与对齐依据。工具按目标持续时间核验可用采样数，不自动猜测全局偏移或混合第二条人声。

### B-roll

`{id, sourceId, inFrame, outFrame, atFrame, reason, audio: "muted", burnedInSubtitles, roi?}`。

- v1 只支持一个无重叠的 B-roll 编排层，保留口播主音轨；需要 B-roll 原声或额外音效时明确报告不支持，不静默混音。
- `burnedInSubtitles` 必须明确。交接记录对应的字幕隐藏区间，但不从权威口播 SRT 删除这些句子；真正的显示联动在第 4 步实现。
- 可选 ROI 为原始像素 `{x, y, width, height}`，整个区域不得超出源画面。校验通过不代表运镜安全；动态安全区、缩放上限及关键帧仍按 Remotion 制作规范验收。
- v1 要求使用的视频与目标时间轴帧率相同，不支持自动变速、混合帧率换算、转场重叠或可变帧率解释；先明确转换和对齐，不能强行凑帧数。

## 工具与生成资料

在项目根运行，计划路径必须是同片审片项目的稳定入口：

```powershell
# 只读检查：计划、引用文件、字幕哈希与切点映射
npm run edit:validate -- "remotion-clone/review/workflow-flash/<片名>/edit-plan.json"
# 检查通过后生成数据交接，不剪视频、不操作软件
npm run edit:prepare -- "remotion-clone/review/workflow-flash/<片名>/edit-plan.json"
# 独立数据工具测试，不使用真实视频
npm run edit:test
```

生成文件直接放在同片项目根层，属于制作登记数据，不进入正式交付包：

| 文件 | 内容 |
| --- | --- |
| `editing-map.json` | 每段源／目标帧映射、音源绑定、删除决定、B-roll 位置与烧入字幕隐藏窗 |
| `captions-edited.srt` | 按剪辑后时间轴重映射的字幕，原文及换行保留 |
| `subtitle-remap-report.json` | 原件／校正版哈希、逐句映射、整句删除记录与生成字幕哈希 |
| `editing-handoff.json` | 小型交接索引、计划身份、阶段、确认声明与验收边界，不装入完整素材日志或字幕正文 |

工具不覆盖已有文件，不修改源视频／音频／原字幕／校正版／计划或现有项目登记。遇到已有派生资料，先核对引用与身份；不得为重跑工具盲删旧证据。写入失败只回滚本次新建的文件，不删除其他文件。

## 字幕剪切边界与验收

- 每段独立映射；相邻且源、目标均连续的段合并计算，因此单纯分段不会人为截断句子。
- 整句完全删除时随源区间删除并记录；整句保留时仅换算时间，毫秒由精确有理帧率计算后舍入。
- 切点穿过一句、重排拆散一句、源时间超界、未决校正或映射时间冲突时，报未决并停止生成交接文件，不复制半句／全文充当被裁掉的文字。先核对音频，修订有证据的权威时间轴及校正记录后再运行。
- `edit:validate` 通过仅表示**数据可用**，不是成片或媒体验收。当前交接始终为 `phase: "data-prepared"`、`mediaValidated: false`、`readyForPackaging: false`；实际剪辑回读与包装联动仍待第 3、4 步。

字段用例与合成测试数据见 `scripts/editing/contract.test.cjs`；测试素材不存在于正式工程，不能把它当作真实剪辑计划或验收证据。
