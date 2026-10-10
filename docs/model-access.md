# 账号、网关和 Coding 套餐

核对日期：2026-10-11。

- ChatGPT：桌面端官方 SIWC 登录、刷新与退出；使用账号公开的文字模型。凭据存于 Obsidian SecretStorage，配置保存引用。
- 词元跳动和 OpenRouter：浏览器 PKCE 授权，也可填写 API Key。
- Magpie：检测网关、发现模型，保留模型完整 ID 与服务报告的思考档位；在 Magpie 内登录 Claude、Codex、Copilot 等订阅，以及其社区插件支持的国内账号。
- Coding / Token Plan：智谱、Z.ai、Kimi Code 国内、MiniMax、百炼、小米 MiMo、火山方舟七项预设；普通 API 与套餐地址分开。
- 模型搜索、多选、手动添加；添加模型保留原默认项。列表可见不代表账号有推理额度，使用连接测试确认。

远程 Magpie 必须使用 HTTPS 和网关密钥，本机环回地址可留空。登录关闭、取消或插件卸载会清理监听器。
ChatGPT 通道仅用于文字，图片生成和编辑沿用独立生图配置（Design）。CLI 原有接入继续保留。

认证/请求核心来自本项目作者的 Qiaomu Agent 0.6.0（MIT，许可证随 src/model-access 保留）。
[支持矩阵、官方文档与上游固定版本](https://github.com/joeseesun/qiaomu-agent/blob/main/docs/research/2026-10-11-account-and-gateway-access.md)。
[AI Elements Model Selector](https://elements.ai-sdk.dev/components/model-selector) 已调查；这两个插件的设置为宿主原生 DOM，保留原生 Modal 与模型选择组件，不引入仅为设置服务的 React/cmdk 运行时。

验证覆盖协议夹具、本机回调取消、令牌轮换、模型目录与真实 Obsidian 设置交互。没有逐家使用真实付费账号授权和扣费，移动端未做真机验收；新账号弹窗非中英文文案回退英文。
