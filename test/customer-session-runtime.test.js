import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.slice(start + 1).search(/\n(?:async )?function [a-zA-Z]/);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function sessionHarness() {
  const sessions = new Map();
  const profile = { login: "tester", login_key: "tester", role: "user" };
  const supabase = {
    from(table) {
      assert.ok(["sessions", "profiles"].includes(table));
      return {
        insert(row) {
          if (sessions.has(row.token)) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
          sessions.set(row.token, { ...row, created_at: new Date().toISOString() });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(column, value) {
              return {
                maybeSingle() {
                  const data = table === "sessions"
                    ? sessions.get(value) || null
                    : column === "login_key" && value === profile.login_key ? profile : null;
                  return Promise.resolve({ data, error: null });
                }
              };
            }
          };
        },
        delete() {
          return {
            eq(_column, value) {
              sessions.delete(value);
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    }
  };
  const context = {
    crypto,
    supabase,
    isProduction: true,
    userSessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    userAccessSessionTtlMs: 24 * 60 * 60 * 1000,
    securityTokenEpochMs: 0,
    secureUserSessionCookieName: "__Host-cerber_remember_v1",
    localUserSessionCookieName: "cerber_remember_v1",
    adminSecret: () => "test-admin-secret",
    secretFingerprint: (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24),
    secretValuesMatch: (a, b) => a === b,
    requireDb: () => {},
    withTimeout: (promise) => promise,
    isLoginBlocked: async () => false,
    console
  };
  const names = [
    "requestUsesHttps", "requestCookie", "bearerUserSessionToken", "persistentUserSessionToken",
    "userSessionCookieName", "appendUserSessionCookie", "userSessionAgentFingerprint",
    "signUserSessionBinding", "createBoundUserSessionToken", "userSessionTokenMatchesRequest",
    "createUserSession", "createPersistentUserSession", "isDuplicateDbError",
    "sessionTokenDigest", "userFromSessionToken", "userFromRequest", "userFromPersistentSession"
  ];
  vm.runInNewContext(names.map(functionSource).join("\n"), context);
  return { context, sessions, profile };
}

test("persistent cookie restores only on its original device; access tokens expire sooner", async () => {
  const { context, sessions, profile } = sessionHarness();
  const request = { headers: { "user-agent": "Cerber test browser", "x-forwarded-proto": "https" } };
  const response = { cookies: [], append(_name, value) { this.cookies.push(value); } };
  const access = await context.createUserSession(request, profile.login_key);
  const persistent = await context.createPersistentUserSession(request, response, profile.login_key);
  const cookie = response.cookies[0];

  assert.match(cookie, /^__Host-cerber_remember_v1=u2p\./);
  assert.match(cookie, /; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000;/);
  assert.match(cookie, /; Secure$/);
  assert.equal((await context.userFromRequest({ headers: { ...request.headers, authorization: `Bearer ${access}` } }))?.login, profile.login);
  assert.equal(await context.userFromRequest({ headers: { ...request.headers, authorization: `Bearer ${persistent}` } }), null);
  assert.equal((await context.userFromPersistentSession({ headers: { ...request.headers, cookie: cookie.split(";")[0] } }))?.login, profile.login);
  assert.equal(await context.userFromPersistentSession({ headers: { ...request.headers, "user-agent": "Different browser", cookie: cookie.split(";")[0] } }), null);

  sessions.get(context.sessionTokenDigest(access)).created_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  assert.equal(await context.userFromRequest({ headers: { ...request.headers, authorization: `Bearer ${access}` } }), null);
  assert.equal((await context.userFromPersistentSession({ headers: { ...request.headers, cookie: cookie.split(";")[0] } }))?.login, profile.login);
});

test("production never accepts a non-__Host remember cookie as authentication", async () => {
  const { context, profile } = sessionHarness();
  const request = { headers: { "user-agent": "Cerber test browser" } };
  const response = { cookies: [], append(_name, value) { this.cookies.push(value); } };
  const persistent = await context.createPersistentUserSession(request, response, profile.login_key);
  const forgedName = { headers: { ...request.headers, cookie: `cerber_remember_v1=${persistent}` } };
  assert.equal(context.persistentUserSessionToken(forgedName), "");
  assert.equal(await context.userFromPersistentSession(forgedName), null);
});
