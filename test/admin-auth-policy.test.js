import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = server.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `${name} must exist`);
  const next = server.slice(start + 1).search(/\n(?:(?:async\s+)?function\s+[a-zA-Z]|app\.)/);
  return server.slice(start, next < 0 ? server.length : start + 1 + next);
}

function tokenHarness() {
  const now = 1800000000000;
  const context = vm.createContext({
    Buffer,
    crypto,
    Date: { now: () => now },
    process: {
      env: {
        ADMIN_JWT_SECRET: "site-secret-that-is-longer-than-thirty-two-characters",
        SELLER_ADMIN_SECRET: "store-secret-that-is-longer-than-thirty-two-characters"
      }
    },
    runtimeAdminSecret: "unused-runtime-secret",
    securityTokenVersion: "auth-policy-test-v1",
    securityTokenEpochMs: 0,
    adminTokenTtlMs: 2 * 60 * 60 * 1000
  });
  vm.runInContext([
    "secretFingerprint",
    "adminSecret",
    "requestDeviceHash",
    "signAdminToken",
    "verifyAdminToken",
    "sellerAdminSecret",
    "signSellerAdminToken",
    "verifySellerAdminToken"
  ].map(functionSource).join("\n"), context);
  return { context, now };
}

function request(token = "") {
  return {
    headers: {
      authorization: token ? `Bearer ${token}` : "",
      "user-agent": "auth-policy-test-browser"
    }
  };
}

test("seller password tokens and site owner MFA tokens cannot cross authorization domains", () => {
  const { context } = tokenHarness();
  const sellerAccount = {
    id: "store:shop-1:staff:worker",
    role: "staff",
    credential_version: 4,
    session_version: 7
  };
  const sellerToken = context.signSellerAdminToken(
    "shop-1",
    { role: "staff", staffLogin: "worker", permissions: ["orders"] },
    sellerAccount,
    request()
  );
  const verifiedSeller = context.verifySellerAdminToken(request(sellerToken));

  assert.equal(verifiedSeller.authentication, "password");
  assert.equal(verifiedSeller.role, "staff");
  assert.equal(verifiedSeller.storeId, "shop-1");
  assert.equal(context.verifyAdminToken(request(sellerToken)), null, "a store token must not authorize a site-owner API");

  const ownerAccount = {
    id: "site:owner",
    login: "owner",
    role: "owner",
    credential_version: 3,
    session_version: 5
  };
  const ownerToken = context.signAdminToken(ownerAccount, request());
  assert.equal(context.verifyAdminToken(request(ownerToken)).role, "owner");
  assert.equal(context.verifySellerAdminToken(request(ownerToken)), null, "a site-owner token must not authorize a store API");
});

test("a signed seller role cannot be promoted by editing the password-session token", () => {
  const { context } = tokenHarness();
  const sellerToken = context.signSellerAdminToken(
    "shop-1",
    { role: "staff", staffLogin: "worker", permissions: ["orders"] },
    { id: "store:shop-1:staff:worker", role: "staff", credential_version: 1, session_version: 1 },
    request()
  );
  const [encodedPayload, signature] = sellerToken.split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  payload.role = "owner";
  payload.permissions = ["finances", "settings"];
  const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  assert.equal(context.verifySellerAdminToken(request(`${tamperedPayload}.${signature}`)), null);
});
