import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

const target = new URL(process.env.SECURITY_SMOKE_URL || "http://127.0.0.1:3210");
const adminLogin = process.env.SMOKE_ADMIN_LOGIN || "";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || "";
const adminTotpSecret = process.env.SMOKE_ADMIN_TOTP_SECRET || "";
const client = target.protocol === "https:" ? https : http;

function decodeBase32(value = "") {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of String(value).replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret = "") {
  const counter = Math.floor(Date.now() / 30000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

function request({ path, method = "GET", headers = {}, body = "", userAgent = "cerber-security-smoke" }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const req = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      servername: target.protocol === "https:" ? target.hostname : undefined,
      path,
      method,
      headers: {
        "User-Agent": userAgent,
        ...(payload.length ? { "Content-Length": payload.length } : {}),
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: Number(res.statusCode || 0),
        headers: res.headers,
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    if (payload.length) req.write(payload);
    req.end();
  });
}

const jsonHeaders = { "Content-Type": "application/json" };
const health = await request({ path: "/api/health" });
const stateResponse = await request({ path: "/api/state" });
const statePayload = JSON.parse(stateResponse.text || "{}");
const state = statePayload.state || {};
const captchaResponse = await request({ path: "/api/auth/captcha" });
const captcha = JSON.parse(captchaResponse.text || "{}");
const captchaPayload = String(captcha.token || "").split(".")[0] || "";
let decodedCaptcha = {};
try {
  decodedCaptcha = JSON.parse(Buffer.from(captchaPayload, "base64url").toString("utf8"));
} catch {}
const unapprovedHost = await request({ path: "/api/health", headers: { Host: "evil.example" } });
const checks = [
  ["health endpoint", health.status === 200, `${health.status} ${JSON.parse(health.text || "{}").build || ""}`],
  ["anonymous state", stateResponse.status === 200, stateResponse.status],
  ["anonymous users hidden", Array.isArray(state.users) && state.users.length === 0, state.users?.length],
  ["anonymous orders hidden", Array.isArray(state.orders) && state.orders.length === 0, state.orders?.length],
  ["anonymous messages hidden", Array.isArray(state.messages) && state.messages.length === 0, state.messages?.length],
  ["anonymous deposits hidden", Array.isArray(state.walletDeposits) && state.walletDeposits.length === 0, state.walletDeposits?.length],
  ["captcha challenge issued", captchaResponse.status === 200 && Boolean(captcha.question && captcha.token), captchaResponse.status],
  ["captcha answer not exposed in token", !("answer" in decodedCaptcha) && Boolean(decodedCaptcha.id), Object.keys(decodedCaptcha).join(",")],
  ["server source blocked", (await request({ path: "/server.js" })).status === 404, "expected 404"],
  ["node_modules blocked", (await request({ path: "/node_modules/express/index.js" })).status === 404, "expected 404"],
  ["unapproved Host blocked", [403, 421].includes(unapprovedHost.status), unapprovedHost.status],
  ["unapproved Origin blocked", (await request({ path: "/api/auth/login", method: "POST", headers: { ...jsonHeaders, Origin: "https://evil.example" }, body: "{}" })).status === 403, "expected 403"],
  ["large anonymous body blocked", (await request({ path: "/api/auth/login", method: "POST", headers: jsonHeaders, body: Buffer.alloc(300 * 1024, 97) })).status === 413, "expected 413"],
  ["legacy owner API disabled", (await request({ path: "/api/owner/state" })).status === 410, "expected 410"],
  ["Telegram password login disabled", (await request({ path: "/api/telegram/login", method: "POST", headers: jsonHeaders, body: "{}" })).status === 410, "expected 410"]
];

if (adminLogin && adminPassword && adminTotpSecret) {
  const login = await request({
    path: "/api/admin/login",
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ login: adminLogin, password: adminPassword, totp: totpCode(adminTotpSecret) })
  });
  const token = JSON.parse(login.text || "{}").token || "";
  const sameDevice = token ? await request({ path: "/api/health/deep", headers: { Authorization: `Bearer ${token}` } }) : { status: 0 };
  const otherDevice = token ? await request({ path: "/api/health/deep", headers: { Authorization: `Bearer ${token}` }, userAgent: "different-device" }) : { status: 0 };
  checks.push(
    ["owner login with TOTP", login.status === 200 && Boolean(token), login.status],
    ["owner token accepted on bound device", sameDevice.status !== 401, sameDevice.status],
    ["owner token rejected on another device", otherDevice.status === 401, otherDevice.status]
  );
}

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail ?? ""}`);
}
if (failed) process.exitCode = 1;
