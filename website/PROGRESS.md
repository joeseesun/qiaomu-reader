# Reader 官网交付

2026-11-03，目标：https://reader.qiaomu.ai/。参照 clipper.qiaomu.ai，展示 Obsidian 与 DSH 两版本价值、真实截图与安装入口。

验收：内容对应当前 README 与公开 Release；桌面/手机真实浏览器、安装入口、弹窗、HTTPS、SEO/分享/PWA、Umami 浏览器事件入库；源码提交推送。只修改 website/，不发布插件新版本。

当前：原工作区干净；Obsidian manifest 4.9.4 但公开最新 Release 为 4.9.3，官网不写本地版本为已发布。DSH 最新 v1.1.2，宿主兼容 rc.2–rc.5，rc.5 核心阅读已验收。DSH 不宣传 Kindle/MOBI/FB2/漫画功能。

部署计划：myvps Nginx 独立静态目录，不依赖 Docker；现有站点不动。后续记录 DNS、TLS、Umami ID 与事件证据。

## 2026-11-03 11:07 北京时间

已部署：myvps /www/wwwroot/reader.qiaomu.ai；Nginx 静态服务，无 Docker 依赖。
DNS：Cloudflare DNS-only A reader.qiaomu.ai → 76.13.103.27（record 975b95072de26809e1de65038a2a9827）。
TLS：Let's Encrypt ECDSA，至 2027-02-01；certbot.timer 已存在。HTTP 301 → HTTPS。
Umami：13b78a3e-d2ec-4cc8-b701-05eec52ff0b3，数据库确认唯一 property。未使用管理员凭据，注册通过服务器数据库沿用 Clipper owner；未以 API 注册。源码 ID 固定且缺失/格式错误会阻止构建。
页面 SHA256：872caee27b09b7d43da573d37c3a39f0506911633340816376c0d9cb0c8e54a1，本地 dist 与服务器文件相同。

验证：Node 构建/静态链接检查、JS/SW 语法、13 项静态资源、11 个锚点通过。Ego Lite 检查 1500px 桌面、390px 手机与320px窄屏；无页面横向溢出；两个二维码弹窗图片与关闭/Escape、FAQ、DSH 安装说明展开均通过。实际看过首屏、双版本对照与安装区截图。原始产品图片保留演示版本说明。

本地 service worker activated，真实浏览器断网重载显示官网标题/正文；不代表真实手机安装验证。SEO/canonical/OG/结构化数据/robots/sitemap/图标/manifest 已部署，manifest 公网 Content-Type 为 application/manifest+json。关注、打赏、GitHub/X、乔木推荐均已提供。

待验：本机负向 DNS 缓存过期后的正式域名浏览器访问、Umami 新浏览器事件入库、GitHub 推送。服务器自身已解析新域名并返回 HTTPS200；本机通过显式 IP 解析也得到 HTTPS200。
