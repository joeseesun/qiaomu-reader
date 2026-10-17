# 4.7.7 — DeepSeek Flash 更新

DeepSeek 默认使用官方稳定模型 ID `deepseek-flash`，随官方升级到当前 Flash 版本，思考模式显式默认使用 `high`。无需更换 API Key 或服务地址。

已保存的官方 `deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 配置在加载后迁移为 `deepseek-flash`，模型列表去重；已有正式模型名称优先保留。迁移在阅读备份恢复后落盘，重复加载不重复修改。第三方转发地址、自定义模型、其他服务和用户明确选择的 Pro 模型不迁移，不增加任何自动 Pro 回退。

连接测试和关闭思考的请求保持非思考模式，不发送可能重新开启思考的 `reasoning_effort`。用户明确选择的受支持推理强度仍有效；未选择时使用 `high`。

## 验证（2026-10-17）

- 479 项 Node 测试通过，无跳过；4 项本地语音 Python 测试通过。
- 八种语言检查、ESLint、标准及 community 构建通过，发布文件大小与版本核验通过。
- 新增迁移回归覆盖当前/非当前服务、旧文本/视觉 Flash ID、模型列表去重、幂等性、第三方地址、自定义模型及其他设置保留；实际插件加载测试验证先恢复备份、再保存迁移。
- Obsidian 1.13.7 独立 QA 库成功全新加载 4.7.7，并用 GitHub 4.7.5 正式资产完成旧版配置保存及升级。内存与落盘模型均为 `deepseek-flash`，SecretStorage 测试凭据、服务地址、关闭思考、其他服务模型、字号和笔记保留；无宿主错误。
- `npm audit --omit=dev`：0 个已知漏洞。完整审计列出开发工具依赖的 13 个 high、2 个 moderate 告警；没有新增或升级依赖，开发依赖不随插件发布。本次未变更该既有工具链。
- 未使用真实 DeepSeek 凭据发送请求；请求参数通过自动测试验证。未验证移动端或 Windows 真机。

官方预扫描、GitHub Release 公开下载及默认分支版本更新是独立门禁，以对应 GitHub/官方后台结果为准。

## 官方依据

- [2026-10-17 模型升级及旧 Flash ID 兼容说明](https://api-docs.deepseek.com/updates/)
- [思考模式和 high 默认强度](https://api-docs.deepseek.com/guides/thinking_mode/)
