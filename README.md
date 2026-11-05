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
