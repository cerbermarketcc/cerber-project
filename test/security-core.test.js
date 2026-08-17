import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adminRoleAllowsRequest,
  boundedUserText,
  base32Decode,
  base32Encode,
  cleanMarketplaceLaunchState,
  consumeRecoveryCode,
  generateRecoveryCodes,
  mergeSellerProductInput,
  generateTotpSecret,
  hashRecoveryCode,
  isBlockedStaticPath,
  mediaMagicMatches,
  normalizePublicBaseUrl,
  parseInlineMedia,
  recoveryCodeHashes,
  sanitizeAuditDetails,
  totpCodeForStep,
  trustedWalletCreditLtc,
  validateProviderPayout,
  validateProviderPayment,
  validIdempotencyKey,
  verifyTotpCode
} from "../security-core.js";

test("clean launch removes marketplace and money while preserving user-owned state", () => {
  const source = {
    ownerStores: [{ id: "store-1" }],
    publicStoresCache: [{ id: "store-1" }],
    stores: [{ id: "store-1" }],
    exchangers: [{ id: "exchange-1" }],
    exchangeCards: [{ id: "card-1" }],
    orders: [{ id: "order-1" }],
    walletTransactions: [{ id: "tx-1" }],
    walletDeposits: [{ id: "deposit-1" }],
    walletWithdrawals: [{ id: "withdrawal-1" }],
    balances: { alice: 100 },
    ltcBalances: { alice: 1.25 },
    storeBalancesLtc: { "store-1": 0.5 },
    ownerBalanceLtc: 0.25,
    adminLogs: [{ id: "log-1" }],
    groupMessages: [{ id: "group-1" }],
    referralCodes: { alice: "SAFE-CODE" },
    telegramBot: { users: { "1": { login: "alice" } } }
  };
  const cleaned = cleanMarketplaceLaunchState(source);
  for (const key of [
    "ownerStores", "publicStoresCache", "stores", "exchangers", "exchangeCards", "orders",
    "walletTransactions", "walletDeposits", "walletWithdrawals", "adminLogs"
  ]) assert.deepEqual(cleaned[key], [], key);
  for (const key of ["balances", "ltcBalances", "storeBalancesLtc", "storeBalancesUsd"])
    assert.deepEqual(cleaned[key], {}, key);
  assert.equal(cleaned.ownerBalanceLtc, 0);
  assert.equal(cleaned.ownerBalanceUsd, 0);
  assert.deepEqual(cleaned.groupMessages, source.groupMessages);
  assert.deepEqual(cleaned.referralCodes, source.referralCodes);
  assert.deepEqual(cleaned.telegramBot, source.telegramBot);
  assert.notEqual(cleaned, source);
});

test("oversized untrusted text is rejected instead of silently stored", () => {
  assert.equal(boundedUserText(" hello ", 10, "Message"), "hello");
  assert.throws(() => boundedUserText("x".repeat(11), 10, "Message"), (error) => error.status === 400 && error.code === "TEXT_TOO_LONG");
});

test("public callback URLs are normalized to approved HTTPS origins", () => {
  const production = { production: true };
  assert.equal(normalizePublicBaseUrl("https://cerber.vip/", production), "https://cerber.vip");
  assert.equal(normalizePublicBaseUrl("cerber.to/callback", production), "https://cerber.to");
  assert.equal(normalizePublicBaseUrl("[https://cerber.love](https://cerber.love)", production), "https://cerber.love");
  assert.equal(normalizePublicBaseUrl("https://attacker.example/callback", production), "https://cerber.vip");
  assert.equal(normalizePublicBaseUrl("javascript:alert(1)", production), "https://cerber.vip");
});

test("static serving blocks secrets, browser profiles, source maps and backups", () => {
  for (const pathname of [
    "/.env",
    "/.env.production",
    "/.git/config",
    "/.chrome-mobile/Default/Cookies",
    "/node_modules/pkg/index.js",
    "/textolite/config.json",
    "/server.js",
    "/backup.dump",
    "/private.pem",
    "/app.js.map",
    "/archive.zip"
  ]) assert.equal(isBlockedStaticPath(pathname), true, pathname);

  for (const pathname of ["/index.html", "/app.js", "/styles.css", "/assets/logo.png"])
    assert.equal(isBlockedStaticPath(pathname), false, pathname);
});

test("security audit logs redact secrets and mask wallet addresses", () => {
  const safe = sanitizeAuditDetails({
    token: "bearer-secret",
    passwordHash: "bcrypt-value",
    payoutAddress: "ltc1qabcdefghijklmnopqrstuvwxyz",
    note: "line one\nline two"
  });
  assert.equal(safe.token, "[redacted]");
  assert.equal(safe.passwordHash, "[redacted]");
  assert.equal(safe.payoutAddress, "ltc1qa...wxyz");
  assert.equal(safe.note, "line one line two");
});

test("administrative roles use an explicit method and route allowlist", () => {
  assert.equal(adminRoleAllowsRequest("manager", "PATCH", "/api/admin/stores/store-1"), true);
  assert.equal(adminRoleAllowsRequest("manager", "DELETE", "/api/admin/stores/store-1"), false);
  assert.equal(adminRoleAllowsRequest("manager", "POST", "/api/admin/users/alice/balance"), false);
  assert.equal(adminRoleAllowsRequest("moderator", "POST", "/api/admin/disputes/d-1/reply"), true);
  assert.equal(adminRoleAllowsRequest("moderator", "PATCH", "/api/admin/stores/store-1"), false);
  assert.equal(adminRoleAllowsRequest("support", "GET", "/api/admin/users/alice"), true);
  assert.equal(adminRoleAllowsRequest("support", "PATCH", "/api/admin/users/alice"), false);
  assert.equal(adminRoleAllowsRequest("support", "POST", "/api/admin/logout"), true);
  assert.equal(adminRoleAllowsRequest("unknown", "GET", "/api/admin/overview"), false);
});

test("store product input cannot overwrite trusted sales and review metrics", () => {
  const existing = {
    id: "p-1",
    title: "Original",
    purchases: 7,
    reviews: 2,
    rating: 4.5,
    reviewsList: [{ id: "review-1", rating: 5 }]
  };
  const merged = mergeSellerProductInput(existing, {
    id: "../../pwned",
    title: "Updated",
    purchases: 999999,
    reviews: 999999,
    rating: 5,
    reviewsList: [{ id: "forged" }],
    priceUsd: -100,
    positions: [{ id: "../position", deliveryItems: ["address"], stock: 999999 }]
  });
  assert.equal(merged.id, "------pwned");
  assert.equal(merged.purchases, 7);
  assert.equal(merged.reviews, 2);
  assert.equal(merged.rating, 4.5);
  assert.deepEqual(merged.reviewsList, existing.reviewsList);
  assert.equal(merged.priceUsd, 0);
  assert.equal(merged.positions[0].stock, 1);
  assert.doesNotMatch(merged.positions[0].id, /[./]/);
});

test("base32 round trip and RFC 6238-compatible TOTP", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
  assert.equal(base32Decode(secret).toString("ascii"), "12345678901234567890");
  assert.equal(totpCodeForStep(secret, 1), "287082");
  assert.deepEqual(verifyTotpCode(secret, "287082", { timestamp: 30_000, window: 0 }), { valid: true, step: 1 });
  assert.equal(verifyTotpCode(secret, "287083", { timestamp: 30_000, window: 0 }).valid, false);
  assert.ok(generateTotpSecret().length >= 32);
});

test("recovery codes are high entropy, hashed, and one-use", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  const hashes = recoveryCodeHashes("server-secret", "site:owner", codes);
  assert.equal(hashes.length, 10);
  assert.equal(hashes.some((hash) => hash.includes(codes[0])), false);
  const consumed = consumeRecoveryCode(hashes, "server-secret", "site:owner", codes[0].toLowerCase());
  assert.equal(consumed.valid, true);
  assert.equal(consumed.hashes.length, 9);
  assert.equal(consumeRecoveryCode(consumed.hashes, "server-secret", "site:owner", codes[0]).valid, false);
  assert.notEqual(hashRecoveryCode("server-secret", "site:owner", codes[1]), hashRecoveryCode("server-secret", "site:other", codes[1]));
});

test("idempotency keys reject short and structured injection payloads", () => {
  assert.equal(validIdempotencyKey("order:01JABCDEF0123456789"), "order:01JABCDEF0123456789");
  assert.equal(validIdempotencyKey("short"), "");
  assert.equal(validIdempotencyKey("valid-length-but-has-space 123"), "");
  assert.equal(validIdempotencyKey("../../../../etc/passwd"), "");
});

test("provider payment must match the stored payment, order, currency and amounts", () => {
  const expected = {
    id: "order-123",
    paymentId: "payment-456",
    payCurrency: "ltc",
    amountUsd: 9,
    payAmount: 0.2
  };
  const valid = {
    payment_id: "payment-456",
    order_id: "order-123",
    pay_currency: "ltc",
    price_currency: "usd",
    price_amount: 9,
    pay_amount: 0.2,
    actually_paid: 0.2
  };
  assert.equal(validateProviderPayment(valid, expected).ok, true);
  assert.equal(validateProviderPayment({ ...valid, payment_id: "other" }, expected).reason, "payment_id_mismatch");
  assert.equal(validateProviderPayment({ ...valid, order_id: "other" }, expected).reason, "order_id_mismatch");
  assert.equal(validateProviderPayment({ ...valid, pay_currency: "trx" }, expected).reason, "pay_currency_mismatch");
  assert.equal(validateProviderPayment({ ...valid, price_amount: 1 }, expected).reason, "price_amount_mismatch");
  assert.equal(validateProviderPayment({ ...valid, actually_paid: 0.1 }, expected).reason, "underpaid");
});

test("provider payout must match the stored currency, amount and destination", () => {
  const expected = { currency: "ltc", amount: 0.123456, address: "ltc1qexampledestination" };
  const valid = { currency: "LTC", amount: "0.123456", address: "ltc1qexampledestination" };
  assert.equal(validateProviderPayout(valid, expected).ok, true);
  assert.equal(validateProviderPayout({ ...valid, currency: "trx" }, expected).reason, "payout_currency_mismatch");
  assert.equal(validateProviderPayout({ ...valid, amount: "0.123455" }, expected).reason, "payout_amount_mismatch");
  assert.equal(validateProviderPayout({ ...valid, address: "ltc1qother" }, expected).reason, "payout_address_mismatch");
});

test("wallet credit ignores client LTC estimates and uses only trusted provider or server rate data", () => {
  const deposit = {
    amountUsd: 100,
    amountLtcExpected: 999999,
    ltcUsdRateAtCreation: 50,
    payCurrency: "usdttrc20"
  };
  assert.equal(trustedWalletCreditLtc(deposit, { actually_paid: 100, price_amount: 100 }), 2);
  assert.equal(trustedWalletCreditLtc(deposit, { outcome_currency: "ltc", outcome_amount: 1.75 }), 1.75);
  assert.equal(trustedWalletCreditLtc({ ...deposit, ltcUsdRateAtCreation: 0 }, { actually_paid: 100 }), 0);
  assert.equal(trustedWalletCreditLtc({ payCurrency: "ltc" }, { actually_paid: 0.25 }), 0.25);
});

test("inline media requires an allowlisted MIME and matching magic bytes", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const allowed = new Set(["image/png"]);
  const valid = parseInlineMedia(`data:image/png;base64,${png.toString("base64")}`, allowed, 1024);
  assert.equal(valid?.mimeType, "image/png");
  assert.equal(mediaMagicMatches("image/png", png), true);
  const script = Buffer.from("<script>alert(1)</script>");
  assert.equal(parseInlineMedia(`data:image/png;base64,${script.toString("base64")}`, allowed, 1024), null);
  assert.equal(parseInlineMedia(`data:image/svg+xml;base64,${script.toString("base64")}`, allowed, 1024), null);
});

test("startup store migration hashes and removes legacy plaintext panel passwords", () => {
  const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const migrationStart = source.indexOf("async function migrateInlineStoreMedia()");
  const migrationEnd = source.indexOf("async function findSellerAdminStore", migrationStart);
  const migration = source.slice(migrationStart, migrationEnd);
  assert.ok(migration.includes("const protectedStore = await normalizeStoreSecrets(sourceStore)"));
  assert.ok(migration.includes("secretsBefore !== storeSecretsSnapshot(protectedStore)"));
  assert.ok(migration.includes("mediaResult.changed || rowIncomplete || secretsChanged"));
  assert.ok(migration.includes("migrationState.ownerStores = await Promise.all"));
  assert.ok(migration.includes("migratedStores.length || fallbackSecretsChanged"));
});
