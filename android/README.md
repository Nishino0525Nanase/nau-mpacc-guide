# Android 1.0.5 · 雨诺的南审手记

原生 Android Activity + 系统 WebView，包名 `cn.nau.mpacc.guide`，支持 Android 7.0 及以上；面向 Android 14（含 Redmi K60E）使用。`minSdk 24`、`compileSdk/targetSdk 35`、`versionCode 6`、`versionName 1.0.5`。这是一份独立整理指南的个人应用，非学校官方应用。

## 功能与数据

- 默认打开[最新官网](https://nishino0525nanase.github.io/nau-mpacc-guide/)。加载网页、脚本、样式或 JSON 失败时切换内置资料；也可随时点“内置”。在线加载超过 15 秒仍未完成时自动切换。
- 打包前 `syncGuideAssets` 复制当前 `dist/` 的完整阅读资料到生成的 `app/src/main/assets/guide/`，包括全部正文、JSON、CSS/JS 及 Word/Excel；排除 APK 安装包及其校验文件，防止新安装包重复嵌入旧安装包。不重复提交生成的阅读资产。
- 离线通过 `https://appassets.androidplatform.net/guide/index.html` 与严格 `shouldInterceptRequest` 映射读取。仅 GET、固定 HTTPS 域名/路径与安全文件名；未知资源返回 403/404。禁用 file/content 访问、混合内容和地理位置，无 JavaScript 原生桥。
- 搜索、章节、导师详情和联系清单在离线版可用。随当前网页打包的导师并排对比与联系准备提纲也可离线使用；对比最多选择 3 位老师，联系草稿使用身份占位符，提交和发送仍由使用者自行决定。对比选择属于当前页面会话，页面重载或切换线上/内置后需重新选择。Android 返回键先关闭已打开的资料弹窗，再按页面历史返回；自动切换内置页后清除失败的在线导航，避免来回循环。线上/内置切换及应用暂停时，只同步指南自己的联系清单到应用私有配置；不读取其他站点、浏览器或应用数据。清除应用数据或卸载会移除清单。
- 保留逐位学生评价资料：34 名导师均有检索覆盖状态，已归名记录标明身份、学位、接触过程及原来源。推荐理由与有经历支持的提醒引用具体记录；未确认的缩写与缺证问题不会成为实名结论。筛选、比较与逐条阅读在内置模式可用。
- 1.0.4 新增四大与国内所实习资源、城市与资源状态筛选、通勤与申请准备。项目周期、申请窗口与截止日期分开标注；官方入口、列表线索与历史公告分别显示。信的文字改为克制的日常祝福。
- 1.0.5 新增“音乐小憩”：19 首自选歌曲的曲名、专辑、版本、时长及官方平台搜索入口可离线查看，安装包不含录音。点“选择本机音频”使用系统文件选择器，可多选明确指定的音频，按文件名匹配歌单后手动播放；也可暂停、跳转进度及调整音量。文件只用于本次页面会话，不上传、不扫描目录、不保存音频或持久访问授权；离开栏目、应用退到后台或打开系统选择器时暂停，回到页面后可手动继续。刷新、切换线上/内置或重启后需重新选择文件。系统提供器须返回可读的音频 `content` URI，实际格式解码能力取决于系统 WebView。
- 外部来源（包括新窗口链接）在系统浏览器打开。在线 Word/Excel 交给浏览器下载最新版；内置 Word/Excel 使用系统“保存为”对话框复制随包版本，不需要读写存储权限。输出明确使用写入并截断模式，文件写入及关闭都成功后才提示保存成功。
- “⋮ → 不计入本机访问量”永久保存本应用的排除选项，后续线上入口附 `exclude_self=1`，由官网在采集前排除。只影响本机此应用；外部浏览器的选择独立。内置域名不满足官网统计采集条件。
- Manifest 仅包含 `INTERNET`；不申请相机、麦克风、定位、通讯录或全盘读写。TLS 错误取消，不提供管理后台或访问量读取接口。

## 构建与下载

GitHub Actions 中运行 **Build Android app**，默认无需参数；推送 `android/**`、`dist/**` 或该 workflow 到 main 也会触发。下载名为 `nau-mpacc-guide-1.0.5-android-release` 或 `…-debug` 的 artifact，解压后得到 APK、`SHA256SUMS.txt`、`signature.txt`、`package-info.txt`、`permissions.txt`。Artifact 是 ZIP 容器，请安装其中的 `.apk`。

固定使用 AGP **8.7.3**、Gradle **8.9**、JDK **17**、SDK **35**、Build Tools **35.0.0**；无 AndroidX、Kotlin 或第三方运行库。官方 actions 均固定完整 commit SHA。工作流仅授予 `contents: read`，不发布、不修改仓库。

可选 GitHub repository secrets（由仓库所有者配置）：

| Secret | 内容 |
| --- | --- |
| `NAU_ANDROID_KEYSTORE_BASE64` | 固定私有 keystore 文件的 Base64；alias 必须是 `nauguide` |
| `NAU_ANDROID_STORE_PASSWORD` | storePassword，同时作为该 alias 的 keyPassword |

两项均配置时构建签名 `nau-mpacc-guide-1.0.5.apk` release；均未配置时构建明确命名的 `nau-mpacc-guide-1.0.5-test.apk` debug。只配置一项则失败，避免签名意外改变。私钥仅在 runner 临时目录解码，构建后删除，不写入 Git 或 artifact。APK 内的证书是公钥信息，可以公开验证。请妥善保存同一私钥供升级续签；不同签名的 APK 无法覆盖安装。

debug 默认使用每次 runner 新生成的调试密钥，因此不同构建之间通常需要卸载重装（会丢失本机清单）。正式分发应使用上述稳定私钥。release 仍为个人指南测试用途，不代表应用商店审核版本。

本地需安装完整 JDK17、Gradle8.9、Android SDK35/Build Tools35.0.0，设置 `ANDROID_HOME` 后：

```sh
cd android
gradle --no-daemon :app:assembleDebug :app:lintDebug
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose --print-certs app/build/outputs/apk/debug/app-debug.apk
python3 verify-apk.py app/build/outputs/apk/debug/app-debug.apk
```

本地 release 额外设置 `ANDROID_KEYSTORE_PATH` 和 `NAU_ANDROID_STORE_PASSWORD` 后运行 `:app:assembleRelease`。本仓库不包含 Gradle wrapper 二进制；CI 通过官方 setup-gradle 安装固定版本。

## 验证状态与安装

工作流先编译和 lint，再用 `apksigner verify --verbose --print-certs` 校验签名，用 `aapt` 导出包信息和权限，用 `verify-apk.py` 校验 APK 的 Manifest/DEX/资源以及每个离线文件与当前 dist 的字节一致性，同时核对 34 人评价结构、已确认归属和推荐/提醒的引用、12 家机构实习资源，以及 19 首歌曲的元数据、平台链接、无私有路径与包内无音频，最后生成 SHA256。安装前核对文件 SHA256 和稳定签名证书 SHA256。

手动触发时可启用 `smoke_test`（默认 false）：下载 API34 模拟器，在默认线上启动前关闭无线连接并设置不可达系统代理，核验代理已生效，再启动应用，等待自动回退的内置模式与第一个导师姓名出现在可访问性树，再打开导师详情，用系统返回键关闭弹窗，并核验返回入口后能离开应用。随后独立重启，打开音乐栏目，核对 19 曲目，经系统文件选择器选取由标准库生成的非版权测试 WAV，确认实际解码、播放计时前进，再打开选择器并取消，确认播放已暂停、原本机文件仍可继续使用。`smoke/result.txt` 记录原有阅读/返回检查，`smoke/music-result.txt` 只有音乐整套通过才写 PASS；任一失败均使 workflow 失败。日志、界面 XML、截图和自制测试音频随同导出，不涉及用户录音。此项较慢，默认构建不运行。模拟器验证不等同于 Redmi 真机验证。

<!-- NATIVE_VERIFICATION -->
1.0.5 的原生音频选择、包内音乐数据检查及 Android 14 音乐烟测已加入，实际 GitHub Actions 构建、签名和模拟器结果待本版运行后确认。当前不得据此宣称本版 APK 已通过实机或模拟器验证；尚未验证 Redmi 真机。
<!-- END_NATIVE_VERIFICATION -->

Redmi / Android 14 安装：下载并解压 artifact，点 APK，按系统提示仅为当前使用的浏览器或文件管理器允许“安装未知应用”。安装后先测试在线页、搜索、联系清单、外部原帖；再断网重启测试内置页及 Word/Excel 保存。暂不包含自动更新，后续同包名且同证书 APK 可覆盖升级。

## 官方配置依据

- [AGP 8.7 兼容表：Gradle8.9/JDK17/API35](https://developer.android.com/build/releases/agp-8-7-0-release-notes)
- [WebView 本地 HTTPS 内容](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [WebView 不安全文件访问](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion)
- [Storage Access Framework 文件保存](https://developer.android.com/training/data-storage/shared/documents-files)
- [WebView 文件选择回调与 URI 校验](https://developer.android.com/reference/android/webkit/WebChromeClient#onShowFileChooser(android.webkit.WebView,android.webkit.ValueCallback%3Candroid.net.Uri[]%3E,android.webkit.WebChromeClient.FileChooserParams))
- [应用签名与升级身份](https://developer.android.com/studio/publish/app-signing)
- [Gradle 官方 setup-gradle](https://github.com/gradle/actions/tree/main/setup-gradle)
- [GitHub Ubuntu 24.04 runner SDK](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
