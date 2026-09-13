# Qiaomu Reader

**中文** · [English](#english) · [官方插件页 · 安装](https://community.obsidian.md/plugins/qiaomu-reader) · [问题反馈](https://github.com/joeseesun/qiaomu-reader/issues)

> 不离开书页，读懂一个观点，留下一条真正有用的笔记。
> Read, ask, and keep what matters — without leaving your book in Obsidian.

**已上架 Obsidian 社区插件市场。** 打开 [Qiaomu Reader 官方插件页](https://community.obsidian.md/plugins/qiaomu-reader)，点击 **Add to Obsidian**，在 Obsidian 中点击 **安装 → 启用**。

也可以在 Obsidian 中进入 **设置 → 第三方插件 → 浏览**，搜索 **Qiaomu Reader**，选择作者为 **向阳乔木** 的插件。首次使用第三方插件时，先按提示开启社区插件。[完整安装步骤](#安装)

![Qiaomu Reader 4.2.4 内置书库：六本中英文公版电子书，包含真实封面、继续阅读、划线数量与阅读笔记入口](docs/assets/showcase-4.2.4-library.jpg)

**安装后，书架里就有六本书。** 从《道德经》《唐诗三百首》《世说新语》或三本英文经典开始，直接体验阅读、划线和做笔记，无需先找书或配置 AI。

Qiaomu Reader 是中文优先的 Obsidian EPUB、PDF、FB2、MOBI、AZW3 和 CBZ 阅读器。它把**舒适阅读 → 就地提问 → 保存笔记 → 返回原文**放在同一个工作流里，减少在阅读器、聊天窗口和笔记应用之间来回复制。

阅读本身完全离线，每本书关联一篇 Markdown 阅读笔记；AI 是可选能力，由你选择服务并主动启用。

[安装与快速开始](#安装) · [功能导览](#功能导览) · [构建验证](https://github.com/joeseesun/qiaomu-reader/actions) · [GPL-3.0 许可](LICENSE)

**截图版本：4.2.4。** 以下五张截图均来自安装正式 Release 文件的 Obsidian 1.13.7，展示内置书架、选文操作、划线笔记、AI 伴读和 PDF 原页。使用隔离演示仓库、公版示例书与原创 PDF；AI 对话明确标注为界面演示，未调用模型。详见[截图与版本核验](docs/showcase.md)。

## 你会得到什么

| 能力 | 实际效果 |
| --- | --- |
| 内置阅读器 | EPUB 可重排；PDF 保留原页，独立缩放，图表不被拆散；FB2、MOBI、AZW3、CBZ 由同一引擎渲染 |
| 中文排版 | 仅内置朱雀仿宋常用字子集；支持选择本机字体、导入字体文件，缺字使用系统字体回退 |
| 阅读主题 | 纸白、暖纸、青瓷、月白和夜间；只改变书页，工具栏跟随 Obsidian |
| 就近批注 | 选中文字后完成三色划线、复制、评论和创建摘录笔记 |
| 专用阅读笔记 | 每本书自动关联一篇 Markdown 笔记，汇总划线与评论 |
| 精确返回原文 | 笔记中的 `↩` 可跳回原书对应段落 |
| 阅读连续性 | 自动保存位置、可命名位置标记；搜索后能返回原阅读点 |
| 就地 AI 对话 | 阅读和聊天并排；按书管理对话，选文、当前页或文本 PDF 全文作为上下文 |
| 流式 Markdown | 回答边输出边渲染；表格、任务列表、引用、代码块等交给 Obsidian Markdown 渲染器 |
| 回答成为笔记 | 保存完整 AI 回答，本地提取可修改标题；独立保存或追加到本书笔记 |
| 少打断的交互 | 快捷问题直接可见；草稿按书落盘；专注阅读保留右侧 AI，不带回左侧文件树 |
| 自选 AI 服务 | 保留自定义提示词；支持 CLI / ACP、国产模型、OpenAI 兼容接口及本地模型 |

## 功能导览

### 1. 从书架开始，接着上次的位置读

首页主图展示插件内置的六本中英文公版书，每本都有封面。书库提供继续阅读、搜索、阅读状态和“有划线”筛选；书名下方直接显示划线数量与阅读笔记入口。也可以添加自己的 EPUB、PDF、MOBI 等图书。

**桌面端可以从本机 [Calibre](https://calibre-ebook.com/) 书库按需加入图书。** 在书库点击「从 Calibre 添加」，或使用命令面板。默认读取书库里的 `metadata.db`（需要 Python 3）；若没有 Python，则回退到 `calibredb`。选定的 EPUB / PDF / MOBI 等文件会拷贝进当前仓库，不会把整座 Calibre 书库挂进 Obsidian。移动端不提供此入口。

![从 Calibre 按需加入书库](docs/assets/calibre-import.png)

### 2. 选中一句话，就地划线、批注或提问

![4.2.4 选文工具栏：划线与颜色下拉、批注、问 AI、复制；正文使用青瓷主题与双页布局](docs/assets/showcase-4.2.4-selection.jpg)

**4.2.7 更新：** AI 助读更名为 AI 伴读；宽屏桌面首次打开书时展示侧栏，并记住主动关闭状态。未配置服务可直接在侧栏完成配置。翻译结果可保存到本书笔记、当前打开的笔记、新笔记或今日笔记，同时保留原文和位置链接。

**4.2.6 更新：** 选文工具栏默认仅显示图标，启用翻译后显示翻译按钮。在「设置 → 翻页操作 → 选文工具栏」可调整按钮显示与顺序、开启文字标签；隐藏功能仍在“更多”和右键菜单中。AI 回复的“查看原文”支持跨章节与重新打开原书定位。

选中文字，常用操作出现在选文旁边；右键也能使用这些功能。划线颜色通过下拉菜单切换，三种颜色使用统一样式。朱雀仿宋随插件离线提供，也可选择本机字体或导入字体文件；主题、字号、行距与单/双页布局可在阅读设置中调整。书页背景覆盖阅读区域，工具栏跟随 Obsidian。

### 3. 划线成为笔记，还能回到原文

![4.2.4 划线与笔记并排：左侧原书粉色划线，右侧 Markdown 阅读笔记包含引文、回跳链接与批注](docs/assets/showcase-4.2.4-notes.jpg)

每本书关联一篇 Markdown 阅读笔记。划线与批注自动汇总，引文右侧的 `↩` 链接用于返回书中对应位置。原文、自己的理解和来源留在一起，后续可以继续在 Obsidian 中整理与连接。

### 4. 需要时，围绕选文和 AI 讨论

![4.2.4 AI 伴读：书页与对话并排，问题保留选文来源，快捷问题位于输入框上方；图中回答为明确标注的界面演示](docs/assets/showcase-4.2.4-ai.jpg)

已打开 AI 伴读时，新选文自动更新待提问上下文；选中本身不会发送请求。快捷问题保持可见，非中文选文增加翻译入口。每条已发送问题保留当时的来源，之后翻页或切换选文不会改写旧问题。

回答可以复制，或完整保存为独立 Markdown 笔记、追加到本书笔记；保存前可修改自动提取的标题。AI 是可选功能，配置服务后由你主动发送问题。图中固定示例仅展示交互，不代表模型效果或响应速度。

### 5. PDF 保留原页面与图表

![4.2.4 PDF 阅读：两页原创演示 PDF 并排呈现，保留双栏文字、图表和表格，顶部显示独立缩放控件](docs/assets/showcase-4.2.4-pdf.jpg)

PDF 保留原始版式，支持独立缩放。有可靠文字层时，可选择、复制、搜索、划线、批注和向 AI 提问；扫描页仍能阅读和保存进度，但不提供没有文字层支撑的搜索或文字问答。

目录、书内搜索和位置跳转集中在底栏。搜索支持结果高亮、`Enter` 下一处、`Shift+Enter` 上一处、`Esc` 关闭，并保留返回原阅读位置的入口。

## 离线示例书

从 4.2.5 起，首次打开书库会自动加入六本 EPUB 示例书，即使仓库已有书籍或 PDF 附件。此前被旧版自动跳过的安装也会在打开书库时补齐；不会覆盖同名文件，已经成功导入后主动删除的示例书不会再次自动添加。也可在设置 → 存储与同步 → 添加示例书中手动恢复。

六本示例书的正文均无插图，配有封面：道德经、唐诗三百首、世说新语、Jekyll and Hyde、Alice in Wonderland 和 Meditations。英语作品保留英语版本，无现代中文译本。文件随插件打包，运行时不从古腾堡下载；这些版本在美国属于公版，其他地区需按当地版权规则判断。书籍保留 Project Gutenberg 的完整许可，与插件 GPL 许可分开，详见[版本、来源与许可](assets/starter-books/README.md)。

## 安装

### 从 Obsidian 社区插件市场安装（推荐）

1. 打开 Obsidian，进入 **设置 → 第三方插件（Community plugins）**。首次使用时，点击 **开启社区插件（Turn on community plugins）**。
2. 点击 **浏览（Browse）**，搜索 **Qiaomu Reader**。
3. 选择 **Qiaomu Reader**，确认作者为 **向阳乔木**，点击 **安装（Install）**。
4. 安装完成后点击 **启用（Enable）**，打开左侧工具栏的书库图标，开始阅读。

也可以打开 [官方插件页](https://community.obsidian.md/plugins/qiaomu-reader)，点击 **Add to Obsidian** 并允许浏览器打开 Obsidian，再完成安装与启用。如果浏览器没有唤起应用，使用上面的应用内搜索步骤即可。桌面和移动端都可以从第三方插件市场安装；本机 CLI 助读仅限桌面。

阅读、划线和笔记无需配置 AI；首次打开书库即可体验内置公版书，也可以添加自己的图书。需要 AI 时，再进入插件设置选择服务并测试连接。

**更新插件：**进入 **设置 → 第三方插件 → 检查更新（Check for updates）**，找到 Qiaomu Reader 后点击更新。社区插件不会自动更新。

<details>
<summary>旧版 Qiaomu Book Reader 用户迁移</summary>

新版插件 ID 为 `qiaomu-reader`，请搜索 **Qiaomu Reader**。先备份仓库并禁用旧版 Qiaomu Book Reader，再启用新版，避免两个阅读器同时注册同一文件类型。书籍与 Markdown 笔记保留在原位置。

需要保留旧设置和阅读数据时，在两个插件均禁用的情况下，将 `.obsidian/plugins/qiaomu-book-reader/` 中的 JSON 数据文件复制到 `.obsidian/plugins/qiaomu-reader/`，**不要复制旧版 `manifest.json`**，并保留原件作为备份。旧笔记中的 `obsidian://qiaomu-book-reader` 回跳链接仍受支持。

</details>

<details>
<summary>备用方式：通过 BRAT 安装</summary>

1. 在 Obsidian 第三方插件市场安装并启用 **BRAT**。
2. 打开 BRAT → **Add beta plugin**。
3. 输入 `joeseesun/qiaomu-reader`。
4. 在“第三方插件”中启用 **Qiaomu Reader**。

此方式使用 GitHub Releases，后续更新由 BRAT 管理。一般用户使用上面的官方社区安装即可。

</details>

<details>
<summary>手动安装</summary>

从 [最新版本](https://github.com/joeseesun/qiaomu-reader/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`，放入：

```text
<你的仓库>/.obsidian/plugins/qiaomu-reader/
```

重新加载 Obsidian 后启用插件。插件 ID 为 `qiaomu-reader`。

朱雀仿宋常用字子集内置于 `styles.css`，随三个插件文件安装；新增安装默认使用该字体，已有字体偏好保留。子集来自 v0.212 预览测试版，覆盖 7,554 个码点，未包含的字符使用系统字体回退。选择“自定义字体”后，可浏览本机已安装字体，或导入 TTF、OTF、WOFF、WOFF2 文件。导入字体随仓库同步；手机不能枚举本机字体时可使用文件导入。

其他字体的官方下载入口与安装方法见[字体说明](fonts/README.md)。

</details>

## AI 辅助阅读

“保存 AI 回复”把完整 Markdown 回答作为笔记正文，原文放在后面的来源区。标题在本地根据回答的主题标题、重点短语或内容句自动提取，过滤“总结”“关键概念”等通用小标题；保存前可修改，不额外调用模型。保存成功后按钮变为“已保存 · 打开笔记”，不会关闭对话，也不会自动抢走阅读焦点。

未发送草稿按书保存在独立本地文件中（最多 30 本、每本最多 20,000 字符），关闭面板或重启后可恢复；生成中输入的新问题不会被上一轮完成动作清掉。插件不主动同步草稿，但第三方同步如果包含整个插件目录，仍可能复制它。新建对话保留当前草稿；已发送的来源固定在对应问题下。单条删除与批量清空都需要确认，删除当前对话后不会在关闭面板时重新写回。

AI 默认关闭。启用后，文本型 PDF 会把整份可提取文字作为新对话的默认上下文；如果选中了原文，则本轮改用选文上下文做精读。常规 PDF 发送全文，超过 180,000 字符时按页均匀精简并明确标注，避免只截掉后半本。你可以通俗解释、举例、提炼要点、联系实际、换角度分析或生成测试题，并继续自由追问。书内“阅读设置”新增“AI 伴读”标签，可就近开关 AI、查看当前服务与模型、调节思考模式/强度和回答语言；API 密钥、接口地址等低频敏感配置仍留在插件系统设置。DeepSeek V4 可单独开关思考模式；模型提供思考过程时会单独显示，回答完成后自动折叠，不与正式回答混在一起。

- 本机账号：Codex CLI、Claude Code CLI、Grok CLI、Kimi Code CLI、ZCode CLI。安装并登录一次后，插件可直接复用账号，无需再填 API 密钥。每个 CLI 分别记住自己的模型和思考强度；Grok 的常驻 ACP 会关闭后台自动更新，避免更新进程阻塞首字输出。
- 国产模型：DeepSeek、Kimi、通义千问、智谱 GLM、MiniMax。
- 聚合服务：硅基流动、豆包/火山方舟、OpenRouter。
- 国际服务：OpenAI。
- 本地模型：Ollama、LM Studio。
- 高级配置：任意 OpenAI 兼容接口。

API 密钥保存在 Obsidian 的密钥库中，不会写入插件 `data.json`。设置页可发送一条不含书籍内容的最短消息测试连接。

CLI 模式会自动检测可执行文件和登录状态，在独立临时目录中运行，并拒绝工具、文件和终端权限。Grok 与 Kimi 使用 CLI 自带的 ACP；Codex 使用 [`codex-acp`](https://github.com/agentclientprotocol/codex-acp)，Claude 使用 [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)，ZCode 目前使用社区 [`zcode-acp`](https://github.com/william0wang/zcode-acp)。同一阅读对话复用常驻进程与 ACP session，首轮发送阅读上下文，后续只发送新问题；切换或清空对话会使用新的 session。会话过期或 ACP 进程意外退出且尚未产生回答时，插件会自动重建并安全重试一次；登录、模型、会话和进程故障会分别提示。设置页会区分“原生 ACP”和“需单独安装适配器”，提供手动安装指引，并可分别检测 CLI 与适配器路径。插件不会自行安装或更新 CLI、适配器或其他依赖。CLI 模式仅支持桌面版 Obsidian。

桌面 CLI 模式会检测仓库外的已安装可执行程序，并在独立临时目录运行；CLI 的登录与配置由对应工具管理。字体文件只在用户选择导入后读取并复制到仓库；本机字体枚举仅由点击字体选择按钮触发。

## 界面语言

支持简体中文、English、Русский、日本語、Español、Français、Deutsch、한국어 和 Português (Brasil)。在插件设置顶部选择语言；语言包随插件提供，切换和使用均不联网，日期按所选语言显示。默认仍为简体中文。

设置页即时切换；已打开的书页和 AI 对话重新打开后使用新语言，原文、笔记和回答内容不会被翻译或改写。新增语言覆盖界面文案，翻译仍欢迎母语使用者反馈；俄语中的部分新增功能继续使用英语回退。

## 外观与阅读设置

插件设置的“外观”页和书内“阅读设置”使用同一组数据。书内弹窗按任务分为“阅读”和“AI 伴读”两个标签；主题、正文字体、字号和行距直接展示，分设备外观、电子墨水屏、对齐、插图和沉浸阅读等低频选项收在“更多阅读设置”中。弹窗只在竖向滚动，并为滚动条预留空间，不再遮住控件。

## 阅读笔记如何工作

首次打开一本书时，插件会创建或关联一份带有 `type: reading-note` 标记的专用 Markdown 笔记。之后的新划线和评论自动汇总到“划线与批注”章节；插件不会仅凭书名误把人物、项目或模板笔记当成阅读笔记。

评论以普通正文显示在引文下方，不使用引用样式。每条引文末尾的 `↩` 是返回原书位置的链接。

## 隐私与联网

书籍、进度、划线、评论和笔记均在本地工作，无需账号，没有遥测、分析或广告。

| 可选功能 | 发送内容 | 目标服务 |
| --- | --- | --- |
| 翻译所选文字 | 当前选中的段落 | Google Translate |
| AI 辅助阅读 | 你主动附加的 PDF 全文、当前页或选中文本、书名和问题 | 你明确选择并配置的模型服务 |
| 本机 CLI 账号 | 你主动附加的 PDF 全文、当前页或选中文本、书名和问题 | Codex、Claude、Grok、Kimi 或 ZCode 的云端服务 |
| 本地 AI | 本轮附加的 PDF 全文、当前页或选文、书名与问题，以及必要的对话历史 | 你配置的 Ollama 或 LM Studio 地址；仅在本机地址且服务不转发时留在设备内 |

联网功能均默认关闭。只有在你主动向 AI 提问时，文本型 PDF 才会在该对话首轮发送整书文字上下文；扫描 PDF 不发送页面图片或伪造 OCR 文本。

本机 CLI 模式还会运行你选择的本地 CLI 程序，并使用其库外安装目录、账号登录状态与配置；不会把这些凭据复制到插件配置。CLI 是否联网取决于所选服务。

## 从源码构建

默认构建和社区验证构建均不包含依赖自动安装器。`npm run build:community` 输出到 `dist/community/`，不包含 ACP 自动安装器，保留手动安装指引、检测和常驻对话能力。日常安装使用 [Obsidian 官方社区插件页](https://community.obsidian.md/plugins/qiaomu-reader)。

```bash
npm ci
npm test
npm run check:i18n
npx eslint src/
npm run build
npm run verify:release
npm run build:community
```

构建产物是仓库根目录的 `main.js`、`styles.css` 和 `manifest.json`；可编辑样式位于 `src/styles.css`。发布文件大小由构建与发布校验脚本中的项目预算检查。唯一内置字体的来源、版本与许可见 [fonts/README.md](fonts/README.md) 和 [fonts/OFL.txt](fonts/OFL.txt)。

### 验证与边界

- 当前工作流改造有模块/控制器测试、国际化检查、ESLint、标准及社区候选构建校验；真实桌面 Obsidian 验证覆盖阅读、搜索、回答保存和 PDF 缩放。详见[开发与验收记录](docs/reading-workflow-plan.md)。
- CLI / ACP 仅限桌面；移动真机触控与软键盘仍待专项验证，桌面窄窗口不等于移动端验收。
- 不内置 OCR，不承诺扫描 PDF 可以文字问答；不提供跨书语义检索，也不授予阅读 Agent 文件/终端工具权限。
- 持久 ACP 会话减少重复启动开销，但首字速度仍受 CLI、模型、网络和上下文长度影响，目前没有可公开比较的性能基准。
- 社区候选版仅供验证；正式安装优先使用 [Obsidian 社区插件市场](https://community.obsidian.md/plugins/qiaomu-reader)。

## 作者

Qiaomu Reader 由 [向阳乔木](https://qiaomu.ai) 维护：

- X：[@vista8](https://x.com/vista8)
- GitHub：[@joeseesun](https://github.com/joeseesun)
- 乔木推荐：[tuijian.qiaomu.ai](https://tuijian.qiaomu.ai)

项目含有改编自 [Elton Reader](https://github.com/swayinfo/elton-reader) 的代码，感谢 Elton Labs 的工作；这些部分保留 MIT 许可。来源、第三方开源软件和版权声明见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)；内置字体的来源与许可见 [fonts/README.md](fonts/README.md) 与 [fonts/OFL.txt](fonts/OFL.txt)。

---

<a name="english"></a>

# English

### Install from Obsidian Community Plugins

**Available in the official directory:** open [Qiaomu Reader](https://community.obsidian.md/plugins/qiaomu-reader), select **Add to Obsidian**, then **Install → Enable** in Obsidian. If your browser does not open the app, install from inside Obsidian:

1. Open **Settings → Community plugins**. Select **Turn on community plugins** if prompted.
2. Select **Browse** and search for **Qiaomu Reader**.
3. Choose **Qiaomu Reader** by **向阳乔木**, then select **Install → Enable**.
4. Open the library from the left ribbon to try the bundled public-domain books or add your own. AI setup is optional.

On desktop, **Add from Calibre** copies selected books from a local [Calibre](https://calibre-ebook.com/) library into the vault. Search uses `metadata.db` (Python 3) and falls back to `calibredb`. The whole Calibre library is not mounted into Obsidian. This entry is hidden on mobile.

For updates, use **Settings → Community plugins → Check for updates**, then update Qiaomu Reader. Community plugins do not update automatically. If you used Qiaomu Book Reader before, back up your vault and disable it before enabling the new plugin; see the [migration instructions](#安装).

### Read, highlight and keep notes

Qiaomu Reader is a Chinese-first reader for Obsidian supporting EPUB, PDF, FB2, MOBI, AZW3 and CBZ. PDF files retain their original fixed page layout; pages with a reliable text layer support selection, search, highlights, annotations and full-document or selected-text AI context, while scan-only pages provide original-page reading, progress and one book-level note without pretending OCR is available. The plugin keeps one dedicated Markdown reading note per book inside your vault.

### A reading workflow, not just a chat window

The five screenshots above show the published **4.2.4** release running in Obsidian 1.13.7: **the six-book starter library, selection actions, linked highlighting notes, optional AI assistance, and original PDF pages.** New users can start with Tao Te Ching, Three Hundred Tang Poems, Shishuo Xinyu, Alice in Wonderland, Jekyll and Hyde, or Meditations without finding a book or configuring AI first. The library includes covers, reading progress, highlight counts and note links.

Since 4.2.5, the first library visit adds all six starter books even when the vault already contains ebooks or PDF attachments. Upgrades also repair installations previously skipped by older versions. Existing same-name files are preserved, and books deliberately deleted after a successful import are not recreated automatically. Use Settings → Storage & sync → Add starter books to restore them manually.

Captures use an isolated demo vault, bundled public-domain books and an original sample PDF. The AI conversation is a visibly labeled fixture with no model call; it demonstrates the interface, not model quality or latency. See [capture and release evidence](docs/showcase.md).

- Streamed answers render as Markdown while arriving, including tables, task lists, blockquotes and code blocks through Obsidian's renderer.
- Built-in quick prompts sit above the input, with translation for non-Chinese selections. An open AI panel follows new selections; selection alone does not send a request.
- Named reading bookmarks, bottom navigation, Chinese single-character search and a return point support continuity.
- Focused reading keeps an already-open AI sidebar without reopening the file tree.
- Chats are associated with books, with searchable/renameable history and immutable source context on sent questions.

New installations default to a bundled Zhuque Fangsong reading subset (7,554 codepoints); missing glyphs fall back to system fonts. Select Custom font to browse installed fonts or import TTF, OTF, WOFF or WOFF2 files. Imported files sync with the vault; mobile platforms without font enumeration can use file import. The font is embedded in styles.css and installed with the plugin. Other fonts are user-installed; see [font downloads](fonts/README.md).

The interface supports Simplified Chinese, English, Russian, Japanese, Spanish, French, German, Korean, and Brazilian Portuguese. Select a language at the top of plugin settings; all language packs are bundled for offline use. Reopen existing book tabs and chats to apply the new language there. Book text, notes, and AI responses are not translated by this setting. Some newer Russian UI strings still fall back to English.

BRAT and manual installation remain available as [alternative installation methods](#安装).

User-selected font files are read only on import and copied into the vault. Enumerating system fonts happens only after pressing the font picker button. Desktop CLI mode detects user-installed executables and runs them in an isolated temporary directory outside the vault; CLI configuration and login are managed by the installed tool.

Reading works fully offline. In-reader settings are split into Reading and AI Assistance tabs, keeping frequent AI controls close to the book while API keys and endpoint URLs remain in Obsidian plugin settings. Optional AI reading assistance includes built-in quick prompts and supports signed-in Codex CLI, Claude Code CLI, Grok CLI, Kimi Code CLI, and ZCode CLI accounts without additional API-key setup, plus DeepSeek, Kimi, Qwen, GLM, MiniMax, SiliconFlow, Doubao, OpenRouter, OpenAI, Ollama, LM Studio, and custom OpenAI-compatible endpoints. CLI chats use persistent ACP sessions: Grok and Kimi provide ACP natively, while Codex, Claude, and ZCode use separately installed adapters. If an ACP session expires or its process exits before returning any content, the plugin rebuilds it and retries once; authentication, model, session, and process failures are reported separately. Grok ACP is launched with background auto-update disabled so an updater cannot delay the first streamed token. CLI providers are desktop-only and still send the page or selection you explicitly attach to their cloud service. AI is off by default and keys are stored with Obsidian SecretStorage.

**New in 4.2.7:** The AI companion appears on the first book open on wide desktop windows and remembers when you close it. Configure a service directly in the sidebar. Save translations with their original passage and location link to the book note, an open note, a new note or today’s Daily Note.

**New in 4.2.6:** Selection actions use icons by default, with translation shown when enabled. Configure labels, visibility and order under Settings → Page turning → Selection toolbar. Hidden actions remain in More and the context menu. AI source links can reopen the correct book and navigate across chapters.

Saving an AI reply preserves its complete Markdown body with the source below it, either in a separate note or appended to the book's reading note. An editable title is extracted locally from the reply's topic, emphasis or content, with no extra model request. Saving keeps the chat open, and the saved action opens the existing note. Unsent drafts are persisted locally for up to 30 books (20,000 characters each) and survive sidebar closure/restarts; third-party syncing of the plugin folder may also copy them. Deleting conversations requires confirmation. Screenshots above were captured with the published [4.2.4 release](https://github.com/joeseesun/qiaomu-reader/releases/tag/4.2.4); see the [official listing](https://community.obsidian.md/plugins/qiaomu-reader) for installation.

### Verification and limits

Use `npm ci`, `npm test`, `npm run check:i18n`, `npx eslint src/`, `npm run build`, `npm run verify:release`, and `npm run build:community` to reproduce the automated gates. See [screenshot evidence](docs/showcase.md) and [workflow checks](docs/reading-workflow-plan.md). Physical mobile-device validation is pending. There is no built-in OCR or cross-book semantic search. CLI providers are desktop-only; model costs and terms belong to the selected provider. Local-model requests stay on-device only when the configured endpoint is local and does not forward them. Persistent ACP reduces repeated startup work, but no comparative latency benchmark is claimed.

## Community build

Both the default build and the community build exclude dependency installation code. CLI adapters must be installed by the user. A separate community-candidate build is available with `npm run build:community` in `dist/community/`. It excludes the ACP dependency installer while retaining manual setup guidance, detection, and persistent chat.

Maintained by [Qiaomu](https://qiaomu.ai). Third-party notices and copyright information are preserved in [LICENSE](LICENSE); bundled font provenance and license live in [fonts/README.md](fonts/README.md) and [fonts/OFL.txt](fonts/OFL.txt).

## License

Copyright (c) 2026 向阳乔木.

本项目整体采用 **GNU GPL v3.0 only**（`GPL-3.0-only`），完整条款见 [LICENSE](LICENSE)。除另有明确声明的第三方部分外，自有代码可按 GPL v3.0 使用、修改和分发，不提供任何担保。第三方代码、字体及素材保留各自许可证与版权声明。

GPL 允许免费商业使用；分发时须遵守相应源码、版权和许可证义务。需要 GPL 之外的授权，可联系作者协商[商业授权](COMMERCIAL-LICENSE.md)。本次变更不撤销此前已授予的许可证。

The project as a whole is licensed under GNU GPL version 3 only, with no warranty. Third-party components retain their own licenses. Commercial use is permitted under GPL; a separate commercial agreement may be negotiated for rights the author can grant. Previously granted licenses remain valid.
