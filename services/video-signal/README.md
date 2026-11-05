# 自愿视频共享：信令服务

此服务仅协调访客明确、单独同意后发起的视频共享。它不获取摄像头、不接收或存储视频帧、不录制、不收集音频。摄像头权限、可见预览、持续共享提示、停止按钮与10分钟到时停止，必须由独立的发送端和站主界面实现，不能与 Cookie 或阅读权限捆绑。

## 部署绑定

- `BUCKET`：私有 R2 bucket。不要开启 bucket 公开访问。
- `ADMIN_SHARED_SECRET`：32—256个 URL-safe 随机字符，建议使用32随机字节的十六进制或base64url编码。通过平台运行时 Secret 设置，不得写入源码、GitHub、前端或URL。
- 缺少绑定或有效密钥时返回503，不能以开发占位值运行。

Root handler为 Worker ESM 的 `fetch(request, env, ctx)`。Owner API 的调用者必须是另一个由平台限制为仅站主可访问的后台服务；该私有后台服务端代理请求，并自行保留其平台访问边界。不要让公开 GitHub 浏览器直接持有管理密钥或代理未授权用户。

## 接口

公开发送端的 `Origin` 必须精确等于 `https://nishino0525nanase.github.io`。所有请求必须使用 HTTPS。CORS 只控制浏览器，不是身份认证或反滥用防护。

| 请求 | 权限 | 返回 |
| --- | --- | --- |
| `POST /api/sessions`，`{offer:{type:'offer',sdp},consentVersion:'camera-share-v1'}` | 独立同意的发送端 | `201 {id,senderToken,expiresAt}` |
| `GET /api/sessions/:id` | Bearer senderToken | `{id,answer:null或RTC描述,status,expiresAt}` |
| `DELETE /api/sessions/:id` | Bearer senderToken | `{ok:true}` |
| `GET /owner/sessions` | 管理密钥；不接受 Origin | `{sessions:[{id,createdAt,expiresAt,status}]}` |
| `GET /owner/sessions/:id` | 管理密钥；不接受 Origin | `{id,offer,createdAt,expiresAt,status}` |
| `POST /owner/sessions/:id/answer`，`{answer:{type:'answer',sdp}}` | 管理密钥；不接受 Origin | `{ok:true,status:'answered'}` |
| `DELETE /owner/sessions/:id` | 管理密钥；不接受 Origin | `{ok:true}` |

时间统一为 ISO 8601。`status` 为 `waiting` 或 `answered`；不存在、已停止或到期会话返回404；错误凭据401。SDP只接受单个video媒体段；audio/data channel均拒绝。请求JSON实际流量上限128KiB，不仅依赖 Content-Length。

会话ID为随机UUID，发送端凭据为32随机字节，只在创建响应中返回，服务端仅存SHA256摘要。凭据须放 Authorization，不得放查询参数或URL，所有响应均no-store。管理列表不含token或SDP。

## 存储、过期与并发边界

R2中分别存储会话索引、offer和answer；没有媒体内容。SDP可能包含网络地址，因此也是私有临时数据，不能写入日志。

固定授权期限为创建后10分钟，轮询或回答不续期。关闭时先撤销索引门禁，再删除描述。过期对象在下一次有效API请求清理，读取与写入始终独立检查绝对到期时间，不依赖清理任务来授权。此版本没有定时回收任务，不宣称R2对象会在第10分钟自动物理消失。

R2对条件写入提供原子比较语义。小型全局索引使用ETag条件写入，保证跨实例不会登记超过20个会话。先保留名额再写offer，两者就绪后才返回发送端凭据；未完成的offer不进入站主列表。失败或停止时先撤销门禁，保留私有的清理标记直到对象删除成功，后续请求可重试回收。answer以create-once条件写入，重复相同回答幂等，不同回答409。迟到回答和延迟读取会再检查门禁与时间，不能重新返回已停止或过期的描述。

R2同一key并发写入限制为每秒1次，本实现对429做有限退避；突发创建或停止可能返回503。20个名额也可能被任意公开客户端占用，CORS不能防止脚本冒充Origin。需要强反滥用或更高吞吐时，应采用受控邀请/认证并以Durable Object或D1协调，而不是扩大这个公开原型的名额。

服务端停止信令并不能关闭已建立的点对点媒体连接。双方浏览器必须在停止、页面隐藏/离开、绝对到期或连接异常时停止媒体tracks并关闭RTCPeerConnection。WebRTC连接还受网络/NAT和STUN/TURN条件影响，不应宣称任何网络都能连通。

## 验证

`node --test tests/worker.test.mjs` 使用合成SDP、私有内存桶和模拟时钟，不读取真实摄像头。覆盖角色隔离、到期、停止、并发配额、迟到回答、输入上限及失败关闭。

参考官方资料：[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)、[一致性与条件写入](https://developers.cloudflare.com/r2/reference/consistency/)、[同一对象写入限制](https://developers.cloudflare.com/r2/platform/limits/)。
