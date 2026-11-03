# 4.9.4 — 在书库发现值得读的书

- 「找书」默认打开公开书源，浏览 Hacker Books 的值得读、最多人提和经典常青书单，并按主题筛选或搜索书名、作者。
- 图书详情展示中文简介、HN 读者评论、阅读建议及相关图书；保留外部书源和古腾堡公版入口。
- 支持「想读 / 读过」清单，并根据本地书库及清单计算推荐；不上传仓库书名、搜索词或阅读清单。
- 修复书单加载失败后重试入口不显示，以及清单保存失败后按钮不可重试的问题。

## English

- Browse Hacker Books rankings, topics and title/author search in the public book source, now the default when finding books.
- Open book details with HN comments and related books, then choose an external catalog or Gutenberg.
- Keep want-to-read and read lists, with recommendations computed locally from your library and lists.
- Recover from failed shelf requests and failed list saves without losing the previous saved status.

## Verification

- 582 Node tests and 15 Python checks passed; i18n and zero-warning ESLint passed.
- Standard and community builds passed the existing per-file 4,800,000-byte budget.
- Obsidian 1.14.5, existing isolated `qiaomu-reader-kindle-qa` vault: loaded 4.9.4, browsed the live shelf, opened book details and HN comments, saved a want-to-read mark, and displayed it in My lists. Installed files match the candidate hashes. Prior plugin data was backed up before installation.
- New regression tests reproduced the two failure paths before the fixes and passed afterward.
- Official scan, draft installation, publication and native community installation evidence will be recorded in the release PR. Physical mobile devices have not been tested.
