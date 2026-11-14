# 微信公众号接入

## 当前账号：未认证订阅号

当前平台地址为 `http://q7banlife.me/news`。该账号按未开通网页授权和高级群发接口处理，程序默认关闭这两类能力；填写 AppID/AppSecret 不会自动开通微信接口权限。

当前可用流程：用户直接访问平台阅读新闻，需要个人设置时使用邮箱注册登录；管理员进入“公众号后台”，选择一篇或多篇新闻，生成固定列表与发布内容，再复制或下载文本，到微信公众平台按账号实际支持的发布方式手动发布。生成列表不需要 AppSecret，也不会向关注者自动发送消息。

编辑后端配置文件 `backend/.env`（示例见 `backend/.env.example`）：

```text
PUBLIC_BASE_URL=http://q7banlife.me/news
WECHAT_OAUTH_ENABLED=false
WECHAT_MASS_SEND_ENABLED=false
ADMIN_EMAILS=你的管理员邮箱
JWT_SECRET=你的随机密钥
```

本地已生成 `backend/.env` 和随机 JWT 密钥，你只需填写管理员邮箱。程序启动时自动读取该文件，不受启动目录影响；修改后重启后端。已有进程环境变量优先于配置文件。配置文件被 Git 忽略，部署到服务器时需在服务器的 `backend/.env` 中单独配置。

后续只有在公众号后台确认已获得对应权限后，才分别设置 `WECHAT_OAUTH_ENABLED=true` 或 `WECHAT_MASS_SEND_ENABLED=true`。开关只控制本程序入口，不能赋予微信权限。微信登录还要求将平台部署到 HTTPS，并同步更新 `PUBLIC_BASE_URL`。HTTP 仅支持当前普通浏览与手动分享，建议为平台配置 HTTPS 后再使用账号密码登录。

## 已实现的流程

- 普通用户：直接浏览新闻，或邮箱登录；取得网页授权权限并启用后，可在微信中授权登录并复用平台账号。
- 管理员：邮箱密码登录 → 公众号后台 → 勾选单篇或多篇新闻 → 生成固定列表 → 复制或下载内容 → 在微信公众平台手动发布；取得接口权限并启用后，可使用预览发送和群发。
- 推送采用公众号文本群发接口，消息包含新闻标题和平台列表链接。没有使用需要封面素材的图文素材发布流程。
- 固定列表保存当时的标题、摘要和来源链接；后续新闻抓取不会改变列表。文章正文仍从新闻详情页读取，正文被清理后可从列表跳到原始来源。
- 微信登录用户始终为普通用户。公众号设置、选稿、重要标记、预览、群发和发送记录均需管理员权限。

## 部署配置

后端启动时自动读取 `backend/.env`。首次部署时复制 `backend/.env.example` 为 `backend/.env`，填写管理员邮箱和 JWT 密钥；Linux 和 Windows 的现有启动、部署脚本均可直接使用：

```text
PUBLIC_BASE_URL=https://news.example.com/news
WECHAT_OAUTH_ENABLED=false
WECHAT_MASS_SEND_ENABLED=false
ADMIN_EMAILS=admin@example.com
JWT_SECRET=至少32个字符的随机密钥
```

可在项目目录运行以下命令生成 JWT 随机密钥，再填入配置文件。已有有效密钥时请保留原值：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`PUBLIC_BASE_URL` 是外部可访问的完整平台地址，包含 `/news`。普通分享支持 HTTP 或 HTTPS，微信授权登录必须使用 HTTPS。反向代理需将 `/news/api/*` 和前端 `/news/*` 路由转发至后端，保留查询参数和 Cookie。

生产环境启动时强制检查 `JWT_SECRET` 至少 32 个字符；修改密钥会让原有登录令牌失效。

使用 `ADMIN_EMAILS` 中的邮箱注册并以管理员身份登录，进入“公众号后台”，填写 AppID、AppSecret 和预览目标 OpenID。密钥保存后不会返回浏览器，输入框留空表示保留原密钥；更换 AppID 需要同时输入 AppSecret，并会清除旧的接口令牌缓存。

首次初始化推送设置默认关闭定时群发；已有数据库的推送开关保持现有值，但接口群发能力关闭时不会执行。只有 `WECHAT_MASS_SEND_ENABLED=true` 时才能在后台开启自动汇总，Cron 使用北京时间（Asia/Shanghai）。修改后台推送设置后定时任务立即重新加载，不需要重启；修改环境变量仍需重启。

## 微信公众平台设置

本节适用于已取得接口权限并开启相应环境开关的公众号。未认证订阅号使用前述手动发布流程，不应配置网页授权入口。

1. 确认公众号拥有 `snsapi_base` 网页授权和相应群发接口权限。具体可用能力及额度以当前公众号控制台为准。
2. 配置网页授权域名，如 `news.example.com`，完成微信要求的域名验证文件校验。校验文件应由反向代理或静态服务器放到域名根路径；本项目不会自动生成微信提供的验证文件。
3. 将后端服务器的公网出口 IP 配置到公众号接口 IP 白名单。
4. 在公众号自定义菜单中添加网页入口：`https://news.example.com/news/api/wechat/auth/start`。该地址直接发起微信授权，默认返回新闻首页。跳到今日新闻可使用 `?returnTo=%2Ftoday`。
5. 网页授权回调地址由程序生成：`https://news.example.com/news/api/wechat/auth/callback`。

这是公众号内网页授权登录，需要在微信中打开。当前没有接入微信开放平台的 PC 扫码登录，也没有接入公众号用户消息 XML 回调、客服自动回复或加密事件推送。网页授权回调地址不应填写到公众号“服务器配置”的消息接收 URL 中。

参考：[腾讯云 CloudBase 公众号网页授权接入说明](https://docs.cloudbase.net/integration/wechat-official-oauth)、[微信网页授权文档](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html)、[微信群发接口文档](https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Batch_Sends_and_Originality_Checks.html)。

## 推送与验收

1. 管理员打开“公众号后台”，选择最新 100 篇新闻中的一篇或多篇，点击“生成推送预览”。列表将保存为固定快照；单条和列表使用同一流程。
2. 打开生成的列表地址，核对新闻标题、摘要和详情链接。
3. 点击“发送给预览 OpenID”，在目标微信号里检查消息与平台链接。
4. 勾选向全部关注者群发的确认框，再点击“立即群发”。普通用户不显示这些入口，后端接口同样拒绝访问。
5. 后台显示微信消息 ID 和发送记录。“微信已受理”表示接口接受发送任务，不代表所有用户已经收到；最终结果需在微信侧核对。接口权限或额度不足会显示错误。

同一个已生成的列表只能提交一次正式群发；网络超时或不明确结果后也会锁定，避免自动重试造成重复消息。此时先在微信侧核对发送结果，确认需要重发后再重新生成列表。预览可重复发送，也会消耗微信相应接口额度。

群发仅向公众号关注者发送，不会向所有平台注册用户发送。这里使用文本与平台链接，不自动发布微信公众号原生图文文章。

## 授权与存储

授权使用随机、短期、单次有效的 state，绑定 HttpOnly、Secure、SameSite=Lax 浏览器 Cookie。服务端用微信返回的 code 交换 OpenID，以 AppID + OpenID 唯一关联账号，不使用前端提交的 OpenID 登录，也不与同名邮箱自动合并。

回到前端时携带的是一分钟有效、绑定浏览器且单次使用的临时票据，位于 URL 片段中；兑换后清除片段。微信 access_token 与 AppSecret 不返回普通用户或管理页面。

数据库初始化会新增 `wechat_users`、`wechat_oauth_flows`、`wechat_login_tickets` 和 `news_pushes` 表，兼容已有账号和新闻数据。授权临时数据会在发起新授权时清理过期记录；固定新闻列表与发送记录会保留。

## 本地验证

```sh
cd backend
npm test -- --runInBand --silent
cd ../frontend
npm run build
```

测试通过模拟微信接口覆盖授权状态与票据复用、账号关联、权限隔离、配置脱敏、选稿验证、固定快照、文本推送格式和重复发送防护。真实微信登录、域名验证、接口权限和最终收信效果仍需用实际公众号在正式 HTTPS 域名下联调。
