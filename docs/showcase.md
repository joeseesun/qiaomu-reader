# 正式版本截图 / Release screenshot evidence

日期：2026-11-03。环境：macOS、Obsidian **1.13.7**、正式发布的 **Qiaomu Reader 4.9.4**。插件 ID：qiaomu-reader。

## 安装与内容来源

使用独立演示仓库与独立 Obsidian profile，没有使用日常仓库的书籍、对话或账号。安装文件与 [4.9.4 Release](https://github.com/joeseesun/qiaomu-reader/releases/tag/4.9.4) 一致；发布提交为 b857729a7e41eeaf5b04a1f58c65e60776872ea6。

| 安装文件 | SHA-256 |
| --- | --- |
| main.js | 8ca2fd0b2415bc6352bcf419678362308334d8212186395d58d124cb8a28445c |
| manifest.json | ac42ce521c38fb1f21b79cdbfbf4029ef9733b6d19a83df120a9df9299bd1c6b |
| styles.css | f0611d27ad35d5ac4e959437c4e74485331293603fd38cba8ab1791d3a5706f7 |

## 五张新版截图

| 截图 | 真实操作与证据 |
| --- | --- |
| [书库与继续阅读](assets/showcase-4.9.4-library.jpg) | 插件正常安装六本内置公版 EPUB；打开图书后生成阅读位置，实际划线计数与继续阅读入口可见 |
| [发现图书](assets/showcase-4.9.4-discovery.jpg) | 通过「找书」打开公开书源，真实加载 Hacker Books 榜单、主题与封面；当次完整书单为 15,362 条，数量不作为永久承诺 |
| [划线、批注与笔记](assets/showcase-4.9.4-notes.jpg) | 在实际 EPUB 文本上创建高亮并保存原创批注；插件生成的 Markdown 笔记含原文、批注和回跳链接，已读回确认 |
| [自定义伴读提示词](assets/showcase-4.9.4-ai-prompts.jpg) | 真实编辑器展示两条原创模板，分别编辑展示名称与实际 Prompt；没有模拟 AI 回答或发送模型请求 |
| [查词、生词本与朗读](assets/showcase-4.9.4-lookup-speech.jpg) | 选中 curiosity，通过谷歌取得“好奇心”的真实结果并收录到生词本；播放器已展开但未开始播放 |

原始捕获为 2400 × 1600，使用 Electron NativeImage 等比缩小为 1200 × 800 JPEG；每张小于 5 MB。没有合成控件、替换文字、拼接页面或用生成式图片修改界面，已逐张查看真实渲染。

书籍、封面与原文许可见[示例书说明](../assets/starter-books/README.md)。阅读进度和批注是演示操作后的状态，不代表首次安装的默认记录。Hacker Books 是公开元数据书单，不是随插件打包的电子书。

## 验证边界

本轮证明桌面真实界面及上述操作，不代表移动真机、全部 AI 服务、朗读质量、Anki 同步或 Kindle 设备验证。谷歌查词确实发起了请求；AI 与朗读截图没有发起生成或播放请求，不用于宣称服务已连接。

官方文案与图片顺序见 [listing-4.9.4.md](listing-4.9.4.md)。插件运行代码、版本和安装资产不变。旧版截图证据保留在 [showcase-4.2.4.md](showcase-4.2.4.md)。

## English

These five captures show the unmodified public 4.9.4 release in an isolated Obsidian 1.13.7 desktop vault. The plugin saved the highlighted passage, comment, linked Markdown note and vocabulary entry. Discovery loaded live public metadata; Google returned the displayed dictionary result. The prompt editor contains original templates, without a simulated AI reply. Read-aloud controls are idle. Retina captures were proportionally resized to 1200 × 800, with no composited or generated interface elements. Reading progress is demonstration state. These images do not establish mobile coverage, AI/speech quality, Anki delivery or Kindle-device behavior. Third-party book, cover and Obsidian rights remain with their respective owners and licenses.
