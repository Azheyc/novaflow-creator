# macOS 安装与签名

目前公开发行包适用于 Apple Silicon Mac。2.0.3 起，应用和完整更新归档采用可验证的临时签名（ad hoc）。临时签名不包含 Apple Developer ID，也没有 Apple 公证，不能保证首次下载后直接双击运行。

## 安装当前版本

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

## 面向所有用户的正式分发

要让正常安全设置下的其他 Mac 用户从浏览器下载后按常规流程打开，发布者需要：

1. 有效的 Apple Developer Program 账号、Developer ID Application 证书及对应私钥。
2. 在受保护的构建环境导入证书；配置 `ELECTROBUN_DEVELOPER_ID` 和 Apple 公证凭据，使用 `macCodesign=1` 构建。当前流程已包含 Developer ID 签名、Apple 公证与票据装订。
3. 对最终应用执行 `codesign --verify --deep --strict`、`stapler validate`，对 DMG 执行签名、公证和装订验证。
4. 用开启默认 Gatekeeper 的干净 Mac，通过浏览器下载实际发布文件后拖入“应用程序”并启动验收。不能用已去除隔离、已授权或关闭 Gatekeeper 的开发机代替首次安装验收。

证书和公证凭据只放在系统钥匙串或 CI Secrets，不能提交到仓库。临时签名版使用完整更新包，保证签名后的归档与 DMG 是同一应用；不基于签名前的 SDK 归档生成增量补丁。

Apple 官方说明：[在 Mac 上安全地打开 App](https://support.apple.com/zh-cn/102445)、[发布前公证 macOS 软件](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。
