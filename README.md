# NovaFlow 创作工作台

基于 Toonflow 开源项目开发的 NovaFlow 本地创作客户端，使用 NovaFlow 官网账号登录，自动加载当前账号有权使用的分组模型。

## 下载

在 [GitHub Releases](https://github.com/Azheyc/novaflow-creator/releases/latest) 下载客户端。当前发行包支持 macOS Apple Silicon（ARM64）。应用尚未进行 Apple Developer ID 签名和公证。

## 使用

1. 安装并打开 NovaFlow Creator。
2. 在账号页面打开 NovaFlow 官网，完成注册或登录并授权客户端。
3. 返回客户端选择分组及模型，开始文本、图片或视频创作。无需复制或管理 API Key。

关于页面可检查本仓库的版本更新。账号管理与充值前往 [NovaFlow 官网](https://www.ycnovaflow.vip/dashboard)。微信客服：`Azhe_327`。

## 本地开发

使用 Bun 1.4.3 或以上版本。首次执行 `bun install`，然后执行 `bun run dev`。桌面构建使用项目现有 Hutch / Electrobun 工具链。

```sh
bun run --cwd apps/web typecheck
bun run --cwd apps/server typecheck
bun run --cwd apps/desktop typecheck
bun run release:desktop 2.0.1 --initial
```

桌面版本快照位于 `build/desktop/releases/`，包含安装包、更新归档和更新清单。后续发布需要增加版本号，将同一快照的全部文件上传到对应 GitHub Release；不要单独替换清单。更新默认从本仓库 Releases 获取。

本仓库只包含客户端，服务端专属凭据及授权由 NovaFlow 平台管理。项目文件、登录会话、配置、构建缓存和服务端部署资料不纳入源码发布。

## 开源声明

本项目基于 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) 修改，采用 MIT 许可证，原作者版权与许可见 [LICENSE](LICENSE)。源码包名、历史数据字段及插件协议保留兼容标识。
