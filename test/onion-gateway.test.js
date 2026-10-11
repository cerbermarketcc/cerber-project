import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ONION_HOST = "cerberw35yusilaylptolh7e7sziwveoyaynhmkico4o6iql3gfm4tad.onion";
const GATEWAY_PATH = fileURLToPath(new URL("../onion-gateway/gateway.mjs", import.meta.url));
const INDEX_PATH = fileURLToPath(new URL("../onion-gateway/html/index.html", import.meta.url));

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function unusedPorts(count) {
  const reservations = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const reservation = http.createServer();
      await listen(reservation);
      reservations.push(reservation);
    }
    return reservations.map((reservation) => reservation.address().port);
  } finally {
    await Promise.all(reservations.map(close));
  }
}

function request({ port, path: requestPath = "/", method = "GET", headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      agent: false,
      headers,
      hostname: "127.0.0.1",
      method,
      path: requestPath,
      port,
    }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve({
        body: Buffer.concat(chunks),
        headers: incoming.headers,
        statusCode: incoming.statusCode,
      }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
      timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

function websocketRequest(pathname, key) {
  return [
    `GET ${pathname} HTTP/1.1`,
    `Host: ${ONION_HOST}`,
    `Origin: http://${ONION_HOST}`,
    "Connection: Upgrade",
    "Upgrade: websocket",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n");
}

function waitForGateway(child, output) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`gateway startup timed out: ${output.stderr}`)), 10_000);
    const finish = (error) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      error ? reject(error) : resolve();
    };
    const onExit = (code, signal) => {
      finish(new Error(`gateway exited before readiness (${code ?? signal}): ${output.stderr}`));
    };
    child.once("exit", onExit);
    child.stdout.on("data", (chunk) => {
      output.stdout += chunk;
      if (output.stdout.includes("onion gateway listeners ready\n")) {
        finish();
      }
    });
    child.stderr.on("data", (chunk) => {
      output.stderr += chunk;
    });
  });
}

async function waitForHealthyGateway(port) {
  const deadline = Date.now() + 5_000;
  let latest;
  while (Date.now() < deadline) {
    latest = await request({ port, path: "/healthz" });
    if (latest.statusCode === 200) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`gateway did not become healthy (last status ${latest?.statusCode || "none"})`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("gateway did not stop")), 5_000);
    timeout.unref();
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function decodeBase32(value) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let accumulator = 0;
  let bits = 0;
  const output = [];
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    assert.notEqual(digit, -1);
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 0xff);
      accumulator &= (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

test("gateway identity validation accepts the public onion identity layout and rejects mismatches", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cerber-onion-identity-test-"));
  t.after(() => rm(directory, { force: true, recursive: true }));

  const decodedAddress = decodeBase32(ONION_HOST.slice(0, -".onion".length));
  assert.equal(decodedAddress.length, 35);
  const publicHeader = Buffer.from("== ed25519v1-public: type0 ==\0\0\0", "binary");
  const secretHeader = Buffer.from("== ed25519v1-secret: type0 ==\0\0\0", "binary");
  await Promise.all([
    writeFile(path.join(directory, "hostname"), `${ONION_HOST}\n`),
    writeFile(path.join(directory, "hs_ed25519_public_key"), Buffer.concat([publicHeader, decodedAddress.subarray(0, 32)])),
    writeFile(path.join(directory, "hs_ed25519_secret_key"), Buffer.concat([secretHeader, Buffer.alloc(64)])),
  ]);

  const valid = spawn(process.execPath, [GATEWAY_PATH, "--validate-identity", directory, ONION_HOST], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const validStderr = [];
  valid.stderr.on("data", (chunk) => validStderr.push(chunk));
  const [validCode] = await once(valid, "exit");
  assert.equal(validCode, 0, Buffer.concat(validStderr).toString("utf8"));

  const mismatchedHost = `${ONION_HOST.slice(0, -7)}e.onion`;
  const invalid = spawn(process.execPath, [GATEWAY_PATH, "--validate-identity", directory, mismatchedHost], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const invalidStderr = [];
  invalid.stderr.on("data", (chunk) => invalidStderr.push(chunk));
  const [invalidCode] = await once(invalid, "exit");
  assert.equal(invalidCode, 1);
  assert.match(Buffer.concat(invalidStderr).toString("utf8"), /hostname does not match ONION_HOSTNAME/);
});

test("running gateway signs and sanitizes proxied requests without using repository secrets", { timeout: 15_000 }, async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "cerber-onion-gateway-test-"));
  const signingKeyPath = path.join(temporaryDirectory, "ephemeral-private-key.pem");
  const preloadPath = path.join(temporaryDirectory, "redirect-upstream.mjs");
  const torReadyPath = path.join(temporaryDirectory, "tor-ready");
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  await writeFile(signingKeyPath, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  await writeFile(torReadyPath, "");
  await writeFile(preloadPath, `
    import http from "node:http";
    import https from "node:https";
    const originalRequest = https.request.bind(https);
    https.request = function request(options, callback) {
      if (!options || options.hostname !== "cerber.cc") return originalRequest(options, callback);
      const redirected = {
        ...options,
        agent: false,
        hostname: "127.0.0.1",
        port: Number(process.env.CERBER_TEST_UPSTREAM_PORT),
        protocol: "http:",
      };
      delete redirected.rejectUnauthorized;
      delete redirected.servername;
      return http.request(redirected, callback);
    };
  `);

  const upstreamRequests = [];
  const upstreamUpgradeSockets = new Set();
  let heldUpgradeReachedResolve;
  let heldUpgradeClosedResolve;
  const heldUpgradeReached = new Promise((resolve) => { heldUpgradeReachedResolve = resolve; });
  const heldUpgradeClosed = new Promise((resolve) => { heldUpgradeClosedResolve = resolve; });
  const upstreamServer = http.createServer((incoming, response) => {
    if (incoming.method === "GET" && incoming.url === "/api/health") {
      response.writeHead(200, {
        "content-type": "application/json",
        "x-cerber-onion-verified": "1",
      });
      response.end('{"ok":true}');
      return;
    }
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      const snapshot = {
        body: Buffer.concat(chunks).toString("utf8"),
        headers: incoming.headers,
        method: incoming.method,
        url: incoming.url,
      };
      upstreamRequests.push(snapshot);
      response.writeHead(307, {
        "alt-svc": "h3=\":443\"",
        "cf-ray": "must-not-leak",
        "content-location": "https://cerber.cc/content?id=7",
        location: "https://cerber.cc/next?step=2#done",
        server: "private-upstream",
        "set-cookie": [
          "upstream_session=abc; Domain=cerber.cc; Path=/; Secure; HttpOnly",
          "cerber_onion_client=forged; Domain=cerber.cc; Path=/",
        ],
        via: "private-proxy",
        "x-powered-by": "must-not-leak",
        "x-upstream-visible": "yes",
      });
      response.end(JSON.stringify(snapshot));
    });
  });
  upstreamServer.on("upgrade", (incoming, socket) => {
    upstreamUpgradeSockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => upstreamUpgradeSockets.delete(socket));
    if (incoming.url === "/ws-hold") {
      const observeGatewayClose = () => {
        heldUpgradeClosedResolve();
        socket.destroy();
      };
      socket.once("end", observeGatewayClose);
      socket.once("close", observeGatewayClose);
      socket.resume();
      heldUpgradeReachedResolve();
      return;
    }
    const key = String(incoming.headers["sec-websocket-key"] || "");
    const accept = crypto
      .createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, "ascii")
      .digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Connection: Upgrade",
      "Upgrade: websocket",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"));
  });
  const upstreamPort = await listen(upstreamServer);
  const [publicPort, onionPort] = await unusedPorts(2);

  const output = { stdout: "", stderr: "" };
  const gateway = spawn(process.execPath, ["--import", pathToFileURL(preloadPath).href, GATEWAY_PATH], {
    env: {
      ...process.env,
      CERBER_TEST_UPSTREAM_PORT: String(upstreamPort),
      ONION_GATEWAY_PRIVATE_KEY: signingKeyPath,
      ONION_HOSTNAME: ONION_HOST,
      ONION_LISTEN_HOST: "127.0.0.1",
      ONION_LISTEN_PORT: String(onionPort),
      PORT: String(publicPort),
      TOR_READY_FILE: torReadyPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    await stopChild(gateway);
    for (const socket of upstreamUpgradeSockets) socket.destroy();
    await close(upstreamServer);
    await rm(temporaryDirectory, { force: true, recursive: true });
  });
  await waitForGateway(gateway, output);

  const health = await waitForHealthyGateway(publicPort);
  assert.equal(health.statusCode, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true });
  assert.equal(health.headers["cache-control"], "no-store");
  const publicRoot = await request({ port: publicPort, path: "/" });
  assert.equal(publicRoot.statusCode, 404);

  const wrongHost = await request({
    headers: { host: "cerber.cc" },
    port: onionPort,
    path: "/",
  });
  assert.equal(wrongHost.statusCode, 421);
  assert.equal(wrongHost.headers["set-cookie"], undefined);

  const localPage = await request({
    headers: { host: ONION_HOST },
    port: onionPort,
    path: "/?from=tor",
  });
  assert.equal(localPage.statusCode, 200);
  assert.deepEqual(localPage.body, await readFile(INDEX_PATH));
  assert.equal(localPage.headers["cache-control"], "no-store, max-age=0");
  assert.equal(localPage.headers["x-frame-options"], "DENY");
  assert.equal(localPage.headers["referrer-policy"], "no-referrer");
  assert.match(localPage.headers["content-security-policy"], /default-src 'self'/);
  assert.match(localPage.headers["content-security-policy"], /https:\/\/uizkvahyzdqzcfhzjkxm\.supabase\.co/);

  const clientCookie = localPage.headers["set-cookie"]?.find((value) => value.startsWith("cerber_onion_client="));
  assert.ok(clientCookie);
  assert.match(clientCookie, /; Path=\/; HttpOnly; SameSite=Strict; Max-Age=31536000$/);
  const cookiePair = clientCookie.split(";", 1)[0];
  const cookieMatch = /^cerber_onion_client=([a-f0-9]{32})\.([A-Za-z0-9_-]{86})$/.exec(cookiePair);
  assert.ok(cookieMatch);
  const [, clientId, clientSignature] = cookieMatch;
  assert.equal(crypto.verify(
    null,
    Buffer.from(`cerber_onion_client\nv1\n${clientId}`, "utf8"),
    publicKey,
    Buffer.from(clientSignature, "base64url"),
  ), true);

  const requestBody = JSON.stringify({ action: "integration-test" });
  const requestPath = "/api/example?return=%2Fwallet";
  const crossOrigin = await request({
    headers: {
      host: ONION_HOST,
      origin: "https://attacker.example",
    },
    method: "POST",
    path: requestPath,
    port: onionPort,
  });
  assert.equal(crossOrigin.statusCode, 403);
  assert.equal(upstreamRequests.length, 0);

  const proxied = await request({
    body: requestBody,
    headers: {
      "cf-connecting-ip": "203.0.113.10",
      connection: "keep-alive, x-remove-me",
      "content-type": "application/json",
      cookie: `upstream_session=client; ${cookiePair}; preference=dark`,
      forwarded: "for=203.0.113.10",
      host: `${ONION_HOST}:80`,
      origin: `http://${ONION_HOST}`,
      referer: `http://${ONION_HOST}/catalog?q=1#details`,
      "true-client-ip": "203.0.113.10",
      "x-cerber-onion-client": "spoofed-client",
      "x-cerber-onion-signature": "spoofed-signature",
      "x-forwarded-for": "203.0.113.10",
      "x-real-ip": "203.0.113.10",
      "x-remove-me": "connection-scoped",
    },
    method: "POST",
    path: requestPath,
    port: onionPort,
  });
  assert.equal(proxied.statusCode, 307);
  assert.equal(upstreamRequests.length, 1);
  const upstream = JSON.parse(proxied.body);
  assert.equal(upstream.method, "POST");
  assert.equal(upstream.url, requestPath);
  assert.equal(upstream.body, requestBody);
  assert.equal(upstream.headers.host, "cerber.cc");
  assert.equal(upstream.headers.origin, "https://cerber.cc");
  assert.equal(upstream.headers.referer, "https://cerber.cc/catalog?q=1#details");
  assert.equal(upstream.headers.cookie, "upstream_session=client; preference=dark");
  assert.equal(upstream.headers["content-length"], String(Buffer.byteLength(requestBody)));
  for (const stripped of [
    "cf-connecting-ip",
    "forwarded",
    "true-client-ip",
    "x-forwarded-for",
    "x-real-ip",
    "x-remove-me",
  ]) {
    assert.equal(upstream.headers[stripped], undefined, `${stripped} reached the upstream`);
  }

  const signatureFields = {
    clientId: upstream.headers["x-cerber-onion-client"],
    method: upstream.headers["x-cerber-onion-method"],
    nonce: upstream.headers["x-cerber-onion-nonce"],
    onionHost: upstream.headers["x-cerber-onion-host"],
    signature: upstream.headers["x-cerber-onion-signature"],
    timestamp: upstream.headers["x-cerber-onion-timestamp"],
    url: upstream.headers["x-cerber-onion-url"],
    version: upstream.headers["x-cerber-onion-version"],
  };
  assert.deepEqual({
    clientId: signatureFields.clientId,
    method: signatureFields.method,
    onionHost: signatureFields.onionHost,
    url: signatureFields.url,
    version: signatureFields.version,
  }, {
    clientId,
    method: "POST",
    onionHost: ONION_HOST,
    url: requestPath,
    version: "v1",
  });
  assert.match(signatureFields.nonce, /^[a-f0-9]{32}$/);
  assert.match(signatureFields.timestamp, /^\d{13}$/);
  assert.ok(Math.abs(Number(signatureFields.timestamp) - Date.now()) <= 5_000);
  const signaturePayload = [
    signatureFields.version,
    signatureFields.timestamp,
    signatureFields.nonce,
    signatureFields.clientId,
    signatureFields.method,
    signatureFields.url,
    signatureFields.onionHost,
  ].join("\n");
  assert.equal(crypto.verify(
    null,
    Buffer.from(signaturePayload, "utf8"),
    publicKey,
    Buffer.from(signatureFields.signature, "base64url"),
  ), true);

  assert.equal(proxied.headers.location, `http://${ONION_HOST}/next?step=2#done`);
  assert.equal(proxied.headers["content-location"], `http://${ONION_HOST}/content?id=7`);
  assert.equal(proxied.headers["x-upstream-visible"], "yes");
  for (const stripped of ["alt-svc", "cf-ray", "server", "via", "x-powered-by"]) {
    assert.equal(proxied.headers[stripped], undefined, `${stripped} leaked to the onion client`);
  }
  assert.deepEqual(proxied.headers["set-cookie"], [
    "upstream_session=abc; Path=/; Secure; HttpOnly",
  ]);

  const oversized = await request({
    headers: {
      "content-length": String(20 * 1024 * 1024 + 1),
      host: ONION_HOST,
    },
    method: "POST",
    path: "/api/upload",
    port: onionPort,
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.headers.connection, "close");
  assert.equal(upstreamRequests.length, 1);

  const stalledBodies = Array.from({ length: 16 }, () => {
    const outgoing = http.request({
      agent: false,
      headers: { "content-length": "2", host: ONION_HOST },
      hostname: "127.0.0.1",
      method: "POST",
      path: "/api/stalled-body",
      port: onionPort,
    });
    outgoing.on("error", () => {});
    outgoing.write("x");
    return outgoing;
  });
  t.after(() => stalledBodies.forEach((outgoing) => outgoing.destroy()));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const bodyCapacityProbe = await request({
    body: "x",
    headers: { "content-length": "1", host: ONION_HOST },
    method: "POST",
    path: "/api/body-capacity-probe",
    port: onionPort,
  });
  assert.equal(bodyCapacityProbe.statusCode, 307);
  stalledBodies.forEach((outgoing) => outgoing.destroy());

  for (let attempt = 0; attempt < 11; attempt += 1) {
    const limited = await request({
      headers: { host: ONION_HOST },
      method: "POST",
      path: "/API/AUTH/REGISTER/",
      port: onionPort,
    });
    assert.equal(limited.statusCode, attempt < 10 ? 307 : 429);
  }

  const heldClient = net.createConnection({ host: "127.0.0.1", port: onionPort });
  heldClient.on("error", () => {});
  await once(heldClient, "connect");
  heldClient.write(websocketRequest("/ws-hold", crypto.randomBytes(16).toString("base64")));
  await withTimeout(heldUpgradeReached, 2_000, "upstream websocket handshake was not reached");
  heldClient.destroy();
  await withTimeout(heldUpgradeClosed, 2_000, "upstream websocket handshake survived client disconnect");

  const openClient = net.createConnection({ host: "127.0.0.1", port: onionPort });
  await once(openClient, "connect");
  const openResponse = new Promise((resolve, reject) => {
    let value = "";
    openClient.on("data", (chunk) => {
      value += chunk.toString("latin1");
      if (value.includes("\r\n\r\n")) resolve(value);
    });
    openClient.once("error", reject);
  });
  openClient.write(websocketRequest("/ws-open", crypto.randomBytes(16).toString("base64")));
  let openHandshake;
  try {
    openHandshake = await withTimeout(openResponse, 2_000, "websocket upgrade timed out");
  } catch (error) {
    throw new Error(`websocket upgrade failed: ${error.message}; gateway stderr: ${output.stderr}`);
  }
  assert.match(openHandshake, /^HTTP\/1\.1 101 /);
  const openClientClosed = new Promise((resolve) => {
    openClient.once("close", resolve);
    openClient.once("error", resolve);
  });
  const gatewayExited = once(gateway, "exit");
  gateway.kill("SIGTERM");
  await withTimeout(openClientClosed, 2_000, "active websocket survived gateway shutdown");
  await withTimeout(gatewayExited, 2_000, "gateway did not stop after closing active websocket");

  assert.doesNotMatch(`${output.stdout}\n${output.stderr}`, /BEGIN (?:OPENSSH |EC |RSA )?PRIVATE KEY|requestPath|integration-test/);
});
