# NovaFlow 创作工作台

基于 Toonflow 开源项目开发的 NovaFlow 本地创作客户端，使用 NovaFlow 官网账号登录，自动加载当前账号有权使用的分组模型。

## 下载

在 [GitHub Releases](https://github.com/Azheyc/novaflow-creator/releases/latest) 下载客户端。发行目标为 macOS Apple Silicon（ARM64）和 Windows Intel / AMD（x64），安装包在同一个版本发布页提供。macOS 应用尚未进行 Apple Developer ID 签名和公证。

安装步骤、系统拦截处理和签名状态见下方的 [macOS 安装与签名](#macos-安装与签名)。

## Windows 安装

在 Releases 下载 `novaFlowCreator-版本号-win-x64-setup.exe`，运行安装程序并按提示完成安装。客户端需要 WebView2，安装程序会检测并引导安装。当前未配置 Windows 代码签名证书，首次下载可能提示未知发布者或 SmartScreen 拦截，请核对本仓库来源和 `sha256.txt`。

## 使用

1. 安装并打开 NovaFlow Creator。
2. 在账号页面打开 NovaFlow 官网，完成注册或登录并授权客户端。
3. 返回客户端选择分组及模型，开始文本、图片或视频创作。无需复制或管理 API Key。

首页“内容洞察”支持平台内容搜索、公开账号分析、竞品监控和将参考视频直接导入画布。监控仅在客户端运行时采集，部分榜单与字段以实际可用能力为准。详见 [内容洞察使用说明](docs/contentInsights.md)。

关于页面可检查本仓库的版本更新。账号管理与充值前往 [NovaFlow 官网](https://www.ycnovaflow.vip/dashboard)。微信客服：`Azhe_327`。

桌面客户端可在“设置 → 关于 → 更新源”选择“GitHub”或“国内镜像（gh-proxy.com）”。镜像使用 `https://gh-proxy.com/https://github.com/...` 获取同一仓库的更新清单与更新包；切换来源后重新检查更新即可，选择会保存供下次使用。

## macOS 安装与签名

目前公开发行包适用于 Apple Silicon Mac。2.0.3 起，应用和完整更新归档采用可验证的临时签名（ad hoc）。临时签名不包含 Apple Developer ID，也没有 Apple 公证，不能保证首次下载后直接双击运行。

### 安装当前版本

1. 从 [本项目 Releases](https://github.com/Azheyc/novaflow-creator/releases/latest) 下载 DMG 及 `sha256.txt`，核对安装包 SHA256。
2. 将 NovaFlow Creator.app 拖入“应用程序”，从“应用程序”打开，不在只读 DMG 中运行。
3. 如果 macOS 提示开发者未验证或无法验证 Apple 是否检查过软件，请先尝试一次打开，再到“系统设置 → 隐私与安全性”选择“仍要打开”，确认应用名称和来源。

如果出现“已损坏”，先检查下载是否完整、应用签名是否有效。终端执行：

```sh
codesign --verify --deep --strict --verbose=2 "/Applications/NovaFlow Creator.app"
```

2.0.1、2.0.2 的发行包存在签名封装缺失问题，应优先升级至 2.0.3 或更高版本。如果确认安装包来自本项目、SHA256 一致，仍需手动使用旧版，可只为这个应用修复临时签名并移除下载隔离：

```sh
codesign --force --deep --sign - --identifier vip.ycnovaflow.creator "/Applications/NovaFlow Creator.app"
codesign --verify --deep --strict --verbose=2 "/Applications/NovaFlow Creator.app"
xattr -dr com.apple.quarantine "/Applications/NovaFlow Creator.app"
open "/Applications/NovaFlow Creator.app"
```

对已校验签名的新版本，如系统仍然拦截且没有“仍要打开”入口，可在确认来源与校验值后仅执行上面的 `xattr` 和 `open` 两行。移除隔离是用户对指定应用的本机授权，不是 Apple 公证。不要对未知应用照搬命令，不要关闭整台 Mac 的 Gatekeeper。如果应用目录由管理员管理，应由管理员处理该应用的权限。

### 面向所有用户的正式分发

要让正常安全设置下的其他 Mac 用户从浏览器下载后按常规流程打开，发布者需要：

1. 有效的 Apple Developer Program 账号、Developer ID Application 证书及对应私钥。
2. 在受保护的构建环境导入证书；配置 `ELECTROBUN_DEVELOPER_ID` 和 Apple 公证凭据，使用 `macCodesign=1` 构建。当前流程已包含 Developer ID 签名、Apple 公证与票据装订。
3. 对最终应用执行 `codesign --verify --deep --strict`、`stapler validate`，对 DMG 执行签名、公证和装订验证。
4. 用开启默认 Gatekeeper 的干净 Mac，通过浏览器下载实际发布文件后拖入“应用程序”并启动验收。不能用已去除隔离、已授权或关闭 Gatekeeper 的开发机代替首次安装验收。

证书和公证凭据只放在系统钥匙串或 CI Secrets，不能提交到仓库。临时签名版使用完整更新包，保证签名后的归档与 DMG 是同一应用；不基于签名前的 SDK 归档生成增量补丁。

Apple 官方说明：[在 Mac 上安全地打开 App](https://support.apple.com/zh-cn/102445)、[发布前公证 macOS 软件](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。

## 本地开发

使用 Bun 1.4.3 或以上版本。首次执行 `bun install`，然后执行 `bun run dev`。桌面构建使用项目现有 Hutch / Electrobun 工具链。

```sh
bun run --cwd apps/web typecheck
bun run --cwd apps/server typecheck
bun run --cwd apps/desktop typecheck
bun run release:desktop 2.0.4
```

GitHub Actions 的“Release NovaFlow”流程默认同时构建 macOS ARM64 和 Windows x64，两个构建均成功后才将安装包、完整更新归档、更新清单和 SHA256 发布到同一个 Release。

桌面版本快照位于 `build/desktop/releases/`，包含安装包、更新归档和更新清单。后续发布需要增加版本号，将同一快照的全部文件上传到对应 GitHub Release；不要单独替换清单。更新默认从本仓库 Releases 获取。

本仓库只包含客户端，服务端专属凭据及授权由 NovaFlow 平台管理。项目文件、登录会话、配置、构建缓存和服务端部署资料不纳入源码发布。

## 开源声明

本项目基于 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) 修改，采用 MIT 许可证，原作者版权与许可见 [LICENSE](LICENSE)。源码包名、历史数据字段及插件协议保留兼容标识。
