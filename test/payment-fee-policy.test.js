import assert from "node:assert/strict";
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

function settlementHarness() {
  const context = {
    Number,
    String,
    cachedLitecoinUsdRate: () => 100,
    adminOrderAmount: (order) => Number(order.amountUsd || 0),
    adminPlatformCommission: (order) => Number(order.platformCommissionUsd || 0),
    storeCommissionPercentForOrder: () => 15,
    usdToLitecoin: (amount) => Number(amount || 0) / 100
  };
  vm.runInNewContext([
    "roundLtc",
    "productOrderUsesFinalProviderSettlement",
    "productOrderFinalProviderOutcome",
    "orderProviderValue",
    "orderActualGrossLtc",
    "orderLtcBreakdown"
  ].map(functionSource).join("\n"), context);
  return context;
}

test("new product settlements require a finished LTC outcome and ignore gross customer transfer", () => {
  const context = settlementHarness();
  const order = {
    id: "order-v2",
    type: "product",
    paymentProvider: "nowpayments",
    feePolicyVersion: 2,
    amountUsd: 5,
    platformCommissionUsd: 0.75,
    providerPaymentStatus: "paid",
    providerActuallyPaid: 0.2,
    payCurrency: "ltc",
    payAmount: 0.2
  };

  assert.equal(context.orderActualGrossLtc(order), 0);
  assert.equal(context.orderLtcBreakdown(order).grossLtc, 0);

  order.providerPaymentStatus = "finished";
  order.providerOutcomeCurrency = "ltc";
  order.providerOutcomeAmount = 0.1;
  const breakdown = context.orderLtcBreakdown(order);
  assert.equal(breakdown.grossLtc, 0.1);
  assert.equal(breakdown.commissionLtc, 0.015);
  assert.equal(breakdown.sellerLtc, 0.085);
  assert.equal(Number((breakdown.commissionLtc + breakdown.sellerLtc).toFixed(8)), breakdown.grossLtc);

  order.providerOutcomeAmount = 0.00000001;
  order.platformCommissionUsd = 2.5;
  const tiny = context.orderLtcBreakdown(order);
  assert.equal(Number((tiny.commissionLtc + tiny.sellerLtc).toFixed(8)), tiny.grossLtc);
});

test("legacy settlements retain their previous actually_paid fallback", () => {
  const context = settlementHarness();
  const order = {
    id: "order-v1",
    type: "product",
    paymentProvider: "nowpayments",
    amountUsd: 5,
    providerActuallyPaid: 0.2,
    payCurrency: "ltc"
  };
  assert.equal(context.orderActualGrossLtc(order), 0.2);
});

test("an unsettled legacy invoice can opt into final outcome accounting without changing historical rows", () => {
  const context = settlementHarness();
  const pending = {
    id: "pending-order",
    type: "product",
    paymentProvider: "nowpayments",
    settlementPolicyVersion: 2,
    providerPaymentStatus: "paid",
    providerActuallyPaid: 0.2,
    payCurrency: "ltc"
  };
  const historical = { ...pending, settlementPolicyVersion: 0, ltcSettlementVersion: 1 };

  assert.equal(context.orderActualGrossLtc(pending), 0);
  assert.equal(context.productOrderUsesFinalProviderSettlement(historical), false);
});

test("both product payment paths preserve the 40-minute floating reservation and settle only net custody LTC", () => {
  const directRoute = source.slice(source.indexOf('app.post("/api/orders/product/deposit"'), source.indexOf('app.get("/api/orders/:id/payment-qr"'));
  const invoiceRoute = source.slice(source.indexOf('app.post(["/api/payments/gateway/create"'), source.indexOf('app.post("/api/wallet/deposits"'));

  assert.match(directRoute, /price_amount:\s*priceUsd[\s\S]*is_fee_paid_by_user:\s*false[\s\S]*is_fixed_rate:\s*false/);
  assert.match(directRoute, /feePolicyVersion:\s*2[\s\S]*paymentFeePayer:\s*"merchant"/);
  assert.match(invoiceRoute, /is_fee_paid_by_user:\s*false[\s\S]*is_fixed_rate:\s*false/);
  assert.match(invoiceRoute, /order\.feePolicyVersion\s*=\s*2/);
});
