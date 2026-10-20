# 一念成片 · Yi Nian Cheng Pian

**你给素材，它来成片。** 把剪辑、字幕校正、视频包装与交付串起来的 Agent 工作流。尽量少操作，但保留必要的安装授权、账号批准和审片确认。

**非商业源码公开（Source-available），不是 OSI 标准开源。** 自有受保护部分采用 [笑爷非商业同许可源码公开许可 2.0](LICENSE)；收费剪片、变现视频制作、企业内部业务等商业用途须事先另获书面授权，不是仅禁止倒卖。第三方独立许可不被覆盖，用户独立成果不自动归维护者。详见 [使用场景](docs/licensing.md)、[NOTICE](NOTICE)和[第三方说明](THIRD-PARTY-NOTICES.md)。

## 开始使用

1. 克隆仓库，在有本机工具权限的 Agent 中打开整个仓库，而非只打开子目录。
2. 直接提供你自己的授权素材和需求，例如“帮我剪这段口播，交付可编辑剪映草稿”。
3. 当前步骤缺必要工具时，Agent 才进入[按需部署](docs/workflows/new-machine-setup.md)，告知后在授权范围内协助安装、核验；已有环境复用，连接异常先恢复。

默认优先本地 ASR，不满足条件或实测不通过才推荐 ChatCut Desktop；不提供云端剪辑回退。只剪辑不必安装 Remotion，本地 ASR 路线不必安装 Desktop。安装与检测工具不是无人值守全能安装器，实际登录、系统批准和付费由你完成。

当前整链平台基线 Windows x64，本地 ASR 使用已接入的 whisper.cpp Vulkan 路线。Desktop 桥当前复用 Codex app-server；其他 Agent 识别项目规则，不代表此传输桥已兼容。不能承诺所有显卡、系统或宿主开箱可用。

仅检查环境、不自动安装：

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup/doctor.ps1

需要包装且已具备合格 Node.js/npm 时，经授权安装依赖：

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup/install-remotion.ps1
    npm run studio

默认只有不依赖媒体、字体文件或账号的 PublicSmoke 技术演示，不登记作者旧片。它不是你的成片，也不是 ASR/真实新机安装验收。请按[任务路由](docs/workflows/README.md)开始自己的制作。

## 验证与维护

基础测试不下载模型，不登录账号，不制作实际视频：

    npm run setup:test
    npm run edit:test
    npm run asr:test
    npm run video:test
    npm run visual:test
    npm run packaging:broll:test
    npm run release:test
    npm run release:check

装好包装依赖后运行 npm run remotion:typecheck。源码完整性清单只针对当前发行快照；自己的修改会导致哈希变化，贡献/发新版按[发布维护流程](docs/releasing.md)重新导出，不手改清单冒充原版。

- [发行范围和已知边界](docs/public-release-scope.md)
- [更新记录](CHANGELOG.md)、[本次验证](docs/releases/v0.1.0.md)
- [贡献要求](CONTRIBUTING.md)、[安全反馈](SECURITY.md)
- 官方项目：[xiangshazaosha/yi-nian-cheng-pian](https://github.com/xiangshazaosha/yi-nian-cheng-pian)

仓库不包含素材、模型、安装包、客户端、账号配置或依赖。Desktop 并不等于完全离线；第三方费用、隐私及许可按各自官方条款核对。备份原素材，复核字幕及剪辑结果；按适用法律允许范围现状提供，不作全平台可用或绝对合规保证。
