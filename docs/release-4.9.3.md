# 4.9.3 — 自定义 AI 伴读快捷提示词

- 在 AI 伴读快捷条点击「管理」，新增、编辑或删除自己的提问模板，最多保存 20 条。
- 展示名称与实际发送的 Prompt 分开编辑，快捷按钮和 `/` 菜单共用已保存的配置。
- 支持恢复内置提示词；清空列表后仍保留管理入口。默认提示词跟随界面语言，自定义内容保持原样。
- 保存失败时保留草稿并提示重试；沿用现有存储格式，不修改阅读进度或笔记。

## English

- Manage up to 20 custom AI reading prompts directly from the suggestion strip.
- Edit each button label and the full prompt separately. Suggestions and slash commands use the same saved library.
- Restore translated defaults or remove suggestions while keeping the management action available.
- Failed saves preserve the draft for retry. Existing reading progress and notes are unchanged.

## Release verification

Local validation: 573 Node tests, 15 Python tests, i18n, ESLint, standard and community builds pass. Both build profiles remain below the 4,800,000-byte per-file budget.

Validation and publication evidence are recorded in the pull request and the official directory scan for the final candidate commit. Desktop QA covers editing, save/reload, exact outgoing prompt text and save failure recovery. Physical mobile devices and live model quality require separate verification.
