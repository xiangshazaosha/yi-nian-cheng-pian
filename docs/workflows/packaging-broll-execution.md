# 包装 B-roll 衔接执行

按[包装复用规则](./packaging-broll.md)先确定“已对齐分轨/已选段/未处理原素材”，仅当前操作才读相关步骤。不为已剪好的独立 B-roll 加载剪映工程、Vlog 编排或源 ASR 的规则。

## 1. 轻量分流与已对齐分轨登记

以既有定剪交接的 `packaging-input.json` 绑定当前口播视频及权威字幕。已有片级记录时复用，不要求用户重新回答已确认的导出方式。

```powershell
npm run packaging:broll -- route --packaging "<当前片>/packaging-input.json" --state "<当前片>/packaging-broll-state.json" --input "<本次Broll目录>"
```

`state`、`input` 可按实际情况省略。没有新增未处理源时 `rulesToLoad` 为空；程序只核对文件身份和已有状态，不导入视觉选段实现。已有的独立 B-roll 继续进入原包装流程，不是跳过裁切/黑段/ROI 检查。

确认分轨导出映射后可登记：

```powershell
npm run packaging:broll -- align --packaging "<当前片>/packaging-input.json" --source "<独立Broll导出文件>" --id broll-aligned-01 --timeline-start-frame 0 --source-offset-frame 0 --duration-frames <核验帧数> --alignment-evidence "实际共同时间原点、首中尾/事件对齐证据" --output "<当前片>/packaging-broll-state.json"
```

源路径为仓库相对路径。原点和时长必须来自当前实际导出，不按示例默认猜；`--state` 可追加到已有状态，再写全新输出。代码核验范围和同帧率，不独立证明对齐声明真实。这个步骤不删黑段、不重切、不重选，B-roll 空白的时间位置保留。

状态文件是内部包装素材衔接记录，绑定当前视频/字幕摘要，分别保留 `alignedTracks`、`selections` 和当前需求已处理的 `processedSources`；不覆盖项目登记、原剪辑协议或原字幕规则。目标变更会阻断旧位置复用，源变化只需重查受影响项。

## 2. 仅未处理源走共用选段

先按[共用执行](./visual-selection-execution.md)第 2、3 步和必要的批次合并准备证据；不要执行 `visual:plan` / `visual:assemble`。助手真实看画面并按当前定剪字幕建立需求，缺少动态核对时保持待复核。

沿用内部 `visual-review.json` 的 `schemaVersion / manifestSha256 / selections / placements`：

- 用 `packagingSha256` 绑定当前 `packaging-input.json` 的字节摘要，`subtitleSha256` 绑定其权威字幕；不用旧源口播 `preparedSha256`。
- `selections` 仍包含真实观察、源帧区间、烧入字幕核查、样本编号与动态核查声明；`placements` 的 `start/end` 是当前定剪时间轴的秒数，`cueIds/reason` 对应当前完整语义。
- 只为新增/缺失需求写新选段；已有有效分轨和选段不要再次作为待选原素材分析。不要让 `processedSources` 成为文件永久“看完/无用”的标签。

```powershell
npm run packaging:broll -- select --packaging "<当前片>/packaging-input.json" --manifest "<证据目录>/manifest.json" --review "<当前片>/visual-review.json" --output "<当前片>/packaging-broll-state-02.json"
```

有原状态时加 `--state` 保留分轨和已选片段；新片段检查当前 SRT、源范围、帧率与相互重叠，不延长或重剪口播。若新增选段位于已有分轨的覆盖时间内，包装时须查明该处确为空段或明确更换，不能盲叠两份画面。

## 3. 给原包装流程提供运行素材

```powershell
npm run packaging:broll -- materialize --packaging "<当前片>/packaging-input.json" --state "<当前片>/packaging-broll-state-02.json" --output "remotion-clone/public/<当前片>/broll-assets-01"
```

输出目录须全新、父目录已存在：

- `alignedTracks`：已对齐分轨直接引用；不在 public 时仅按字节复制，不重新编码或删除时间线黑段。
- `clips`：已存在且完整可用的 public 短片直接复用；否则只抽取已审阅区间，输出物理片段和 `packaging-broll.json`。保留原尺寸、源有音轨则保留，原生无声不伪造音轨。
- 分轨的 `from / sourceOffsetFrames / durationInFrames` 保留其时间映射；新物理短片的固定源偏移为 0，由原包装中的 Sequence 放到 `from`。两个情况不能混用偏移。

当前抽取入口只接受已核对的 CFR/同帧率、无须旋转还原的源；需要重编码的 HDR/高位深素材先明确保色策略，不默认降位深。没有新几何裁切、变速、配乐或合成器：包装助手消费素材清单，把素材放进当前片已有包装源码，按原有黑段、裁切、ROI、字幕、声音规则处理。程序不会自动把整条含黑段的分轨盖到口播上，也不会自动修改 Composition。

整个包装分支不生成剪映 JSON/工程、不连接达芬奇、不重做 ASR。输出不授权全片渲染，仍需原代表静帧与实片看听闸门。

## 验证范围

`npm run packaging:broll:test` 验证无 B-roll/已对齐不加载选段实现、分轨按字节复用且仍需包装处理、当前定剪字幕直接选段、旧目标/旧源阻断、合成媒体真实抽片、长度与音轨检查、已选短片不重复编码。它不证明真实素材语义、黑段位置、裁切或应用效果通过，必须在当前片正常验收。
