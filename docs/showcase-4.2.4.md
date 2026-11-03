# 正式版本截图 / Release screenshot evidence

日期：2026-09-10。环境：macOS、Obsidian 1.13.7、正式发布的 **Qiaomu Reader 4.2.4**。插件 ID：`qiaomu-reader`。

## 版本核验

截图使用 [4.2.4 GitHub Release](https://github.com/joeseesun/qiaomu-reader/releases/tag/4.2.4) 的安装文件，安装在独立 QA 仓库中。已核对安装版本及 `main.js` 与下载的正式 Release 文件 SHA-256 一致：

```text
e6b3899c9448f43040457e133d7c1ee387a891639c8b2db3e3d4b877487e2198
```

对应发布提交：`cc544efb52615fdb87a53c059f2a6f253b9cc1ba`。此次只更新文档和截图，不修改插件运行代码、版本号或 Release 安装文件。

## 展示内容

| 截图 | 捕获时核验 |
| --- | --- |
| [六本内置书架](assets/showcase-4.2.4-library.jpg) | 六本 EPUB 及封面、继续阅读、划线计数、笔记入口 |
| [选文操作](assets/showcase-4.2.4-selection.jpg) | 真实正文选区与插件选文工具栏、双页布局 |
| [划线与笔记](assets/showcase-4.2.4-notes.jpg) | 通过插件创建粉色划线和批注，读回自动生成的 Markdown 与回跳链接 |
| [AI 助读](assets/showcase-4.2.4-ai.jpg) | 真实 AI 视图控制器加载固定示例；选文来源、回答操作、快捷问题与输入框 |
| [PDF 原页](assets/showcase-4.2.4-pdf.jpg) | 原创两页 PDF 实际渲染，双页、图表与表格、100% 缩放 |

截图由隔离 Obsidian 实例的调试接口捕获，原始 JPEG 为 2400 × 1600 像素；没有合成控件、替换背景或修图。截图中的阅读进度与划线属于演示状态，并非首次安装后的默认阅读记录。

## 内容与验证边界

- 书架展示实际随插件打包的六本 EPUB；版本、封面来源和许可见[示例书说明](../assets/starter-books/README.md)。英文作品使用英文原版，不暗示内置现代中文译本。
- 《世说新语》的划线、批注和 Markdown 笔记由插件正常流程产生；读回了保存的引文、批注和带书籍、划线与位置参数的回跳链接。
- PDF 是原创演示内容，图表注明示意数据。该 PDF 用于展示原页阅读，并非第七本内置示例书。
- AI 视图通过真实控制器加载固定示例，回答中可见“界面演示对话，未调用模型”。没有发起模型请求，也不将示例视为模型能力或网络连接测试。
- 这些截图核验桌面布局和上述操作；不能替代流式时序、长期稳定性、移动真机或完整回归测试。发布验证与 CI 是独立证据。
- 隔离仓库没有用户私人书籍、对话或账号配置；正常使用的 Obsidian 仓库未参与截图。

## English

These five unretouched captures show the published Qiaomu Reader 4.2.4 release running in an isolated Obsidian 1.13.7 desktop vault. The installed main.js matches the SHA-256 of the official release asset above. The library contains the six bundled public-domain EPUBs with their packaged covers; reading progress and highlights are demonstration state. The sample PDF is original demonstration material, not an additional bundled book. The real plugin created the highlighted passage, annotation and linked Markdown note. The AI view renders a clearly labeled seeded conversation without a model request. These images demonstrate desktop UI, not mobile-device coverage, streaming performance or model quality. Third-party book, cover and Obsidian rights remain with their respective owners and licenses.
