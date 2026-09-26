# Reader 4.4.1 最终构建候选验收

**当前状态：4.4.1 最终构建候选已完成本地安装复验并提交 PR #33；290 项测试、i18n、src lint、standard/community 构建及 CI 通过。rockfish 和隔离 release vault 已重载最终三资产，原书手机模拟结果见文末。官方预扫描与公开发布尚未完成。**

基线：`origin/main` = `7157656`，远端 manifest 4.4.0；rockfish 原安装同为 4.4.0。分支 `codex/reader-notes-epub-context`。未推送、未公开发布、未提交官方扫描。

## 根因与修复

1. 部分新建书籍笔记入口绕过 BookSetupModal；路径设置拒绝不存在的目录；空字符串被 `||` 回退到默认目录；目录创建失败曾退回根目录。现复用创建对话框，提供路径输入/选择，设置持久化，逐级建目录，明确空路径为根目录，不移动已有文件。
兼容迁移补充：`noteFolderRootSemanticsMigrated` 一次性物化旧版空 bookNotesFolder/lastNoteFolder 继承 notesFolder 的实际目录。此后明确 root 保持空。迁移在恢复 progressBackups 后落盘，避免丢备份；测试覆盖恢复/保存顺序、序列化重载和已有笔记链接不变。

2. 原生 AI composer 缺少文件拖放处理。现使用集中兼容适配器读取 Obsidian 文件树 native file/files 载荷及标准 wiki/Obsidian URI，库内读取 EPUB，按 spine 顺序提取独立文档正文，作为逐轮结构化上下文。
3. 新建始终避让任何现有文件，包括未关联的同名普通笔记；只有明确选择已有笔记才能复用。文件已创建后，设置/关联保存异常仍返回该文件并提示，避免误报创建失败后生成重复副本。
4. BookSetupModal 的成功、失败、保存中关闭均只结束一次回调；不会让 prompt Promise 或翻译保存串行队列永久等待。
5. EPUB 的压缩文件、目录声明大小、累计实际解压大小、单条目、条目/章节数量均有限制。正文预算直接复用 PDF_AI_CONTEXT_MAX_CHARS；超过预算在 UI 和请求上下文中标记截断。解析不调用模型；提取中拦截发送；过期任务不得回填。
6. 主进程用原《追问》复现了初始容器 `display:none`、300ms 后显示时导航失败并销毁引擎的问题。引擎现于 `view.open` 后等待容器宽高均大于零，再布局和恢复位置；关闭时通过 AbortSignal 取消等待。该修复针对已证实的初始化时序，不代表已确认用户手机空白的唯一根因。

## 自动检查

- 最终 `npm test`：290/290 通过。包括同名普通笔记保护、保存失败后保留文件、保存中关闭、队列释放、root/nested path、旧配置一次性迁移、整书顺序、损坏/空文本/外部路径、超限/伪造目录 size、取消/关闭/切换/重复拖入、发送快照、未发送不调用 provider，以及隐藏容器等待与取消的 4 项新增测试。
- `npm run check:i18n`：1326 keys，简体中文及 7 个附加语言包通过。
- 最终 `npx eslint src`：0 errors / 0 warnings；路径与附件测试此前单独 lint 同样通过。
- `npm run build`、`npm run verify:release`、`npm run build:community`：通过。
- 两渠道 `verify-release` 均为 `installVerified: false`：本轮只验证候选，尚未复制到 rockfish。standard main.js 5,197,760 bytes，community 5,197,761 bytes，均低于 5,200,000 bytes 上限。
- 额外运行 `eslint src tests scripts` 有 11 errors / 46 warnings；11 项错误逐项在上游 `7157656` 源码验证存在，来自既有测试和构建脚本。本轮 src lint 无问题，未扩展修复既有规范问题。

## rockfish 真实宿主（最终迁移与引擎补丁之前的安装）

- 已先运行 `obsidian help plugin:reload`，随后按 `obsidian vault=rockfish plugin:reload id=qiaomu-reader` 重载，runtime manifest 确认为 4.4.1。
- 原插件 main.js/styles.css/manifest.json 备份到 `backups/rockfish-4.4.0-20260926-200026/`（Git 忽略）。每次安装均只复制这三份文件，data.json 与缓存 3 个文件在复制前后 hash 相同。
- 设置页真实输入尚不存在的嵌套路径，两项值落盘到 data.json；重载后仍为测试设置的嵌套路径。
- 真实 BookSetupModal 创建多级目录笔记与根目录笔记；选文菜单打开 NoteTitleModal，清空文件夹字段后确实在根目录创建摘录，没有回退到非空默认路径。
- 宿主调用新建逻辑，同名普通 Markdown 保持内容不变，新文件自动使用 `(2).md`。测试文件已移入系统废纸篓；个人目录设置及唐诗原有笔记关联已恢复。
- 文件树《唐诗三百首》拖入原生 AI 伴读：曾用 CDP 鼠标移动/按下/拖动/放开验证；当时已安装构建再次触发真实文件树 dragstart 处理器，再将其原始 DataTransfer 交给输入区 drop。捕获 `type=file`、实际 vault path、`text/plain` 与 `text/uri-list`（Obsidian open URI），未伪造 native draggable。
- 附件 **50,301 字**、未截断、正文包含李白及书末内容，书名/字数正确显示。移除有效。全过程 AI 对话轮数 **0**，没有发送模型请求。
- 宿主延迟 readBinary 后立即关闭伴读，关闭后 loading 清除、没有旧附件回填，对话轮数仍为 0。
- 截图保存在本机 `/tmp/reader-441-final.png`。未将个人库截图提交到仓库。

## 最终 standard 候选 SHA256（仓库根目录；最终安装已核对）

| 资产 | bytes | SHA256 |
| --- | ---: | --- |
| `main.js` | 5197760 | `e82bf3e02b06e8d3cd58e48849c9013c94c657013e6308a6b1bb881c7d629f22` |
| `styles.css` | 3661364 | `fee2d54cbb6768cd07d043ee65626eab15a1f0622a489fc0e48a66ea2119188d` |
| `manifest.json` | 328 | `fd536a290bca3ea1be82f4de9df933c54d198a05c6a598d8352c1d7e9d1f8e93` |

Community 最终构建位于 `dist/community/`，main.js 为 5,197,761 bytes，SHA256 `1fb496ed6dfb0bd681602c49546b53a04476b5eb18f98c554da9597333db0c21`；styles.css、manifest.json 的 bytes/hash 同上。standard 与 community 有构建渠道 banner 差别，发布方请按实际渠道核对。

## 原《追问》与隐藏首开证据

- 原文件 SHA256：`61bd06bfef237cffd98fbf0784b201e739b07c158045d267b13f4766b71f885b`。只读 ZIP 检查 CRC 正常，72 条目、58 个 spine 章节，资源引用无缺失；没有明确书籍特有损坏证据。
- 主进程报告：4.4.0 的真实 ReaderModal + Obsidian `dev:mobile on` + CDP 390×844，封面 SVG、书名页图片、正文、CFI 恢复与 scroll 正常；58 章节遍历无空章/坏图。这是桌面宿主移动模拟，非手机实机验收。
- 明确复现：engine host 初始 `display:none`，300ms 后显示；修复前报 `Could not load a readable book location`，引擎销毁后不能恢复。
- 修复后主进程宿主记录 `/tmp/reader-blank-qa/hidden-after.json` 已核读：显示前 location 为 null，显示后有 CFI，封面宽 335.40625、高 481.4296875，下一页图片 `nextImageLoaded: true`。
- 未在用户手机实机测试；无法据此认定其设备原始空白现象的唯一根因。最终候选的安装、reload 与宿主验收结果见文末。

## 边界与现场观察

- 本次拖入整书只支持 vault 内 EPUB，一次一本；系统外部文件、MOBI/PDF 拖入、OCR 未新增。PDF 原有上下文流程保留。
- 未发送附件仅驻留当前 composer，不跨关闭/重载保存；已发送上下文沿用历史存储。
- 移动端真实拖放、多窗口、DRM 实际样本、完整模型生成回合未验收；测试中的 provider 全部使用模拟实现。
- 此前隐藏 Reader leaf 首开失败现已纳入上述初始化时序修复；曾观察到的 ResizeObserver loop 通知未单独证明已消除。

最终检查日志：`/tmp/reader-final-tests.log`、`/tmp/reader-final-standard-verify.log`、`/tmp/reader-final-community-build.log`。版本为 4.4.1（package、lock、manifest、versions 一致）；最终安装与提交状态见文首及文末。

## 最终产物安装复验

- standard 最终三资产已安装到 rockfish 与隔离 release vault，复制时 data.json 与所有缓存文件摘要保持一致；重载后均为 4.4.1，目录迁移标记正常。`verify-release.mjs <rockfish plugin>` 逐字节验证通过。
- 最终安装版本用用户原始《追问》在真实 ReaderModal + Obsidian mobile emulation + 390×844 视口复验：隐藏容器 300ms 期间保留加载任务，显示后打开成功；58 个章节全部有正文或图片，图片全部加载；封面宽度 307.9px，CFI 恢复成功。
- 证据保留于本机 `/tmp/reader-blank-qa/final-mobile-results.json`，原书及书内文字没有提交到仓库。以上是桌面宿主手机模拟，尚无 Android/iOS 实机复测结果。
