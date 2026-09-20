import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionSource(name, code = source) {
  const start = code.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} must exist`);
  const next = code.slice(start + 1).search(/\n(?:async )?function [a-zA-Z]/);
  return code.slice(start, next < 0 ? code.length : start + 1 + next);
}

function settlementHarness() {
  const store = { id: "shop-1", name: "Test shop", ownerLogin: "seller", commissionPercent: 10 };
  const context = {
    Date,
    console,
    adminOrderAmount: (order) => Number(order.amountUsd || 0),
    roundLtc: (value) => Math.max(0, Number(Number(value || 0).toFixed(8))),
    storeCommissionPercentForOrder: (item) => Number(item?.commissionPercent || 0),
    applyProductOrderCommission: (order, _state, item) => {
      order.platformCommissionPercent = Number(item?.commissionPercent || 0);
      order.platformCommissionUsd = Number(order.amountUsd || 0) * order.platformCommissionPercent / 100;
      order.sellerAmountUsd = Number(order.amountUsd || 0) - order.platformCommissionUsd;
      return order;
    },
    applyProductOrderLtcSettlement: (order) => {
      order.ltcSettlementVersion = 1;
      order.settlementGrossLtc = 1;
      order.platformCommissionLtc = 0.1;
      order.sellerAmountLtc = 0.9;
      order.ltcUsdRateAtPayment = 100;
      return order;
    },
    lifecycleStoreForOrder: async () => store,
    settleProductReferralReward: async () => {},
    restoreExpiredProductReservation: async () => false,
    pushSiteNotification: () => {},
    loginKey: (login) => String(login || "").toLowerCase()
  };
  const names = [
    "adminIsPaidProductOrder", "adminIsWithdrawableStoreOrder", "adminIsHeldPaidProductOrder", "storeOrderHeldForPayout", "storeLedgerHoldReason",
    "recordProductOrderLedger", "ensureProductOrderSettlement", "normalizeServerOrders"
  ];
  vm.runInNewContext(names.map((name) => functionSource(name)).join("\n"), context);
  const order = {
    id: "order-test-1",
    type: "product",
    login: "buyer",
    storeId: store.id,
    product: "Test product",
    amountUsd: 100,
    paymentStatus: "paid",
    status: "active",
    paidAt: Date.now(),
    autoReleaseHours: 24,
    autoReleaseAt: Date.now() + 24 * 60 * 60 * 1000
  };
  const state = {
    orders: [order],
    walletTransactions: [],
    storeBalancesUsd: {},
    storeBalancesLtc: {},
    ownerBalanceUsd: 0,
    ownerBalanceLtc: 0,
    referralPayments: [],
    referrals: [],
    ownerSettings: { defaultAutoReleaseHours: 24 }
  };
  return { context, order, state, store };
}

test("paid active sale is recorded as held and cannot be withdrawn before completion", async () => {
  const { context, order, state, store } = settlementHarness();
  context.recordProductOrderLedger(order, state, store);
  const storeTx = state.walletTransactions.find((tx) => tx.id === `tx-store-sale-${order.id}`);
  const ownerTx = state.walletTransactions.find((tx) => tx.id === `tx-owner-commission-${order.id}`);

  assert.equal(storeTx?.status, "held");
  assert.equal(storeTx?.amountLtc, 0.9);
  assert.equal(ownerTx?.amountLtc, 0.1);
  assert.equal(state.storeBalancesLtc[store.id] || 0, 0);
  assert.equal(context.adminIsWithdrawableStoreOrder(order), false);
  assert.equal(await context.ensureProductOrderSettlement(state, order, store), false);
});

test("unpaid order never creates a sale ledger or withdrawable balance", async () => {
  const { context, order, state, store } = settlementHarness();
  order.paymentStatus = "waiting";
  order.status = "pending_payment";
  context.recordProductOrderLedger(order, state, store);

  assert.equal(state.walletTransactions.length, 0);
  assert.equal(state.ownerBalanceLtc, 0);
  assert.equal(state.storeBalancesLtc[store.id] || 0, 0);
  assert.equal(await context.ensureProductOrderSettlement(state, order, store), false);
});

test("store panel finance shows a paid active sale as held, then as earned", () => {
  const { context, order, state, store } = settlementHarness();
  context.recordProductOrderLedger(order, state, store);
  context.cachedLitecoinUsdRate = () => 100;
  context.orderLtcBreakdown = () => ({ grossLtc: 1, commissionLtc: 0.1, sellerLtc: 0.9 });
  vm.runInNewContext(functionSource("storeLedgerFinance"), context);

  const held = context.storeLedgerFinance(state, store, [order]);
  assert.equal(held.rows.length, 1);
  assert.equal(held.rows[0].status, "held");
  assert.equal(held.heldLtc, 0.9);
  assert.equal(held.netLtc, 0);

  order.status = "completed";
  const earned = context.storeLedgerFinance(state, store, [order]);
  assert.equal(earned.rows[0].status, "completed");
  assert.equal(earned.heldLtc, 0);
  assert.equal(earned.netLtc, 0.9);
});

test("a ledger entry with no authoritative order stays on review, not withdrawable", () => {
  const { context, order, state, store } = settlementHarness();
  context.recordProductOrderLedger(order, state, store);
  const tx = state.walletTransactions.find((item) => item.id === `tx-store-sale-${order.id}`);
  tx.status = "completed";
  tx.held = false;
  context.cachedLitecoinUsdRate = () => 100;
  context.orderLtcBreakdown = () => ({ grossLtc: 1, commissionLtc: 0.1, sellerLtc: 0.9 });
  vm.runInNewContext(functionSource("storeLedgerFinance"), context);

  const finance = context.storeLedgerFinance(state, store, []);
  assert.equal(finance.netLtc, 0);
  assert.equal(finance.reviewHeldLtc, 0.9);
  assert.equal(finance.rows[0].holdReason, "review");
});

test("a paid sale sent to manual review cannot become withdrawable from an earlier ledger entry", () => {
  const { context, order, state, store } = settlementHarness();
  context.recordProductOrderLedger(order, state, store);
  context.cachedLitecoinUsdRate = () => 100;
  context.orderLtcBreakdown = () => ({ grossLtc: 1, commissionLtc: 0.1, sellerLtc: 0.9 });
  vm.runInNewContext(functionSource("storeLedgerFinance"), context);

  order.status = "manual_review";
  order.paymentStatus = "review";
  const finance = context.storeLedgerFinance(state, store, [order]);
  assert.equal(context.adminIsWithdrawableStoreOrder(order), false);
  assert.equal(finance.rows.length, 1);
  assert.equal(finance.rows[0].status, "held");
  assert.equal(finance.netLtc, 0);
  assert.equal(finance.heldLtc, 0.9);
});

test("completed paid sale releases the seller share exactly once", async () => {
  const { context, order, state, store } = settlementHarness();
  context.recordProductOrderLedger(order, state, store);
  order.status = "completed";

  assert.equal(await context.ensureProductOrderSettlement(state, order, store), true);
  assert.ok(order.storeBalanceReleasedAt);
  assert.equal(state.walletTransactions.find((tx) => tx.id === `tx-store-sale-${order.id}`)?.status, "completed");
  assert.equal(state.storeBalancesLtc[store.id], 0.9);
  assert.equal(state.ownerBalanceLtc, 0.1);

  assert.equal(await context.ensureProductOrderSettlement(state, order, store), false);
  assert.equal(state.storeBalancesLtc[store.id], 0.9);
  assert.equal(state.ownerBalanceLtc, 0.1);
});

test("automatic completion retains the release marker and cannot credit the store twice", async () => {
  const { context, order, state, store } = settlementHarness();
  context.recordProductOrderLedger(order, state, store);
  order.autoReleaseAt = Date.now() - 1000;

  assert.equal(await context.normalizeServerOrders(state), true);
  assert.equal(state.orders[0].status, "completed");
  assert.ok(state.orders[0].storeBalanceReleasedAt);
  assert.equal(state.storeBalancesLtc[store.id], 0.9);

  assert.equal(await context.ensureProductOrderSettlement(state, state.orders[0], store), false);
  assert.equal(state.storeBalancesLtc[store.id], 0.9);
});

test("owner overview separates paid active earnings from completed withdrawable earnings", () => {
  const { order, store } = settlementHarness();
  const context = {
    Date,
    mainLtcWallet: "",
    hydrateOrdersDisputeHistory: (orders) => orders,
    cachedLitecoinUsdRate: () => 100,
    orderLtcBreakdown: () => ({ grossLtc: 1, commissionLtc: 0.1, sellerLtc: 0.9 }),
    roundLtc: (value) => Number(Number(value || 0).toFixed(8)),
    activeWithdrawalLtc: () => 0,
    orderHasDisputeHistory: () => false,
    requestHasDisputeHistory: () => false,
    loginKey: (value) => String(value || "").toLowerCase(),
    adminPeriods: () => [],
    adminOrderAmount: (item) => Number(item.amountUsd || 0),
    adminStorePanelLinks: () => ({}),
    adminCollectMirrorBots: () => [],
    adminLtcBalanceChart: () => [],
    adminBucketCharts: () => [],
    adminTimestamp: (item) => Number(item.createdAt || 0),
    adminOrderForState: (item) => item,
    adminDepositForState: (item) => item,
    storeAdminWithdrawalForState: (item) => item,
    adminExchangersForState: () => [],
    normalizeSupportSettings: (item) => item,
    adminMoney: (value) => Number(value || 0)
  };
  vm.runInNewContext([
    "adminIsPaidProductOrder", "adminIsWithdrawableStoreOrder",
    "adminIsHeldPaidProductOrder", "adminBuildOverview"
  ].map((name) => functionSource(name)).join("\n"), context);
  const paidActive = { ...order, id: "paid-active" };
  const unpaid = { ...order, id: "unpaid", status: "pending_payment", paymentStatus: "waiting" };
  const completed = { ...order, id: "completed", status: "completed" };
  const overview = context.adminBuildOverview({
    state: {
      orders: [paidActive, unpaid, completed],
      walletTransactions: [],
      walletWithdrawals: [],
      walletDeposits: [],
      referrals: [],
      referralPayments: [],
      ownerSettings: {}
    },
    stores: [store],
    profiles: [],
    sessions: [],
    messages: []
  });

  assert.equal(overview.stats.pendingPaidDeals, 1);
  assert.equal(overview.stats.pendingCommissionLtc, 0.1);
  assert.equal(overview.stats.pendingStoresNetLtc, 0.9);
  assert.equal(overview.stats.totalCommissionLtc, 0.1);
  assert.equal(overview.stats.ownerWithdrawableLtc, 0.1);
  assert.equal(overview.stats.storesWithdrawableLtc, 0.9);
  assert.equal(overview.stats.totalSales, 1);
});

test("store admin unwraps a Supabase data row and includes its completed sales in finance", async () => {
  const store = {
    id: "shop-1",
    name: "Test shop",
    ownerLogin: "seller",
    commissionPercent: 10,
    productOrders: [{
      id: "order-embedded",
      type: "product",
      storeId: "shop-1",
      login: "buyer",
      product: "Test product",
      amountUsd: 100,
      paymentStatus: "paid",
      status: "completed",
      paidAt: Date.now()
    }]
  };
  const state = {
    orders: [], ownerStores: [], publicStoresCache: [], walletTransactions: [], walletWithdrawals: []
  };
  const context = {
    console,
    supabase: {
      from(table) {
        if (table === "messages") return {
          select: () => ({
            order: () => ({ limit: async () => ({ data: [] }) }),
            like: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) })
          })
        };
        if (table === "stores") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: store } }) }) })
        };
        throw new Error(`Unexpected table: ${table}`);
      }
    },
    withTimeout: (value) => value,
    loadSettingsState: async () => state,
    stateHasDurableContent: () => true,
    sanitizeStateForVisualReset: (value) => value,
    sanitizeStoresForVisualReset: (value) => value,
    mergeStoreSources: () => [],
    isMarketplaceRecordAfterVisualReset: () => true,
    sanitizeMessagesForVisualReset: (value) => value,
    storeSaleLedgerOrderFromMessage: () => null,
    recoverMissingProductOrdersFromDisputeMessages: () => [],
    hydrateOrdersDisputeHistory: (orders) => orders,
    loadLitecoinUsdRate: async () => ({ rate: 100 }),
    cachedLitecoinUsdRate: () => 100,
    orderLtcBreakdown: () => ({ grossLtc: 1, commissionLtc: 0.1, sellerLtc: 0.9 }),
    roundLtc: (value) => Number(Number(value || 0).toFixed(8)),
    adminOrderAmount: (order) => Number(order.amountUsd || 0),
    adminPlatformCommission: (order) => Number(order.amountUsd || 0) * 0.1,
    adminStoreNetAmount: (order) => Number(order.amountUsd || 0) * 0.9,
    activeWithdrawalLtc: () => 0,
    adminLtcBalanceChart: () => [],
    withdrawalConsumesBalance: () => false,
    withdrawalAmountLtc: () => 0,
    storeForAdminState: (value) => ({ ...value }),
    sellerTokenCanAccess: () => true,
    storeAdminWithdrawalForState: (value) => value,
    loadStoreAuditLogs: async () => [],
    orderHasDisputeHistory: () => false
  };
  vm.runInNewContext([
    "adminIsPaidProductOrder", "adminIsWithdrawableStoreOrder", "adminIsHeldPaidProductOrder",
    "storeOrderHeldForPayout", "storeLedgerHoldReason", "storeLedgerFinance", "stateForStoreAdmin"
  ].map((name) => functionSource(name)).join("\n"), context);

  const payload = await context.stateForStoreAdmin(store.id, { role: "owner" });
  assert.equal(payload.store?.id, store.id);
  assert.equal(payload.store?.productOrders?.length, 1);
  assert.equal(payload.store?.storeFinanceRows?.length, 1);
  assert.equal(payload.store?.storeBalanceLtc, 0.9);
  assert.equal(payload.store?.storeAvailableBalanceLtc, 0.9);
});

test("production completion never marks an order completed when authentication is absent or rejected", async () => {
  const order = { id: "order-test", type: "product", status: "active", paymentStatus: "paid" };
  const toasts = [];
  let apiCalls = 0;
  let localSaves = 0;
  let remoteApplies = 0;
  const context = {
    db: { orders: [order] },
    API_ENABLED: true,
    orderCanComplete: () => true,
    ensureApiSession: async () => false,
    apiFetch: async () => { apiCalls += 1; throw new Error("Session expired"); },
    applyRemoteState: () => { remoteApplies += 1; },
    showProductReviewModal: () => {},
    showToast: (message) => { toasts.push(message); },
    saveDb: () => { localSaves += 1; }
  };
  vm.runInNewContext(functionSource("completeProductOrderByClient", appSource), context);

  await context.completeProductOrderByClient(order.id);
  assert.equal(apiCalls, 0);
  assert.equal(order.status, "active");
  assert.equal(localSaves, 0);
  assert.equal(remoteApplies, 0);

  context.ensureApiSession = async () => true;
  await context.completeProductOrderByClient(order.id);
  assert.equal(apiCalls, 1);
  assert.equal(order.status, "active");
  assert.equal(localSaves, 0);
  assert.equal(remoteApplies, 0);
  assert.equal(toasts.length, 2);
});

test("durable finance merge preserves an open dispute over auto-completion until explicitly closed", () => {
  const context = { isProductOrderRecord: (record) => record.type === "product" };
  vm.runInNewContext([
    "durableFinanceRecordRank", "durableFinanceRecordTimestamp", "mergeDurableFinanceRecords"
  ].map((name) => functionSource(name)).join("\n"), context);
  const base = { id: "order-race", type: "product", paymentStatus: "paid", createdAt: 100 };
  const disputed = { ...base, status: "dispute", disputeOpen: true, updatedAt: 200 };
  const autoCompleted = { ...base, status: "completed", disputeOpen: false, completedAt: 300 };
  const explicitClose = {
    ...base, status: "completed", disputeOpen: false, disputeChatClosed: true,
    disputeClosedAt: 400, completedAt: 400, updatedAt: 400
  };

  const keptDispute = context.mergeDurableFinanceRecords([disputed], [autoCompleted])[0];
  assert.equal(keptDispute.status, "dispute");
  assert.equal(keptDispute.disputeOpen, true);

  const reopened = context.mergeDurableFinanceRecords([autoCompleted], [disputed])[0];
  assert.equal(reopened.status, "dispute");
  assert.equal(reopened.disputeOpen, true);

  const closed = context.mergeDurableFinanceRecords([disputed], [explicitClose])[0];
  assert.equal(closed.status, "completed");
  assert.equal(closed.disputeOpen, false);
  assert.equal(closed.disputeChatClosed, true);
});

test("production browser never auto-completes or expires a product order locally", () => {
  const now = Date.now();
  const active = {
    id: "active-order", type: "product", status: "active", paymentStatus: "paid",
    createdAt: now - 2 * 24 * 60 * 60 * 1000, autoReleaseAt: now - 1000
  };
  const pending = {
    id: "pending-order", type: "product", status: "pending_payment", paymentStatus: "waiting",
    createdAt: now - 60 * 60 * 1000, paymentExpiresAt: now - 1000
  };
  const context = { API_ENABLED: true, Date };
  vm.runInNewContext(functionSource("normalizeOrders", appSource), context);
  const state = { orders: [active, pending], exchangeRequests: [] };
  context.normalizeOrders(state);
  assert.equal(state.orders[0], active);
  assert.equal(state.orders[1], pending);
  assert.equal(state.orders[0].status, "active");
  assert.equal(state.orders[1].status, "pending_payment");
});

test("production browser cannot pretend to pay an existing crypto invoice from local balance", () => {
  const order = { id: "invoice-order", status: "pending_payment", paymentStatus: "waiting", amountUsd: 100 };
  const context = {
    API_ENABLED: true,
    db: { currentUser: "buyer", orders: [order], balances: { buyer: 200 }, ltcBalances: { buyer: 2 } },
    showToast: () => {},
    saveDb: () => { throw new Error("must not save a local payment"); },
    markProductOrderPaid: () => { throw new Error("must not mark a local payment paid"); }
  };
  vm.runInNewContext(functionSource("payProductOrderFromBalance", appSource), context);
  context.payProductOrderFromBalance(order.id);
  assert.equal(order.status, "pending_payment");
  assert.equal(order.paymentStatus, "waiting");
  assert.equal(context.db.balances.buyer, 200);
  assert.equal(context.db.ltcBalances.buyer, 2);
});
