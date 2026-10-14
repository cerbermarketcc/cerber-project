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

function payoutMathHarness() {
  const context = {
    nowpaymentsPayoutFeeReserveMultiplier: 2,
    nowpaymentsPayoutFeeReserveMinimumLtc: 0.0001
  };
  vm.runInNewContext([
    "roundLtc",
    "normalizeNowpaymentsPayoutAmount",
    "nowpaymentsPayoutFeeLtc",
    "nowpaymentsMinimumPayoutLtc",
    "payoutFeeReserveLtc",
    "payoutAmountsForGrossDebit",
    "reconcilePayoutFeeReserve",
    "withdrawalAmountLtc",
    "withdrawalConsumesBalance",
    "activeWithdrawalLtc"
  ].map(functionSource).join("\n"), context);
  return context;
}

test("NOWPayments payout fee and minimum parsers fail closed on unusable values", () => {
  const context = payoutMathHarness();

  assert.equal(context.nowpaymentsPayoutFeeLtc({ currency: "ltc", fee: "0.00012345" }), 0.00012345);
  assert.equal(context.nowpaymentsPayoutFeeLtc({ currency: "ltc", fee: 0 }), 0);
  assert.equal(Number.isNaN(context.nowpaymentsPayoutFeeLtc({ currency: "ltc" })), true);
  assert.equal(Number.isNaN(context.nowpaymentsPayoutFeeLtc({ fee: -0.1 })), true);

  assert.equal(context.nowpaymentsMinimumPayoutLtc({ success: true, result: "0.001" }), 0.001);
  assert.equal(context.nowpaymentsMinimumPayoutLtc({ min_amount: "0.002" }), 0.002);
  assert.equal(Number.isNaN(context.nowpaymentsMinimumPayoutLtc({ success: true })), true);
  assert.equal(Number.isNaN(context.nowpaymentsMinimumPayoutLtc({ result: 0 })), true);
});

test("gross withdrawal debit is split into recipient amount and its own network fee", () => {
  const context = payoutMathHarness();
  const plan = context.payoutAmountsForGrossDebit(0.05, 0.001);

  assert.equal(plan.grossDebitLtc, 0.05);
  assert.equal(plan.payoutFeePolicyVersion, 3);
  assert.equal(plan.recipientAmountLtc, 0.048);
  assert.equal(plan.amountLtc, 0.048);
  assert.equal(plan.estimatedNetworkFeeLtc, 0.001);
  assert.equal(plan.reservedNetworkFeeLtc, 0.002);
  assert.equal(plan.providerRequiredLtc, 0.05);
  assert.ok(plan.recipientAmountLtc + plan.reservedNetworkFeeLtc <= plan.grossDebitLtc + 1e-12);
});

test("seller and owner payouts remain fully backed in either withdrawal order", () => {
  const context = payoutMathHarness();
  const seller = context.payoutAmountsForGrossDebit(0.085, 0.001);
  const owner = context.payoutAmountsForGrossDebit(0.015, 0.001);

  assert.equal(Number((seller.providerRequiredLtc + owner.providerRequiredLtc).toFixed(8)), 0.1);
  assert.equal(Number((seller.recipientAmountLtc + owner.recipientAmountLtc).toFixed(8)), 0.096);
  for (const sequence of [[seller, owner], [owner, seller]]) {
    let custody = 0.1;
    for (const payout of sequence) {
      assert.ok(custody + 1e-12 >= payout.providerRequiredLtc);
      custody = Number((custody - payout.providerRequiredLtc).toFixed(8));
    }
    assert.equal(custody, 0);
  }
});

test("recipient amount is floored to provider precision and can never overrun gross debit", () => {
  const context = payoutMathHarness();
  const plan = context.payoutAmountsForGrossDebit(0.050000009, 0.0000004);

  assert.equal(plan.recipientAmountLtc, 0.049899);
  assert.equal(plan.amountLtc, plan.recipientAmountLtc);
  assert.equal(plan.providerRequiredLtc, 0.05000001);
  assert.ok(plan.providerRequiredLtc <= plan.grossDebitLtc);

  const belowFee = context.payoutAmountsForGrossDebit(0.0001, 0.0001);
  assert.equal(belowFee.recipientAmountLtc, 0);
  assert.equal(belowFee.amountLtc, 0);
  assert.ok(belowFee.providerRequiredLtc <= belowFee.grossDebitLtc);
});

test("withdrawal balance consumption uses gross debit for v2 and amount for legacy rows", () => {
  const context = payoutMathHarness();

  assert.equal(context.withdrawalAmountLtc({
    payoutFeePolicyVersion: 2,
    grossDebitLtc: 0.05,
    recipientAmountLtc: 0.049,
    amountLtc: 0.049
  }), 0.05);
  assert.equal(context.withdrawalAmountLtc({ amountLtc: 0.049 }), 0.049);

  const state = {
    walletWithdrawals: [
      {
        id: "v2-active",
        scope: "store",
        storeId: "shop-1",
        status: "queued",
        payoutFeePolicyVersion: 2,
        grossDebitLtc: 0.05,
        amountLtc: 0.049
      },
      {
        id: "legacy-active",
        scope: "store",
        storeId: "shop-1",
        status: "processing",
        amountLtc: 0.02
      },
      {
        id: "v2-failed",
        scope: "store",
        storeId: "shop-1",
        status: "failed",
        payoutFeePolicyVersion: 2,
        grossDebitLtc: 1,
        amountLtc: 0.99
      },
      {
        id: "other-store",
        scope: "store",
        storeId: "shop-2",
        status: "queued",
        payoutFeePolicyVersion: 2,
        grossDebitLtc: 2,
        amountLtc: 1.9
      }
    ]
  };

  assert.equal(context.activeWithdrawalLtc(state, "store", "shop-1"), 0.07);
});

test("dynamic fee quote converges and reserves amount plus fee inside the claimant debit", async () => {
  const calls = [];
  const context = {
    Date,
    Number,
    encodeURIComponent,
    nowpaymentsPayoutFeePayer: "sender",
    nowpaymentsPayoutFeeReserveMultiplier: 2,
    nowpaymentsPayoutFeeReserveMinimumLtc: 0.0001,
    nowpaymentsPayoutStep: async (_stage, operation) => operation(),
    nowpaymentsRequest: async (path) => {
      calls.push(path);
      if (path.startsWith("payout/fee?")) return { currency: "ltc", fee: "0.001" };
      if (path === "payout-withdrawal/min-amount/ltc") return { success: true, result: "0.01" };
      throw new Error(`Unexpected request: ${path}`);
    }
  };
  vm.runInNewContext([
    "roundLtc",
    "normalizeNowpaymentsPayoutAmount",
    "nowpaymentsPayoutFeeLtc",
    "nowpaymentsMinimumPayoutLtc",
    "payoutFeeReserveLtc",
    "payoutAmountsForGrossDebit",
    "quoteNowpaymentsLtcPayout"
  ].map(functionSource).join("\n"), context);

  const plan = await context.quoteNowpaymentsLtcPayout(0.05);
  assert.equal(plan.grossDebitLtc, 0.05);
  assert.equal(plan.recipientAmountLtc, 0.048);
  assert.equal(plan.reservedNetworkFeeLtc, 0.002);
  assert.equal(plan.providerRequiredLtc, 0.05);
  assert.equal(plan.minimumPayoutLtc, 0.01);
  assert.deepEqual(calls, [
    "payout/fee?currency=ltc&amount=0.050000",
    "payout/fee?currency=ltc&amount=0.048000",
    "payout-withdrawal/min-amount/ltc"
  ]);
});

test("final payout fee releases unused reserve and never debits another claimant", () => {
  const context = payoutMathHarness();
  const withdrawal = context.payoutAmountsForGrossDebit(0.05, 0.001);

  const settled = context.reconcilePayoutFeeReserve(withdrawal, 0.001);
  assert.equal(settled.reserveCovered, true);
  assert.equal(withdrawal.grossDebitLtc, 0.049);
  assert.equal(withdrawal.refundedFeeReserveLtc, 0.001);

  const spike = context.payoutAmountsForGrossDebit(0.05, 0.001);
  const blocked = context.reconcilePayoutFeeReserve(spike, 0.003);
  assert.equal(blocked.reserveCovered, false);
  assert.equal(blocked.accounted, true);
  assert.equal(spike.grossDebitLtc, 0.051);
  assert.equal(spike.feeReserveExceededLtc, 0.001);
  assert.equal(spike.payoutFeeDebtLtc, 0.001);
});

test("provider balance must cover the recipient amount and its reserved network fee", async () => {
  const context = {
    nowpaymentsPayoutsEnabled: true,
    nowpaymentsApiKey: "test-api-key",
    nowpaymentsPayout2faSecret: "TESTSECRET",
    nowpaymentsPayoutToken: async () => "test-token",
    quoteNowpaymentsLtcPayout: async () => ({
      payoutFeePolicyVersion: 2,
      grossDebitLtc: 0.05,
      recipientAmountLtc: 0.049,
      amountLtc: 0.049,
      estimatedNetworkFeeLtc: 0.001,
      providerRequiredLtc: 0.05
    }),
    nowpaymentsPayoutStep: async (_stage, operation) => operation(),
    nowpaymentsRequest: async (path) => {
      if (path === "payout/validate-address") return { result: true };
      if (path === "balance") return { ltc: 0.0495 };
      throw new Error(`Unexpected request: ${path}`);
    }
  };
  vm.runInNewContext([
    "nowpaymentsAvailableLtc",
    "createNowpaymentsLtcPayout"
  ].map(functionSource).join("\n"), context);

  await assert.rejects(
    () => context.createNowpaymentsLtcPayout({ grossDebitLtc: 0.05, address: "ltc1qexample" }),
    (error) => error?.payoutErrorCode === "insufficient_balance" && error?.payoutStage === "balance"
  );
});
