# 4.7.9 — iOS 17 EPUB 打开兼容修复

合入 [PR #50](https://github.com/joeseesun/qiaomu-reader/pull/50)，修复 [issue #28](https://github.com/joeseesun/qiaomu-reader/issues/28) 报告的 EPUB 打开错误：iOS 17.0 的 WebKit 缺少 `Object.groupBy` 与 `Map.groupBy`，此前读取书籍元数据会抛出异常。

阅读引擎现在使用局部兼容实现，不修改其他插件共享的全局 API。保留 EPUB 2/3 元数据、作者、集合与多语言标题，以及中文、空格、百分号编码的章节路径和目录锚点；兼容实现升级后重新注册对应渲染器，避免插件重载继续使用旧实现。

升级无需修改设置、重新导入书籍或迁移阅读数据。重新打开原先无法读取的 EPUB 即可尝试修复。

## 验证与边界

- 4.7.9 发布候选的 483 项 Node 回归测试、6 项 Python 回归测试、国际化检查、ESLint、标准构建及发布资产校验通过；修复合并后的主线 CI 通过，包括 Windows 本地 TTS 回归。
- iPhone 18 Pro / iOS 27.0 模拟器中，使用真实 `EpubEngine` 与仓库的 Foliate 构建适配，正常 API、缺少任一 API、两者都缺少四种情况共 112 条断言通过，覆盖章节 iframe 实际排版、目录跳转和关闭后按 CFI 恢复位置。恢复原始调用的对照构建复现 `Object.groupBy is not a function`。
- 模拟器验证在独立 WKWebView 测试壳完成，不是完整 Obsidian 应用验收，也不代表 iOS 17.0 真机验证。仍需在该系统的真实 Obsidian、原问题 EPUB 和实际仓库中检查打开、目录、翻页、阅读位置、划线和笔记。
- GitHub Release、公开下载资产和 Obsidian 官方目录扫描分别核验，具体发布结果以正式发布记录为准。

正式插件文件为 `main.js`、`manifest.json` 和 `styles.css`。社区插件用户可在 Obsidian 的「设置 → 第三方插件 → 检查更新」检查版本；BRAT 和手动安装继续使用同一 GitHub Release。
