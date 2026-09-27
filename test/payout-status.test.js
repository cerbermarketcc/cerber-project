import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { validateProviderPayout } from "../security-core.js";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.slice(start + 1).search(/\n(?:async )?function [a-zA-Z]/);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function harness() {
  const context = { Date, Set, String, validateProviderPayout };
  vm.runInNewContext([
    "nowpaymentsPayoutLookupIds",
    "nowpaymentsPayoutRecords",
    "nowpaymentsPayoutRecord",
    "nowpaymentsPayoutStatusValue",
    "nowpaymentsPayoutErrorCode",
    "applyNowpaymentsPayoutStatus"
  ].map(functionSource).join("\n"), context);
  return context;
}

function withdrawal() {
  return {
    id: "local-withdrawal",
    providerPayoutId: "batch-1",
    providerWithdrawalIds: ["provider-withdrawal-1"],
    payCurrency: "ltc",
    amountLtc: 0.343771,
    address: "ltc1qexampledestination"
  };
}

function providerRecord(overrides = {}) {
  return {
    id: "provider-withdrawal-1",
    batch_withdrawal_id: "batch-1",
    status: "FINISHED",
    currency: "ltc",
    amount: "0.343771",
    address: "ltc1qexampledestination",
    ...overrides
  };
}

test("payout reconciliation accepts a root array response", () => {
  const context = harness();
  const item = withdrawal();
  const result = context.applyNowpaymentsPayoutStatus(item, {
    id: "provider-withdrawal-1",
    payload: [providerRecord()]
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.terminal, true);
  assert.equal(item.providerStatus, "finished");
  assert.equal(item.status, "paid");
});

test("payout reconciliation unwraps payouts containers and treats rejected_not_checked as terminal", () => {
  const context = harness();
  const item = withdrawal();
  const result = context.applyNowpaymentsPayoutStatus(item, {
    payload: { data: { payouts: [providerRecord({ status: "REJECTED_NOT_CHECKED" })] } }
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.status, "rejected_not_checked");
  assert.equal(result.terminal, true);
  assert.equal(item.status, "rejected");
  assert.equal(item.requiresManualReview, false);
});

test("wrapped payout records still require the stored currency, amount, and address", () => {
  const context = harness();
  const item = withdrawal();
  const result = context.applyNowpaymentsPayoutStatus(item, {
    payload: { payouts: [providerRecord({ address: "ltc1qattacker" })] }
  });

  assert.equal(result.validation.ok, false);
  assert.equal(result.validation.reason, "payout_address_mismatch");
  assert.equal(result.terminal, false);
  assert.equal(item.status, "manual_review");
  assert.equal(item.requiresManualReview, true);
});
