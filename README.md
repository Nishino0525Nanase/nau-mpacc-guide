# 雨诺的南审手记 · MPAcc 选导与生活指南

独立 GitHub Pages 网站。目标仓库：`Nishino0525Nanase/nau-mpacc-guide`，项目路径：`/nau-mpacc-guide/`。

网页已发布。策划与设计：胡雨诺；西南林业大学 → 南京审计大学 MPAcc（保研），介绍由委托方提供。

- [打开指南](https://nishino0525nanase.github.io/nau-mpacc-guide/)
- [站点管理与私人统计入口](https://nishino0525nanase.github.io/nau-mpacc-guide/admin/)

统计数据需使用站主的 PostHog 账号登录查看。上线验收产生过一次访问。

`main` 分支保存源码及整理后的 `dist/`。发布时将 `dist/` 内的文件映射到 `gh-pages` 分支根目录，GitHub Pages 的发布源设置为 `gh-pages` 分支、根目录 `/`。发布分支另加空 `.nojekyll` 文件，直接提供静态文件。

- `dist/`：可直接发布的完整静态网页，包含原始 Word / Excel 下载。
- `data/build_site_data.py`：从已完成的研究材料整理页面数据。
- `scripts/build-config.mjs`：从环境变量或未提交的 `.env.local` 生成公开采集配置。
- `tests/analytics.test.mjs`：采集范围、匿名化、退出统计和防重复的验证。
- `DEPLOY.md`：独立仓库的分支发布方式与上线验收。

## 访问统计

统计入口为 `admin/`，点击后在 PostHog 登录。该页面本身可公开访问，统计数据必须通过 PostHog 账号验证。没有浏览器密码校验、公开共享报表、个人 API 密钥或本地模拟计数。

数据保存在已连接账号的唯一项目中。设置时组织只有站主本人一个成员，报表 `is_shared=false`。未来如果邀请组织成员，应同时复核 PostHog 的项目和报表访问权限；不要打开公开分享。

仅在生产域名 `nishino0525nanase.github.io` 下 `/nau-mpacc-guide/` 路径采集标准 `$pageview`，以 `source=nau-mpacc-guide` 隔离数据。PV 按页面打开次数计算；UV 是所选时间内匿名浏览器标识的去重值，不能识别真实身份。未开启自动点击采集或录像。屏蔽统计的访客无法完整计数。

## 更新配置

需要的环境变量：`NAU_POSTHOG_TOKEN`（仅公开 capture token）、`NAU_POSTHOG_API_HOST`、`NAU_ALLOWED_HOST`、`NAU_PATH_PREFIX`。运行 `node scripts/build-config.mjs`，将生成的 `dist/analytics-config.js` 随静态文件发布。不要使用个人 API key，不要提交 `.env.local`。

## 内容边界

指南为非官方资料。官方导师名单、公开资料与社交平台自述分别标记；本科课程印象、二手转述、历史经历不等同于当年 MPAcc 日常指导风格。名额以当年学院通知和导师回复为准。

## 资料扩充与隐私选择

当前来源索引为108条，本轮新增收录26条（小红书23、其他平台3），另列筛除和未读线索。来源数量不等于独立学生数或导师评价数量。

网页不显示资料生成日期；原帖发布日期和政策年份用于判断适用边界。匿名统计只有访客明确同意后才启用，拒绝不影响阅读，且可随时撤回。

## 自愿视频共享

`video/` 为独立自愿共享页，先本机预览，再单独明示同意共享给网站管理员 GitHub Nishino0525Nanase（不等同于页面策划署名者）。Cookie 同意不会获取摄像头。页面始终显示预览与共享状态，停止、切后台和10分钟到期会关闭摄像头，不录音、不录像、不截帧。

- [视频共享页](https://nishino0525nanase.github.io/nau-mpacc-guide/video/)
- [私人视频后台](https://nau-guide-video-owner.nishinonanase77.chatgpt.site/)：Sites平台保持仅站主账号可访问。
- `services/video-signal` 与 `services/video-owner` 是服务源码；运行时凭据不在仓库。信令只临时处理SDP和连接信息，视频走点对点连接；过期授权立即失效，物理清理在后续有效请求触发。
- 当前使用公共STUN；未配置TURN，部分网络可能不能连通。真实摄像头与跨网络视频需要实际设备验收，单元测试不替代此检查。
