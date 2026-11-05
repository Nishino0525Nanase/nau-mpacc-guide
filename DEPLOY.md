# 独立仓库发布与验收

目标仓库为 `Nishino0525Nanase/nau-mpacc-guide`。此仓库专门保存南审 MPAcc 指南，新仓库创建和上线结果以实际 GitHub 返回状态为准。

## 发布目录

`main` 分支保存项目源码，包括 `dist/`、`README.md`、本说明及发布清单中的其他文件。不要上传 `.env.local`、私人 API key、GitHub 凭据、预览文件或临时运行记录。

发布使用单独的 `gh-pages` 分支：将 `dist/` 中的所有文件映射到该分支根目录。例如 `dist/index.html` 对应 `gh-pages` 中的 `index.html`，`dist/admin/index.html` 对应 `admin/index.html`。不要把 `dist/` 目录本身包进发布分支，也不要增加 `nau-guide/` 子目录。

发布分支根目录增加空 `.nojekyll` 文件。GitHub Pages 的发布源选择 **Deploy from a branch**，分支为 `gh-pages`、目录为 `/ (root)`；对应 Pages API 配置为 `build_type: legacy`、`source: {branch: gh-pages, path: /}`。本项目不另外提交自定义 Pages 工作流，避免产生两套发布流程。

此方式不需要为提交自定义工作流申请 `workflow` 权限。认证仍需有新仓库的创建、代码写入和 Pages 设置权限；凭据仅用于 GitHub 认证，不得放进网页、源码或发布文件。上传前核对发布清单的文件哈希，更新分支时使用非强制更新，避免覆盖并发修改。

## 上线验收

1. 将 `dist/` 的当前内容提交至 `gh-pages`，等待 GitHub 自动的 Pages 构建部署成功，通过 GitHub 返回的实际部署地址访问指南。
2. 打开导师目录、搜索姓名并检查对应详情；查看生活章节和原帖；确认3份资料下载。
3. 页脚“站点管理”进入管理入口，再打开需要登录的 PostHog 统计后台。报表公开分享必须保持关闭。
4. 用不排除统计的另一个浏览器打开指南，稍后刷新后台，检查 PV 和匿名浏览器访客数增加；不要向正式数据中手工补入访问量。
5. 在自己常用的浏览器访问管理入口，点击“排除这个浏览器的访问”。该设置需分别在不同浏览器开启。

## 统计配置

公开配置中只包含 PostHog capture token，它只能写入事件，不能读取报表。统计脚本仅允许生产域名 `nishino0525nanase.github.io` 下 `/nau-mpacc-guide/` 路径；如果换域名或仓库名，应重新构建配置。个人 API key、GitHub 凭据和 `.env.local` 不得提交。

本地运行 `node scripts/build-config.mjs`，使用环境变量或未提交的 `.env.local` 生成 `dist/analytics-config.js`。生成后的公开配置随 `dist/` 提交到 `main`，再映射到 `gh-pages` 根目录。发布后的静态文件不包含私人查询密钥。

## 本地验证

运行 `node --test tests/analytics.test.mjs` 验证匿名化、退出统计、目录范围和重复加载行为。数据转换脚本需要原始研究输入，发布目录已包含完整整理后的 JSON 和三份下载文件。
