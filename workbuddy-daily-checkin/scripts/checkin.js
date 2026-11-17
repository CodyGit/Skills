#!/usr/bin/env node
// date: 2026-11-16 22:28
// author: cody
// description: 通过 WorkBuddy 本机 wbipc 通道调用官方接口，完成每日积分自动签到
/**
 * WorkBuddy 每日积分自动签到（Buddy 加油站）
 *
 * 原理：WorkBuddy 桌面端在本机暴露 wbipc 命名管道/Unix socket（wb.request 管道），
 * 客户端可通过它代理 HTTP 请求，应用会自动注入 Authorization 与 x-user-id，
 * 因此本脚本不需要读取或解密本地登录令牌。
 *
 * 用法：
 *   node checkin.js                 自动签到模式：查状态 -> 未签则领取 -> 输出一行结果
 *   node checkin.js <path> <method> [jsonBody]
 *                                   手动探测模式：调用任意 wb.request 接口并打印响应
 *
 * 退出码：0 = 成功（含"今日已签到"）；1 = 失败
 *
 * 环境变量：WORKBUDDY_CONFIG_DIR（默认 ~/.workbuddy）
 */
"use strict";

const net = require("net");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ---------- 定位 wbipc endpoint ----------
const configDir =
  (process.env.WORKBUDDY_CONFIG_DIR || "").trim() || path.join(os.homedir(), ".workbuddy");
const discoveryPath = path.join(configDir, "wbipc", "endpoint.json");

function fail(msg) {
  console.error("FAILED:", msg);
  process.exit(1);
}

let disc;
try {
  disc = JSON.parse(fs.readFileSync(discoveryPath, "utf8"));
} catch (e) {
  fail(`无法读取 ${discoveryPath}（${e.message}）。请确认 WorkBuddy 桌面端已启动且已登录，然后重试。`);
}
const ticket = disc.ticket;
if (!ticket || !disc.endpoint) fail("endpoint.json 内容不完整，请重启 WorkBuddy 后重试。");
const ticketId = crypto.createHash("sha256").update(ticket, "utf8").digest("hex").slice(0, 16);

// Windows: 命名管道 \\.\pipe\wbipc-<id>；其他平台: <configDir>/wbipc/b-<id>.sock
function resolveSocketPath() {
  if (process.platform === "win32") return disc.endpoint;
  const name = String(disc.endpoint).split(/[\\/]/).pop(); // wbipc-<id> or b-<id>.sock
  const candidates = [
    path.join(configDir, "wbipc", name.endsWith(".sock") ? name : `b-${name}.sock`),
    path.join(configDir, "wbipc", `${name}.sock`),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[0];
}

// ---------- wbipc 握手与 RPC ----------
function encodeTranscript(side, t) {
  const parts = [
    side === "server" ? "wbipc-s" : "wbipc-c",
    String(t.protocol),
    t.endpoint,
    t.clientNonce,
    t.serverNonce,
  ];
  const chunks = [];
  for (const p of parts) {
    const b = Buffer.from(p, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(b.length, 0);
    chunks.push(len, b);
  }
  return Buffer.concat(chunks);
}
function computeProof(side, t) {
  return crypto
    .createHmac("sha256", Buffer.from(ticket, "utf8"))
    .update(encodeTranscript(side, t))
    .digest("base64url");
}

const sock = net.connect(resolveSocketPath());
let buf = Buffer.alloc(0);
const pending = new Map();
let nextId = 1;
let myNonce = crypto.randomBytes(16).toString("base64url");
let transcript = null;

function send(obj) {
  sock.write(Buffer.from(JSON.stringify(obj) + "\n", "utf8"));
}

sock.on("error", (e) =>
  fail(`连接 wbipc 失败（${e.message}）。请确认 WorkBuddy 桌面端正在运行且已登录。`)
);

// 连接被对端关闭（握手被拒、服务端断开）时显式失败，避免进程静默以 0 退出
sock.on("close", () => fail("wbipc 连接被关闭，握手可能被拒绝。请重启 WorkBuddy 后重试。"));

sock.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const i = buf.indexOf(10);
    if (i < 0) break;
    const line = buf.subarray(0, i);
    buf = buf.subarray(i + 1);
    if (!line.length) continue;
    let f;
    try {
      f = JSON.parse(line.toString("utf8"));
    } catch {
      continue;
    }
    onFrame(f);
  }
});

function onFrame(f) {
  if (f.type === "session_challenge") {
    transcript = { protocol: f.protocol, endpoint: disc.endpoint, clientNonce: myNonce, serverNonce: f.server_nonce };
    if (computeProof("server", transcript) !== f.server_proof) fail("服务端证明校验失败，票据可能过期，请重启 WorkBuddy。");
    send({ type: "session_prove", client_proof: computeProof("client", transcript) });
  } else if (f.type === "session_hello_ack") {
    run().catch((e) => fail(e.message));
  } else if (f.jsonrpc && pending.has(f.id)) {
    const p = pending.get(f.id);
    pending.delete(f.id);
    if (f.error) p.reject(new Error(`RPC ${f.error.code}: ${f.error.message}`));
    else p.resolve(f.result);
  }
}

sock.on("connect", () => {
  send({
    type: "session_hello",
    protocol_min: 1,
    protocol_max: 1,
    client_nonce: myNonce,
    ticket_id: ticketId,
    client: { kind: "cli", id: "daily-checkin", version: "1.0.0" },
  });
});

function rpc(method, params, mode) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const msg = { jsonrpc: "2.0", id, method, params };
    if (mode) msg.mode = mode;
    send(msg);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("请求超时（60s）"));
      }
    }, 60000);
  });
}

// 通过 wb.request 管道发起请求（应用自动附加登录态请求头）
async function wbFetch(httpMethod, urlPath, bodyObj) {
  const res = await rpc("broker/GetPipe", { pipe: "wb.request" });
  const channel = res.channel;
  const params = { method: httpMethod.toUpperCase(), path: urlPath };
  if (bodyObj !== undefined) {
    params.body_b64 = Buffer.from(JSON.stringify(bodyObj), "utf8").toString("base64");
    params.headers = { "content-type": "application/json" };
  }
  const r = await rpc(`${channel}/http.fetch`, params, "call");
  return {
    status: r.status,
    body: r.body_b64 ? Buffer.from(r.body_b64, "base64").toString("utf8") : "",
  };
}

const STATUS_API = "/v2/billing/meter/checkin-activity-status";
const CLAIM_API = "/v2/billing/meter/daily-checkin";

async function run() {
  try {
    // ----- 自动签到模式（默认）-----
    if (!process.argv[2]) {
      const s = await wbFetch("POST", STATUS_API);
      let st = {};
      try {
        const j = JSON.parse(s.body);
        st = (j && j.data) || {};
      } catch {}

      if (st.today_checked_in) {
        console.log(
          `今日已签到 | 连续${st.streak_days ?? "?"}天 | 今日积分${st.today_credit ?? "-"} | 总积分${st.total_credits ?? "-"}`
        );
        process.exit(0);
      }
      if (st.active === false) {
        console.log(`签到活动未开启（活动可能已结束或账号未参与）。原始响应：${s.body.slice(0, 200)}`);
        process.exit(1);
      }

      const c = await wbFetch("POST", CLAIM_API);
      if (c.status === 200) {
        console.log(`签到成功 | ${c.body.slice(0, 300)}`);
        process.exit(0);
      }
      if (c.status === 400 && c.body.includes("10001")) {
        console.log("今日已签到（接口幂等保护），无需重复领取");
        process.exit(0);
      }
      console.log(`签到返回异常 HTTP ${c.status}: ${c.body.slice(0, 300)}`);
      process.exit(1);
    }

    // ----- 手动探测模式 -----
    const reqPath = process.argv[2];
    const method = (process.argv[3] || "POST").toUpperCase();
    const bodyArg = process.argv[4] ? JSON.parse(process.argv[4]) : undefined;
    const r = await wbFetch(method, reqPath, bodyArg);
    console.log("HTTP", r.status);
    console.log(r.body || "(empty body)");
    process.exit(0);
  } catch (e) {
    fail(e.message);
  }
}
