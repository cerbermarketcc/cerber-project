import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_COOKIE = "cerber_onion_client";
const CLIENT_COOKIE_CONTEXT = "cerber_onion_client\nv1\n";
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_BUFFERED_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_BUFFERED_REQUESTS = 16;
const BUFFERED_REQUEST_SLOT_THRESHOLD_BYTES = 64 * 1024;
const MAX_PENDING_REQUEST_BODIES = 128;
const BODY_INACTIVITY_TIMEOUT_MS = 10_000;
const MAX_WEBSOCKET_EARLY_BYTES = 64 * 1024;
const MAX_WEBSOCKET_BUFFERED_BYTES = 1024 * 1024;
const MAX_PENDING_WEBSOCKET_HANDSHAKES = 32;
const MAX_ACTIVE_WEBSOCKET_CONNECTIONS = 128;
const WEBSOCKET_IDLE_TIMEOUT_MS = 5 * 60_000;
const UPSTREAM_HOST = "cerber.cc";
const UPSTREAM_ORIGIN = `https://${UPSTREAM_HOST}`;
const OFFICIAL_ONION_HOSTNAME = "cerberw35yusilaylptolh7e7sziwveoyaynhmkico4o6iql3gfm4tad.onion";
const SIGNATURE_VERSION = "v1";
const SIGNATURE_HEADER_PREFIX = "x-cerber-onion-";
const READINESS_CLIENT_ID = "79d1fe67ae9d46d6ae7f07c7f05549db";
const GLOBAL_ALL_REQUEST_BUDGET = { capacity: 500, refillPerMs: 50 / 1_000 };
const GLOBAL_REQUEST_BUDGETS = new Map([
  ["GET /api/auth/captcha", { capacity: 120, refillPerMs: 4 / 1_000 }],
  ["POST /api/auth/login", { capacity: 60, refillPerMs: 1 / 1_000 }],
  ["POST /api/auth/register", { capacity: 10, refillPerMs: 1 / 30_000 }],
]);
let globalAllRequestBudgetState = null;
const globalRequestBudgetState = new Map();
const activeWebSocketSockets = new Set();
let bufferedRequestBytes = 0;
let bufferedRequests = 0;
let pendingRequestBodies = 0;
let bufferedWebSocketEarlyBytes = 0;
let pendingWebSocketHandshakes = 0;
let activeWebSocketConnections = 0;
const LOCAL_HTML_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'sha256-LwGlgkSkxEiHHxfPSdxkT4YhGBqvP2mu6Q2ULIIysjU=' 'sha256-dgb9fRbDMIdSjxNtXCwryvoPWgvOqkeB5EoQvv3bhhw=' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://cerber.to https://www.cerber.to https://cerber.love https://www.cerber.love https://cerber.vip https://www.cerber.vip https://cerber.cc https://www.cerber.cc https://uizkvahyzdqzcfhzjkxm.supabase.co",
  "media-src 'self' data: blob: https://cerber.to https://www.cerber.to https://cerber.love https://www.cerber.love https://cerber.vip https://www.cerber.vip https://cerber.cc https://www.cerber.cc https://uizkvahyzdqzcfhzjkxm.supabase.co",
  "connect-src 'self' https://cerber.to https://www.cerber.to https://cerber.love https://www.cerber.love https://cerber.vip https://www.cerber.vip https://cerber.cc https://www.cerber.cc https://api.coingecko.com https://challenges.cloudflare.com wss://cerber.to wss://www.cerber.to wss://cerber.love wss://www.cerber.love wss://cerber.vip wss://www.cerber.vip wss://cerber.cc wss://www.cerber.cc",
  "frame-src https://challenges.cloudflare.com",
  "form-action 'self' https://nowpayments.io https://*.nowpayments.io",
].join("; ");

const BASE_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const ALWAYS_STRIPPED_REQUEST_HEADERS = new Set([
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "forwarded",
  "host",
  "origin",
  "referer",
  "true-client-ip",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  "alt-svc",
  "cf-cache-status",
  "cf-ray",
  "nel",
  "proxy-authenticate",
  "report-to",
  "server",
  "server-timing",
  "via",
  "x-powered-by",
]);

const LOCAL_HTML = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/market-admin.html", "market-admin.html"],
  ["/text-admin.html", "text-admin.html"],
  ["/telegram-chat.html", "telegram-chat.html"],
  ["/hr-template.html", "hr-template.html"],
]);

function fail(message) {
  process.stderr.write(`onion gateway startup failed: ${message}\n`);
  process.exit(1);
}

function base32Lower(buffer) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let accumulator = 0;
  let bits = 0;
  let output = "";
  for (const byte of buffer) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(accumulator >>> bits) & 31];
      accumulator &= (1 << bits) - 1;
    }
  }
  if (bits > 0) {
    output += alphabet[(accumulator << (5 - bits)) & 31];
  }
  return output;
}

function validateIdentity(directory, expectedHostname) {
  if (!/^cerber[a-z2-7]{50}\.onion$/.test(expectedHostname)) {
    throw new Error("unexpected hostname format");
  }

  const hostnamePath = path.join(directory, "hostname");
  const publicPath = path.join(directory, "hs_ed25519_public_key");
  const secretPath = path.join(directory, "hs_ed25519_secret_key");
  const hostnameBytes = fs.readFileSync(hostnamePath);
  const publicBytes = fs.readFileSync(publicPath);
  const secretBytes = fs.readFileSync(secretPath);
  const hostname = hostnameBytes.toString("utf8").replace(/[\r\n]+$/u, "");

  if (hostname !== expectedHostname || !/^[a-z2-7]{56}\.onion$/.test(hostname)) {
    throw new Error("hostname does not match ONION_HOSTNAME");
  }
  if (!/^\S+(?:\r?\n)?$/u.test(hostnameBytes.toString("utf8"))) {
    throw new Error("hostname file contains unexpected data");
  }
  if (publicBytes.length !== 64 || secretBytes.length !== 96) {
    throw new Error("Tor key files have invalid sizes");
  }

  const publicMagic = Buffer.from("== ed25519v1-public: type0 ==\0\0\0", "binary");
  const secretMagic = Buffer.from("== ed25519v1-secret: type0 ==\0\0\0", "binary");
  if (!publicBytes.subarray(0, 32).equals(publicMagic)) {
    throw new Error("Tor public key header is invalid");
  }
  if (!secretBytes.subarray(0, 32).equals(secretMagic)) {
    throw new Error("Tor secret key header is invalid");
  }

  const rawPublicKey = publicBytes.subarray(32);
  const version = Buffer.from([3]);
  const checksum = crypto
    .createHash("sha3-256")
    .update(Buffer.from(".onion checksum", "ascii"))
    .update(rawPublicKey)
    .update(version)
    .digest()
    .subarray(0, 2);
  const derivedHostname = `${base32Lower(Buffer.concat([rawPublicKey, checksum, version]))}.onion`;
  if (derivedHostname !== expectedHostname) {
    throw new Error("Tor public key does not derive the expected hostname");
  }
}

if (process.argv[2] === "--validate-identity") {
  try {
    validateIdentity(process.argv[3] || "", process.argv[4] || "");
  } catch (error) {
    process.stderr.write(`identity validation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exit(1);
  }
  process.exit(0);
}

const onionHostname = String(process.env.ONION_HOSTNAME || "").toLowerCase();
if (onionHostname !== OFFICIAL_ONION_HOSTNAME) {
  fail("ONION_HOSTNAME must match the official Cerber v3 onion hostname");
}

function parsePort(value, fallback, label) {
  const raw = value || String(fallback);
  if (!/^\d{1,5}$/.test(raw)) {
    fail(`${label} is invalid`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    fail(`${label} is out of range`);
  }
  return parsed;
}

const publicPort = parsePort(process.env.PORT, 10000, "PORT");
const onionPort = parsePort(process.env.ONION_LISTEN_PORT, 8080, "ONION_LISTEN_PORT");
const onionListenHost = process.env.ONION_LISTEN_HOST || "127.0.0.1";
if (onionListenHost !== "127.0.0.1") {
  fail("ONION_LISTEN_HOST must be 127.0.0.1");
}

const signingKeyPath = process.env.ONION_GATEWAY_PRIVATE_KEY || "/run/cerber-onion/gateway-private.pem";
const torReadyFile = process.env.TOR_READY_FILE || "/run/cerber-onion/tor-ready";
let signingPrivateKey;
let signingPublicKey;
try {
  signingPrivateKey = crypto.createPrivateKey(fs.readFileSync(signingKeyPath));
  if (signingPrivateKey.type !== "private" || signingPrivateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("key must be an Ed25519 private key");
  }
  signingPublicKey = crypto.createPublicKey(signingPrivateKey);
} catch (error) {
  fail(error instanceof Error ? `could not load gateway signing key: ${error.message}` : "could not load gateway signing key");
}

const localHtmlBuffers = new Map();
for (const fileName of new Set(LOCAL_HTML.values())) {
  try {
    localHtmlBuffers.set(fileName, fs.readFileSync(path.join(MODULE_DIR, "html", fileName)));
  } catch {
    fail(`missing local HTML snapshot: ${fileName}`);
  }
}

const upstreamAgent = new https.Agent({
  keepAlive: true,
  maxFreeSockets: 16,
  maxSockets: 128,
  scheduling: "lifo",
});

function sendPlain(response, statusCode, message, extraHeaders = undefined) {
  const body = Buffer.from(`${message}\n`, "utf8");
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": String(body.length),
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...(extraHeaders || {}),
  });
  response.end(body);
}

function hostHeaderIsExact(request) {
  let hostCount = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === "host") {
      hostCount += 1;
    }
  }
  if (hostCount !== 1) {
    return false;
  }
  const host = String(request.headers.host || "").toLowerCase();
  return host === onionHostname || host === `${onionHostname}:80`;
}

function onionOriginIsAllowed(request) {
  const origin = request.headers.origin;
  if (origin === undefined) {
    return true;
  }
  if (typeof origin !== "string") {
    return false;
  }
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:"
      && parsed.hostname.toLowerCase() === onionHostname
      && (!parsed.port || parsed.port === "80")
      && !parsed.username
      && !parsed.password
      && parsed.pathname === "/"
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

function validOriginalUrl(rawUrl) {
  return typeof rawUrl === "string"
    && rawUrl.startsWith("/")
    && !rawUrl.startsWith("//")
    && rawUrl.length <= 8_192
    && !/[\x00-\x20\x7f-\xff]/u.test(rawUrl);
}

function cookieValue(cookieHeader, name) {
  if (typeof cookieHeader !== "string") {
    return "";
  }
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 1) {
      continue;
    }
    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return "";
}

function clientSignature(clientId) {
  return crypto
    .sign(null, Buffer.from(`${CLIENT_COOKIE_CONTEXT}${clientId}`, "utf8"), signingPrivateKey)
    .toString("base64url");
}

function verifiedClientId(cookieHeader) {
  const value = cookieValue(cookieHeader, CLIENT_COOKIE);
  const separator = value.indexOf(".");
  if (separator < 1 || value.indexOf(".", separator + 1) !== -1) {
    return "";
  }
  const clientId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^[a-f0-9]{32}$/.test(clientId) || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
    return "";
  }
  try {
    const valid = crypto.verify(
      null,
      Buffer.from(`${CLIENT_COOKIE_CONTEXT}${clientId}`, "utf8"),
      signingPublicKey,
      Buffer.from(signature, "base64url"),
    );
    return valid ? clientId : "";
  } catch {
    return "";
  }
}

function clientContext(request) {
  const existing = verifiedClientId(request.headers.cookie);
  if (existing) {
    return { clientId: existing, setCookie: "" };
  }
  const clientId = crypto.randomBytes(16).toString("hex");
  const signature = clientSignature(clientId);
  return {
    clientId,
    setCookie: `${CLIENT_COOKIE}=${clientId}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`,
  };
}

function removeGatewayCookie(cookieHeader) {
  if (typeof cookieHeader !== "string") {
    return "";
  }
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && part.slice(0, part.indexOf("=")).trim() !== CLIENT_COOKIE)
    .join("; ");
}

function connectionTokens(headers) {
  const tokens = new Set(BASE_HOP_BY_HOP_HEADERS);
  const value = headers.connection;
  if (typeof value === "string") {
    for (const token of value.split(",")) {
      const normalized = token.trim().toLowerCase();
      if (normalized) {
        tokens.add(normalized);
      }
    }
  }
  return tokens;
}

function requestSignatureHeaders(method, rawUrl, clientId) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString("hex");
  const normalizedMethod = method.toUpperCase();
  const payload = `${SIGNATURE_VERSION}\n${timestamp}\n${nonce}\n${clientId}\n${normalizedMethod}\n${rawUrl}\n${onionHostname}`;
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), signingPrivateKey).toString("base64url");
  return {
    [`${SIGNATURE_HEADER_PREFIX}client`]: clientId,
    [`${SIGNATURE_HEADER_PREFIX}host`]: onionHostname,
    [`${SIGNATURE_HEADER_PREFIX}method`]: normalizedMethod,
    [`${SIGNATURE_HEADER_PREFIX}nonce`]: nonce,
    [`${SIGNATURE_HEADER_PREFIX}signature`]: signature,
    [`${SIGNATURE_HEADER_PREFIX}timestamp`]: timestamp,
    [`${SIGNATURE_HEADER_PREFIX}url`]: rawUrl,
    [`${SIGNATURE_HEADER_PREFIX}version`]: SIGNATURE_VERSION,
  };
}

let backendVerifiedAt = 0;
let backendVerificationProbe = null;

function probeBackendVerification() {
  if (backendVerificationProbe) {
    return backendVerificationProbe;
  }
  backendVerificationProbe = new Promise((resolve) => {
    const probe = https.request({
      agent: upstreamAgent,
      headers: {
        accept: "application/json",
        ...requestSignatureHeaders("GET", "/api/health", READINESS_CLIENT_ID),
      },
      hostname: UPSTREAM_HOST,
      method: "GET",
      path: "/api/health",
      port: 443,
      protocol: "https:",
      rejectUnauthorized: true,
      servername: UPSTREAM_HOST,
    }, (response) => {
      const verified = response.statusCode === 200
        && String(response.headers["x-cerber-onion-verified"] || "") === "1";
      response.resume();
      response.once("end", () => {
        if (verified) {
          backendVerifiedAt = Date.now();
        }
        resolve(verified);
      });
      response.once("error", () => resolve(false));
    });
    probe.setTimeout(10_000, () => probe.destroy(new Error("backend verification timeout")));
    probe.once("error", () => resolve(false));
    probe.end();
  }).finally(() => {
    backendVerificationProbe = null;
  });
  return backendVerificationProbe;
}

function gatewayIsReady(now = Date.now()) {
  return fs.existsSync(torReadyFile)
    && backendVerifiedAt > 0
    && now - backendVerifiedAt <= 45_000;
}

function consumeTokenBucket(policy, previous, now) {
  const current = previous || { tokens: policy.capacity, updatedAt: now };
  const elapsedMs = Math.max(0, now - current.updatedAt);
  const record = {
    tokens: Math.min(policy.capacity, current.tokens + elapsedMs * policy.refillPerMs),
    updatedAt: Math.max(current.updatedAt, now),
  };
  if (record.tokens >= 1) {
    record.tokens -= 1;
    return { record, retryAfter: 0 };
  }
  return {
    record,
    retryAfter: Math.max(1, Math.ceil((1 - record.tokens) / policy.refillPerMs / 1_000)),
  };
}

function globalRequestBudgetRetryAfter(method, pathname, now = Date.now()) {
  const globalResult = consumeTokenBucket(GLOBAL_ALL_REQUEST_BUDGET, globalAllRequestBudgetState, now);
  globalAllRequestBudgetState = globalResult.record;
  if (globalResult.retryAfter > 0) {
    return globalResult.retryAfter;
  }

  const normalizedPathname = (pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname).toLowerCase();
  const key = `${String(method || "GET").toUpperCase()} ${normalizedPathname}`;
  const policy = GLOBAL_REQUEST_BUDGETS.get(key);
  if (!policy) {
    return 0;
  }
  const result = consumeTokenBucket(policy, globalRequestBudgetState.get(key), now);
  globalRequestBudgetState.set(key, result.record);
  return result.retryAfter;
}

function upstreamRequestHeaders(request, rawUrl, clientId, bodyLength, websocket = false) {
  const hopHeaders = connectionTokens(request.headers);
  const output = {};
  for (const [name, value] of Object.entries(request.headers)) {
    const normalized = name.toLowerCase();
    if (value === undefined
      || hopHeaders.has(normalized)
      || ALWAYS_STRIPPED_REQUEST_HEADERS.has(normalized)
      || normalized.startsWith(SIGNATURE_HEADER_PREFIX)
      || normalized === "content-length") {
      continue;
    }
    if (normalized === "cookie") {
      const filteredCookie = removeGatewayCookie(value);
      if (filteredCookie) {
        output.cookie = filteredCookie;
      }
      continue;
    }
    output[normalized] = value;
  }

  output.host = UPSTREAM_HOST;
  if (typeof request.headers.origin === "string") {
    output.origin = UPSTREAM_ORIGIN;
  }
  if (typeof request.headers.referer === "string") {
    try {
      const referer = new URL(request.headers.referer);
      if (referer.hostname.toLowerCase() === onionHostname) {
        output.referer = `${UPSTREAM_ORIGIN}${referer.pathname}${referer.search}${referer.hash}`;
      }
    } catch {
      // Invalid or unrelated referrers are deliberately omitted.
    }
  }
  if (!websocket && bodyLength > 0) {
    output["content-length"] = String(bodyLength);
  }
  Object.assign(output, requestSignatureHeaders(request.method || "GET", rawUrl, clientId));
  if (websocket) {
    output.connection = "Upgrade";
    output.upgrade = "websocket";
  }
  return output;
}

function rewriteUpstreamUrl(value) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const parsed = new URL(value, UPSTREAM_ORIGIN);
    if (parsed.hostname.toLowerCase() !== UPSTREAM_HOST) {
      return value;
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return value;
    }
    return `http://${onionHostname}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
}

function rewriteSetCookie(value) {
  if (typeof value !== "string" || /^\s*cerber_onion_client=/i.test(value)) {
    return "";
  }
  return value.replace(/;\s*Domain=[^;]*/giu, "");
}

function responseHeaders(upstreamResponse, context, websocket = false) {
  const hopHeaders = connectionTokens(upstreamResponse.headers);
  const output = {};
  for (const [name, value] of Object.entries(upstreamResponse.headers)) {
    const normalized = name.toLowerCase();
    if (value === undefined || STRIPPED_RESPONSE_HEADERS.has(normalized)) {
      continue;
    }
    if (hopHeaders.has(normalized) && !(websocket && (normalized === "connection" || normalized === "upgrade"))) {
      continue;
    }
    if (normalized === "set-cookie") {
      const values = Array.isArray(value) ? value : [value];
      const rewritten = values.map(rewriteSetCookie).filter(Boolean);
      if (context.setCookie) {
        rewritten.push(context.setCookie);
      }
      if (rewritten.length > 0) {
        output[normalized] = rewritten;
      }
      continue;
    }
    if (normalized === "location" || normalized === "content-location") {
      output[normalized] = rewriteUpstreamUrl(Array.isArray(value) ? value[0] : value);
      continue;
    }
    output[normalized] = value;
  }
  if (!Object.hasOwn(output, "set-cookie") && context.setCookie) {
    output["set-cookie"] = [context.setCookie];
  }
  if (websocket) {
    output.connection = "Upgrade";
    output.upgrade = "websocket";
  }
  return output;
}

function appendClientCookie(headers, context) {
  if (!context.setCookie) {
    return headers;
  }
  return { ...headers, "set-cookie": [context.setCookie] };
}

function drainRejectedRequest(request) {
  request.once("error", () => {});
  request.resume();
}

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    const declaredLength = request.headers["content-length"];
    let parsedLength = null;
    if (declaredLength !== undefined) {
      parsedLength = Number(declaredLength);
      if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_REQUEST_BYTES) {
        const error = new Error("request body is too large");
        error.code = "BODY_TOO_LARGE";
        reject(error);
        drainRejectedRequest(request);
        return;
      }
    }

    if ((parsedLength === 0 || parsedLength === null) && request.headers["transfer-encoding"] === undefined) {
      resolve({ body: Buffer.alloc(0), release() {} });
      return;
    }
    if (pendingRequestBodies >= MAX_PENDING_REQUEST_BODIES) {
      const error = new Error("request body capacity is busy");
      error.code = "BODY_CAPACITY";
      reject(error);
      drainRejectedRequest(request);
      return;
    }

    const chunks = [];
    let total = 0;
    let settled = false;
    let bufferSlotAcquired = false;
    let bufferedReleased = false;
    let pendingReleased = false;
    let inactivityTimer = null;
    pendingRequestBodies += 1;
    const releasePending = () => {
      if (pendingReleased) return;
      pendingReleased = true;
      pendingRequestBodies = Math.max(0, pendingRequestBodies - 1);
      clearTimeout(inactivityTimer);
    };
    const releaseBuffered = () => {
      if (bufferedReleased) return;
      bufferedReleased = true;
      if (bufferSlotAcquired) bufferedRequests = Math.max(0, bufferedRequests - 1);
      bufferedRequestBytes = Math.max(0, bufferedRequestBytes - total);
    };
    const cleanup = () => {
      clearTimeout(inactivityTimer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.off("error", onError);
      chunks.length = 0;
    };
    const fail = (error, drain = false) => {
      if (settled) return;
      settled = true;
      releasePending();
      releaseBuffered();
      cleanup();
      reject(error);
      if (drain) drainRejectedRequest(request);
    };
    const armInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        const error = new Error("request body timed out");
        error.code = "BODY_TIMEOUT";
        fail(error, true);
      }, BODY_INACTIVITY_TIMEOUT_MS);
      inactivityTimer.unref();
    };
    function onData(chunk) {
      if (settled) {
        return;
      }
      armInactivityTimer();
      if (total + chunk.length > MAX_REQUEST_BYTES) {
        const error = new Error("request body is too large");
        error.code = "BODY_TOO_LARGE";
        fail(error, true);
        return;
      }
      if (!bufferSlotAcquired && total + chunk.length > BUFFERED_REQUEST_SLOT_THRESHOLD_BYTES) {
        if (bufferedRequests >= MAX_BUFFERED_REQUESTS) {
          const error = new Error("request body capacity is busy");
          error.code = "BODY_CAPACITY";
          fail(error, true);
          return;
        }
        bufferSlotAcquired = true;
        bufferedRequests += 1;
      }
      if (bufferedRequestBytes + chunk.length > MAX_BUFFERED_REQUEST_BYTES) {
        const error = new Error("request body capacity is busy");
        error.code = "BODY_CAPACITY";
        fail(error, true);
        return;
      }
      total += chunk.length;
      bufferedRequestBytes += chunk.length;
      chunks.push(chunk);
    }
    function onEnd() {
      if (!settled) {
        settled = true;
        releasePending();
        const body = Buffer.concat(chunks, total);
        cleanup();
        resolve({ body, release: releaseBuffered });
      }
    }
    function onAborted() {
      fail(new Error("request aborted"));
    }
    function onError(error) {
      fail(error);
    }
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("aborted", onAborted);
    request.on("error", onError);
    armInactivityTimer();
  });
}

function serveLocalHtml(request, response, fileName, context) {
  const body = localHtmlBuffers.get(fileName);
  const headers = appendClientCookie({
    "cache-control": "no-store, max-age=0",
    "content-length": String(body.length),
    "content-security-policy": LOCAL_HTML_CSP,
    "content-type": "text/html; charset=utf-8",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "origin-agent-cluster": "?1",
    "permissions-policy": "camera=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-permitted-cross-domain-policies": "none",
  }, context);
  response.writeHead(200, headers);
  response.end(request.method === "HEAD" ? undefined : body);
}

function proxyHttp(request, response, rawUrl, context, body, releaseBody) {
  const options = {
    agent: upstreamAgent,
    headers: upstreamRequestHeaders(request, rawUrl, context.clientId, body.length),
    hostname: UPSTREAM_HOST,
    method: request.method,
    path: rawUrl,
    port: 443,
    protocol: "https:",
    rejectUnauthorized: true,
    servername: UPSTREAM_HOST,
  };

  let upstreamRequest;
  try {
    upstreamRequest = https.request(options, (upstreamResponse) => {
      upstreamResponse.setTimeout(30_000, () => upstreamResponse.destroy(new Error("upstream response timeout")));
      const headers = responseHeaders(upstreamResponse, context);
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.statusMessage, headers);
      upstreamResponse.pipe(response);
      upstreamResponse.on("aborted", () => response.destroy());
      upstreamResponse.on("error", () => response.destroy());
    });
  } catch {
    releaseBody();
    sendPlain(response, 502, "Bad Gateway", appendClientCookie({}, context));
    return;
  }

  upstreamRequest.once("finish", releaseBody);
  upstreamRequest.setTimeout(20_000, () => upstreamRequest.destroy(new Error("upstream request timeout")));
  upstreamRequest.on("error", () => {
    releaseBody();
    if (!response.headersSent) {
      sendPlain(response, 502, "Bad Gateway", appendClientCookie({}, context));
    } else {
      response.destroy();
    }
  });
  if (body.length > 0) {
    upstreamRequest.write(body);
  }
  upstreamRequest.end();
  response.once("close", () => {
    if (!response.writableEnded) upstreamRequest.destroy(new Error("onion client disconnected"));
  });
}

async function handleOnionRequest(request, response) {
  if (!hostHeaderIsExact(request)) {
    sendPlain(response, 421, "Misdirected Request");
    return;
  }
  const rawUrl = request.url || "";
  if (!validOriginalUrl(rawUrl)) {
    sendPlain(response, 400, "Bad Request");
    return;
  }
  if (!onionOriginIsAllowed(request)) {
    sendPlain(response, 403, "Forbidden");
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl, `http://${onionHostname}`);
  } catch {
    sendPlain(response, 400, "Bad Request");
    return;
  }

  const retryAfter = globalRequestBudgetRetryAfter(request.method, parsedUrl.pathname);
  if (retryAfter > 0) {
    sendPlain(response, 429, "Too Many Requests", { "retry-after": String(retryAfter) });
    return;
  }

  const context = clientContext(request);

  const localFile = LOCAL_HTML.get(parsedUrl.pathname);
  if (localFile && (request.method === "GET" || request.method === "HEAD")) {
    serveLocalHtml(request, response, localFile, context);
    return;
  }

  try {
    const collected = await collectRequestBody(request);
    proxyHttp(request, response, rawUrl, context, collected.body, collected.release);
  } catch (error) {
    if (error && error.code === "BODY_TOO_LARGE") {
      sendPlain(response, 413, "Payload Too Large", appendClientCookie({ connection: "close" }, context));
      return;
    }
    if (error && error.code === "BODY_CAPACITY") {
      sendPlain(response, 503, "Service Unavailable", appendClientCookie({ connection: "close", "retry-after": "2" }, context));
      return;
    }
    if (error && error.code === "BODY_TIMEOUT") {
      sendPlain(response, 408, "Request Timeout", appendClientCookie({ connection: "close" }, context));
      return;
    }
    if (!response.headersSent) {
      sendPlain(response, 400, "Bad Request", appendClientCookie({}, context));
    }
  }
}

function writeSocketResponse(socket, statusCode, message) {
  if (!socket.destroyed) {
    const body = `${message}\n`;
    socket.end(
      `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  }
}

function writeUpgradeHead(socket, upstreamResponse, headers) {
  const statusCode = upstreamResponse.statusCode || 502;
  const statusMessage = upstreamResponse.statusMessage || "Bad Gateway";
  const lines = [`HTTP/1.1 ${statusCode} ${statusMessage}`];
  for (const [name, value] of Object.entries(headers)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      lines.push(`${name}: ${item}`);
    }
  }
  socket.write(`${lines.join("\r\n")}\r\n\r\n`);
}

function trackWebSocketSocket(socket) {
  activeWebSocketSockets.add(socket);
  socket.once("close", () => activeWebSocketSockets.delete(socket));
}

function handleWebSocketUpgrade(request, clientSocket, clientHead) {
  if (!hostHeaderIsExact(request)) {
    writeSocketResponse(clientSocket, 421, "Misdirected Request");
    return;
  }
  const rawUrl = request.url || "";
  if (!validOriginalUrl(rawUrl)
    || String(request.headers.upgrade || "").toLowerCase() !== "websocket"
    || !request.headers["sec-websocket-key"]
    || request.method !== "GET") {
    writeSocketResponse(clientSocket, 400, "Bad Request");
    return;
  }
  if (!onionOriginIsAllowed(request)) {
    writeSocketResponse(clientSocket, 403, "Forbidden");
    return;
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl, `http://${onionHostname}`);
  } catch {
    writeSocketResponse(clientSocket, 400, "Bad Request");
    return;
  }
  if (globalRequestBudgetRetryAfter(request.method, parsedUrl.pathname) > 0) {
    writeSocketResponse(clientSocket, 429, "Too Many Requests");
    return;
  }
  if (clientHead.length > MAX_WEBSOCKET_EARLY_BYTES) {
    writeSocketResponse(clientSocket, 413, "Payload Too Large");
    return;
  }
  if (pendingWebSocketHandshakes >= MAX_PENDING_WEBSOCKET_HANDSHAKES
    || activeWebSocketConnections >= MAX_ACTIVE_WEBSOCKET_CONNECTIONS
    || bufferedWebSocketEarlyBytes + clientHead.length > MAX_WEBSOCKET_BUFFERED_BYTES) {
    writeSocketResponse(clientSocket, 503, "Service Unavailable");
    return;
  }

  const context = clientContext(request);
  const earlyClientChunks = clientHead.length > 0 ? [clientHead] : [];
  let earlyClientBytes = clientHead.length;
  let bufferingEarlyClientData = true;
  let handshakeReleased = false;
  let connectionReleased = false;
  let suppressUpstreamErrorResponse = false;
  let handshakeTimer = null;
  let upstreamRequest = null;
  let upstreamResponseRef = null;
  let upstreamSocketRef = null;
  pendingWebSocketHandshakes += 1;
  activeWebSocketConnections += 1;
  bufferedWebSocketEarlyBytes += clientHead.length;
  const stopBufferingEarlyClientData = () => {
    if (!bufferingEarlyClientData) return;
    bufferingEarlyClientData = false;
    clientSocket.pause();
    clientSocket.off("data", bufferEarlyClientData);
  };
  const discardEarlyClientData = () => {
    bufferedWebSocketEarlyBytes = Math.max(0, bufferedWebSocketEarlyBytes - earlyClientBytes);
    earlyClientChunks.length = 0;
    earlyClientBytes = 0;
  };
  const releaseHandshake = () => {
    if (handshakeReleased) return;
    handshakeReleased = true;
    pendingWebSocketHandshakes = Math.max(0, pendingWebSocketHandshakes - 1);
  };
  const releaseConnection = () => {
    if (connectionReleased) return;
    connectionReleased = true;
    activeWebSocketConnections = Math.max(0, activeWebSocketConnections - 1);
  };
  const closeUpstream = () => {
    suppressUpstreamErrorResponse = true;
    clearTimeout(handshakeTimer);
    stopBufferingEarlyClientData();
    discardEarlyClientData();
    releaseHandshake();
    releaseConnection();
    if (upstreamSocketRef) {
      if (!upstreamSocketRef.destroyed) upstreamSocketRef.destroy();
    } else if (upstreamResponseRef) {
      upstreamResponseRef.destroy();
    } else if (upstreamRequest && !upstreamRequest.destroyed) {
      const pendingSocket = upstreamRequest.socket;
      upstreamRequest.destroy();
      if (pendingSocket && !pendingSocket.destroyed) pendingSocket.destroy();
    }
  };
  function bufferEarlyClientData(chunk) {
    if (!bufferingEarlyClientData) return;
    if (earlyClientBytes + chunk.length > MAX_WEBSOCKET_EARLY_BYTES) {
      closeUpstream();
      writeSocketResponse(clientSocket, 413, "Payload Too Large");
      return;
    }
    if (bufferedWebSocketEarlyBytes + chunk.length > MAX_WEBSOCKET_BUFFERED_BYTES) {
      closeUpstream();
      writeSocketResponse(clientSocket, 503, "Service Unavailable");
      return;
    }
    earlyClientBytes += chunk.length;
    bufferedWebSocketEarlyBytes += chunk.length;
    earlyClientChunks.push(chunk);
  }

  try {
    upstreamRequest = https.request({
      agent: false,
      headers: upstreamRequestHeaders(request, rawUrl, context.clientId, 0, true),
      hostname: UPSTREAM_HOST,
      method: "GET",
      path: rawUrl,
      port: 443,
      protocol: "https:",
      rejectUnauthorized: true,
      servername: UPSTREAM_HOST,
    });
  } catch {
    stopBufferingEarlyClientData();
    discardEarlyClientData();
    releaseHandshake();
    releaseConnection();
    writeSocketResponse(clientSocket, 502, "Bad Gateway");
    return;
  }

  handshakeTimer = setTimeout(() => upstreamRequest.destroy(new Error("upstream websocket timeout")), 20_000);
  handshakeTimer.unref();

  trackWebSocketSocket(clientSocket);
  clientSocket.once("end", closeUpstream);
  clientSocket.once("close", closeUpstream);
  clientSocket.once("error", closeUpstream);
  clientSocket.on("data", bufferEarlyClientData);
  clientSocket.resume();
  if (clientSocket.destroyed) {
    closeUpstream();
    return;
  }

  upstreamRequest.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    clearTimeout(handshakeTimer);
    stopBufferingEarlyClientData();
    upstreamSocketRef = upstreamSocket;
    trackWebSocketSocket(upstreamSocket);
    releaseHandshake();
    if (clientSocket.destroyed) {
      discardEarlyClientData();
      releaseConnection();
      upstreamSocket.destroy();
      return;
    }
    const headers = responseHeaders(upstreamResponse, context, true);
    writeUpgradeHead(clientSocket, upstreamResponse, headers);
    if (upstreamHead.length > 0) {
      clientSocket.write(upstreamHead);
    }
    for (const chunk of earlyClientChunks) {
      upstreamSocket.write(chunk);
    }
    discardEarlyClientData();
    clientSocket.setTimeout(WEBSOCKET_IDLE_TIMEOUT_MS, () => clientSocket.destroy());
    upstreamSocket.setTimeout(WEBSOCKET_IDLE_TIMEOUT_MS, () => upstreamSocket.destroy());
    upstreamSocket.once("error", () => clientSocket.destroy());
    upstreamSocket.once("close", () => {
      if (!clientSocket.destroyed) clientSocket.destroy();
    });
    clientSocket.once("close", () => {
      if (!upstreamSocket.destroyed) upstreamSocket.destroy();
    });
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstreamRequest.on("response", (upstreamResponse) => {
    clearTimeout(handshakeTimer);
    stopBufferingEarlyClientData();
    discardEarlyClientData();
    releaseHandshake();
    upstreamResponseRef = upstreamResponse;
    if (clientSocket.destroyed) {
      releaseConnection();
      upstreamResponse.destroy();
      return;
    }
    const headers = responseHeaders(upstreamResponse, context);
    writeUpgradeHead(clientSocket, upstreamResponse, { ...headers, connection: "close" });
    upstreamResponse.pipe(clientSocket);
    upstreamResponse.on("end", () => clientSocket.end());
    upstreamResponse.on("error", () => clientSocket.destroy());
    clientSocket.once("close", () => upstreamResponse.destroy());
  });

  upstreamRequest.on("error", () => {
    clearTimeout(handshakeTimer);
    stopBufferingEarlyClientData();
    discardEarlyClientData();
    releaseHandshake();
    releaseConnection();
    if (!suppressUpstreamErrorResponse) writeSocketResponse(clientSocket, 502, "Bad Gateway");
  });
  upstreamRequest.end();
}

const publicServer = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    const ready = gatewayIsReady();
    const body = Buffer.from(ready ? '{"ok":true}\n' : '{"ok":false}\n', "utf8");
    response.writeHead(ready ? 200 : 503, {
      "cache-control": "no-store",
      "content-length": String(body.length),
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
    return;
  }
  sendPlain(response, 404, "Not Found");
});

const onionServer = http.createServer((request, response) => {
  void handleOnionRequest(request, response).catch(() => {
    if (!response.headersSent) {
      sendPlain(response, 500, "Internal Server Error");
    } else {
      response.destroy();
    }
  });
});
onionServer.on("upgrade", handleWebSocketUpgrade);

for (const server of [publicServer, onionServer]) {
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
}

let stopping = false;
function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  clearInterval(backendVerificationTimer);
  publicServer.close();
  onionServer.close();
  for (const socket of activeWebSocketSockets) {
    socket.destroy();
  }
  activeWebSocketSockets.clear();
  upstreamAgent.destroy();
  const forcedExit = setTimeout(() => process.exit(1), 10_000);
  forcedExit.unref();
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);

let listenersReady = 0;
function listenerReady() {
  listenersReady += 1;
  if (listenersReady === 2) {
    process.stdout.write("onion gateway listeners ready\n");
  }
}

publicServer.listen(publicPort, "0.0.0.0", listenerReady);
onionServer.listen(onionPort, onionListenHost, listenerReady);

void probeBackendVerification();
const backendVerificationTimer = setInterval(() => {
  void probeBackendVerification();
}, 15_000);
backendVerificationTimer.unref();

for (const server of [publicServer, onionServer]) {
  server.on("error", (error) => {
    process.stderr.write(`onion gateway listener failed: ${error.code || "unknown"}\n`);
    process.exit(1);
  });
}
