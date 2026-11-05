# 雨诺的南审手记 · MPAcc 选导与生活指南

南京审计大学 MPAcc 选导与生活指南。策划与设计：胡雨诺。

[打开指南](https://nishino0525nanase.github.io/nau-mpacc-guide/)

网页包含导师导览、学习生活、社交原帖与官方资料索引，以及 Word / Excel 资料下载。官方事实与社交平台个人反馈分开标记；当年双选名额以学院通知和导师回复为准。网页不显示资料生成时间，保留原帖日期和政策年份供判断适用范围。

## 发布

`main` 保存源码与 `dist/`；`gh-pages` 根目录对应 `dist/`，另含空 `.nojekyll`。GitHub Pages 从 `gh-pages` 根目录发布。

- `dist/`：完整静态页面、数据和下载资料。
- `data/`：研究材料转换与合并脚本。
- `scripts/build-config.mjs`：生成公开采集配置，仅使用 capture token。
- `tests/analytics.test.mjs`：计数边界、排除设置与匿名化验证。

基础访问量仅统计页面打开次数，不使用 Cookie 或长期访客标识。遵循浏览器隐私信号与已保存的退出选择。不启用自动点击采集、录屏或身份识别。统计报表需要账号权限，不提供公开读取接口。

## 应用版

网页“资料下载 → 应用版”提供 Android 安装包和浏览器安装说明。Android 版可在线读取更新，并内置随安装包提供的指南与 Word / Excel 资料供离线阅读；仅需联网权限。使用“内置”切换离线资料，“在线”返回网站。

浏览器版支持添加到桌面；首次联网打开后可缓存指南。iPhone 使用 Safari 的“分享 → 添加到主屏幕”。Android 原生源码与构建说明见 [android/README.md](android/README.md)。

追加研究材料可用 `python data/extend_app_research.py --write` 合并；已读来源、重复项及适用边界保留在 `data/research_app/` 与 QA 记录中。

### 1.0.1 改进

Android 返回键会先关闭资料详情；自动切换离线资料后会清理失败的在线导航，避免返回循环。文件保存完成且关闭成功后才显示成功提示。内置模式显示当前客户端版本，不再重复提示安装自己。

研究补充脚本为 `data/extend_continue_research.py`，输入放在 `data/research_continue/`。公开项目主题只作为有来源的选题参考，不据此分配导师或推断当年名额。
