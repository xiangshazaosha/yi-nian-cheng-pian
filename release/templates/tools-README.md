# 项目内工具目录

只有明确部署或当前步骤必要工具缺失时，按 [环境部署与修复](../../docs/workflows/new-machine-setup.md)对应章节安装。复用正常环境；已安装但未启动、未授权或连接异常先恢复，不直接重装。

- tools/node/、tools/python/：项目运行时。
- tools/ffmpeg/bin/：完整 FFmpeg 与 ffprobe。
- tools/whisper-cpp/：本机实际程序、模型、配置及验收证据，不随 Git 分发。
- tools/jianying-draft/runtime/：按需安装的本地草稿生成依赖。
- tools/setup-state/：本机路线、来源版本和实际验收记录。
- tools/installers/、tools/npm-cache/：下载包与缓存。
- tools/releases/：发布导出副本、验证日志及源/公开版本映射，不进入日常制作上下文。

ChatCut Desktop 从官方渠道安装，已有应用和 launcher 直接复用，不下载第二套。其数据、账号配置和内部脚本不随仓库分发。系统驱动/运行库或安装器强制的用户/系统目录须先说明影响；不承诺所有软件均为可搬走的绿色版。

安装前向用户告知来源、位置、可确定的占用、网络行为、费用和 [第三方授权要求](../../THIRD-PARTY-NOTICES.md)，在相应授权后再操作。程序、模型、安装包、缓存、用户数据和本机证据均不提交公开库。
