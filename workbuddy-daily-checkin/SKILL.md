---
name: workbuddy-daily-checkin
description: WorkBuddy 每日积分自动签到（Buddy 加油站）。当用户提到 WorkBuddy 签到、每日积分、加油站领积分、check-in、credits、自动领积分、定时领积分时使用此 skill。通过本机 wbipc 通道调用官方签到接口完成领取（不需要读取用户登录令牌），并可用 automation_update 创建每日定时任务实现全自动领取。
agent_created: true
---

# WorkBuddy 每日积分自动签到

WorkBuddy 桌面端的"Buddy 加油站"每天可手动签到领取积分（每日 100 积分，连续签到有额外奖励）。本 skill 通过 WorkBuddy 本机 wbipc 通道调用官方签到接口，代替手动点击，并可创建定时任务实现每天自动领取。

**核心原理**：WorkBuddy 桌面端在本机暴露 wbipc 管道（`wb.request`），客户端通过它代理 HTTP 请求时，应用会自动附加登录态请求头（`Authorization: Bearer` 与 `x-user-id`）。因此脚本**不接触、不存储、不解密**用户登录令牌，安全且随登录态自动更新。

## 前置条件检查

执行签到前，依次确认：

1. **WorkBuddy 桌面端正在运行且已登录**：wbipc 管道由客户端进程提供。检查 `<配置目录>/wbipc/endpoint.json` 是否存在（默认 `~/.workbuddy/wbipc/endpoint.json`，除非设置了 `WORKBUDDY_CONFIG_DIR`）。文件不存在或内容为空 → 提示用户启动 WorkBuddy 并登录后重试。
2. **Node.js 可用**：优先 `node`（PATH）；不可用时在 `~/.workbuddy/binaries/node/versions/*/` 下查找内置 Node（Windows 为 `node.exe`）。

## 签到执行

运行脚本（无参数即自动签到模式）：

```bash
node <skill目录>/scripts/checkin.js
```

脚本行为：查询签到状态 → 已签则输出"今日已签到"退出 → 未签则调用领取接口 → 输出一行结果。脚本幂等，重复运行不会多领。

输出解读（退出码 0 = 成功，1 = 失败）：

| 输出 | 含义 | 处理 |
|---|---|---|
| `签到成功 \| ...` | 领取成功 | 向用户汇报到账积分 |
| `今日已签到 \| 连续N天...` | 当天已领过 | 无需处理 |
| `签到活动未开启` | 活动结束或账号未参与 | 如实告知用户 |
| `FAILED: 无法读取 endpoint.json` / `连接 wbipc 失败` | WorkBuddy 未运行或未登录 | 提醒用户启动 WorkBuddy 并登录 |
| `签到返回异常 HTTP ...` | 接口可能已变更 | 查看 `references/protocol.md` 重新核对接口路径 |

## 创建每日定时任务

用户要求"自动签到/定时领取"时，用 `automation_update`（mode=create）创建循环自动化：

- **name**: `WorkBuddy 每日积分自动签到`
- **scheduleType**: `recurring`
- **rrule**: `FREQ=DAILY;BYHOUR=9;BYMINUTE=0`（每天 9点执行；多值 BYHOUR 必须写成多个 `BYHOUR=xx` 段，不能逗号分隔）
- **status**: `ACTIVE`
- **cwds**: 传脚本所在目录
- **prompt**（必须自包含，定时任务运行时看不到当前对话）：

```
执行 WorkBuddy 每日积分自动签到。运行命令：node "<skill目录绝对路径>/scripts/checkin.js"（node 不可用时用 ~/.workbuddy/binaries/node/versions/*/ 下的内置 Node）。脚本自动完成：查询签到状态 → 未签则领取 → 输出一行结果，幂等，已签到会跳过。读取输出向用户简短汇报；若输出 FAILED 或"签到活动未开启"，说明原因并提醒用户确认 WorkBuddy 已启动且已登录。
```

注意：prompt 中的 `<skill目录绝对路径>` 必须在创建时替换为本 skill 的实际绝对路径（即本次会话中 SKILL.md 所在目录），不能用相对路径或占位符。

创建后立即运行一次脚本验证，并向用户报告结果与下次执行时间。

## 手动探测其他接口

脚本支持探测模式，可调用任意 wb.request 接口（用于排查接口变更）：

```bash
node <skill目录>/scripts/checkin.js /v2/billing/meter/checkin-activity-status POST
```

详细接口契约、wbipc 握手协议与排障方法见 `references/protocol.md`。
