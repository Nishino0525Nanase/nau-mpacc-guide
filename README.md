# 雨诺的南审手记 · MPAcc 选导与生活指南

南京审计大学 MPAcc 选导与生活指南。策划与设计：胡雨诺。

[打开指南](https://nishino0525nanase.github.io/nau-mpacc-guide/)

网页包含导师导览、学习生活、社交原帖与官方资料索引、Word / Excel 资料下载，以及独立的“音乐小憩”歌单。官方事实与社交平台个人反馈分开标记；当年双选名额以学院通知和导师回复为准。网页不显示资料生成时间，保留原帖日期和政策年份供判断适用范围。

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

### 1.0.2 选导工具

可在当前会话中选择最多3位导师并排对比，分别查看公开研究内容、具名教学或指导记录、学生反馈身份及待确认名额。工具不提供评分和排名。联系准备面板提供可编辑的提纲和草稿，个人身份与经历使用占位符，内容由使用者自行填写和核对后复制。

### 1.0.3 学生个人评价

34位导师逐人记录评价覆盖与缺口。学生经历前置展示，标明评论者、接触关系、学位阶段、年份、本人经历或转述及原始来源；推荐理由与适配提醒引用具体经历，缺证时提供核实问题。姓名缩写只作检索线索，不按名单匹配推定实名。可按评价覆盖类型筛选，并在导师对比中核对这些边界。

评价合并脚本为 `data/build_student_review_dossiers.py`，发布用研究输入放在 `data/reviews_research/`。`data/student-review-coverage.json` 记录逐人覆盖，`data/student-review-sources.json` 保留来源与阅读范围。Excel索引另附学生评价总览。

### 1.0.4 实习资源与申请准备

学习生活第九章新增四大、国内所与南京周边实习资源，可按机构、项目地区和资源状态筛选。分别显示申请资格、出勤、时长、项目期、投递窗口和已公布的截止日；官方入口、项目公告、待核列表、已过窗口及正式校招分别标注。办公室和合作基地不代表当前岗位或名额，苏沪机会需另核实际驻地及课业安排。

实习研究脚本为 `data/build_internship_resources.py`，安全输入放在 `data/internships_research/`，来源与QA记录为 `data/internship-sources.json`、`data/internship-qa.json`。网页、Word、Excel与应用版同步；信的文字改为平常、克制的祝福。

### 1.0.5 音乐小憩

新增独立的[音乐栏目](https://nishino0525nanase.github.io/nau-mpacc-guide/#music)，收录自选的19首华晨宇歌曲，保留专辑、现场版本和音频时长，支持搜索与筛选。每首歌提供QQ音乐官方搜索入口；搜索不保证平台提供相同版本或免费播放。

可手动选择本机音频，匹配歌单后在当前页面播放、切歌、调节进度和音量。音频不上传，也不持久保存；刷新后需重新选择。页面不自动播放，离开栏目、页面隐藏或应用退到后台会暂停。Android版使用系统文件选择器选取音频，不申请媒体库、存储、录音或摄像头权限。网站和安装包只发布歌单信息，不包含商业歌曲音频。原有信件保持1.0.4版本。

歌单构建脚本为 `data/build_music_playlist.py`，版本与来源核对见 `data/music-playlist-sources.json`、`data/music-playlist-qa.json`。
