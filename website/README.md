# 乔木阅读官网

生产地址：https://reader.qiaomu.ai/。风格参照乔木剪藏官网，内容来自两个插件的 README、实际截图与公开 Release。

## 构建与发布

无需安装依赖，使用 Node 22+：

```sh
cd website
npm run build
npm run check
npm run deploy
```

`umami-id.txt` 保存本网站公开统计 ID。缺失或格式错误时构建失败；发布前后检查唯一脚本、域名、安装链接、锚点与资源。管理员凭据不进入源码。

日常部署使用 `scripts/deploy.sh`，只更新 myvps 的 `/www/wwwroot/reader.qiaomu.ai/`，保留 ACME challenge。首次 Nginx 配置在 `deploy/`，证书由 certbot 管理。生产使用 Nginx 静态服务；网站本身不依赖 Docker，Umami 是独立统计服务。

页面源码为 `index.template.html` 与 `public/`；`build.mjs` 生成 dist、缓存版本、robots、sitemap、404 和离线 shell。服务工作线程网络优先，仅在离线时返回已缓存页面；不缓存外域统计请求。

## 内容与素材

- Obsidian 安装入口：官方社区插件页，不把本地未发布版本当成正式版。
- DSH 下载入口：GitHub latest Release。安装示例当前为 v1.1.2，升级时同步命令与兼容范围。
- Obsidian 截图主要来自 4.2.4，查词来自 4.5.0；DSH 截图来自 1.1.0。图片旁保留演示说明，AI 示例不当成真实模型效果。
- 图片复制到本网站 public/assets，避免依赖 GitHub raw 图床。
- Noto Serif SC 标题字体采用 SIL OFL，许可随 `public/fonts/NotoSerifSC-OFL.txt` 分发。标题字形按当前中文内容子集化；增改标题时需重新生成字体，否则使用宋体回退。
- 图标使用 Lucide 风格线形，书本标志自绘。二维码来自插件既有 about 素材。

详见 [PROGRESS.md](PROGRESS.md) 中的部署和验证证据。官网交付不改变插件实现和插件版本。
