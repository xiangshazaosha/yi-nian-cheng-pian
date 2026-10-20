# Resolve 可编辑执行

本节仅在用户已选择达芬奇或维护该执行器时读取；默认剪辑直接走[剪映文件执行分支](./jianying-editing.md)，不以本节为前置。先按[素材入口](./intake.md#剪辑与调色工具选择)完成调色相关需求的推荐与选择；本节现有实现和证据主要覆盖剪辑技术验证，不代表自动调色已实现。实际调色另行核查可用能力与当前素材，不能以 DRP／剪点回读代替色彩画面验收。Resolve 免费版方案、脚本与历史工程保留，不默认继续 UI 操作或购买 Studio。

复用同片审片项目，[建立／登记规则](../../remotion-clone/review/workflow-flash/README.md)照旧。计划存放项目根层 `edit_plan.json`，不要按执行轮次新建片名项目。

```powershell
npm run video:prepare -- --plan "remotion-clone/review/workflow-flash/<片名>/edit_plan.json" --name "<原视频完整文件名>"
python video_editing/resolve_adapter.py probe
python video_editing/resolve_adapter.py execute --prepared "remotion-clone/review/workflow-flash/<片名>/resolve-input.json" --project "<唯一达芬奇工程名>"
```

`video:prepare` 从实际媒体元数据生成内部 `resolve-input.json` 与 `captions-edited.srt`，检查源／字幕哈希和切穿字幕；只是数据准备，不说明真实剪辑已完成。所有新建文件拒绝静默覆盖；重做前核对现有引用、归档依据，不能盲删旧产物。

执行器只调用官方 Python API，建立新工程、导入完整源、保留 `01-original` 时间线并生成 `02-ai-edit`。口播为链接的 V1/A1，B-roll 为静音 V2；原片完整保留，人工可重新拉回内容，不声称脚本操作必然支持 Ctrl+Z。逐片段及整轨回读实际位置、长度、源偏移，保存工程并导出 `resolve-project.drp` 与执行记录。

**当前需实际安装版本核验的边界**：外部脚本可用性／版本类型，API 源起止帧约定、字幕轨导入能力、真实音画与编码支持。SRT 目前作为侧车交付，执行器不冒称已将它导入可编辑字幕轨。免费版若不支持外部控制，可在官方 Console／脚本菜单使用该函数；未实测前不得把此路径标为自动化完成。执行失败保留新建工程供排查，不删除或覆盖用户现有工程。

## 执行前的版本与能力核查

先核对当前版本与实际可用API通道；当前已有记录仅证明内部Lua做过短片技术测试，不能据此声称外部Python或调色已接通。`AppendToTimeline.endFrame` 在已测21.1.1.10为排他末端，其他版本须回读验证，不机械减1；证据需要时读[实际测试记录（未随公开版分发）](../public-release-scope.md)。程序缺失或环境问题才读[安装与接入](./resolve-setup.md)。

## 验收与停止条件

- 当前片语义、字幕、源身份和音频边界要求完整执行；口播粗剪还须过[交付检查](./rough-cut-defaults.md#能力检查与交付闸门)，不能仅生成DRP就交付整项未完成的剪辑。
- 对照实际源和生成时间线回读链接、偏移、长度、轨道及声音，并分别记录文件/API检查与真实播放听审。调色另验实际色彩，不用剪辑测试替代。
- 连接、字幕、剪点或回读失败则停止该执行步骤，保留失败证据和用户工程；不默认切换执行器、覆盖或购买软件。

该测试入口 `video_editing/resolve_smoke.py` 仅生成当前已核验源的技术夹具，公开计划仍为 `edit_plan.json`。它不调用／绕过正式 `video:prepare` 的字幕校正闸门，不产出校正版字幕，也不是可直接交给包装的语义剪辑。UI 调用须符合 Computer Use 的替代路径检查与明确同意；可将生成的 Lua 文件正文交给内部 `loadstring` 一次执行，无需全局安装脚本或开网络服务。未命名原工程可能在 `SaveProject` 时弹出保存框，先完成保存，不能重复提交写脚本。实际结果见当前片 `resolve-result.json` 与[验收记录（未随公开版分发）](../public-release-scope.md)。

人工微调后，**达芬奇实际最终时间线成为权威**。必须重新导出锁定视频及同时间线 SRT；不再用旧计划自动映射字幕，也不默认从 AI 字幕生成最终时间线字幕。若未改时间轴，也须核对视频／字幕一致再交接。

包装交接按[锁定交接](./video-editing.md#4-接回既有-remotion-包装)，不自动开始整片渲染。
