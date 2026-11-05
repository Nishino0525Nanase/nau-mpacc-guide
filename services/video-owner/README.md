# 自愿视频交流 · 站主端

这是仅供站主访问的 Cloudflare Worker ESM。部署必须保持 **Sites owner-private**，该平台访问边界应覆盖页面和所有 `/api/` 请求。不要将此站点发布为公共站点，也不要把服务访问令牌或服务器密钥交给浏览器。

运行时需要 `SIGNAL_ORIGIN`（信令站点的 HTTPS origin）和秘密 `ADMIN_SHARED_SECRET`。缺失时返回 503。源文件和前端只含变量名，不包含真实凭据。

浏览器仅访问同源的限定 `/api/sessions` 路由。Worker 在服务端向信令站点 `/owner/sessions` 请求中加入共享密钥，不转发客户端 Cookie、Origin 或 Authorization。响应仅包含白名单字段，错误不回显上游响应正文。

站主端只接收访客主动共享的视频，不请求站主设备摄像头，不录制、截帧或播放音频。界面提供明确的查看与结束按钮、剩余时间以及失败状态。查看结束、断网或超时会关闭 WebRTC 连接；单次会话最长时间由信令后端决定，前端到期也会停止。

默认使用 Cloudflare 的公开 STUN 地址 `stun:stun.cloudflare.com:3478`。没有配置 TURN 中继，因此部分 NAT、校园网或移动网络无法直连；前端会报告失败并停止，不把协商成功当作收到画面。

官方资料：https://developers.cloudflare.com/realtime/turn/ 和 https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/

本地最小检查：`node --check worker/index.js` 与 `node --test tests/owner-worker.test.mjs`。测试不使用真实密钥、设备或账号；生产 owner-private 权限边界与真实设备视频仍须单独验收。
