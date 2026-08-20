import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const appClient = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

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

test("a paid auto-completed order remains disputable until review or a prior dispute closure", () => {
  const clientRule = functionBody(appClient, "orderCanDispute");
  const openRoute = routeBody("post", "/api/orders/:id/dispute/open");
  const closeRoute = routeBody("post", "/api/orders/:id/dispute/close");
  assert.doesNotMatch(clientRule, /completed/);
  assert.match(clientRule, /order\.reviewLeft/);
  assert.match(clientRule, /order\.disputeClosedAt/);
  assert.doesNotMatch(openRoute, /\["completed", "closed"/);
  assert.match(openRoute, /order\.reviewLeft/);
  assert.match(openRoute, /order\.disputeClosedAt \|\| order\.disputeChatClosed/);
  assert.match(closeRoute, /order\.status = "completed"/);
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
  assert.match(indexHtml, /app\.js\?v=166/);
});
