# 发布说明

目标仓库 `Nishino0525Nanase/nau-mpacc-guide`，网址 https://nishino0525nanase.github.io/nau-mpacc-guide/ 。

将 `dist/` 文件映射到 `gh-pages` 分支根目录并保留 `.nojekyll`；源码保存在 `main`。两个分支更新均使用预期分支头校验，避免覆盖其他修改。删除的静态资源需同步从发布分支删除。

运行 `node --test tests/analytics.test.mjs`。检查导师搜索、详情、章节阅读和三份下载资料，确认页面无已移除组件。生产计数只允许指定域名与指南首页，预览不会发送事件。部署验收不手工注入正式统计数据。

公开配置只包含 PostHog capture token，不能读取报表。私人 API key、GitHub 凭据、运行时密钥和 `.env.local` 不得提交。仅统计页面打开次数，不将随机事件标识当作去重人数。
