import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const appClient = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const renderConfig = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");

function routeBody(method, route) {
  const markers = [`app.${method}("${route}"`, `app.${method}('${route}'`];
  const start = markers.reduce((found, marker) => found >= 0 ? found : server.indexOf(marker), -1);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${route} must be a dedicated route`);
  const nextRoute = server.indexOf("\napp.", start + 1);
  return server.slice(start, nextRoute < 0 ? server.length : nextRoute);
}

function functionBody(source, name) {
  const asyncMarker = `async function ${name}(`;
  const syncMarker = `function ${name}(`;
  const start = source.indexOf(asyncMarker) >= 0 ? source.indexOf(asyncMarker) : source.indexOf(syncMarker);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function apiFetchHarness(outcomes, { restored = true } = {}) {
  const requests = [];
  let token = "old-access-token";
  let restoreCalls = 0;
  const context = {
    API_ORIGINS: ["https://cerber.test"],
    URL,
    db: { currentUser: "alice" },
    customerSessionGeneration: 1,
    apiUrl(path, origin = "https://cerber.test") {
      return /^https?:\/\//.test(path) ? path : `${origin}${path}`;
    },
    apiSessionToken: () => token,
    async restoreApiSession() {
      restoreCalls += 1;
      if (restored) token = "renewed-access-token";
      return restored;
    },
    async apiFetchOnce(path, options) {
      requests.push({ path, options });
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }
  };
  vm.runInNewContext(`${functionBody(appClient, "apiFetch")}\nglobalThis.runApiFetch = apiFetch;`, context);
  return { run: context.runApiFetch, requests, restoreCalls: () => restoreCalls };
}

function expiredCustomerSessionError() {
  const error = new Error("Сессия истекла. Войдите снова.");
  error.status = 401;
  error.customerSessionExpired = true;
  return error;
}

test("customer login issues a persistent hardened restore cookie for a 30-day session", () => {
  const registration = routeBody("post", "/api/auth/register");
  const login = routeBody("post", "/api/auth/login");
  const persistentSession = functionBody(server, "createPersistentUserSession");

  assert.match(registration, /createPersistentUserSession\(req\s*,\s*res\s*,/);
  assert.match(login, /createPersistentUserSession\(req\s*,\s*res\s*,/);
  assert.match(persistentSession, /createUserSession\(req\s*,\s*loginKeyValue\s*,\s*["']persistent["']\)/);
  assert.match(persistentSession, /appendUserSessionCookie\(req\s*,\s*res\s*,\s*token\)/);
  assert.match(server, /["']__Host-[A-Za-z0-9_-]+["']/);
  assert.match(server, /(?:httpOnly\s*:\s*true|HttpOnly)/i);
  assert.match(server, /(?:secure\s*:\s*true|parts\.push\(["']Secure["']\)|;\s*Secure)/i);
  assert.match(server, /(?:sameSite\s*:\s*["'](?:lax|strict)["']|SameSite=(?:Lax|Strict))/i);
  assert.match(server, /(?:path\s*:\s*["']\/["']|Path=\/)/i);
  assert.match(server, /(?:maxAge\s*:\s*userSessionTtlMs|Max-Age)/i);
  assert.match(server, /process\.env\.USER_REMEMBER_SESSION_TTL_HOURS\s*\|\|\s*720/);
  assert.match(server, /Math\.min\(720\s*,/);
  assert.match(server, /process\.env\.USER_SESSION_TTL_HOURS\s*\|\|\s*24/);
  assert.match(server, /Math\.min\(24\s*,/);
  assert.match(server, /purpose\s*===\s*["']persistent["']\s*\?\s*userSessionTtlMs\s*:\s*userAccessSessionTtlMs/);
  assert.match(envExample, /^USER_SESSION_TTL_HOURS=24$/m);
  assert.match(envExample, /^USER_REMEMBER_SESSION_TTL_HOURS=720$/m);
  assert.match(renderConfig, /key:\s*USER_SESSION_TTL_HOURS[\s\S]{0,80}value:\s*["']24["']/);
  assert.match(renderConfig, /key:\s*USER_REMEMBER_SESSION_TTL_HOURS[\s\S]{0,80}value:\s*["']720["']/);
});

test("restore-session accepts only the purpose-bound cookie and rotates a fresh bearer", () => {
  const restore = routeBody("post", "/api/auth/restore-session");
  const accessReader = functionBody(server, "userFromRequest");
  const persistentReader = functionBody(server, "userFromPersistentSession");

  assert.match(restore, /userFromPersistentSession\(req\)/);
  assert.match(restore, /createUserSession\(req\s*,/);
  assert.match(restore, /res\.json\(\{\s*token\b/);
  assert.match(restore, /status\(401\)/);
  assert.doesNotMatch(restore, /req\.body\??\.(?:login|password)|req\.body\s*\[\s*["'](?:login|password)/i);
  assert.doesNotMatch(restore, /headers\.authorization|Bearer\s+/i);
  assert.match(accessReader, /bearerUserSessionToken\(req\)/);
  assert.doesNotMatch(accessReader, /persistentUserSessionToken/);
  assert.match(persistentReader, /persistentUserSessionToken\(req\)[\s\S]{0,80}["']persistent["']/);
  assert.match(server, /purpose\s*===\s*["']persistent["']\s*\?\s*["']u2p["']\s*:\s*["']u2["']/);
});

test("legacy Telegram password login stays disabled and cannot restore a browser session", () => {
  const telegramLogin = routeBody("post", "/api/telegram/login");

  assert.match(telegramLogin, /status\(410\)/);
  assert.doesNotMatch(telegramLogin, /createUserSession|restore|cookie|res\.json\(\{\s*token\b/i);
});

test("logout revokes the bearer and clears the persistent restore cookie", () => {
  const logout = routeBody("post", "/api/auth/logout");

  assert.match(logout, /bearerUserSessionToken\(req\)/);
  assert.match(logout, /persistentUserSessionToken\(req\)/);
  assert.match(logout, /from\("sessions"\)\.delete\(\)\.eq\("token",\s*sessionTokenDigest\(token\)\)/);
  assert.match(logout, /clearUserSessionCookies\(req\s*,\s*res\)/);
});

test("a bearer alone cannot mint a new persistent remember cookie", () => {
  const session = routeBody("get", "/api/session");

  assert.match(session, /userFromRequest\(req\)/);
  assert.doesNotMatch(session, /createPersistentUserSession|appendUserSessionCookie|Set-Cookie/i);
});

test("the browser restores a bearer into sessionStorage and clears a stale visible account on failure", () => {
  const ensureSession = functionBody(appClient, "ensureApiSession");
  const restoreSession = functionBody(appClient, "restoreApiSession");
  const apiFetchOnce = functionBody(appClient, "apiFetchOnce");
  const rememberToken = functionBody(appClient, "rememberApiToken");

  assert.match(ensureSession, /restoreApiSession\(\)/);
  assert.match(restoreSession, /\/api\/auth\/restore-session/);
  assert.match(restoreSession, /method:\s*["']POST["']/);
  assert.match(restoreSession, /rememberApiToken\(payload\.token\)/);
  assert.match(restoreSession, /applyRemoteState\(payload\)/);
  assert.match(restoreSession, /clearSession\(\)/);
  assert.match(apiFetchOnce, /credentials:\s*["']same-origin["']/);
  assert.match(rememberToken, /sessionStorageSet\(API_TOKEN_KEY\s*,/);
  assert.doesNotMatch(rememberToken, /storageSet\(API_TOKEN_KEY|localStorage\.setItem/);
});

test("a customer 401 restores once and retries the original request only once", async () => {
  const classifyResponse = functionBody(appClient, "apiFetchOnce");
  assert.match(classifyResponse, /response\.status\s*===\s*401\s*&&\s*!hasAuthorization/);
  assert.match(classifyResponse, /error\.customerSessionExpired\s*=\s*true/);

  const recovered = apiFetchHarness([expiredCustomerSessionError(), { ok: true }]);
  assert.deepEqual(await recovered.run("/api/group/messages", { method: "POST", body: "{}" }), { ok: true });
  assert.equal(recovered.restoreCalls(), 1);
  assert.equal(recovered.requests.length, 2);
  assert.equal(recovered.requests[0].path, recovered.requests[1].path);
  assert.equal(recovered.requests[0].options.body, recovered.requests[1].options.body);

  const stillExpired = apiFetchHarness([expiredCustomerSessionError(), expiredCustomerSessionError()]);
  await assert.rejects(stillExpired.run("/api/telegram/link-code", { method: "POST" }), /Сессия истекла/);
  assert.equal(stillExpired.restoreCalls(), 1);
  assert.equal(stillExpired.requests.length, 2);
});

test("401 recovery never runs for login, restore, privileged APIs or explicit authorization", async () => {
  for (const [path, options] of [
    ["/api/auth/login", { method: "POST" }],
    ["/api/auth/restore-session", { method: "POST" }],
    ["/api/admin/state", {}],
    ["/api/group/messages", { headers: { Authorization: "Bearer custom-token" } }]
  ]) {
    const harness = apiFetchHarness([expiredCustomerSessionError()]);
    await assert.rejects(harness.run(path, options), /Сессия истекла/);
    assert.equal(harness.restoreCalls(), 0, `${path} must not invoke customer restore`);
    assert.equal(harness.requests.length, 1, `${path} must not be retried`);
  }
});

test("initial bootstrap restores the customer session before falling back to public state", () => {
  const initialLoad = functionBody(appClient, "loadInitialRemoteState");
  const initApp = functionBody(appClient, "initApp");

  assert.match(initialLoad, /db\.currentUser\s*&&\s*currentUser\(\)/);
  assert.match(initialLoad, /loadRemoteSession\(\)/);
  assert.match(initialLoad, /loadRemoteState\(\)/);
  assert.match(initApp, /loadInitialRemoteState\(\)/);
  assert.match(initApp, /rememberedUserNeedsVerification/);
  assert.match(initApp, /if\s*\(rememberedUserNeedsVerification\)\s*renderFallbackScreen\(\)/);
  assert.match(initApp, /if\s*\(rememberedUserNeedsVerification\s*&&\s*db\.currentUser\s*&&\s*!sessionVerified\)\s*renderFallbackScreen\(\)/);
  assert.doesNotMatch(initApp, /apiSessionToken\(\)\s*\?\s*loadRemoteSession\(\)\s*:\s*loadRemoteState\(\)/);
  assert.match(indexHtml, /<script\s+src=["']app\.js\?v=179["']><\/script>/);
});

test("logout waits for server revocation before clearing the local session", () => {
  const bindGlobal = functionBody(appClient, "bindGlobal");
  const logout = bindGlobal.slice(bindGlobal.indexOf('document.querySelectorAll("[data-logout]")'));

  assert.match(logout, /button\.onclick\s*=\s*async\s*\(\)\s*=>/);
  assert.match(logout, /await apiFetch\("\/api\/auth\/logout"/);
  assert.match(logout, /await apiFetch\("\/api\/auth\/logout"[\s\S]*?clearSession\(\)/);
  assert.match(logout, /catch[\s\S]*button\.disabled\s*=\s*false/);
});
