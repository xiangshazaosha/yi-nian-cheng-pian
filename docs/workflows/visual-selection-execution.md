# 视觉选段：本地执行入口

仅命名分流已发现 B-roll 且当前需要选段/配画面，或用户明确制作视觉 Vlog 时读取。纯口播不加载本页。方法在[共用选段规则](./visual-selection.md)，命名规则只在[素材入口](./intake.md#先做轻量命名分流)维护。

## 第一版实现边界

- 已实现：命名分流、分批概览抽帧、候选区间加密抽帧、证据批次合并、选段审阅数据检查、SRT 版本绑定与既有 B-roll 计划组装；独立 Vlog 可按已审阅顺序生成保留原声的剪映审片草稿。
- 视觉判断由助手实际看证据、必要动态画面及声音后填写；没有新增自动视频模型、嵌入检索或 API。空白、缺失或过期审阅不会被程序自动补齐。程序只能核对声明和文件一致性，不能证明“看过”或“语义匹配”声明真实。
- 概览间隔与批量大小只是可调整的初值，不是剪辑秒数或瞬间事件完整召回保证。当前为固定帧索引采样，尚未实现自适应事件检测；采样不足必须加密/回看。
- 复用项目已有 FFmpeg/FFprobe 与剪映文件运行时，不下载安装任何参考仓库、模型或服务；原素材只读，没有新建正式成片或控制剪映界面。
- 目前帧索引入口要求可核对的 CFR，发现 VFR/时间映射异常即停止；不承诺处理所有混合帧率。最终口播覆盖继续受既有同帧率、1 倍速与无重叠单层限制。

## 1. 先分类，不加载分析库

```powershell
npm run media:classify -- --input "<素材路径>"
```

这是只读命名扫描，不抽帧/探测内容。`needsVisualSelection=false` 的纯口播返回空 `rulesToLoad`。原 `inspect:input` 增加同一 `mediaRouting`，主视频从口播组选择，不将 B-roll 当作主口播。命名不足但用户明确指定角色时，以用户要求为准，不直接改原文件名；当前自动准备入口尚未支持逐文件角色覆盖，未标记素材会跳过，不能冒称已按指定自动处理。

## 2. 分批准备实际画面证据

先按既有素材登记将实际要处理的源置于项目受控路径，原文件保持不变；此入口使用仓库相对路径，不能借路径穿越或链接读出项目。外部原素材的角色可以只读分类，但不能把机器专属盘符写成通用登记。

```powershell
npm run visual:prepare -- --input "<素材仓库相对路径>" --output "<当前片>/frames/visual-overview-01" --mode broll --interval 10 --batch-size 60 --batch 0
```

视觉 Vlog 改用 `--mode vlog`，不要求字幕。输出目录须全新且父目录已存在；已有审片项目复用当前片，不为分析另建片名项目。

输出 `manifest.json` 记录源摘要、原名线索、时间基准、实际源帧与解码时间、图片摘要；`frames/` 是该批 JPEG；`index.html` 是带标识/时间/文件名的本地浏览页，不自动打开浏览器。清单是内部证据，不是另一套公开剪辑协议。

全局采样计划包含首尾，但尾部可能在后面的批次。根据 `batchCount` 续跑不同 `--batch` 和新输出目录，不能只看首批后称看完。`remainingSamplesOutsideBatch` 是本批之外的计划样本，不表示它们都未在别处处理。程序不替人累计“看完”状态，`visualUnderstandingCompleted`、`dynamicReviewCompleted` 始终保持 false。

无标记 B-roll 时返回 `skipped-no-broll`，在哈希、媒体探测、抽帧和创建目录之前退出。文件名线索带 `nameIsContentProof=false`，不能直接当视觉描述。

## 3. 对候选加密查看

```powershell
npm run visual:refine -- --manifest "<概览目录>/manifest.json" --source v1 --start-frame 300 --end-frame 600 --interval 0.25 --output "<当前片>/frames/visual-refine-01"
```

入出点为原素材帧号，末端排他，不是 JPEG 编号、目标口播时间或毫秒。源摘要变化即拒绝复用；长候选同样可分批。密集帧序列不自动证明声音、完整动作或最终观感；助手须实际查看并回看必要连续区间，没有能力就停在待复核。

需要跨批次/多源审阅时，先将清单的仓库相对路径存成 JSON 数组，再合并：

```powershell
npm run visual:merge -- --manifests "<当前片>/visual-batches.json" --output "<当前片>/frames/visual-merged-01"
```

合并保留原始图片引用、检查源/图片摘要、重编号不同源并去除重叠样本；只允许同一模式，冲突即停。合并后再填写审阅，使用新清单的源/样本编号与摘要，不复用旧编号猜对应关系。合并不代表样本都已被实际查看，更不证明整段动态看过。

## 4. 审阅结果与 SRT 绑定

助手根据真实查看形成内部 `visual-review.json`。字段仅在本页维护，不复制外部模型 schema：

```json
{
  "schemaVersion": 1,
  "manifestSha256": "实际清单字节摘要",
  "preparedSha256": "实际既有 resolve-input.json 字节摘要",
  "subtitleSha256": "准备文件记录的剪后字幕摘要",
  "selections": [{
    "id": "select-01", "sourceId": "v1", "startFrame": 300, "endFrame": 450,
    "evidenceSampleIds": ["v1-f300"],
    "description": "实际观察", "reason": "实际选择理由", "burnedInSubtitles": false,
    "dynamicReview": {"startFrame": 270, "endFrame": 480, "evidence": "实际查看的连续区间与结论"}
  }],
  "placements": [{
    "selectionId": "select-01", "start": 42, "end": 47,
    "cueIds": ["当前剪后SRT编号"], "reason": "与完整语义的对应理由"
  }]
}
```

以上是占位说明，不是可运行的媒体审阅结果，也不表示只看一帧就够。实际源帧、目标秒数、字幕编号和摘要必须来自当前片；未查烧入字幕不能填 false。动态复核区间须包含选段，程序核验声明范围，但不证明声明真实。样本必须来自当前绑定清单与同一源，不能混用旧清单的同名样本。

口播已有确认删除计划且字幕闸门通过后，由既有 `video:prepare` 得到当前 `resolve-input.json`、`captions-edited.srt`；这个准备文件可供剪映复用，不要求选择或连接达芬奇。当前工具只接受既有单口播源协议，多源粗剪不能强塞进来。

## 5. 写候选计划，再走既有草稿执行

本节仅剪辑阶段需要生成审片工程时读取。当前已经在包装阶段时，复用前述证据准备/精看即可，随后走[包装直接选段](./packaging-broll-execution.md#2-仅未处理源走共用选段)；不执行本节或 Vlog 草稿组装。

```powershell
npm run visual:plan -- --manifest "<精看目录>/manifest.json" --review "<当前片>/visual-review.json" --prepared "<原计划目录>/resolve-input.json" --output "<当前片>/visual-candidate-01" --review-only
```

检查源/帧/字幕/计划身份、审阅区间、当前剪后 SRT 窗口、素材长度、帧率与重叠。原计划和已有 B-roll 保留，只向新计划追加合法覆盖；不足时拒绝，不自动变速、延长或循环。

输出仍是既有 `edit_plan.json`，附收据。确认候选后按[剪映分支](./jianying-editing.md)生成审片草稿；正式准备/包装仍须走原字幕闸门，不能用内部声明绕过。

## 6. 纯视觉 Vlog 独立编排与草稿

Vlog 的清单用 `--mode vlog` 准备与合并。审阅文件保留相同 `schemaVersion / manifestSha256 / selections`，不需要口播 `preparedSha256 / subtitleSha256 / placements`，另写 `sequence` 数组：每项为 `{selectionId, reason}`，可选 `sourceStartFrame / sourceEndFrame` 在已审阅选段内部进一步修剪。顺序就是时间线顺序，只有本次确实需要重复才重复引用并写明理由。

```powershell
npm run visual:assemble -- --manifest "<Vlog合并目录>/manifest.json" --review "<当前片>/visual-review.json" --output "<当前片>/vlog-draft-01" --draft-name "<唯一草稿名>" --review-only
```

只接收明确 Vlog 模式、已绑定且带实际动态审阅声明的选段；按源帧范围组装一条连续视频轨并保留各源原声，不强制 ASR、不转成口播覆盖计划。当前只支持同帧率、同尺寸、无需旋转还原的素材，超出条件先显式适配/归一，不自动裁切、变速或改变原文件。

输出真正的剪映草稿目录（`draft_content.json / draft_info.json / draft_meta_info.json`）、回读收据和说明；复用已有窄文件序列化运行时，不打开剪映、不改草稿首页索引、不安装新软件。原素材仅引用，移动后须重链。当前没有新加 BGM、转场、调色、字幕或独立混音，不能称完整精剪；原声中有需呈现的人声时，正式交付仍遵循字幕规则。

## 验证状态

测试入口 `npm run visual:test` 覆盖无 B-roll 早退、命名分组、尾批覆盖、实际 CFR 解码时间、加密采样、批次合并、过期源/字幕/证据阻断、SRT 窗口与源范围限制。另以合成音视频运行“预检 → 证据 → 既有字幕准备 → 候选计划 → 真正剪映文件序列化”，核对双轨、静音、源偏移与目标时间；Vlog 分支直接生成多源连续草稿，核对顺序、总长与保留原声策略，不读取 ASR/SRT。

合成测试仅验证数据/文件链，不证明助手语义选段质量、真实用户素材表现或剪映应用内打开/播放；后续首条实片还须记录命中/漏段、实际选段依据与正常速度看听结果。

2026-10-18 本次核验：视觉/命名测试 30 项、剪映 Node 测试 4 项与 Python 测试 11 项通过；既有流水线 Node 34 项与 Resolve Python 9 项通过；编辑器 97 项测试、编辑器构建与 Remotion 类型检查通过。未新增安装或操作应用界面；这些结果不升级上述实片验收状态。
