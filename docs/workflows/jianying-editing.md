# 剪映草稿：按本机已选路线执行

本页负责剪辑、草稿导出及交接。按当前已选且可用的语音链执行：本地 ASR 走后面的本地生成分支；Desktop 则登记／转写 → Script 剪辑 → 原生导出。已有选择沿用，不在两边重复剪辑，不为普通剪辑预读部署说明。工具与范围仍按[素材入口](./intake.md)，判断和完成度见[粗剪规则](./rough-cut-defaults.md)，不重剪已完成的回流片。

操作者均为当前外部 Agent。只有 Desktop 分支使用本地 MCP，不要求用户在其内部再选 Agent／模型；连接和职责见[Desktop 接入](./chatcut-asr.md#执行通道与-agent-职责)。本地分支不要求安装 Desktop。

## 当前默认执行链

保留原锚点供旧链接使用；以下仅为 **Desktop 已选分支** 的执行链，本地路线直接跳到本地分支。

### 1. 核对工程与原始备份

连接、源身份、完整词级时间与字幕接收见[Desktop 转写](./chatcut-asr.md)，只使用本次 schema。先匹配当前工程与源文件，已有正确剪辑不能先清空。实际删改前保存只读 Script／时间线快照、完整源顺序备份和源指纹；用 `manage_timelines` 的当前 schema 管理备份，不猜 action。不得覆盖用户已有编辑。

- 新建／切换后读回 `read_project` 和必要的 `preview_timeline`，以**实际返回的时间线 fps**换算位置与时长，不把 `create_project` 请求的 fps 当成已生效；源素材的 `30000/1001` 与时间线的 `30` 分别记录。用户明确要求的设置未生效时先排查，不谎报设置成功。
- 原始顺序备份保留完整源段，优先使用工具的完整剩余源长度并回读；手工换算必须用实际时间线 fps、检查源尾越界与末帧取整。对备份轨使用当前工具支持的锁定保护，不把小于一帧的不可表示尾差写成完整听审；不为迁就错误换算重剪原素材。
- 备份时间线默认保存在 Desktop 工程中。原生导出覆盖哪些时间线以本次 schema／实际草稿为准，不能把“Desktop 有原始备份”说成“剪映草稿一定自带备份时间线”。

### 2. 用 Script 决定内容

- `read_script` 返回本次真实 `timeline.md` 与只读 `library` 路径，或返回内联内容。保存修改前快照；不猜缓存目录，不改原始 library。
- AI 阅读当前片完整原始表达，按去重留末次完整段落、去失败起句与卡词、保留独有信息和用户语气词的规则，修改当前可编辑 Script；不是按词表机械删除。
- `apply_script preview:true` 先检查计划差异、源引用和保留表达，再执行正式 `apply_script`。使用当次稳定引用，不把正文改写当作原声剪辑，不拼造半句。读回真实时间线及分页结果。
- Script 决策来自本次 AI，切割落实在 Desktop 工程。不要另写本地帧列表重剪同一工程。

### 3. 处理停顿

当前 schema 下明确传参：

```json
{"only":"silence","silence":"compress:200"}
```

通过 `clean_script` 只将超过200ms的可确认停顿压缩到约200ms，等于或短于200ms的不剪、不加长；不运行默认250ms，也不执行通用 fillers 批量删除，原声不变速。实际保留量与帧量化、字头字尾保护要检查。工具是针对现有时间线的增量处理，不能把其统计再次从已读回总时长扣减；不为小数量化误差循环清理。疑点保留原声，不以整项跳过代替停顿处理。修改默认值不自动重做旧稿，恢复旧目标的规则见[粗剪规则](./rough-cut-defaults.md)。

内容去重、停顿和切点技术核验按[交付闸门](./rough-cut-defaults.md#能力检查与交付闸门)区分核心未做与仅未听审。符合可编辑粗剪草稿条件就继续下一步原生导出，不以“没有听审接口”停在内部候选，也不追加一次导出确认。取消染色、标签、时间线注释，不调用标记工具作替代。

### 4. 原生导出剪映草稿

按本次 `local_export` schema 调用：

```json
{"format":"jianying","product":"jianying","includeMotionGraphics":false}
```

该格式由 Desktop 自带导出器将当前时间线转成可编辑工程，并复制所需媒体；不是先渲染单条MP4，也不是本项目 Python 序列化器。它写入剪映实际草稿目录，返回的 `outputPath` 是草稿文件夹，不接受自定目标目录；项目须在 Desktop 中实际打开。完成弹窗由用户接手，不自动启动／操作剪映。导出名字冲突按原生工具返回处理，绝不覆盖用户已有草稿。包装动效不属于粗剪，默认不导出付费动态图形。

### 5. 回读与交接

原生导出后核验实际工程、全部源区间／目标位置、正常速度、原声和复制媒体的完整文件哈希。以真实时间线帧率和原素材帧率分别换算，记录整数取整误差，不将NTSC与30fps混为一谈。若应用改写为非明文格式，不解密、不用旧副本覆盖用户修改；报告可读证据的范围。

导出、文件核验、应用打开／播放听审分开登记，不能互相冒充。同片登记沿用唯一 `project.json`／执行回执，先读[审片目录规则](../../remotion-clone/review/workflow-flash/README.md)。文件核验通过后告知实际草稿名、时长和原生完成弹窗的接管方式；未听审只如实说明，不把文件草稿称为最终成片。交付草稿后等待用户人工复核及定剪导出，不自动进入包装；回流按[锁定交接](./video-editing.md#4-接回既有-remotion-包装)核验。

## 可选：本地 ASR 与本地草稿生成

本机已选本地处理时进入，包含新机优先评估并验收的本地路线，不重复要求用户另选生成器；不作为 Desktop 故障盲回退。[本地适配](./local-whisper-asr.md)输出原素材微秒文字片段，复用 `rough_cut.py` 停顿目标和源帧保护，AI 仍负责语义选择。不得凭句级 SRT 硬切或均分 token。使用内部帧列表或单源 `edit_plan.json`，不另造公开协议；缺依赖接回[安装包](./jianying-setup.md)。

单源文件生成仅为无字幕可编辑审片草稿，显式 `--review-only`：

```powershell
node video_editing/jianying_adapter.cjs --plan "remotion-clone/review/workflow-flash/<片名>/edit_plan.json" --name "<原视频完整文件名>" --output "remotion-clone/review/workflow-flash/<片名>/jianying-review" --draft-name "<唯一草稿名>" --review-only
```

本地生成器保留完整媒体引用、原声、原速与原始备份；两份明文 JSON 镜像一致。需要首页登记才用 `jianying_install.py`，**只在剪映关闭时**执行、不强关，冲突即停、先备份索引、原子写入后回读。Desktop 原生导出已经登记时，不再运行它重复安装。

```powershell
python video_editing/jianying_install.py --draft "<仓库内新草稿文件夹>" --draft-root "<剪映实际草稿目录>" --index "<剪映实际root_meta_info.json>"
```

维护本地执行器才运行 `node --test video_editing/jianying.test.cjs` 与 `python -m unittest discover -s video_editing -p test_jianying.py`；日常剪辑不重跑安装或合成测试。历史灯塔零保留稿不因未来默认变化被重做；达芬奇及旧工程保留。
