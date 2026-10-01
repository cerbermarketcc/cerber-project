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

test("customer catalog exposes live category, city and package controls without forcing a product", () => {
  const catalog = functionBody(appClient, "renderProductsCatalog");
  const routeTo = functionBody(appClient, "routeTo");
  const renderCurrent = functionBody(appClient, "renderCurrent");
  assert.match(appClient, /district: "",\s*weight: "",\s*category: "Все товары"/);
  assert.match(catalog, /data-catalog-category/);
  assert.match(catalog, /data-catalog-city/);
  assert.match(catalog, /data-catalog-weight/);
  assert.match(catalog, /country: "", city: "", district: "", weight: ""/);
  assert.doesNotMatch(catalog, /Показаны лучшие варианты в других районах/);
  assert.doesNotMatch(routeTo, /Альфа \(A-PVP\)|chisinau|Центр/);
  assert.doesNotMatch(renderCurrent, /Альфа \(A-PVP\).*chisinau.*Центр/s);
});

test("product purchase picker cascades only through in-stock positions and preserves exact offers", () => {
  const selectorHarness = new Function(`
    const filterOptions = { countries: { moldova: { cities: {
      orhei: { label: "Орхей" }, chisinau: { label: "Кишинёв" }
    } } } };
    let activeProductMode = "any";
    let activeProductCityKey = "";
    let activeProductWeightKey = "";
    let activeProductDistrictKey = "";
    ${functionBody(appClient, "normalizedShopKey")}
    ${functionBody(appClient, "normalizedWeightKey")}
    ${functionBody(appClient, "enabledProductPositions")}
    ${functionBody(appClient, "positionSaleMode")}
    ${functionBody(appClient, "positionCityKey")}
    ${functionBody(appClient, "positionCityName")}
    ${functionBody(appClient, "customerWeightLabel")}
    ${functionBody(appClient, "customerDistrictKey")}
    ${functionBody(appClient, "customerDistrictLabel")}
    ${functionBody(appClient, "customerWeightKey")}
    ${functionBody(appClient, "productPurchaseSelection")}
    return {
      select: productPurchaseSelection,
      chooseDistrict(value) { activeProductDistrictKey = value; }
    };
  `)();
  const product = {
    priceUsd: 20,
    positions: [
      { id: "buried", country: "moldova", city: "orhei", district: "Центр", weight: "0.6", deliveryType: "Закоп", priceUsd: 20, stock: 2, status: "ready" },
      { id: "courier", country: "moldova", city: "orhei", district: "Центр", weight: "0.6 g", deliveryType: "Курьер", priceUsd: 22, stock: 1, status: "ready" },
      { id: "sold-out", country: "moldova", city: "chisinau", district: "Ботаника", weight: "0.3", priceUsd: 18, stock: 0, status: "ready" },
      { id: "disabled", country: "moldova", city: "chisinau", district: "Центр", weight: "1", priceUsd: 30, stock: 4, status: "disabled" }
    ]
  };
  const initial = selectorHarness.select(product);
  assert.deepEqual(initial.cities.map((item) => item.label), ["Орхей"]);
  assert.deepEqual(initial.weights.map((item) => item.key), ["0.6"]);
  assert.equal(initial.districts.length, 1);
  assert.equal(initial.districts[0].positions.length, 2);
  assert.equal(initial.selectedPositions.length, 0);
  selectorHarness.chooseDistrict(initial.districts[0].key);
  const selected = selectorHarness.select(product);
  assert.deepEqual(selected.selectedPositions.map((item) => item.id).sort(), ["buried", "courier"]);
  const offer = functionBody(appClient, "productPurchaseOfferView");
  assert.match(offer, /data-buy-position="\$\{esc\(position\.id\)\}"/);
  assert.match(offer, /Number\(position\.priceUsd \|\| 0\)/);
  assert.doesNotMatch(offer, /product\.priceUsd/);
});

test("product pages show review totals and only position-level prices", () => {
  const renderProduct = functionBody(appClient, "renderProductView");
  const cardFacts = functionBody(appClient, "productCardFacts");
  const cards = functionBody(appClient, "shopCardsTab");
  const products = functionBody(appClient, "shopProductsTab");
  const shopActions = functionBody(appClient, "bindShopPanelActions");
  const ratingSummary = new Function("db", `${functionBody(appClient, "ratingSummaryText")}\nreturn ratingSummaryText;`);

  assert.equal(ratingSummary({ lang: "ru" })(5, 1), "5.00 из 5.00 (1)");
  assert.equal(ratingSummary({ lang: "md" })(4.5, 12), "4.50 din 5.00 (12)");
  assert.equal(ratingSummary({ lang: "en" })(4, 3), "4.00 out of 5.00 (3)");
  assert.match(renderProduct, /ratingSummaryText\(product\.rating \|\| 5, productReviewCount\)/);
  assert.doesNotMatch(renderProduct, /<p class="price">|Number\(product\.priceUsd/);
  assert.match(cardFacts, /Number\(position\.priceUsd \|\| 0\)/);
  assert.doesNotMatch(cardFacts, /product\.priceUsd/);

  assert.doesNotMatch(cards, /name="priceUsd"/);
  assert.match(products, /Цена товара, USD<input name="priceUsd"[^>]+required/);
  assert.match(shopActions, /const priceUsd = Number\(data\.get\("priceUsd"\) \|\| 0\)/);
  assert.match(shopActions, /priceUsd <= 0\) throw new Error\("Укажите цену товара"\)/);
  assert.match(shopActions, /Math\.abs\(Number\(position\.priceUsd \|\| 0\) - priceUsd\)/);
  assert.match(shopActions, /priceUsd,\s*weight:/);
});

test("personal LTC address modal loads a server-generated QR without an amount", () => {
  const details = functionBody(appClient, "showWalletDepositDetails");
  const loaderStart = appClient.indexOf("async function loadPermanentWalletQr");
  const loaderEnd = appClient.indexOf("\nfunction showWalletDepositDetails", loaderStart);
  const loader = appClient.slice(loaderStart, loaderEnd);
  assert.match(details, /data-wallet-deposit-qr=/);
  assert.match(details, /любую сумму в кошельке/);
  assert.match(details, /loadPermanentWalletQr\(deposit\.id\)/);
  assert.match(loader, /\/api\/wallet\/deposits\/\$\{encodeURIComponent\(depositId\)\}\/qr/);
  assert.match(loader, /safeContentUrl\(payload\.qrCodeDataUrl\)/);
});

test("product checkout requires the number of persons and shows it in order details", () => {
  const checkout = functionBody(appClient, "openProductCheckoutModal");
  const personsReader = functionBody(appClient, "checkoutPersonsCount");
  const orderDetails = functionBody(appClient, "showProductOrder");
  const sellerHistory = functionBody(appClient, "shopSaleHistoryList");
  assert.match(checkout, /data-checkout-persons[^>]+name="personsCount"[^>]+min="1"[^>]+max="100"[^>]+required/);
  assert.equal((checkout.match(/JSON\.stringify\(\{ storeId, productId, positionId, personsCount/g) || []).length, 2);
  assert.match(personsReader, /Number\.isInteger\(personsCount\)/);
  assert.match(personsReader, /personsCount < 1 \|\| personsCount > 100/);
  assert.match(orderDetails, /Количество персон:/);
  assert.match(sellerHistory, /<span>Персон<\/span>/);
  assert.match(orderDetails, /Заказ зарегистрирован в розыгрыше от 500 ₽/);
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

test("shop staff can add inventory but cannot modify or delete existing data", () => {
  const cardsRoute = routeBody("put", "/api/store-admin/products");
  const positionsRoute = routeBody("put", "/api/store-admin/products/:productId/positions");
  const previewRoute = routeBody("post", "/api/store-admin/inventory/preview");
  assert.match(cardsRoute, /staffProductAdditions/);
  assert.match(cardsRoute, /store_staff_mutation_rejected/);
  assert.match(cardsRoute, /может только добавлять новые карточки/);
  assert.match(positionsRoute, /staffPositionAdditions/);
  assert.match(positionsRoute, /additionalDeliveryItems/);
  assert.match(positionsRoute, /Изменение и удаление существующих товаров запрещены/);
  assert.match(previewRoute, /sellerDeliveryDuplicateReport/);
  assert.match(appClient, /is-staff-panel/);
  assert.match(styles, /\.is-staff-panel \[data-shop-position-delete\]/);
});

test("shop inventory keeps delimiters, supports custom districts and renders a duplicate preview", () => {
  const storage = functionBody(appClient, "shopStorageTab");
  const products = functionBody(appClient, "shopProductsTab");
  const settings = functionBody(appClient, "shopSettingsTab");
  assert.match(storage, /join\(position\.delimiter \|\| "\\n"\)/);
  assert.match(storage, /<strong>Открыть<\/strong>/);
  assert.doesNotMatch(storage, /name="status"/);
  assert.match(products, /data-shop-delivery-preview/);
  assert.match(appClient, /function shopDistrictField/);
  assert.match(appClient, /Введите свой район или выберите из списка/);
  assert.match(appClient, /function bindShopDeliveryPreview/);
  assert.doesNotMatch(settings, /autoReleaseHours/);
  assert.match(settings, /data-shop-wallet-form/);
  assert.match(settings, /data-shop-password-form/);
});

test("shop admin exposes employee logs and hides store and product availability statuses", () => {
  const cards = functionBody(appClient, "shopCardsTab");
  const shell = functionBody(appClient, "sellerDashboardShell");
  const logs = functionBody(appClient, "shopActivityLogsTab");
  assert.match(appClient, /\["logs", "L", "Логи"\]/);
  assert.match(logs, /store_staff_cards_added/);
  assert.match(logs, /store_staff_inventory_added/);
  assert.match(server, /loadStoreAuditLogs\(id, 500\)/);
  assert.doesNotMatch(cards, /name="status"|>active<|>disabled<|product\.status/);
  assert.doesNotMatch(shell, /storeStatusLabel\(store\)/);
  assert.doesNotMatch(appClient, /product\.status = String\(data\.get\("status"\)/);
});

test("home content has no empty brand spacer between mirrors and the store list", () => {
  assert.doesNotMatch(appClient, /market-brand-spacer/);
  assert.doesNotMatch(styles, /market-brand-spacer/);
});

test("official mirrors promote the courier school with a safe Telegram link", () => {
  const mirrors = functionBody(appClient, "officialMirrorsView");
  assert.match(mirrors, /Школа Курьеров от Cerber/);
  assert.match(mirrors, /href="https:\/\/t\.me\/HRcerber"/);
  assert.match(mirrors, /target="_blank" rel="noopener noreferrer"/);
  assert.match(mirrors, />HRCerber<\/a>/);
  assert.match(styles, /\.courier-school-promo\s*\{[\s\S]{0,260}grid-column: 1 \/ -1/);
});

test("mobile product cards show complete three-by-four artwork", () => {
  assert.match(styles, /grid-template-columns: clamp\(118px, 40vw, 154px\) minmax\(0, 1fr\)/);
  assert.match(styles, /aspect-ratio: 3 \/ 4;[\s\S]{0,220}object-fit: cover;/);
  assert.match(styles, /\.mega-product-card \.product-body h3[\s\S]{0,260}-webkit-line-clamp: 2/);
});

test("top stores title uses a periodic breathing Cerberus instead of fire", () => {
  const title = functionBody(appClient, "topTitleView");
  assert.doesNotMatch(appClient, /storesTop: "[^"]*🔥/);
  assert.doesNotMatch(title, /🔥|top-fire-sticker/);
  assert.match(title, /topCerberusView\(\)/);
  assert.match(appClient, /class="top-cerberus"/);
  assert.match(styles, /animation: topCerberusBarkMouth 4\.2s [^;]+ infinite both;/);
  assert.match(appClient, /top-cerberus-steam-left/);
  assert.match(styles, /animation: topCerberusSteamLeft 4\.2s ease-out infinite/);
  assert.match(styles, /@media \(max-width: 360px\)[\s\S]{0,180}\.top-cerberus/);
  assert.doesNotMatch(styles, /topFireFlicker|fireSpark|top-fire-sticker/);
});

test("SOL and USDT Solana payment models remain available", () => {
  for (const source of [appClient, server]) {
    assert.match(source, /id: "usdt_sol", payCurrency: "usdtsol"/);
    assert.match(source, /id: "sol", payCurrency: "sol"/);
  }
  assert.match(indexHtml, /styles\.css\?v=118/);
  assert.match(indexHtml, /app\.js\?v=185/);
});

test("public bootstrap keeps assets light and avoids duplicate state requests", () => {
  const bootstrap = functionBody(appClient, "initApp");
  assert.doesNotMatch(indexHtml, /challenges\.cloudflare\.com\/turnstile/);
  assert.match(bootstrap, /loadInitialRemoteState\(\)/);
  assert.doesNotMatch(bootstrap, /apiSessionToken\(\)\s*\?\s*loadRemoteSession\(\)\s*:\s*loadRemoteState\(\)/);
  assert.match(appClient, /assets\/cerber-neon-emblem-fast\.webp/);
  assert.match(appClient, /assets\/user-avatar-fast\.webp/);
  assert.doesNotMatch(appClient, /src="assets\/cerber-neon-emblem\.png"/);
  assert.doesNotMatch(appClient, /src="assets\/user-avatar\.png"/);
  assert.match(server, /public, max-age=31536000, immutable/);
  assert.match(routeBody("get", "/api/state"), /loadPublicCatalogSnapshot\(\)/);
});

test("chat messages render optimistically with server-side duplicate protection", () => {
  assert.match(appClient, /newClientRequestId\("private-message"\)/);
  assert.match(appClient, /newClientRequestId\("group-message"\)/);
  assert.match(appClient, /pendingSend: true/);
  assert.match(server, /function clientMessageIdentity/);
  assert.match(routeBody("post", "/api/group/messages"), /clientMessageIdentity\("group"/);
  assert.match(routeBody("post", "/api/private-messages"), /clientMessageIdentity\("private"/);
});
