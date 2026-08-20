import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const appClient = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf("\nfunction ", start + name.length + 9);
  return source.slice(start, next < 0 ? source.length : next);
}

function routeBody(method, route) {
  const marker = `app.${method}("${route}"`;
  const start = server.indexOf(marker);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${route} must exist`);
  const next = server.indexOf("\napp.", start + marker.length);
  return server.slice(start, next < 0 ? server.length : next);
}

test("catalog starts without an implicit location and offers explicit all-location options", () => {
  assert.match(appClient, /filters:\s*\{\s*country: "",\s*city: ""/);
  assert.match(appClient, /CATALOG_FILTER_DEFAULTS_KEY/);
  assert.match(appClient, />Все страны<\/option>/);
  assert.match(appClient, />Все города<\/option>/);
  assert.match(appClient, /country: event\.target\.value, city: "", district: ""/);
});

test("paid and legacy product orders expose disputes until review or a real dispute closure", () => {
  const clientRule = functionBody(appClient, "orderCanDispute");
  const openRoute = routeBody("post", "/api/orders/:id/dispute/open");
  const closeRoute = routeBody("post", "/api/orders/:id/dispute/close");
  const canDispute = new Function(`
    ${functionBody(appClient, "orderBooleanFlag")}
    ${functionBody(appClient, "isProductOrder")}
    ${functionBody(appClient, "productOrderIsPaid")}
    ${functionBody(appClient, "orderHasReview")}
    ${functionBody(appClient, "orderHasClosedDispute")}
    ${clientRule}
    return orderCanDispute;
  `)();

  assert.equal(canDispute({ type: "product", status: "active", paymentStatus: "paid" }), true);
  assert.equal(canDispute({ storeId: "shop", product: "Legacy", status: "completed", paymentStatus: "finished", reviewLeft: "false", disputeChatClosed: "false" }), true);
  assert.equal(canDispute({ storeId: "shop", product: "Recovered", status: "completed", paymentStatus: "paid", disputeChatClosed: true }), true);
  assert.equal(canDispute({ type: "product", status: "completed", paymentStatus: "paid", reviewLeft: true }), false);
  assert.equal(canDispute({ type: "product", status: "completed", paymentStatus: "paid", disputeClosedAt: Date.now() }), false);
  assert.equal(canDispute({ type: "product", status: "completed", paymentStatus: "paid", disputeThreadId: "thread", disputeChatClosed: true }), false);
  assert.equal(canDispute({ type: "product", status: "refunded", paymentStatus: "paid" }), false);

  assert.match(openRoute, /findProductOrderForDispute/);
  assert.match(openRoute, /productOrderPaymentConfirmed/);
  assert.match(openRoute, /productOrderReviewLeft/);
  assert.match(openRoute, /productOrderDisputeClosed/);
  assert.match(openRoute, /syncProductOrderEverywhere/);
  assert.match(closeRoute, /order\.paymentStatus/);
  assert.match(closeRoute, /order\.status = "completed"/);
  assert.match(styles, /\.order-side \.order-dispute-button/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("customer USD balance is ledger-based and independent from the live LTC rate", () => {
  const fixedBalance = functionBody(server, "stateUserUsdBalance");
  const balancePurchase = routeBody("post", "/api/orders/product/balance");
  assert.match(fixedBalance, /userUsdBalanceFromLedger/);
  assert.doesNotMatch(fixedBalance, /litecoinToUsd|loadLitecoinUsdRate/);
  assert.match(balancePurchase, /stateUserUsdBalance\(state, user\.login, user\.login_key\)/);
  assert.match(balancePurchase, /balanceUsd \+ 0\.00000001 < priceUsd/);
  assert.match(balancePurchase, /amountUsd: -priceUsd/);
  assert.match(appClient, /const usdBalance = userBalance\(\)/);
  assert.match(appClient, /const usd = userBalance\(\)/);

  const buildCalculator = new Function("sameLogin", "loginKey", `
    ${functionBody(server, "walletTransactionAffectsUserLtcBalance")}
    ${functionBody(server, "walletTransactionAffectsUserUsdBalance")}
    ${functionBody(server, "userUsdBalanceFromLedger")}
    ${fixedBalance}
    return stateUserUsdBalance;
  `);
  const sameLogin = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const calculate = buildCalculator(sameLogin, (value) => String(value || "").trim().toLowerCase());
  const state = {
    balances: { client: 1 },
    walletTransactions: [
      { login: "client", type: "deposit", status: "completed", amountUsd: 10 },
      { login: "client", type: "deposit", status: "processing", amountUsd: 20 },
      { login: "client", type: "purchase", status: "completed", amountUsd: -4 },
      { login: "client", type: "withdrawal", status: "cancelled", amountUsd: -3 },
      { login: "client", type: "withdrawal_refund", status: "completed", amountUsd: 2 },
      { login: "client", type: "referral_reward", status: "completed", amountUsd: 3 }
    ]
  };
  assert.equal(calculate(state, "client"), 9);
});

test("SOL and USDT Solana payment models remain available", () => {
  for (const source of [appClient, server]) {
    assert.match(source, /id: "usdt_sol", payCurrency: "usdtsol"/);
    assert.match(source, /id: "sol", payCurrency: "sol"/);
  }
  assert.match(indexHtml, /app\.js\?v=168/);
});
