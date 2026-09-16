import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../market-admin.js", import.meta.url), "utf8");
const challengeSource = server.slice(server.indexOf("function signMfaChallenge("), server.indexOf("async function beginMfaSetup("));

function harness(scope = "site") {
  let now = 1800000000000;
  const account = { id: "test-account", scope, role: scope === "site" ? "owner" : "store_owner", credential_version: 1, session_version: 1 };
  const context = vm.createContext({
    Buffer, crypto,
    Date: { now: () => now },
    MFA_CHALLENGE_TTL_MS: 600000, securityTokenEpochMs: 0,
    mfaSigningSecret: value => `test-secret-${value}`,
    requestDeviceHash: req => crypto.createHash("sha256").update(req.headers["user-agent"]).digest("hex"),
    secretValuesMatch: (a, b) => a === b,
    loadAdminAccountById: async () => account
  });
  vm.runInContext(challengeSource, context);
  const req = { headers: { "user-agent": "test-browser" }, body: {} };
  req.body.challengeToken = context.signMfaChallenge(account, req);
  return { context, account, req, advance: ms => { now += ms; } };
}

for (const scope of ["site", "store"]) {
  test(`${scope} MFA challenge remains valid before its deadline and fails after expiry`, async () => {
    const h = harness(scope);
    h.advance(599000);
    assert.equal((await h.context.accountForMfaChallenge(h.req, scope)).account.id, h.account.id);
    h.advance(2000);
    await assert.rejects(h.context.accountForMfaChallenge(h.req, scope), error => error.status === 401 && error.code === "MFA_CHALLENGE_INVALID");
  });
  test(`${scope} MFA challenge rejects changed device, scope, signature and revoked credentials`, async () => {
    const h = harness(scope);
    assert.equal(h.context.verifyMfaChallenge(h.req, scope === "site" ? "store" : "site"), null);
    const original = h.req.body.challengeToken;
    h.req.body.challengeToken = original + "tampered";
    assert.equal(h.context.verifyMfaChallenge(h.req, scope), null);
    h.req.body.challengeToken = original;
    h.req.headers["user-agent"] = "another-browser";
    assert.equal(h.context.verifyMfaChallenge(h.req, scope), null);
    h.req.headers["user-agent"] = "test-browser";
    h.account.session_version += 1;
    await assert.rejects(h.context.accountForMfaChallenge(h.req, scope), error => error.code === "MFA_CHALLENGE_INVALID");
  });
}

test("permission and service failures do not log the owner out as an expired session", () => {
  const fn = admin.slice(admin.indexOf("function adminAuthError("), admin.indexOf("async function refreshData("));
  const ctx = vm.createContext({});
  vm.runInContext(fn, ctx);
  assert.equal(ctx.adminAuthError({ status: 403, message: "Administrative role does not permit this action" }), false);
  assert.equal(ctx.adminAuthError({ status: 503, message: "Service unavailable" }), false);
  assert.equal(ctx.adminAuthError({ status: 401, message: "Admin session required" }), true);
});
