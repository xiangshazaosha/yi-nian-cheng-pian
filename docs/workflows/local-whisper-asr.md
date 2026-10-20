# 本地 Whisper ASR 与细粒度源时间适配（可选）

本机已选本地 ASR 或维护该链时读取；已有 Desktop 选择不自动改变，不因连接故障盲换通道。日常复用本机软件、large-v3 模型与 GPU 配置，不重装、不上传、不改原素材，也不预读部署说明；确需安装／更换模型才读[部署规则](./asr-deployment.md)。

## 输入与运行

- 程序、模型、VAD 和 GPU 兼容参数只取 `tools/whisper-cpp/runtime-config.json`；启动器校验实际文件 SHA256 和 GPU 日志，不绕过启动器、不自动回退CPU或其他模型。现有主机证据不代表其他机器可照搬。
- 输入为完整、未处理的 PCM 16-bit／mono／16kHz WAV。抽轨前探测音轨、起点／PTS与独立音频偏移，核对零点与时长；多声道分工不得静默猜。不得裁切、去静音、变速或预处理后冒称原素材时间。使用已验证的完整 FFmpeg，不用 Remotion 裁剪版代替。
- 启动器每次生成唯一运行目录，保留原始 SRT、完整 JSON、PCM、参数、日志和回执。退出0、文件非空、全源声明或末尾时码都不单独证明识别完整。

```powershell
# 抽轨变量必须先替换为已探测、已核验的实际路径
& $FFmpeg -nostdin -n -i $Source -map 0:a:0 -vn -ar 16000 -ac 1 -c:a pcm_s16le "$Work/source.wav"
if ($LASTEXITCODE -ne 0) { throw "完整音轨准备失败" }
npm run asr:local -- --wav "$Work/source.wav" --language zh
```

启动器默认请求细粒度适配；`--sentence-only` 才只生成句级输出。读取其实际返回的 `srt / words / evidence`，不硬编码临时路径。输出仍是待校正原始转写，未完成语义剪辑或最终字幕；原件接收和校正分别按[固定入口](./video-editing.md#1-原素材转写固定入口)与[字幕规则](./subtitles.md)。已有同源原件先复用，重转写另存，不覆盖历史。

## 为什么不能直接拿 token 当字词

本地 `-ojf` 已包含 token 起止时间，并非只有 SRT。Token 可是多个汉字、词片段、标点或特殊符号；不得均分一个 token 的时长伪造每个字的时间。Desktop 对外提供的是原素材微秒文字行，但不据此猜它内部 tokenizer 或声学算法。

`video_editing/source_timing.py` 输出统一内部结构：原素材微秒 `words:[{startUs,endUs,text,...}]`。这里的单位是**带时间的文字片段**，可含多个 token，不承诺语言学分词。规则：

1. 原文本与 token 拼接只忽略排版空白，逐字核对；过滤特殊控制符，不改写词句。未解码片段、文本不一致或缺少 token 时失败，不从 SRT 猜补。
2. 零长度的发音 token 不删除，也不给它随意分配毫秒；将它与相邻有正时长的 token 合为保护片段。重叠边界合并保护，不在片段内部强切；全是零长度、负值、越界等异常拒绝。
3. VAD 拼接时间不是原素材时间。默认细粒度模式按 VAD 源区间分组，在每个**连续原 PCM 块**上关闭 VAD 重转写，再按精确样本／毫秒偏移映射回源。即使只有一整块，也不能跳过这步而误用 VAD 压缩 token。已无VAD的连续源运行无需重复这一步。
4. `local_asr_chunks.py` 同时平移句级和 token 时间；保存原始块 JSON，输出不去重、不重排、不填补长静音。检测区间不是无漏识别证明，未覆盖区间仍在源音轨保留。
5. 文本、时序、单位、范围和来源证据验证后，可供 `rough_cut.py` 生成内部帧候选。结构通过不等于核听，也不等于成片验收。两通道使用同样标准，不凭格式假定谁必定更准。

## 已有原件的适配与切点链

旧回执与原始 JSON 保持不变。对含 `source-timeline-map.json` 的运行，适配器直接读取保留的原始连续块，核对输入 WAV 哈希、原始块参数、源样本偏移，再转换；旧的句级派生 JSON 不再是数据丢失终点。无源映射的旧 VAD 主结果会明确拒绝，须用连续 PCM 重跑，不能整体加一个偏移。

```powershell
npm run asr:timing -- adapt-run --run "<已保存运行目录>" --source-json "<当前片source.json>" --output "<唯一源时间JSON>"
npm run asr:timing -- cut --timing "<唯一源时间JSON>" --selection "<AI已审阅的源区间JSON>" --fps-num 30000 --fps-den 1001 --output "<唯一内部帧候选JSON>"
```

`selection` 是现有本地内部保留区间列表 `{start,end}`，单位原素材微秒，不是用户审片定位时码；它不扩展[公开剪辑协议](./editing-contract.md)。AI 仍按完整表达作语义决策，停顿阈值与保留目标统一按[粗剪规则](./rough-cut-defaults.md#默认剪辑判断)，原声原速、只删完整非语音候选帧，保护片段字头字尾。生成结果是 `internalCandidateOnly`，不自动创建／登记草稿；交付走[粗剪闸门](./rough-cut-defaults.md#能力检查与交付闸门)。

## 验证和停止条件

先在包含中文、停顿和重录的30～60秒真实样本上检查 GPU、源偏移、全文一致与帧候选，再扩展全片。核对首中尾、长静音后恢复、术语和疑难边界，未决保留，不把波形统计当听审。异常时保留所有原件，报告失败，不自动换模型、上传或回退其他通道。

维护测试：`npm run asr:test`。默认 Desktop 路由的修改不授权重做已交付灯塔草稿，不自动渲染包装或删除旧部署。
