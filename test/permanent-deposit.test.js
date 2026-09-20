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

function harness() {
  const saved = [];
  const notices = [];
  const address = {
    id: "wallet-address-alice-ltc",
    kind: "permanent_address",
    status: "active",
    login: "alice",
    seedPaymentId: "seed-1",
    payAddress: "Lalice",
    payCurrency: "ltc",
    coinId: "ltc"
  };
  const state = {
    walletDeposits: [address],
    walletTransactions: [],
    ltcBalances: { alice: 0 }
  };
  const context = {
    Date,
    Number,
    String,
    loginKey: (value) => String(value).toLowerCase(),
    roundLtc: (value) => Number(Number(value).toFixed(8)),
    loadLitecoinUsdRate: async () => ({ rate: 100 }),
    stateUserLtcBalance: (item, login) => Number(item.ltcBalances?.[login] || 0),
    setStateUserLtcBalance: (item, login, value) => {
      item.ltcBalances[login] = value;
      return value;
    },
    reconcileUserLtcBalanceFromLedger: (item, login) => {
      const balance = item.walletTransactions
        .filter((tx) => tx.login === login && tx.type === "deposit" && tx.status === "completed")
        .reduce((sum, tx) => sum + Number(tx.amountLtc || 0), 0);
      item.ltcBalances[login] = balance;
      return balance;
    },
    applyReferralReward: () => null,
    saveSettingsState: async (item) => { saved.push(item); },
    notifyRealtime: () => {},
    notifySiteUser: async (item, login, notice) => { notices.push({ login, notice }); }
  };
  vm.runInNewContext([
    "permanentWalletAddresses", "permanentWalletAddressForPayment", "completePermanentWalletPayment"
  ].map(functionSource).join("\n"), context);
  const payment = (paymentId, actuallyPaid, extra = {}) => ({
    payment_id: paymentId,
    parent_payment_id: "seed-1",
    pay_address: "Lalice",
    pay_currency: "ltc",
    payment_status: "finished",
    actually_paid: actuallyPaid,
    pay_amount: 10,
    ...extra
  });
  return { context, state, address, saved, notices, payment };
}

test("different confirmed payment IDs credit their actual amounts to one permanent LTC address", async () => {
  const { context, state, address, payment, notices } = harness();
  const first = await context.completePermanentWalletPayment(state, payment("seed-1", 0.01));
  const second = await context.completePermanentWalletPayment(state, payment("extra-2", 0.025));

  assert.equal(first.credited, true);
  assert.equal(second.credited, true);
  assert.equal(state.ltcBalances.alice, 0.035);
  assert.equal(state.walletTransactions.length, 2);
  assert.equal(state.walletDeposits.filter((item) => item.kind === "permanent_credit").length, 2);
  assert.ok(state.walletDeposits.filter((item) => item.kind === "permanent_credit").every((item) => item.addressId === address.id));
  assert.deepEqual(state.walletTransactions.map((item) => item.amountLtc), [0.025, 0.01]);
  assert.equal(state.walletDeposits.find((item) => item.paymentId === "extra-2").amountUsd, 2.5);
  assert.equal(notices.length, 2);
});

test("replaying a payment ID does not create a second ledger credit or notification", async () => {
  const { context, state, payment, notices } = harness();
  await context.completePermanentWalletPayment(state, payment("extra-1", 0.01));
  const replay = await context.completePermanentWalletPayment(state, payment("extra-1", 0.5));

  assert.equal(replay.credited, false);
  assert.equal(replay.duplicate, true);
  assert.equal(state.walletTransactions.length, 1);
  assert.equal(state.walletDeposits.filter((item) => item.kind === "permanent_credit").length, 1);
  assert.equal(state.ltcBalances.alice, 0.01);
  assert.equal(notices.length, 1);
});

test("address, currency, parent, and payment ID must identify the same permanent address", async () => {
  const { context, state, payment } = harness();
  const invalid = [
    payment("wrong-address", 0.01, { pay_address: "Lother" }),
    payment("wrong-coin", 0.01, { pay_currency: "btc" }),
    payment("wrong-parent", 0.01, { parent_payment_id: "seed-other" }),
    payment("wrong-order", 0.01, { order_id: "wallet-address-bob-ltc" }),
    payment("missing-id", 0.01, { payment_id: "" })
  ];
  for (const item of invalid) {
    const result = await context.completePermanentWalletPayment(state, item);
    assert.equal(result.credited, false);
    assert.equal(result.reason, "address_or_parent_mismatch");
  }
  assert.equal(state.walletTransactions.length, 0);
  assert.equal(state.ltcBalances.alice, 0);
});

test("pending payments and missing or zero actual paid amount never credit a balance", async () => {
  const { context, state, payment } = harness();
  const pending = await context.completePermanentWalletPayment(state, payment("pending", 0.01, { payment_status: "confirmed" }));
  const missing = await context.completePermanentWalletPayment(state, payment("missing", undefined));
  const zero = await context.completePermanentWalletPayment(state, payment("zero", 0));

  assert.equal(pending.credited, false);
  assert.equal(pending.reason, "status_confirmed");
  assert.equal(missing.reason, "paid_amount_missing");
  assert.equal(zero.reason, "paid_amount_missing");
  assert.equal(state.walletTransactions.length, 0);
  assert.equal(state.ltcBalances.alice, 0);
});

test("a payment ID already assigned to another deposit cannot be credited again", async () => {
  const { context, state, payment } = harness();
  state.walletDeposits.push({ kind: "permanent_credit", addressId: "wallet-address-bob-ltc", paymentId: "taken" });
  const result = await context.completePermanentWalletPayment(state, payment("taken", 0.01));

  assert.equal(result.credited, false);
  assert.equal(result.reason, "payment_id_already_assigned");
  assert.equal(state.walletTransactions.length, 0);
  assert.equal(state.ltcBalances.alice, 0);
});

test("a legacy product order blocks reuse of its payment ID or pay-in address", async () => {
  const conflicts = [
    { paymentId: "taken" },
    { payAddress: "Lalice" },
    { walletDepositAddress: "Lalice" }
  ];
  for (const order of conflicts) {
    const { context, state, payment } = harness();
    state.orders = [{ id: "old-order", ...order }];
    const result = await context.completePermanentWalletPayment(state, payment("taken", 0.01));
    assert.equal(result.credited, false);
    assert.equal(result.reason, "address_or_parent_mismatch");
    assert.equal(state.walletTransactions.length, 0);
    assert.equal(state.ltcBalances.alice, 0);
  }
});

test("a legacy wallet deposit blocks reuse of its payment ID or pay-in address", async () => {
  const conflicts = [
    { paymentId: "taken" },
    { payAddress: "Lalice" }
  ];
  for (const deposit of conflicts) {
    const { context, state, payment } = harness();
    state.walletDeposits.push({ id: "legacy-deposit", kind: "wallet_deposit", ...deposit });
    const result = await context.completePermanentWalletPayment(state, payment("taken", 0.01));
    assert.equal(result.credited, false);
    assert.equal(result.reason, "address_or_parent_mismatch");
    assert.equal(state.walletTransactions.length, 0);
    assert.equal(state.ltcBalances.alice, 0);
  }
});

test("payment-list recovery resumes after two full pages and credits a later payment", async () => {
  const { context, state, address, payment, saved } = harness();
  address.createdAt = Date.now() - 60_000;
  context.URLSearchParams = URLSearchParams;
  context.nowpaymentsEmail = "merchant@example.test";
  context.nowpaymentsPassword = "test-only-password";
  context.permanentPaymentListLastScanAt = 0;
  context.nowpaymentsPayoutToken = async () => "test-token";
  const pages = [];
  const filler = Array.from({ length: 500 }, () => ({ payment_status: "waiting" }));
  context.nowpaymentsRequest = async (path) => {
    if (path.startsWith("payment/?")) {
      const page = Number(new URLSearchParams(path.slice("payment/?".length)).get("page"));
      pages.push(page);
      return { data: page === 2 ? [{ payment_id: "late-payment", payment_status: "finished", pay_address: "Lalice", pay_currency: "ltc" }] : filler, pagesCount: 3 };
    }
    assert.equal(path, "payment/late-payment");
    return payment("late-payment", 0.01, { order_id: address.id });
  };
  vm.runInNewContext(functionSource("scanPermanentWalletPayments"), context);

  const first = await context.scanPermanentWalletPayments(state);
  assert.equal(first.credited, 0);
  assert.equal(first.complete, false);
  assert.equal(state.permanentPaymentListScan.page, 2);
  assert.deepEqual(pages, [0, 1]);

  const second = await context.scanPermanentWalletPayments(state);
  assert.equal(second.credited, 1);
  assert.equal(second.complete, true);
  assert.equal(state.permanentPaymentListScan, undefined);
  assert.deepEqual(pages, [0, 1, 2]);
  assert.equal(state.ltcBalances.alice, 0.01);
  assert.equal(state.walletTransactions.length, 1);
  assert.ok(saved.length >= 2);
});
