# 邀请制书库验收 · 2026-10-24

用户结果：没有激活码时仍使用原有找书；有激活码时在 Reader 内搜索、下载并导入书架。独立轻量后台管理领取人、有效期、设备和额度，总 MCP/Telegram 凭据只在服务端。

实际桌面：Obsidian 1.13.7，隔离库 `/Users/joe/Documents/ChatGPT/qiaomu-reader-kindle-qa`，插件 qiaomu-reader 4.8.0 community 构建，基于 Kindle 候选 9e2d933 增量。代码位于 codex/ebook-library。

已验证：
- 原生「找书」默认公开书源，Anna’s Archive、Z-Library、Gutenberg、Standard Ebooks、维基文库保留；创建该页面不调用乔木 API 或读取登录凭据。
- 临时 QA 授权在生产 HTTPS API 激活；凭据写入真实 Obsidian SecretStorage，data.json 无激活码/刷新凭证。重载后仍能恢复登录并刷新 access token。
- 原生 UI 搜索 Lewis Carroll，返回 4 个带作者、语言、年份、格式和大小的版本；选择《Alice's Adventures in Wonderland and Through the Looking Glass》英文 EPUB（2003，5.69 MB）。
- 实际导入文件 5,966,328 字节，SHA256 `b7de7123381ff2a47b3748c25ed4d9e87cfe753bcf59aad6275ee432ef4f270e`；服务器文件、API 元数据、仓库文件三者一致。完成任务已记录，重开不再列为未导入任务。该验收不涉及 Kindle 传输。
- 关闭 QA 授权后，原登录下一请求立即 403；切回公开书源仍可用。QA 授权已停用。
- 本机隔离管理后台经真实 Chrome 登录、批量生成 2 码、关闭完整码展示、编辑下载额度并回读；修正了日期选择保存造成的时区偏移，并确认同日期再次保存不会变化。测试密码与测试码不用于生产。
- 生产 /reader/admin/ 200，/reader/api/me 和 /mcp 未鉴权均 401，/healthz 200。新图书位于独立 private 目录，不在旧 /files/ 路径；未改动原 MCP token/session 和旧公开下载文件。

自动检查：506 Node 测试、6 Python TTS 测试、1515 i18n keys、全部 src ESLint 零警告、standard/community 构建；后端 25 Python 测试覆盖并发设备限制、刷新轮换、撤销/到期、CSRF、额度/idempotency、文件隔离、真实 bot 元数据格式、大小/损坏清理与备份恢复。

边界：移动端真机未验证；安装 ID 不是硬件锁；默认下载文件上限32MiB、授权列表500条、临时文件24小时、额度按UTC日期重置。管理员实际密码尚未初始化，由用户在自己终端输入；提供 Downloads/初始化乔木书库后台.command。首次设置后才可正式生成分发码。

发布：原 Kindle 4.8.0 为草稿，官方预扫描此前缺 Source/Build 结果。此增量需对最终 SHA 再扫描，未满足门禁不公开 Release、不提升 main。后端已部署，Reader 候选已安装隔离库；日常库安装与最终 PR/预扫描另记实际结果。
