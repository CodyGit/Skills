# Buddy 加油站签到接口与 wbipc 协议参考

本文档供维护与排障使用：当签到接口失效、wbipc 握手失败或需要调用其他 wb.request 接口时参考。逆向自 WorkBuddy 桌面端（2026-11，版本以实际为准），接口可能随官方更新变动。

## 签到业务接口

所有请求经 wb.request 管道转发至官方后端（baseUrl 由应用注入），请求头由应用自动附加：

- `authorization: Bearer <accessToken>`
- `x-user-id: <uid>`（企业账号另有 `x-enterprise-id` / `x-tenant-id`）

### 1. 查询签到状态

```
POST /v2/billing/meter/checkin-activity-status
```

成功响应（HTTP 200）关键字段：

```json
{
  "code": 0,
  "data": {
    "active": true,               // 活动是否参与
    "today_checked_in": true,     // 今天是否已签
    "streak_days": 30,            // 连续签到天数
    "daily_credit": 100,          // 每日积分
    "today_credit": 100,
    "total_credits": 3000,        // 总积分
    "checkin_dates": ["2026-11-16", "..."],
    "week_progress": [true,false,false,false,false,false,false],
    "theme_name": "Buddy加油站",
    "activity_name": "Buddy应用"
  }
}
```

### 2. 领取每日积分

```
POST /v2/billing/meter/daily-checkin
```

- 成功：HTTP 200，`{"code":0,"msg":"OK",...}`（含领取到的积分）
- 已签过：HTTP 400，`{"code":10001,"msg":"今天已签到，请明天再来"}` —— **接口幂等**，同一天重复调用不会多领

## wbipc 协议要点

### 端点发现

- 发现文件：`<WORKBUDDY_CONFIG_DIR 或 ~/.workbuddy>/wbipc/endpoint.json`
- 内容：`{"endpoint":"\\\\.\\pipe\\wbipc-<instanceId>","ticket":"<base64url 32字节随机票据>"}`
- Windows 连接命名管道；其他平台 socket 文件为 `<配置目录>/wbipc/b-<instanceId>.sock`
- ticket 每次客户端启动时重新生成，WorkBuddy 重启后需重新读取

### 帧格式

换行符（`\n`）分隔的 JSON 帧，单帧上限 65536 字节。

### 握手流程

1. 客户端 → `{"type":"session_hello","protocol_min":1,"protocol_max":1,"client_nonce":"<base64url 16B>","ticket_id":"<sha256(ticket)[:16hex]>","client":{"kind":"cli","id":"...","version":"..."}}`
2. 服务端 → `{"type":"session_challenge","protocol":1,"server_nonce":"...","server_proof":"..."}`
3. 客户端校验 server_proof，然后 → `{"type":"session_prove","client_proof":"..."}`
4. 服务端 → `{"type":"session_hello_ack","protocol":1,"connection_epoch":"...","max_inflight":8,"pipes":[...]}`

proof 计算：`HMAC-SHA256(key=ticket_utf8, msg=transcript)`，base64url 输出。

transcript 编码（4 字节大端长度前缀 + 内容，依次拼接）：

- 客户端侧：`["wbipc-c","1",<endpoint>,<clientNonce>,<serverNonce>]`
- 服务端侧：`["wbipc-s","1",<endpoint>,<clientNonce>,<serverNonce>]`

### RPC 调用（JSON-RPC 2.0）

1. 打开通道：`{"jsonrpc":"2.0","id":1,"method":"broker/GetPipe","params":{"pipe":"wb.request"}}` → 返回 `{"channel":"c:wb.request","methods":["http.fetch"]}`
2. 调用方法：`{"jsonrpc":"2.0","id":2,"method":"c:wb.request/http.fetch","mode":"call","params":{...}}`

`http.fetch` 参数：

| 字段 | 说明 |
|---|---|
| `method` | GET/HEAD/POST/PUT/PATCH/DELETE |
| `path` | 相对路径，必须以 `/` 开头，禁止 `//`、`..`、`?`、`#` |
| `query` | 可选，`{k: "v"}` 字符串键值对 |
| `headers` | 仅允许 `content-type`、`accept` |
| `body_b64` | 请求体标准 base64（GET/HEAD 不得携带） |

返回：`{"status":<http状态码>,"headers":{白名单头},"body_b64":"<响应体 base64>"}`（白名单：content-type/content-length/etag/last-modified/retry-after/location/x-request-id）。

超时：单请求 50 秒；单连接最多 8 个并发请求。

### 可用管道

- `wb.request` — HTTP 代理（本 skill 使用）
- `wb.entitlement` — 权益相关
- `wb.wecom-a2a` — 企业微信 A2A 消息

## 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| endpoint.json 不存在 | WorkBuddy 未启动或未登录 | 启动并登录后重试 |
| 连接管道失败 / 握手 auth_failed | ticket 过期（客户端重启） | 重新读取 endpoint.json 重试 |
| RPC `E_NOT_CONNECTED: workbuddy session is not available` | 登录态不可用 | 确认已登录 |
| HTTP 401 / 接口 404 | 接口变更 | 在 app.asar 中重新检索 `daily-checkin`、`checkin-activity-status` 确认新路径 |
| 路径报 `path must be relative...` | 手动探测时 Git Bash 把 `/v2/...` 转成了 Windows 路径 | 加 `MSYS_NO_PATHCONV=1` 前缀 |
