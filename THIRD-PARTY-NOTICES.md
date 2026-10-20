# 第三方依赖、安装与授权边界

核对日期：2026-10-20。本文是已知依赖入口，不是完整权属、漏洞或法律认证。自有部分许可见 [LICENSE](./LICENSE)，不能覆盖第三方。安装后保留原包全部许可、NOTICE 和来源；再分发二进制、修改依赖或升级版本前重新检查，不以本表替代上游原文。

## ChatCut Desktop（可选）

- 它是独立第三方产品；本项目无官方隶属、背书或经销授权，不随源码分发其安装包、内部脚本、账号或修改版程序。
- 仅从[官方渠道](https://chatcut.io/docs/desktop-app)协助用户安装，通过文档支持的 Desktop 本地 MCP 连接调用；不改官方 launcher，不提取凭据，不绕过登录、付费、限流或批准。
- 官方文档支持外部 Agent 本地连接，但[服务条款](https://chatcut.io/terms)第 4、8 节对自动化及改编有宽泛限制；不能把文档能力等同所有用法的授权。有歧义的分发或商业集成应取得官方书面确认。
- 用户自行接受其条款、完成账号认证和系统批准；可能的费用先说明，未经授权不购买。
- Desktop 不是完全离线应用，外部 Agent 也可能调用在线模型。网络功能与上传范围须逐项核对，不承诺所有数据绝不离机。本项目不提供云端剪辑回退路线。
- 正常本地 ASR 路线不必安装 Desktop。旧 helper 改写脚本不进入公开发行包或公开 Git 历史。

## Remotion

- 当前活跃依赖固定为 4.0.491，版本依据 [package.json](./remotion-clone/package.json)及 [lockfile](./remotion-clone/package-lock.json)，遵守该版本 [Remotion License](https://github.com/remotion-dev/remotion/blob/v4.0.491/LICENSE.md)，不是 MIT。
- 该版本的免费资格包含个人、最多 3 名员工的营利组织、非营利组织及符合规定的非商业评估；不符合免费条件的实体须取得 Company License。边界案例、合作团队及实际用途应核查[官方许可 FAQ](https://www.remotion.dev/docs/license/faq)，不只数实际操作人数。
- 本项目源码公开、非商业授权、作者自己的资格或另外取得的商用授权，都不自动替下游取得 Remotion 授权；也不把 Remotion 原有独立授权收回。
- 安装仅按锁定版本获取上游依赖，保留其许可。不分发 Remotion 的改名 SDK 或把其程序本身作为自己的产品再许可。不需要包装时暂不安装。
- 未来升级重新检查实际版本的许可、计划和遥测要求，不把当前免费条件写成永久承诺；不绕过授权核查。

## 其他已知依赖

| 对象 | 来源与版本依据 | 许可处理 |
| --- | --- | --- |
| React / React DOM 18.3.1、@types/react 18.3.31 | 活跃 npm lockfile | 锁文件记录 MIT，保留原包声明 |
| TypeScript 5.9.3 | 活跃 npm lockfile | Apache-2.0，保留原包许可和适用声明 |
| whisper.cpp、Whisper 模型 | 部署时固定实际 tag/revision、哈希及来源；不把作者本机版本当所有新机版本 | [whisper.cpp](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE)和 [Whisper](https://github.com/openai/whisper/blob/main/LICENSE)上游采用 MIT；实际下载的程序、转换模型、VAD 模型及打包依赖分别核对并保留声明 |
| FFmpeg / ffprobe | 部署时登记实际构建、版本、配置和下载来源 | [官方说明](https://ffmpeg.org/legal.html)：LGPL/GPL 等义务随构建选项变化。不能笼统声称所有 FFmpeg 包是 MIT；分发构建须另行履行适用源码及许可义务 |
| pyJianYingDraft 0.3.1 | [上游项目](https://github.com/GuanYixuan/pyJianYingDraft)、当前部署文档 | 上游仓库采用 Apache-2.0；实际发行包也须核对许可，缺失时回查与该发行版对应的来源，不仅凭 PyPI 元数据为空推定无条件授权。本项目只调用其文件模块，不附带或修改上游代码 |
| pymediainfo 7.0.1、MediaInfo 原生库 | 对应 PyPI 发行包及所附原生库 | Python 包与原生库分别保留实际许可；不得只核对包装层 |
| imageio、NumPy、Pillow、Node.js、Python、浏览器及传递依赖 | 已有环境或本次实际安装版本 | 各自原许可；不随仓库打包。安装记录需有版本、来源及许可位置 |
| 剪映、DaVinci Resolve、Agent 宿主及模型服务 | 用户自己的官方安装及账号 | 各自条款，不因适配器可调用而自动获授权；不分发客户端或凭据 |
| 字体、音效、音乐、图像、视频、参考材料 | 用户自行提供或另获授权 | 源码只保留必要占位及字体回退名称，不附送字体/媒体许可；不得推定“网上可下载”即可再分发 |

## 安装前提醒与责任

取得安装授权前不下载或改配置。首次补环境应明确组件、官方来源、预计占用（无法确定则说明）、安装位置、网络/上传可能性、费用及适用第三方条款；不能用一次制作授权代替付费和账号批准。已有环境复用，连接异常先恢复，不直接重装。

用户应备份原素材和工程，复核字幕、切点、引用及最终输出。在适用法律允许范围内按现状提供，不保证结果无误或所有环境兼容；不排除法定不能排除的责任。正式商业合作或存疑分发应取得对应权利人确认，必要时请适用地区的专业人士审查。
