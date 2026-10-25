# 4.8.4 — 离线完整包回到 5 MB 以下

## 中文

- 主程序从 5,715,816 字节缩减至约 4.68 MB，严格低于 5,000,000 字节，并保留约 322 KB 余量。
- 仅将九种语言的静态字典共享键名并本地压缩；EPUB/PDF/文本阅读、Kindle 传书、示例书、字体和 PDF 离线资源全部保留。无需联网解压，不增加安装文件。
- 标准及社区构建增加每个安装文件 4,800,000 字节预算门禁，防止后续新增功能挤满上限。
- 无需更改阅读、AI 或 Kindle 配对设置。此次优化降低跨设备同步时主程序被跳过的风险，尚不能确认原“升级后无法阅读”反馈的具体根因。

验证：517 项 Node 测试、6 项 Python 测试、九种语言逐条等价性、国际化检查、ESLint、标准及社区构建；独立 Obsidian 1.14.5 断网验证中文路径 EPUB 正文/目录、PDF 实际页面和 TXT。移动平台启动兼容模拟通过，手机真机与 Kindle 实机未复测。

## English

- Reduced main.js from 5,715,816 bytes to about 4.68 MB, leaving approximately 322 KB below a strict decimal 5 MB.
- Losslessly packed all nine UI dictionaries. Reading, Kindle delivery, starter books, fonts and offline PDF resources remain bundled; no additional files or remote code are required.
- Both distribution profiles enforce a 4,800,000-byte limit on every installed asset, reserving room for future changes.
- No reading, AI or pairing configuration migration. This addresses the oversized distribution risk; it does not establish the cause of an unidentified user's reading failure.

Validation includes 517 Node tests, six Python tests, exact dictionary comparisons, i18n, ESLint, both builds, and native offline desktop reading. Physical mobile devices and Kindle hardware were not retested. Exact publication, CI, asset readback and directory status are recorded separately.
