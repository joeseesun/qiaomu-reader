# Qiaomu Reader TTS 调研与实施建议

调研日期：2026-10-12（北京时间）。本地基线：4.6.0，Git `0c0b3ed`，调研开始时工作区干净。本文前半部分保留初始调研判断；后续已进入开发，最新实施和实测证据见文末。未调用付费云端合成服务。

## 判断

建议 Go：在阅读器内部增加“从这里朗读”和“朗读选中内容”，复用现有电子书定位能力。第一阶段先验证系统语音；第一版完整体验加入千问云端语音。保留 OpenAI-compatible 适配接口，后续扩展 Azure 和本地服务。

独立 TTS 插件已能朗读 Markdown 笔记，但不能据此认定其支持本插件 iframe 内电子书的章节、CFI 和 PDF 页内位置。值得做的差异是阅读位置与听读位置联动、跨章连续播放、回到原文和不干扰已有划线。

## 已确认的代码基础

| 位置 | 已有能力 | TTS 所需补充 |
| --- | --- | --- |
| `src/reader-engine.js:85` 的 `EpubEngine` | Foliate 封装；`contents()` 暴露当前文档与章节索引，`currentLocation()`、`cfiFromRange()` 和 `goTo()` 支持定位 | 在适配器内新增朗读文本/位置接口，避免 UI 直接操作 Foliate 私有视图 |
| 已安装 `foliate-js@1.0.1` 的 `tts.js:226`、`view.js:569` | `initTTS()`、`start/resume/prev/next/from/setMark`，DOM Range、SSML 标记和分段；默认回调可滚动到 Range | 它不负责语音合成、播放器或整书跨章队列；SSML 不能直接当纯文本发给所有服务；标记与音频时间仍需适配 |
| `src/main.js:10726`，另有第二处引擎挂载 | 章节文档加载、选区事件、阅读位置更新 | 两个宿主入口共享一套朗读控制器，避免只接一个视图 |
| `src/main.js:7185`、`src/pdf-text-content.js` | PDF 文本提取，坏文本/无文本判定 | 保留 page + item/offset 与可见文本映射，处理多栏、页眉页脚和断行 |
| `manifest.json` | `isDesktopOnly: false`，最低 Obsidian 1.11.4 | 方案必须保留移动端路径；声明兼容不等于手机测试通过 |
| `src/model-access/` | 现有聊天供应商/账号接入 | 未发现 TTS 适配；聊天接口可用不代表 `/audio/speech` 可用，OAuth 也不能直接当语音 API Key |

Foliate 上游 MIT 许可；本地安装版本与本次读取的上游最新 commit 不是同一版本的证明。直接使用现有依赖导出的模块优于复制其内部实现，新增行为需对安装版本测试。

## 服务选型

| 方案 | 优点 | 限制与建议 |
| --- | --- | --- |
| 系统语音：Web Speech API | 无需用户配置 API Key；可枚举系统声音、暂停和调整语速 | 各宿主音色、事件与行为不同；只有经验证的本地音色才可标记离线。作为免配置入口，首次枚举并试听后显示就绪 |
| 千问 `qwen3-tts-flash` | 明确的中文参数、HTTP 接口、字符计费；适合作为第一家云端候选 | 该接口文档标注单次最多 600 字符；需按实际限制分段，合成后缓存音频；官方返回的音频 URL 有效期 24 小时 |
| OpenAI / OpenAI-compatible | 官方 speech API；可复用同协议的自托管服务 | 官方音色目前以英语优化，中文须试听；“兼容聊天”不等于兼容语音，模型和声音枚举也并不统一 |
| Azure Speech | SDK 提供音频偏移、文本偏移等边界信息，适合精确跟读 | 接入比普通音频 HTTP 响应复杂；如逐词同步成为首要目标，再提高优先级 |
| 本地 Qwen3-TTS / Kokoro 服务 | 可自行部署，适合重视离线或大量使用的用户 | 模型下载、进程、算力及手机访问都增加负担；作为外部可选服务，首版不把模型或 Python 嵌入插件 |
| Edge TTS 社区方案 | 项目支持无需 API Key 使用 Edge 在线朗读服务 | 值得优先验证的免费候选；本轮两种声音合成都遇到 403，且移动 WebView 直连有兼容缺口，尚不能提升为默认可用服务。补充证据见文末 |

以上是工程适配判断，不是音质排行榜。本轮没有听感或延迟实测。

官方依据：[Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)、[boundary 兼容性](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event)、[千问接口](https://help.aliyun.com/zh/model-studio/qwen-tts-api)、[OpenAI 语音指南](https://developers.openai.com/api/docs/guides/text-to-speech)、[Azure 合成事件](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis)、[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)、[Kokoro](https://github.com/hexgrad/kokoro)、[Edge TTS](https://github.com/rany2/edge-tts)。

### 成本样例

2026-10-12 读取的[阿里云官方价格](https://help.aliyun.com/zh/model-studio/model-pricing)：北京地域 `qwen3-tts-flash` 为 0.8 元/万计费字符，汉字按 2 个字符计，其他字符按文档规则计。因此 20 万纯汉字约 40 万计费字符，首次全部合成约 32 元；未计标点、重试、税费差异或优惠。不同地域、模型价格不同，不能将这个金额泛化为所有千问 TTS。

只合成当前及接下来的少量文本，命中音频缓存可减少重复合成；单纯调整播放器倍速不应重新收费生成。更换音色、模型或生成参数则不能继续命中旧音频。

## 开源参考证据

以下固定 commit 来自本轮 GitHub API；维护日期为对应默认分支最后提交日期，不是服务质量或移动兼容证明。

| 项目 / 固定版本 | 许可 / 维护 | 实际检查与处理方式 |
| --- | --- | --- |
| [Foliate](https://github.com/johnfactotum/foliate-js/tree/78914aef4466eb960965702401634c2cb348e9b1) | MIT；2026-05-01；未归档 | 重点读了本地安装的 `tts.js` 和 `view.js`。直接采用现有依赖的文本分段/定位基础，不认为已经包含播放器 |
| [Aloud](https://github.com/adrianlyjak/obsidian-aloud-tts/tree/0bd97a49ac256bfab8fc4d684e297ed24a412a7f) | MIT；2026-06-09；未归档；manifest 0.15.1，非桌面独占 | 读播放器架构、`ChunkLoader`、`AudioCache`、OpenAI-like 模型配置和 manifest。借鉴分块预加载、缓存和播放器分层，独立实现适合 Reader 的小模块，首版不整体引入其播放器栈 |
| [Voice](https://github.com/chrisurf/obsidian-voice/tree/2b48bb746334186e86d2cb9311841f9498cf6efc) | MIT；2026-09-17；未归档；manifest 1.19.0，非桌面独占 | 读 `BaseSpeechService`、`OpenAiCompatibleSpeechService`、`VoicePlayerView` 和 manifest。借鉴 provider 分层；不照搬大播放器 UI，也不以 `/models` 成功代替实际合成验证 |
| [Edge TTS](https://github.com/rany2/edge-tts/tree/4bdb8e4c6ea62f151a45a3fceb4cf6ff696bb89f) | 多数文件 LGPLv3，`srt_composer.py` 为 MIT；2026-03-22；未归档 | 读 README 和完整 LICENSE；不复制或打包作为首版依赖 |

MIT 代码如实际复制或派生，须保留版权与许可；本次没有复制第三方实现进入项目。竞品审查是针对关键模块的抽样，不是完整安全、依赖或 Release 资产审计。

近期开放问题抽样：Aloud 有[从光标开始播放请求](https://github.com/adrianlyjak/obsidian-aloud-tts/issues/169)、[429 报告](https://github.com/adrianlyjak/obsidian-aloud-tts/issues/165)、[崩溃报告](https://github.com/adrianlyjak/obsidian-aloud-tts/issues/136)；这些是未验证的用户报告，不据此归因。Voice 有[供应商密钥计划兼容性提问](https://github.com/chrisurf/obsidian-voice/issues/87)。由此应把取消、限流、长时间内存和实际合成鉴权列入本插件验收。

## 推荐架构

```text
EPUB 文档 / PDF 文本
        ↓
文本清理、分段 + 原文锚点
        ↓
全插件唯一朗读会话（目标书籍、段落、状态、任务代次）
        ↓
语音适配器 → 当前段 + 后续 1–2 段预加载 → 有容量上限的缓存
        ↓
系统语音 或 音频播放器 → 临时高亮 / 跟随位置 / 断点保存
```

建议拆成 `tts-controller.js`、`tts-text.js`、`tts-providers.js`、`tts-cache.js` 和轻量播放栏，扩展 `reader-engine.js` 作为电子书适配层，避免在 `main.js` 继续堆积合成逻辑。

- **文本与定位**：按句子和段落切分，保留规范化文本 offset 到 DOM Range/CFI 或 PDF item 的映射。不能只用 `visibleText()` 循环，否则翻页/重排易重读漏读。扫描 PDF、漫画无文本时显示“此页没有可朗读文字”，OCR 另立功能。
- **跨章**：章节结束后通过阅读器导航切到下一可读章节，等待对应文档就绪，再生成段落；避免加载整本书到内存。跳过目录、脚本、样式和不应重复读出的注音等内容需单独验证。
- **播放与合成分离**：系统语音本身不可统一当音频文件缓存；云端适配器返回字节、格式及可选对齐信息。声明能力差异，不强迫所有服务支持导出、时间戳或流式。
- **高亮**：首版按实际合成片段高亮，片段可是一句或短段；没有真实对齐信息时不按字数猜逐词进度。Foliate 的 SSML mark 只有在合成服务确实提供对应事件时才能用于准确跟读。临时高亮不写进用户批注。
- **跟随**：默认跟随正在读的位置，用户手动翻页/滚动后暂时关闭跟随，提供“回到朗读处”；阅读位置与听读断点分别保存。
- **状态**：`idle/loading/playing/paused/error`；开始新目标先终止旧会话。跨窗口/分屏只有一个活动会话，书籍内容变化时失效旧队列。关闭所属阅读视图和卸载时停止，切书重置；重启仅恢复断点，不自动发声。
- **网络**：现有 Obsidian SDK 的 `requestUrl()` 返回完整 `arrayBuffer`，未暴露流式 reader 或 AbortSignal。首版用短片段请求与预加载降低等待；服务支持 SSE 不等于宿主已支持流式播放。无法真正中断的在途请求用会话代次丢弃结果，停止继续预取，不能宣称取消必然免计费。
- **缓存**：键包含端点标识、provider、模型、音色、语言、文本和生成参数；不包含密钥。建议初始上限 100 MB、LRU 回收，可重建缓存不写进插件配置 JSON。书籍断点单独持久化。暂停后停止继续扩充预取队列。
- **资源**：回收 Blob URL、AudioBuffer、计时器、监听器和旧章节 Range；不长时间持有全书 DOM。断网保留最后断点，401 给出更新密钥入口，429 有限退避而非无上限重试。
- **凭据与外发**：复用现有凭据存储机制前检查能力与最低宿主支持，不把聊天登录 token 默认发送给语音端点。首次选择云服务清楚说明朗读文字会发送到该服务；服务商计费与语音可用性用一次短句合成验证。

宿主依据：[requestUrl](https://docs.obsidian.md/Reference/TypeScript%20API/requestUrl)、[移动开发](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development)及本地 `node_modules/obsidian/obsidian.d.ts:5442`。未来若要真流式，再单独验证桌面与移动传输能力，避免添加仅桌面能用的 Node SDK 作为公共依赖。

## 最小产品范围与开发顺序

1. **验证性小样**：真实 Obsidian 中枚举系统语音、合成短句，验证暂停恢复与长文连续播放；验证 Foliate Range、CFI 和中文分句，确定系统语音的设备可用性。
2. **首版核心**：EPUB 等可提取文本的引擎格式；当前段开始、选中朗读、暂停/继续、上一段/下一段、倍速、片段高亮、跨章、断点。常驻工具栏只加一个朗读入口，播放时展开紧凑控制栏。
3. **云端与缓存**：优先千问 + 有限预取和缓存；设置首先显示服务、音色、所需密钥和试听结果，服务地址、模型自定义、缓存清理等折叠。随后接 OpenAI-compatible。
4. **PDF 与移动强化**：有文本 PDF 的正文顺序与定位；iOS/Android 后台、锁屏、耳机中断实测。Azure 精确边界、本地模型服务、音频导出和睡眠定时为后续选项。

服务选择不是音质结论。云端最终默认音色应使用同一组中文、英文、数字、专名、混排段落试听后决定。UI 遵循项目既有国际化、键盘焦点和无无谓 hover tooltip 的规则。

## 验收与证据缺口

- 自动检查：句子跨 DOM 节点、中文标点/缩写、超长段落、代理对字符、规范化 offset 映射、provider 约束、缓存失效、任务取消后旧结果、跨章边界。
- 桌面真实库：EPUB 连续播放至少 30 分钟；暂停恢复、改倍速、切音色、重开书、分屏、弹出窗口、快速切书、卸载；监测内存、预取次数和 Blob URL 回收。
- PDF：单栏、双栏、重复页眉、多页段落、扫描无文本、坏文本；不能把图像渲染成功当作文字可朗读。
- 网络：离线、401、429、超时、空音频、返回错误类型、服务音频 URL 过期；错误后恢复不重复播放已完成片段。
- 移动真机：用户手势后启动音频、后台/锁屏、章节切换、耳机中断；Media Session 能设置控件也不等于操作系统保证后台运行。
- 当前缺口：尚无系统语音探测、付费 API 实测、音质对比、首包延迟、长文资源测量或手机真机证据。研究可支持进入小样验证，不能据此称功能可用或已完成发布。

## 补充：Edge TTS 专项核验

用户补充了 Edge TTS 的免费方案后，本轮进一步检查了真实 Obsidian 插件及 JavaScript 实现，并以自拟短句测试 Python 客户端。

- **可借鉴项目**：[obsidian-edge-tts](https://github.com/travisvn/obsidian-edge-tts/tree/d36f7df373994f4fe82b2786687f6c953c24f073)，固定 commit `d36f7df373994f4fe82b2786687f6c953c24f073`，最后提交 2025-12-22，manifest 3.4.3，AGPL-3.0。它使用 `edge-tts-universal`，无需要求用户安装 Python；本轮读了 manifest、package.json、README、`tts-client-wrapper.ts` 和 `tts-engine.ts`。
- **维护者记录的故障**：该固定版本 README 首段说明，自 2025-12-17 起服务端对其免费调用方式的支持出现不稳定。这是维护者报告，不代表所有客户端在当前都不可用。
- **移动端关键缺口**：本轮 npm 元数据为 `edge-tts-universal@1.4.0`，AGPL-3.0。其[当前 README](https://github.com/travisvn/edge-tts-universal)说明普通浏览器无法设置所需 WebSocket 请求头，浏览器直连仅支持 Edge，Node 路径不受同一浏览器限制。由此推断，Obsidian 移动 WebView 不能直接沿用旧版“全平台直连”承诺；本轮没有手机实测。声明 `isDesktopOnly: false` 不足以证明这条链路当前可用。
- **本机实测**：使用 `uv` 在 `/tmp/qiaomu-tts-research/uv-cache` 隔离环境运行 `edge-tts==7.2.8`，未改项目依赖或系统 Python 安装。音色列表读取成功，包含 `zh-CN-XiaoxiaoNeural`、`zh-CN-YunxiNeural`、`zh-CN-YunjianNeural`。
- **实际合成结果**：晓晓、云希分别合成同一条自拟短句，两次均在 WebSocket 握手阶段返回 HTTP 403（`WSServerHandshakeError`），没有成功生成音频。未对云健执行合成。尚不能区分网络、地区、客户端与服务端策略等因素，不将两次失败推广为“Edge TTS 已失效”。
- **文案校正**：可以说明社区客户端无需 API Key；不能承诺“无限制”“永久免费可用”或“稳定不卡顿”。现有库支持语速、音量、音高，但上游明确限制自定义 SSML，不能把 Azure 的全部情感/风格能力视为 Edge 客户端都有。
- **更新后的建议**：将 Edge 列为优先验证的免费在线候选。桌面先独立验证 Node 传输、短句、长文与时间边界；通过后可作为在线首选，失败提供系统语音入口，不自动切换到收费云服务。移动端优先系统语音，若未来采用用户自有或产品中转服务，则需单独评估部署、运维与正文传输路径。本轮不部署中转、不更改许可证、不复制 AGPL 实现。

目前没有足够实测证据把 Edge 设置为全平台默认服务；免费体验的方向可保留，默认路线以接入实测结果决定。


## 实施更新：多服务与真实播放（2026-10-12）

已实现独立的文本、播放会话、HTTP 服务与桌面 Edge 传输模块。默认系统语音；云端按用户选择发送朗读片段，不复用聊天登录凭据。API Key 放入 Obsidian SecretStorage。每次最多预取后续一段，20 MB 内存 LRU 缓存，停止后丢弃在途结果。播放器改速复用音频；系统语音改速从下一片段生效。

服务入口包括系统、Edge、OpenAI、兼容接口、千问、豆包、MiniMax、硅基流动与 ElevenLabs、Azure。各服务独立保存模型和音色；协议差异不伪装成聊天兼容。

| 补充服务 | 官方接口与适配方式 | 结论 |
| --- | --- | --- |
| [豆包语音](https://docs.volcengine.com/docs/DoubaoVoice/unidirectional-streaming-text-to-speech-http?lang=zh) | V3 HTTP，X-Api-Key + 语音资源 ID；NDJSON 的 base64 音频包 | 本轮专用适配；短片段整包播放，暂不声称实时流式 |
| [MiniMax](https://platform.minimax.cn/docs/api-reference/speech-t2a-http) | `/v1/t2a_v2`；Bearer；检查业务状态并解码 hex 音频 | 本轮专用适配；国内站默认，国际站地址可改 |
| [硅基流动](https://docs.siliconflow.cn/docs/api/audio-speech-post) | `/v1/audio/speech`；CosyVoice2 模型与带模型前缀的音色名 | 复用 OpenAI-compatible 传输，提供独立默认配置 |
| [ElevenLabs](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) | URL 中的 voice ID、xi-api-key、model_id | 本轮独立适配；预置官方示例声音，可自行改 ID |
| [Fish Audio](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech) | 自有 TTS 协议和 reference_id | 候选，尚未实现；不等同于通用 OpenAI 兼容 |
| [Google Cloud](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd) / [Amazon Polly](https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html) | 自有音色、鉴权及语音 API | 后续按已有账号需求接入，未实现 |

本轮没有音质排名；云端协议测试不能替代用户账号的授权、余额和真实音色试听。

### Edge 403：定位与修复

旧端点两种音色都返回 403 后，继续检查了 [Readest 已合并 PR #6722](https://github.com/readest/readest/pull/6722) 和 [edge-tts issue #490](https://github.com/rany2/edge-tts/issues/490)。Readest 修复于 2026-10-11 19:02 UTC 合并：切换到 `api.msedgeservices.com/tts/cognitiveservices/websocket/v1`，客户端标识参数改为 `Ocp-Apim-Subscription-Key`。本项目独立调整协议常量，没有复制 Readest AGPL 组件代码。

同机同短句、新连接、无缓存实测：晓晓返回 26,352 字节 MP3、耗时约 1.15 秒、音频 4.392 秒；云希返回 30,816 字节、约 1.21 秒。随后在 Obsidian QA 库用插件实际播放 Edge 短句：readyState=4、duration=4.152 秒、currentTime 正常推进，最终 ended，无捕获异常。此次不需要 Python、中转或用户 API Key。

此证据只证明当前机器/网络可用，不保证所有地区或未来持续可用。Readest 网页还有登录后的 HTTPS 中转，原生客户端则走带请求头的 WebSocket；本插件目前未实现移动原生桥或中转，不借用他人的后端。

### 参考 Readest 的 UI

读了固定提交 `074603ce62eedd60498b4bf19c542cf449f09b20` 的 `TTSMiniPlayer.tsx`、`TTSPlayerSheet.tsx`、`EdgeTTSClient.ts` 和 provider/session 接口，结合[官方 Listen 文档](https://www.readest.com/docs/listen)。借鉴迷你播放器与展开选项分层、居中播放键、段落前后切换、稳定控件宽度与主题一致性。不会用估算进度冒充逐词时间戳，也不复制其后台播放或手机支持承诺。

### 当前验收边界

- 真实 Obsidian QA：系统语音短句 start/end、Edge 在线音频播放至结束。
- 本机 HTTP 测试音频：真实 requestUrl→Audio、暂停继续、从章节索引 8 连续进入 9、临时高亮、停止清理；这不是付费厂商实测。
- 10 项服务设置入口与豆包资源 ID 字段已在真实界面检查；新文案为中文/英文，其余语言回退英文。
- EPUB 从当前位置/选文朗读并跨章；PDF 首版仅当前页提取文字，扫描 PDF 不提供 OCR。
- 尚未做：付费服务账号实测、长时间压力验证、移动真机、后台/锁屏播放。
- `ws` 使用已修复本轮已知通报的 8.21.0；项目原有开发依赖的审计告警另存记录，未执行无关批量升级。
- 原有 5 MB 单文件工程预算不足以容纳新增传输和许可证；构建与验证共同使用 5.2 MB 预算。它是项目预算，不是 Obsidian 官方限制。
- 尚未发布；播放器视觉方向正在确认，最终候选需重新构建、安装及扫描。

## 播放器内模型、音色与试听（最终候选 4.7.0）

用户选择 B「极简浮条」后，继续要求常用设置全部在播放器完成。紧凑态保留五个控件；展开后是服务、模型、音色、试听。选择后保留当前段落并暂停；试听使用固定短句，成功、失败或手动停止都会恢复暂停的阅读会话，不自动朗读付费正文。倍速与段落保留。API 密钥仍使用 SecretStorage，只有首次配置服务需要设置弹窗。

| 服务 | 模型选择 | 音色选择 |
| --- | --- | --- |
| 系统 | 隐藏，无独立模型 | 设备 getVoices，监听 voiceschanged |
| Edge | 隐藏，无独立模型 | 常用中英粤语/台湾音色，支持自定义 ID |
| OpenAI | mini-tts、tts-1、tts-1-hd，自定义 | 按模型过滤预置音色，支持自定义 |
| OpenAI-compatible | 自定义模型 | 自定义音色，不假设所有聚合服务都有相同目录接口 |
| Qwen | Flash、Instruct Flash、旧 Qwen-TTS，自定义 | 四个常用预置音色，自定义/复刻 ID |
| 豆包 | Seed TTS 2.0/1.0 对应 resourceId，自定义 | 按资源过滤；换版本自动更新默认音色 |
| MiniMax | 2.8/2.6/02 HD/Turbo，自定义 | 常用音色，get_voice 加载系统/复刻/生成音色 |
| 硅基流动 | CosyVoice2、MOSS TTSD，刷新音频模型目录、自定义 | 模型前缀自动联动；账号自定义音色按 model 过滤 |
| ElevenLabs | 内置模型及 /models TTS 筛选，自定义 | /v2/voices 分页（最多1000，更多可填ID），支持账号音色 |
| Azure | 隐藏，无独立模型 | 常用音色及所选区域的 voices/list，自定义 |

音色目录获取成功只表示列表已更新，不标记为试听成功。新模型无已知音色时清空旧音色，要求用户选择/输入，不拼接猜测 ID。错误文案在播放器内展示，可直接配置或切换服务。

官方协议依据（2026-10-12复核）：
- [硅基流动音频合成](https://api-docs.siliconflow.cn/docs/api/audio-speech-post)：MOSS支持单音色voice，CosyVoice与MOSS均使用模型前缀；未实现双人对话/参考音频上传。
- [硅基流动账号音色](https://api-docs.siliconflow.cn/docs/api/audio-voice-list-get) 与 [模型列表](https://api-docs.siliconflow.cn/docs/api/models-get)：type=audio 后筛选TTS，排除ASR。
- [豆包官方音色表](https://docs.volcengine.com/docs/DoubaoVoice/Tonelist-1?lang=zh)：在真实浏览器读取渲染表格，核对2.0 Vivi、小何、云舟、小天等以及1.0思思、阿虎、小何。ListSpeakers需要另一套开放平台签名，不拿语音API Key冒充AK/SK。
- [MiniMax音色接口](https://platform.minimax.io/docs/api-reference/voice-management-get)：POST get_voice, voice_type=all。
- [ElevenLabs音色](https://elevenlabs.io/docs/api-reference/voices/search)、[模型](https://elevenlabs.io/docs/api-reference/models/list)：xi-api-key，分页加载，过滤can_do_text_to_speech。
- [Azure REST](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech)：区域音色列表与订阅密钥。
- [OpenAI TTS](https://developers.openai.com/api/docs/guides/text-to-speech)：模型与预置音色支持范围。
- [Qwen非实时TTS](https://help.aliyun.com/en/model-studio/non-realtime-tts-user-guide) 与 [音色表](https://help.aliyun.com/en/model-studio/qwen-tts-voice-list)：仅使用现有非实时接口兼容模型；不列CosyVoice/Realtime等不同协议模型。

验收：398个测试通过；真实Obsidian隔离库中硅基流动MOSS+Claire、豆包1.0/2.0联动通过。Edge云希试听实际音频4.248秒，结束后原owner、index=1、rate=1.5恢复为paused；模拟403（清空缓存后）同样保留位置并显示错误。Escape关闭倍速面板后保持阅读器活跃，焦点回倍速按钮。320px容器中播放器296px无横向溢出；纸色/夜间截图检查通过，无新增title/aria-label悬浮提示。付费服务只有协议/目录测试，未使用真实付费API Key；窄屏模拟不是手机真机证明。
