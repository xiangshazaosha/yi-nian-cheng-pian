# 本地 Whisper：部署与环境修复

本页用于已授权的新机本地 ASR 优先部署，或明确维护／恢复本地方案；缺字幕或 Desktop 故障本身不授权安装。先按[新机接入](./new-machine-setup.md)和[配置选型](./asr-deployment.md)检测，必要时用用户显卡型号粗选，再补核部署条件；不从作者设备实测推断新机可用。已配置的普通转写按[运行入口](./local-whisper-asr.md)，不重复安装。

当前接入路线采用官方 whisper.cpp + Vulkan、多语言 large-v3；来源/版本/哈希与环境参数分别以安装回执和运行配置为准。重新选型时核验官方现状；历史依据仅在需要比较时读[选型证据（未随公开版分发）](../public-release-scope.md)。

## 2. 部署边界与目录

按[软件目录规则](../../tools/README.md)，仅在进入部署任务后下载／构建。目标布局：

```text
tools/whisper-cpp/
  src/                  # 官方源码，固定 tag 与 commit
  build/                # 独立构建输出；或保留官方包原始布局
  models/               # 只下载选中的模型
  cache/                # 可配置的工具缓存
  install-receipt.json  # 实际版本、来源、哈希与程序路径
```

- 优先核查官方 Releases 是否有与 Windows x64、Vulkan 匹配的包；不能把普通 CPU 包当 Vulkan 包，不用不明第三方整合包。没有合适包时再从官方源码构建，选择实际存在的稳定版本、记录 tag 和 commit，不把随时变动的 master 当锁定版本。
- 源码构建方向是 `cmake -S tools/whisper-cpp/src -B tools/whisper-cpp/build -DGGML_VULKAN=1`，再 `cmake --build tools/whisper-cpp/build --config Release`。**这只是待执行模板，不是已完成步骤**；先检查现有 CMake、C++ 编译器和 Vulkan 开发依赖，不能假定显卡驱动已包含编译 SDK。
- 新增便携工具放项目内独立目录；驱动、Visual Studio Build Tools、SDK／运行库等若无法完全放项目内，先说明路径及系统影响，不静默安装或升级驱动。能复用现有依赖则不另装。
- 模型只从官方文档指向的维护者仓库取，记录实际 revision、下载地址、完整文件 SHA256、文件大小；能取得上游校验值时对照，不把自行计算的哈希说成上游认证。记录程序／依赖来源与实际路径，文档登记使用仓库相对路径。
- 不装第二套 ChatCut，不启用 MCP，不安装 CUDA、faster-whisper 或整套 PyTorch 来运行本分支；不建立常驻 HTTP 服务、不开放端口。
- 安装与模型下载需要网络，但素材推理不上传。程序、模型、构建产物与缓存不提交；工具运行日志不默认加入聊天上下文。

本机配置按[模板与生成器](./new-machine-setup.md#4-优先本地-asr安装配置调用验收)生成，填写新机实际文件及哈希，不复制作者配置。生成器不覆盖已有配置、不替代来源核验或推理验收。

部署最小验收：实际 `whisper-cli --help` 成功；真实短音频推理退出成功；日志确认 Vulkan 后端及**新机实际选中的 GPU**，不能只见 DLL 就算 GPU 成功。原机 RX 7700 XT 只作历史例子。多设备按实际帮助与日志选设备，禁止复制第三方的 `--gpu-device` 参数；所查上游为 `--device`，部署版本仍须复查。当前启动器检查 Vulkan0，其他设备／后端须先完成适配，不绕过校验。CPU 回落、错误设备或缺后端须报告，不能以 CPU 成功冒称 GPU 验收。

## 交接与故障定位

部署成功必须有真实设备绑定、短样本执行与资源/质量证据；不是看到可执行文件就完成。通过后回[日常运行与验收](./local-whisper-asr.md)，不把部署输出当最终字幕。已有相同主机驱动/构建问题时才查[主机部署记录（未随公开版分发）](../public-release-scope.md)；不要默认重装、换小模型或上传素材。
