# 环境部署与修复：按需带装到可调用

仅当用户明确要求部署，或当前步骤所需工具／运行时确实缺失时读取本页对应章节；不因首次 clone、换机或开启新会话就自动部署，也不在日常制作中预加载全文。文件名沿用旧名以保留链接。语音方案仍只有两个：**本地 ASR 优先；条件不满足或实测不通过时使用 ChatCut Desktop。** 已有可用选择保留，暂停／纯答疑／规则维护不启动安装。

## 1. 启动与权限

`git clone` 不会执行安装器或 Git hook。用户直接提出制作任务时，先使用当前步骤必要的工具；只做使用前所需的轻量能力核查，不例行运行全套硬件检测／安装。发现问题须区分未安装、路径未激活、未启动、未授权、连接异常与业务报错，不能将一次调用失败都当成缺软件。已明确“帮我安装环境”的授权范围内直接推进常规项目内安装，不逐包重复确认；确实缺项但尚未授权时，一次询问是否按最小方案开始。不代登录、不复制作者凭据，不静默升级／卸载已有软件。

### 按需安装范围

1. **用本地 ASR，不必安装 Desktop**；本地链及所需生成器可用，就不因缺 Desktop 进入其安装章节。
2. **只剪辑，暂时不必安装 Remotion**；只有进入包装或用户明确要求完整环境部署时，才补齐 Remotion 及其必要依赖。
3. **已安装但没启动、没授权或连接异常，先恢复连接，不能直接重装**；Desktop 按[恢复规则](./chatcut-asr.md#启动与连接恢复)有界排查，路径／权限等问题按实际缺项修复。业务报错先排查业务，不以重装代替定位。

### 安装前向用户提醒

取得安装授权后，在开始下载、安装或写配置前，**必须发一条面向用户的中文提醒，不能仅写终端或日志**：

- 首次为当前任务补齐该组件：**“首次使用，正在部署本次任务所需环境：<组件>。已有可用环境会复用，完成后继续<当前任务>。”**
- 上次部署失败／中断后续接：**“正在继续部署未完成的环境：<缺项>；已完成的部分会复用。”** 不反复宣称这是首次部署。
- 只有连接问题：说明“正在恢复<工具>连接”，不误报正在安装。

尚未取得安装授权时，先说“首次使用需要补齐<组件>，是否开始部署？”，不能先宣称正在安装。系统级变更、账号批准和付费仍遵守下方独立边界。安装失败如实告知具体原因及剩余步骤，不报告环境已就绪。

安装授权不替代软件许可：开始前说明官方来源、安装位置、可确定的下载／磁盘占用、网络／上传可能性、费用及对应第三方条款；未知项明确说明。ChatCut Desktop、Remotion 等按[第三方授权边界](../../THIRD-PARTY-NOTICES.md)核对，必要登录、接受条款、购买与系统批准由用户完成，不自动替用户取得商用授权。本项目自身的商业使用边界见[许可说明](../licensing.md)，不为这项说明预加载其他安装分支。

新增工具遵守[项目目录](../../tools/README.md)。系统级驱动、运行库、付费或安装器不能自定目录的情况，先说明影响；系统批准和账号认证由用户本人完成。优先文件、进程、API 和正常安装参数；Computer Use 仍须独立说明原因并取得明确同意。

当前整链已接入基线是 **Windows x64**。macOS／ARM64／Linux 须先核查平台适配；Desktop 有安装包不代表本仓库所有脚本已兼容。不支持的平台明确报待适配，不为了凑“安装成功”冒称可用。

## 2. 零额外依赖检查与路线选择

需要语音选型或整体环境检查时，在仓库根目录运行 Windows 自带 PowerShell；只缺单项工具可仅核查该项，不必遍历全机。检查无需先装 Node 或 Python，不改永久执行策略：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup/doctor.ps1
# 不能检测时，只问显卡型号，不要求用户先懂显存／驱动
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup/doctor.ps1 -SkipHardwareProbe -GpuHint "RTX 4060"
# 用户明确选择 Desktop 时尊重其选择
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup/doctor.ps1 -PreferDesktop
```

检查仅输出系统／显卡／内存／剩余磁盘和工具路径／版本摘要；不读账号配置、launcher 内容或凭据，不下载／安装，不连 MCP、不改工程。WMI `AdapterRAM` 可能截断，不拿它判断显存。`agentReady:false`、`connectionVerified:false` 刻意保留到实际验收，检查退出成功不等于环境齐全。

Agent 按下列顺序继续，不让用户自己研究一堆软件：

1. 先复用已验收的本机选择及已有工具；确需首次建立语音处理链时优先本地 ASR。成功粗选显卡只代表值得评估，按[ASR 选型](./asr-deployment.md)核查官方支持和安装所需条件，然后协助安装、短样本实测。
2. 自动检测受限时，询问一个显卡型号即可，按型号粗选；必需的资源／驱动条件由 Agent 在部署过程中补核。不要把检测不到误判成显卡不足，也不要凭型号承诺推理成功。
3. 用户说不清显卡、没有可用加速设备、资源／权限不满足或样本质量／性能不达标时，明确原因，**推荐并在用户选择／安装授权后协助安装 ChatCut Desktop 原生应用＋本地 MCP**。不强行 CPU 慢跑、不静默换小模型、不反复装社区补丁。
4. 两条方案都不满足时保留失败证据并指出具体缺项，不改成其他方案。Desktop 本地接入不等于每个 AI 功能离线；登录、网络服务和素材处理范围仍按实际能力核对，不能承诺完全不上传。

## 3. 基础环境：按缺项实际安装

按当前任务缺项补装必要组件；只有用户明确要求完整初始化时，才依次补基础运行时、选定语音链、剪映草稿和 Remotion 包装。Agent 负责查官方入口、下载、核验、安装和回读，不只发链接让用户自行处理。没有访问用户电脑的能力时应明确限制，请用户做最少本机步骤后接回验证，不谎称已安装。

| 组件 | 安装路径和操作 | 最小验证 |
| --- | --- | --- |
| Node.js＋npm | 优先复用合格运行时；否则从[Node 官方](https://nodejs.org/en/download)选仍受支持的 LTS，项目接入基线 22+。官方 Windows x64 ZIP 校验后解到 `tools/node/`，保留完整发行目录和 npm，不全局安装 Remotion | 同一 Agent shell 的 `node --version`、`npm --version` 成功 |
| Python | 优先复用现有／Agent 随附 Python，基线 3.11+；缺失按[Python 官方 Windows 指南](https://docs.python.org/3/using/windows.html)补装，能自定目录时使用 `tools/python/`，否则先说明系统／用户级影响。不要把嵌入式包当完整开发环境，不默认下载第三方 pip 引导脚本 | `python --version`、`python -c "import tomllib, subprocess, pathlib"` 成功；需 pip 的分支再验 pip |
| 完整 FFmpeg＋ffprobe | 先复用已有完整发行版；否则从[FFmpeg 官方下载页](https://ffmpeg.org/download.html)指向的 Windows 构建源下载核验，放 `tools/ffmpeg/bin/`。说明官网指向的第三方构建不是 FFmpeg 自发二进制；不要用 Remotion 裁剪版代替 | 两程序 `-version`，再验证授权样本的媒体探测／PCM 抽轨／所需混音能力 |
| Remotion 依赖 | 仅缺失或明确重建时，运行下面的项目安装脚本，使用现有 lockfile，不装归档 editor | 类型检查＋不依赖旧媒体的预览；生产仍遵守静帧确认 |
| 剪映客户端 | 剪辑链需要用户接手草稿时检查；缺失从当前官方渠道协助安装，不装第二套 | 授权样本草稿导出、引用核对；应用打开和听审分别登记 |

便携运行时每个新 Agent shell 激活一次，只改当前进程 PATH，完整 ffprobe 同时提供给项目素材工具：

```powershell
. ./scripts/setup/activate.ps1
node --version
npm --version
python --version
# npm ci 会重建项目 node_modules；只在需要安装／明确修复时执行
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup/install-remotion.ps1
```

`install-remotion.ps1` 仅激活运行时、按锁安装 npm 依赖并类型检查；不下载 Node／Python／其他应用，不渲染。`doctor.ps1` 是检查器，不是无人值守全能安装器。剩余安装由当前 Agent 按本页和选中分支实际完成。

下载包放 `tools/installers/`，只运行官方来源且身份／签名核验通过的安装器。参数以当前官方文档／实际帮助为准，不猜静默安装或路径开关，不关闭安全保护。便携包／模型尽量对照维护者校验值，只有自行计算的 SHA256 不能说成上游认证。软件、模型、缓存和机器配置不提交。

## 4. 优先本地 ASR：安装、配置、调用、验收

先按[配置选型](./asr-deployment.md)粗选，再按[本地部署](./local-whisper-setup.md)安装。在已授权的新机完整初始化中，本地 ASR 优先评估和合格后部署无需用户重复指定同一选择。按本机实际能力决定可行性，不复制原电脑的通过结论。

- 当前仓库启动器只接入 **whisper.cpp Vulkan／Windows x64**；NVIDIA、AMD、Intel 的具体卡均须核查该后端支持并实测。CUDA、Metal、faster-whisper 不作为已接入的换机路线，不另装未适配引擎来冒称交付；无法满足当前接入链时推荐 Desktop。
- 多语言 `large-v3` 为质量基线；模型、程序和构建产物放 `tools/whisper-cpp/`。结构见[Vulkan 配置示例](../../config/examples/whisper-cpp-vulkan.example.json)。示例不可直接运行，必须填写本机实际文件、版本、SHA256、GPU 名称、设备参数；不复制 RX 7700 XT 的修复开关。当前运行器验证 `using Vulkan0 backend`，多卡须核对真实绑定；不满足时先完成适配或选 Desktop，不能绕过校验。
- 可用 `python scripts/setup/configure-local-asr.py --help` 查看配置生成器。它从实际文件计算哈希，仅写新配置并标记未验收；不下载、不运行模型、不覆盖旧配置。模板参数须经 `whisper-cli --help` 核对；选 VAD 时另按本地部署规则填入模型和源时间映射，不能凭 SRT 猜细粒度时间。
- 安装后以 30～60 秒授权真实语音做 GPU、原素材时间、细粒度输出及质量测试，再按实际任务复验长片／资源余量。没有样本只能报“程序已安装、推理待验收”；结构检查、真实核听和长片验收分别报告。
- 本地整链还需[本地草稿生成依赖](./jianying-setup.md)，由 Agent 检查并补齐缺少的 Python 包／媒体库，再走[本地草稿分支](./jianying-editing.md#可选本地-asr-与本地草稿生成)验证真实可编辑草稿。不为本地 ASR 成功的机器强制安装 Desktop；生成器不是第三个语音方案。不要把 ASR 成功等同于剪辑和草稿已经完成。

已有正常环境／用户指定的路线优先。本页选定并验收的本地方案，视为后续制作已选择本地分支；在 `tools/setup-state/` 留下路线、版本和证据摘要。没有记录不等于环境不可用，不据此自动重装；核对当前步骤实际能力，确实缺所需工具才回本页。已有选择沿用，不因规则维护重剪旧片。

## 5. 本地不满足时：带装 Desktop 到 MCP 可调用

1. 缺官方 launcher 不一定是没装应用，先查安装登记／快捷方式；有应用则按[连接恢复](./chatcut-asr.md#启动与连接恢复)启动并回读，不默认重装。
2. 缺应用则从[官方 Desktop 安装及本地 MCP 说明](https://chatcut.io/docs/desktop-app)当前下载入口取安装器、核验身份后协助运行。能选项目目录就选项目目录；若只能用户／系统目录，先说明影响。版本排查才读[Current versions](https://chatcut.io/docs/releases)及对应[Changelog](https://chatcut.io/docs/changelog)，不固化易过期下载地址。
3. 由用户完成必要登录／系统批准。当前外部 Agent 继续负责判断，两应用须在同一电脑运行；桥需要已有 Codex app-server 运行时，优先复用宿主，特殊位置可只在当前进程设置 `VIDEO_CODEX_EXE`。不要求再配置 Desktop 内部 Agent，不读／复制 launcher 凭据。
4. 使用 Desktop 的官方本地连接流程，不用 hosted Agent Plugin 的安装提示词替代。先运行 `python video_editing/chatcut_bridge.py status`，再实际调用 `get_active_project`；无活动工程可为正常空状态。只加载当前步骤所需 schema，按[有界重试](./chatcut-asr.md#工具缺项与有界重试)恢复，不盲重放写操作。
5. 有用户授权样本后，验证导入、完整转写、必要时间数据、Script 剪辑和原生草稿导出及回读；安装检查本身不擅自新建制作工程／导入素材／消费服务。只有无自动路径的必要步骤才请用户做，完成后 Agent 主动接回。

## 6. 完成条件、记录与后续生产

以当前任务所需能力为验收范围，不强求本次不需要的链。只有明确要求完整部署时才逐项核对：运行时可执行、所选语音链真实样本／源时间、草稿实际生成／回读、Remotion 依赖与独立预览。不要求两个语音方案都安装；未使用的标本次不需要，缺样本／批准／适配的标待验收并给下一步。文件存在／帮助命令成功不等于 Agent 可调用；核听与技术验证不互相冒充，不把仅未听审扩大成无权导出，按[粗剪闸门](./rough-cut-defaults.md#能力检查与交付闸门)处理。

不设置“首次 clone 已部署过就永不再进入”的一次性标志。未安装时安装、失败／中断时检查原因后续接、已安装未验收时继续验收、已通过且当前可用时复用；已成功部分不重复安装。用户暂停／拒绝时等待明确恢复；相同原因持续失败有界停止并报告，不循环重装全套环境。写操作结果不明先回读，不盲重放。

机器记录保存在已忽略的 `tools/setup-state/`，由 Agent 根据实际回执整理：检测时间、系统／GPU摘要、所选路线、组件来源／实际版本／安装位置、样本与验收结果／证据路径；不包含秘密或 launcher 内容。检测脚本不会自动替用户签署“全部通过”。

新用户使用自己的素材即可开始，不要求下载作者全部旧片。旧审片记录不算新机验收；依赖旧媒体的 Composition 不用于裸仓库验收。环境就绪不自动授权成片制作、发布或发送；真实制作仍先校字幕、展示代表静帧并停在用户确认闸门。

维护验证：`npm run setup:test`，或尚无 Node 时直接运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup/test-environment.ps1`。这些测试证明检测／路由与配置生成逻辑，不代表已在一台全新电脑完成实际软件安装。
