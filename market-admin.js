const root = document.getElementById("admin-app");
const TOKEN_KEY = "cerber_market_admin_token";
const UI_STATE_KEY = "cerber_market_admin_ui_state";
const PRIMARY_API_ORIGIN = "https://cerber-project.onrender.com";
const LOCAL_API_HOSTS = ["127.0.0.1", "localhost"];
const IS_LOCAL_ADMIN_HOST = LOCAL_API_HOSTS.includes(location.hostname);
const API_ORIGIN = IS_LOCAL_ADMIN_HOST ? location.origin : PRIMARY_API_ORIGIN;
const API_ORIGINS = Array.from(new Set([API_ORIGIN, PRIMARY_API_ORIGIN].filter(Boolean)));
const coins = ["ltc", "eth", "trx", "usdt_trc20", "usdt_erc20", "usdt_sol", "sol"];
const nav = ["Dashboard", "Магазины", "Пользователи", "Сделки", "Диспуты", "Рассылки", "Финансы", "Настройки", "Разное", "Логи", "Health", "Боты"];
nav.splice(2, 0, "Обменники");
const supportTopics = [
  "Общие вопросы",
  "Ввод/вывод средств",
  "Настройка магазина",
  "Сотрудничество",
  "Восстановление доступа",
  "Добавление города/района",
  "Аукцион",
  "Сообщить о баге (предлагается вознаграждение)",
  "Открытие магазина"
];

let token = localStorage.getItem(TOKEN_KEY) || "";
let data = null;
let adminUiState = readAdminUiState();
let section = adminUiState.section || "Dashboard";
let query = adminUiState.query || "";
let selectedStoreId = adminUiState.selectedStoreId || "";
let selectedUserLogin = adminUiState.selectedUserLogin || "";
let selectedDisputeId = adminUiState.selectedDisputeId || "";
let realtimeSocket = null;
let refreshTimer = null;
let adminLastInteractionAt = 0;
let adminDetailRestoreNonce = 0;

function readAdminUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function persistAdminUiState() {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      section,
      query,
      selectedStoreId,
      selectedUserLogin,
      selectedDisputeId
    }));
  } catch {}
}

function adminIsEditing() {
  const element = document.activeElement;
  return Boolean(element && element.closest("form") && /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
}

function adminHasOpenDetail() {
  return Boolean(
    root.querySelector("[data-store-detail] form") ||
    root.querySelector("[data-user-detail] .user-profile") ||
    root.querySelector("[data-dispute-detail] button")
  );
}

function adminCanSilentRender() {
  if (adminIsEditing()) return false;
  if (adminHasOpenDetail()) return false;
  if (window.scrollY > 80) return false;
  if (Date.now() - adminLastInteractionAt < 30000) return false;
  return true;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function stableDisputeNumber(value = "") {
  const text = String(value || Date.now());
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return 100 + (hash % 900);
}

function disputeDisplayNumber(item = {}) {
  return Number(item.disputeNumber || item.disputeNo || stableDisputeNumber(item.disputeThreadId || item.id || item.exchangeRequestId || "dispute"));
}

function disputeDisplayLabel(item = {}) {
  return `#${disputeDisplayNumber(item)}`;
}

function loginKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function sameLogin(a, b) {
  return loginKey(a) === loginKey(b);
}

function disputeSearchText(item = {}) {
  const label = disputeDisplayLabel(item);
  return [label, label.replace("#", ""), item.id, item.login, item.fromLogin, item.storeName, item.storeId, item.toLogin, item.status].join(" ").toLowerCase();
}

function fmtMoney(value) {
  return `${Number(value || 0).toFixed(2)} $`;
}

function fmtDate(value) {
  const date = Number(value) ? new Date(Number(value)) : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ru-RU");
}

function statusClass(value) {
  return ["active", "completed", "paid", "finished", "ACTIVE"].includes(String(value)) ? "" : "off";
}

function toast(message, bad = false) {
  let box = document.querySelector(".admin-toast");
  if (!box) {
    box = document.createElement("div");
    box.className = "admin-toast";
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.toggle("bad", bad);
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 2800);
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

function imageElementFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function fileToDataUrl(file) {
  const original = String(await readFileDataUrl(file) || "");
  if (!file || !file.size || !String(file.type || "").startsWith("image/") || original.length < 1200000) return original;
  try {
    const image = await imageElementFromDataUrl(original);
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(image.width || maxSide, image.height || maxSide));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.width || maxSide) * scale));
    canvas.height = Math.max(1, Math.round((image.height || maxSide) * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL("image/jpeg", 0.82);
    return compressed && compressed.length < original.length ? compressed : original;
  } catch {
    return original;
  }
}

async function filesToSupportAttachments(input) {
  const files = Array.from(input?.files || []).filter((file) => file && file.size).slice(0, 8);
  return Promise.all(files.map(async (file) => ({
    name: file.name || "image",
    type: file.type || "image/png",
    url: await fileToDataUrl(file)
  })));
}

async function formImageValue(formData, fileName, fallbackName = "") {
  const file = formData.get(fileName);
  if (file && file.size) return fileToDataUrl(file);
  return String(formData.get(fallbackName || fileName) || "").trim();
}

async function api(path, options = {}) {
  if (/^https?:\/\//i.test(String(path || ""))) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "API error");
    return payload;
  }
  let lastError = null;
  for (const origin of API_ORIGINS) {
    try {
      const response = await fetch(`${origin}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {})
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "API error");
      return payload;
    } catch (error) {
      lastError = error;
      if (origin === PRIMARY_API_ORIGIN) break;
    }
  }
  throw lastError || new Error("API error");
}

async function refreshData(silent = false) {
  if (!token) return;
  try {
    data = await api("/api/admin/overview");
    if (!silent) renderShell();
    else if (adminCanSilentRender()) renderCurrentView({ preserveScroll: true });
  } catch (error) {
    if (!silent) renderLogin("Сессия истекла");
  }
}

function connectRealtime() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => refreshData(true), 6000);
  try {
    const api = new URL(API_ORIGIN);
    const protocol = api.protocol === "https:" ? "wss:" : "ws:";
    realtimeSocket?.close();
    realtimeSocket = new WebSocket(`${protocol}//${api.host}/api/admin/realtime?token=${encodeURIComponent(token)}`);
    realtimeSocket.onmessage = () => refreshData(true);
    realtimeSocket.onclose = () => setTimeout(connectRealtime, 5000);
  } catch {}
}

function renderLogin(message = "") {
  root.innerHTML = `
    <section class="login-page">
      <form class="login-card" data-login-form>
        <p class="eyebrow">CERBER MARKETPLACE</p>
        <h1>Административная панель</h1>
        <p class="muted">Управление магазинами, пользователями, финансами, диспутами и рассылками.</p>
        ${message ? `<p class="notice">${esc(message)}</p>` : ""}
        <label class="field">Логин<input name="login" value="admin" autocomplete="username" required></label>
        <label class="field">Пароль<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="primary">Войти</button>
      </form>
    </section>
  `;
  bindAdminButtonFeedback(root);
  root.querySelector("[data-login-form]").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ login: form.get("login"), password: form.get("password") })
      });
      token = payload.token;
      localStorage.setItem(TOKEN_KEY, token);
      await refreshData();
      connectRealtime();
    } catch (error) {
      renderLogin(error.message);
    }
  };
}

async function load() {
  await refreshData();
  connectRealtime();
}

function renderShell() {
  persistAdminUiState();
  root.innerHTML = `
    <section class="admin-shell">
      <aside class="sidebar">
        <div class="brand"><strong>CERBER Admin</strong><button class="ghost" data-logout>Выйти</button></div>
        <nav class="nav">
          ${nav.map((item) => `<button class="${section === item ? "active" : ""}" data-section="${esc(item)}">${esc(item)}<span>›</span></button>`).join("")}
        </nav>
      </aside>
      <section class="content">
        <div class="topline">
          <div><p class="eyebrow">Раздел</p><h1>${esc(section)}</h1></div>
          <input data-search placeholder="Поиск по всему" value="${esc(query)}">
        </div>
        <div data-view>${renderSection()}</div>
      </section>
    </section>
  `;
  root.querySelectorAll("[data-section]").forEach((button) => button.onclick = () => {
    section = button.dataset.section;
    selectedStoreId = "";
    selectedUserLogin = "";
    selectedDisputeId = "";
    persistAdminUiState();
    renderShell();
  });
  root.querySelector("[data-logout]").onclick = () => {
    localStorage.removeItem(TOKEN_KEY);
    token = "";
    realtimeSocket?.close();
    clearInterval(refreshTimer);
    renderLogin();
  };
  root.querySelector("[data-search]").oninput = (event) => {
    query = event.target.value.toLowerCase();
    persistAdminUiState();
    renderCurrentView({ preserveScroll: true });
  };
  restoreAdminDetailPanels();
  bindActions();
  bindAdminButtonFeedback(root);
  drawCharts();
}

function renderCurrentView({ preserveScroll = false } = {}) {
  const view = root.querySelector("[data-view]");
  if (!view) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  view.innerHTML = renderSection();
  restoreAdminDetailPanels();
  bindActions();
  bindAdminButtonFeedback(root);
  drawCharts();
  if (preserveScroll) requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
}

function restoreAdminDetailPanels() {
  if (!data) return;
  const storeDetailBox = root.querySelector("[data-store-detail]");
  if (storeDetailBox && selectedStoreId && data.stores?.some((store) => store.id === selectedStoreId)) {
    storeDetailBox.innerHTML = storeDetail(selectedStoreId);
  }
  const userDetailBox = root.querySelector("[data-user-detail]");
  if (userDetailBox && selectedUserLogin && userDetailBox.dataset.restoredLogin !== selectedUserLogin) {
    const nonce = ++adminDetailRestoreNonce;
    userDetailBox.dataset.restoredLogin = selectedUserLogin;
    api(`/api/admin/users/${encodeURIComponent(selectedUserLogin)}`)
      .then((payload) => {
        if (nonce !== adminDetailRestoreNonce || selectedUserLogin !== userDetailBox.dataset.restoredLogin) return;
        userDetailBox.innerHTML = userDetail(payload);
        bindActions();
        bindAdminButtonFeedback(root);
      })
      .catch(() => {});
  }
  const disputeDetailBox = root.querySelector("[data-dispute-detail]");
  if (disputeDetailBox && selectedDisputeId && disputeDetailBox.dataset.restoredDispute !== selectedDisputeId) {
    const nonce = ++adminDetailRestoreNonce;
    disputeDetailBox.dataset.restoredDispute = selectedDisputeId;
    api(`/api/admin/disputes/${encodeURIComponent(selectedDisputeId)}`)
      .then((payload) => {
        if (nonce !== adminDetailRestoreNonce || selectedDisputeId !== disputeDetailBox.dataset.restoredDispute) return;
        disputeDetailBox.innerHTML = disputeDetail(payload);
        bindActions();
        bindAdminButtonFeedback(root);
      })
      .catch(() => {});
  }
}

function bindAdminButtonFeedback(scope = root) {
  scope.querySelectorAll("button:not([data-button-feedback-bound])").forEach((button) => {
    button.dataset.buttonFeedbackBound = "1";
    button.addEventListener("click", () => {
      adminLastInteractionAt = Date.now();
      if (button.disabled || button.classList.contains("is-loading")) return;
      button.classList.remove("tap-loading");
      void button.offsetWidth;
      button.classList.add("tap-loading");
      clearTimeout(button.tapLoadingTimer);
      button.tapLoadingTimer = setTimeout(() => button.classList.remove("tap-loading"), 850);
    });
  });
}

function renderSection() {
  if (!data) return "";
  if (section === "Dashboard") return renderDashboard();
  if (section === "Магазины") return renderStores();
  if (section === "Обменники") return renderExchangers();
  if (section === "Пользователи") return renderUsers();
  if (section === "Сделки") return renderDeals();
  if (section === "Диспуты") return renderDisputes();
  if (section === "Рассылки") return renderBroadcasts();
  if (section === "Финансы") return renderFinance();
  if (section === "Настройки") return renderSettings();
  if (section === "Разное") return renderMisc();
  if (section === "Логи") return renderLogs();
  if (section === "Health") return renderHealth();
  if (section === "Боты") return renderMirrorBots();
  return "";
}

function statCard(label, value, hint = "") {
  return `<article class="card"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

function filterRows(rows, keys) {
  if (!query) return rows;
  return rows.filter((row) => keys.some((key) => String(row[key] ?? "").toLowerCase().includes(query)));
}

function renderDashboard() {
  const s = data.stats;
  return `
    <section class="grid">
      ${statCard("Продажи", s.totalSales, "закрытые сделки")}
      ${statCard("Оборот", fmtMoney(s.totalTurnover), "всё время")}
      ${statCard("Комиссия", fmtMoney(s.totalCommission), "доход площадки")}
      ${statCard("К выводу владельцу", fmtMoney(s.ownerWithdrawableUsd || s.totalCommission || 0), "комиссии магазинов")}
      ${statCard("К выводу магазинам", fmtMoney(s.storesWithdrawableUsd || 0), "чистый доход продавцов")}
      ${statCard("Новые пользователи", s.newUsers, "за сутки")}
      ${statCard("Всего пользователей", s.totalUsers, `${s.usersWithPurchase} с покупкой`)}
      ${statCard("Диспуты", s.disputes, "открытые")}
      ${statCard("Активные сделки", s.activeDeals, "в работе")}
      ${statCard("Онлайн", s.onlineUsers, "realtime")}
    </section>
    <article class="split-card">
      <h2>Вывести средства владельца</h2>
      <p class="muted">Доступно к выводу: <strong>${fmtMoney(s.ownerWithdrawableUsd || 0)}</strong>. Комиссия начисляется автоматически с покупок клиентов, вывод отправляется на LTC счет площадки.</p>
      <form data-owner-withdraw-form>
        <div class="row">
          <label class="field">Сумма USD<input name="amountUsd" type="number" min="0.01" step="0.01" max="${esc(s.ownerWithdrawableUsd || 0)}" value="${esc(Number(s.ownerWithdrawableUsd || 0).toFixed(2))}"></label>
          <button class="ghost" type="button" data-owner-withdraw-all="${esc(Number(s.ownerWithdrawableUsd || 0).toFixed(2))}">Всё</button>
        </div>
        <label class="field">LTC кошелек для вывода<input name="address" value="${esc(data.settings?.paymentSettings?.platformLtcWallet || "")}" placeholder="ltc1..." required></label>
        <button class="primary">Вывести средства</button>
      </form>
    </article>
    <section class="charts">
      ${chartBox("Продажи", "sales")}
      ${chartBox("Регистрации", "registrations")}
      ${chartBox("Доход", "revenue")}
      ${chartBox("Диспуты", "disputes")}
    </section>
    <article class="table-card">${periodTable()}</article>
  `;
}

function chartBox(title, id) {
  return `<article class="card chart-box"><h3>${title}</h3><canvas data-chart="${id}" width="520" height="180"></canvas></article>`;
}

function periodTable() {
  return `<table><thead><tr><th>Период</th><th>Продажи</th><th>Оборот</th><th>Комиссия</th><th>Новые</th><th>Диспуты</th><th>Активные</th></tr></thead><tbody>
    ${data.periods.map((p) => `<tr><td>${p.label}</td><td>${p.sales}</td><td>${fmtMoney(p.turnover)}</td><td>${fmtMoney(p.commission)}</td><td>${p.newUsers}</td><td>${p.disputes}</td><td>${p.activeDeals}</td></tr>`).join("")}
  </tbody></table>`;
}

function renderStores() {
  const rows = filterRows(data.stores, ["id", "name", "ownerLogin", "status"]);
  return `
    <article class="split-card">
      <h2>Создать магазин</h2>
      <form data-create-store-form>
        <label class="field">Фото магазина файлом<input name="imageFile" type="file" accept="image/*"></label>
        <div class="checks">
          <label><input name="placement_TOP10" type="checkbox" checked> TOP 10</label>
          <label><input name="placement_TOP" type="checkbox"> TOP</label>
          <label><input name="placement_NEW" type="checkbox"> NEW</label>
          <label><input name="placement_stores" type="checkbox" checked> Раздел Магазины</label>
        </div>
        <div class="row">
          <label class="field">Название магазина<input name="name" required></label>
          <label class="field">Логин владельца<input name="ownerLogin" required></label>
        </div>
        <div class="row">
          <label class="field">Пароль панели продавца<input name="adminPassword" required></label>
          <label class="field">Позиция<input name="position" type="number" min="1" step="1" value="1"></label>
        </div>
        <div class="row">
          <label class="field">Процент владельца сайта с продаж<input name="commissionPercent" type="number" min="0" max="20" step="0.1" value="3"></label>
        </div>
        <label class="field">Описание магазина<textarea name="description"></textarea></label>
        <div class="checks">
          <label><input name="region_moldova" type="checkbox" checked> Молдова</label>
          <label><input name="region_transnistria" type="checkbox"> Приднестровье</label>
        </div>
        <div class="checks">${coins.map((coin) => `<label><input name="coin_${coin}" type="checkbox" ${coin === "ltc" ? "checked" : ""}> ${coin.toUpperCase()}</label>`).join("")}</div>
        <button class="primary">Создать магазин</button>
      </form>
      <div data-created-store></div>
    </article>
    <section class="split">
      <article class="table-card"><table><thead><tr><th>Магазин</th><th>ID</th><th>Статус</th><th>Продажи</th><th>Доход магазина</th><th>Комиссия владельца</th><th>Клиенты</th><th>Товары</th><th>Диспуты</th><th>Дата</th></tr></thead><tbody>
        ${rows.map((s) => `<tr data-store="${esc(s.id)}"><td><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.ownerLogin)}</span></td><td>${esc(s.id)}</td><td><span class="status ${statusClass(s.status)}">${esc(s.status)}</span></td><td>${s.sales}</td><td>${fmtMoney(s.revenue)}</td><td>${fmtMoney(s.commission)}</td><td>${s.clients}</td><td>${s.products}</td><td>${s.disputes}</td><td>${fmtDate(s.registeredAt)}</td></tr>`).join("")}
      </tbody></table></article>
      <article class="split-card" data-store-detail><h2>Магазин</h2><p class="muted">Выбери строку магазина для управления статусом, комиссией, позицией, автозакрытием и монетами.</p></article>
    </section>
  `;
}

function storeDetail(id) {
  const store = data.stores.find((item) => item.id === id);
  if (!store) return "";
  const status = store.status === "active" || store.status === "ACTIVE" ? "ACTIVE" : "DISABLE";
  const countries = store.countries || store.regions || [];
  const panelUrl = store.panel?.shopPanelUrl || `${PRIMARY_API_ORIGIN}/#shop-panel-${store.id}`;
  const grossRevenue = Number(store.grossRevenue || 0);
  const storeRevenue = Number(store.revenue || 0);
  const ownerCommission = Number(store.commission || 0);
  const placements = Array.isArray(store.placements) && store.placements.length
    ? store.placements
    : [
      ...(store.placement ? [store.placement] : []),
      ...(store.isTop ? ["TOP 10"] : []),
      ...(store.isFeatured ? ["TOP"] : []),
      ...(store.isNew ? ["NEW"] : []),
      ...(store.visibleInCatalog !== false ? ["stores"] : [])
    ];
  return `
    <h2>${esc(store.name)}</h2>
    <p class="muted">Shop Admin: <a href="${esc(panelUrl)}" target="_blank">${esc(panelUrl)}</a><br>Логин: <strong>${esc(store.panel?.login || store.ownerLogin || "")}</strong> · Пароль: <strong>${esc(store.panel?.password || store.adminPassword || "")}</strong></p>
    <p class="notice">Оборот: <strong>${fmtMoney(grossRevenue)}</strong> · К выводу магазину: <strong>${fmtMoney(storeRevenue)}</strong> · Комиссия владельца: <strong>${fmtMoney(ownerCommission)}</strong></p>
    <form data-store-form="${esc(store.id)}">
      <label class="field">Фото / аватар файлом<input name="imageFile" type="file" accept="image/*"></label>
      <label class="field">Баннер файлом<input name="coverFile" type="file" accept="image/*"></label>
      <div class="checks">
        <label><input name="placement_TOP10" type="checkbox" ${placements.includes("TOP 10") ? "checked" : ""}> TOP 10</label>
        <label><input name="placement_TOP" type="checkbox" ${placements.includes("TOP") ? "checked" : ""}> TOP</label>
        <label><input name="placement_NEW" type="checkbox" ${placements.includes("NEW") ? "checked" : ""}> NEW</label>
        <label><input name="placement_stores" type="checkbox" ${placements.includes("stores") || placements.includes("STORES") ? "checked" : ""}> Раздел Магазины</label>
      </div>
      <label class="field">Название<input name="name" value="${esc(store.name || "")}"></label>
      <label class="field">Описание<textarea name="description">${esc(store.description || "")}</textarea></label>
      <div class="row">
        <label class="field">Статус<select name="status"><option value="ACTIVE" ${status === "ACTIVE" ? "selected" : ""}>ACTIVE</option><option value="DISABLE" ${status === "DISABLE" ? "selected" : ""}>DISABLE</option></select></label>
        <label class="field">Логин владельца<input name="ownerLogin" value="${esc(store.ownerLogin || "")}"></label>
      </div>
      <div class="row">
        <label class="field">Комиссия 0-20%<input name="commissionPercent" type="number" min="0" max="20" step="0.1" value="${esc(store.commissionPercent)}"></label>
        <label class="field">Позиция<input name="position" type="number" min="0" step="1" value="${esc(store.position || store.homepagePosition || 0)}"></label>
      </div>
      <div class="row">
        <label class="field">Автозакрытие, часов<input name="autoReleaseHours" type="number" min="0" max="168" value="${esc(store.autoReleaseHours || 24)}"></label>
      </div>
      <label class="field">Пароль панели продавца<input name="adminPassword" placeholder="оставить пустым, если не менять"></label>
      <div class="checks">
        <label><input name="region_moldova" type="checkbox" ${countries.includes("moldova") ? "checked" : ""}> Молдова</label>
        <label><input name="region_transnistria" type="checkbox" ${countries.includes("transnistria") ? "checked" : ""}> Приднестровье</label>
      </div>
      <div class="checks">${coins.map((coin) => `<label><input name="coin_${coin}" type="checkbox" ${store.coins?.[coin] !== false ? "checked" : ""}> ${coin.toUpperCase()}</label>`).join("")}</div>
      <p><button class="primary">Сохранить магазин</button> <button class="ghost danger" type="button" data-delete-store="${esc(store.id)}">DELETE магазин</button></p>
    </form>
  `;
  return `
    <h2>${esc(store.name)}</h2>
    <form data-store-form="${esc(store.id)}">
      <div class="row">
        <label class="field">Статус<select name="status"><option value="ACTIVE" ${status === "ACTIVE" ? "selected" : ""}>ACTIVE</option><option value="DISABLE" ${status === "DISABLE" ? "selected" : ""}>DISABLE</option></select></label>
        <label class="field">Комиссия 0-20%<input name="commissionPercent" type="number" min="0" max="20" step="0.1" value="${esc(store.commissionPercent)}"></label>
      </div>
      <div class="row">
        <label class="field">Позиция на главной<input name="homepagePosition" type="number" min="0" step="1" value="${esc(store.homepagePosition)}"></label>
        <label class="field">Автозакрытие, часов<input name="autoReleaseHours" type="number" min="0" max="168" value="${esc(store.autoReleaseHours || 24)}"></label>
      </div>
      <label class="field">Пароль панели магазина<input name="adminPassword" placeholder="новый пароль магазина"></label>
      <div class="checks">${coins.map((coin) => `<label><input name="coin_${coin}" type="checkbox" ${store.coins?.[coin] !== false ? "checked" : ""}> ${coin.toUpperCase()}</label>`).join("")}</div>
      <p><button class="primary">Сохранить магазин</button> <button class="ghost danger" type="button" data-delete-store="${esc(store.id)}">DELETE магазин</button></p>
    </form>
  `;
}

function exchangerUserOptions() {
  return (data.users || [])
    .slice()
    .sort((a, b) => String(a.login || "").localeCompare(String(b.login || "")))
    .map((user) => `<option value="${esc(user.login)}">${esc(user.name || user.role || "")}</option>`)
    .join("");
}

function renderExchangers() {
  const rows = filterRows(data.exchangers || [], ["id", "login", "name", "title", "description", "status"]);
  return `
    <datalist id="exchanger-users">${exchangerUserOptions()}</datalist>
    <article class="split-card">
      <h2>Создать обменник</h2>
      <p class="muted">Привяжите обменник к уже зарегистрированному логину. Когда клиент нажмет “Отправить сообщение обменнику”, личный диалог откроется именно с этим пользователем.</p>
      <form data-exchanger-create-form>
        <div class="row">
          <label class="field">Логин пользователя<input name="login" list="exchanger-users" placeholder="начните вводить логин" required></label>
          <label class="field">Название обменника<input name="name" placeholder="Например: Cerber Exchange" required></label>
        </div>
        <label class="field">Описание<textarea name="description" placeholder="Условия, направление обмена, рабочее время"></textarea></label>
        <div class="row">
          <label class="field">Фото каталога файлом<input name="imageFile" type="file" accept="image/*"></label>
        </div>
        <div class="row">
          <label class="field">Аватарка чата файлом<input name="avatarFile" type="file" accept="image/*"></label>
        </div>
        <div class="row">
          <label class="field">Позиция<input name="position" type="number" min="0" step="1" value="0"></label>
          <label class="field">Статус<select name="status"><option value="active">Активен</option><option value="disabled">Скрыт</option></select></label>
        </div>
        <button class="primary">Создать обменник</button>
      </form>
    </article>
    <section class="split">
      <article class="table-card">
        <table><thead><tr><th>Фото</th><th>Аватар</th><th>Название</th><th>Логин</th><th>Статус</th><th>Позиция</th><th>Создан</th><th></th></tr></thead><tbody>
          ${rows.map((item) => `<tr><td>${item.image ? `<img src="${esc(item.image)}" alt="" style="width:56px;height:40px;object-fit:cover;border-radius:8px">` : "-"}</td><td>${item.avatar ? `<img src="${esc(item.avatar)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:50%">` : "-"}</td><td><strong>${esc(item.name || item.title || "")}</strong><br><span class="muted">${esc(String(item.description || "").slice(0, 90))}</span></td><td>${esc(item.login || "")}</td><td><span class="status ${item.active ? "" : "off"}">${esc(item.status || "active")}</span></td><td>${Number(item.position || 0)}</td><td>${fmtDate(item.createdAt)}</td><td><button class="ghost" data-exchanger-edit="${esc(item.id)}">Открыть</button></td></tr>`).join("") || `<tr><td colspan="8">Обменников пока нет.</td></tr>`}
        </tbody></table>
      </article>
      <article class="split-card" data-exchanger-detail>
        <h2>Обменник</h2>
        <p class="muted">Выберите строку, чтобы изменить название, описание, фото, статус или привязанный логин.</p>
      </article>
    </section>
  `;
}

function exchangerDetail(id) {
  const item = (data.exchangers || []).find((row) => String(row.id || "") === String(id || ""));
  if (!item) return `<h2>Обменник не найден</h2>`;
  return `
    <h2>${esc(item.name || item.title || item.id)}</h2>
    <form data-exchanger-update-form="${esc(item.id)}">
      <label class="field">Логин пользователя<input name="login" list="exchanger-users" value="${esc(item.login || "")}" required></label>
      <label class="field">Название<input name="name" value="${esc(item.name || item.title || "")}" required></label>
      <label class="field">Описание<textarea name="description">${esc(item.description || "")}</textarea></label>
      <label class="field">Новое фото каталога файлом<input name="imageFile" type="file" accept="image/*"></label>
      <label class="field">Новая аватарка чата файлом<input name="avatarFile" type="file" accept="image/*"></label>
      <div class="row">
        <label class="field">Позиция<input name="position" type="number" min="0" step="1" value="${esc(item.position || 0)}"></label>
        <label class="field">Статус<select name="status"><option value="active" ${item.active ? "selected" : ""}>Активен</option><option value="disabled" ${!item.active ? "selected" : ""}>Скрыт</option></select></label>
      </div>
      <p><button class="primary">Сохранить</button> <button class="ghost danger" type="button" data-exchanger-delete="${esc(item.id)}">Удалить</button></p>
    </form>
  `;
}

function renderUsers() {
  const rows = filterRows(data.users, ["login", "name", "role", "status"]);
  return `<article class="table-card"><table><thead><tr><th>№</th><th>Пользователь</th><th>Роль</th><th>Статус</th><th>Регистрация</th><th>Покупки</th><th>Сумма</th><th>Баланс</th><th>Диспуты</th><th>Действие</th></tr></thead><tbody>
    ${rows.map((u) => `<tr><td>${u.number}</td><td><strong>${esc(u.login)}</strong><br><span class="muted">${esc(u.name)}</span></td><td>${esc(u.role)}</td><td><span class="status ${u.status === "blocked" ? "off" : ""}">${esc(u.status)}</span></td><td>${fmtDate(u.registeredAt)}</td><td>${u.purchases}</td><td>${fmtMoney(u.purchaseUsd)}</td><td>${fmtMoney(u.balance)}</td><td>${u.disputes}</td><td><button class="ghost" data-user="${esc(u.login)}">Открыть</button></td></tr>`).join("")}
  </tbody></table></article><div data-user-detail></div>`;
}

function userDetail(payload) {
  const u = payload.user;
  const s = payload.summary;
  const bots = payload.bots || [];
  return `<article class="split-card user-profile"><h2>${esc(u.login)}</h2>
    <form data-user-form="${esc(u.login)}">
      <div class="row"><label class="field">Роль<select name="role">${["admin", "moderator", "seller", "user"].map((role) => `<option value="${role}" ${u.role === role ? "selected" : ""}>${role}</option>`).join("")}</select></label><label class="field">Пароль магазина<input name="storePassword" placeholder="задать для роли Магазин"></label></div>
      <label class="field">Причина блокировки<input name="blockReason" value="${esc(payload.status?.reason || "Ваш аккаунт заблокирован")}"></label>
      <p><button class="primary">Сохранить пользователя</button> <button class="ghost danger" type="button" data-block-user="${esc(u.login)}">Заблокировать</button> <button class="ghost" type="button" data-unblock-user="${esc(u.login)}">Разблокировать</button></p>
    </form>
    <section class="grid">
      ${statCard("Баланс", fmtMoney(payload.balanceUsd || 0), `${Number(payload.balanceLtc || 0).toFixed(6)} LTC`)}
      ${statCard("Пополнения", fmtMoney(s.totalDeposits), "все успешные")}
      ${statCard("Покупки", fmtMoney(s.totalPurchases), `${payload.orders.length} заказов`)}
      ${statCard("Средний чек", fmtMoney(s.averageCheck), "по покупкам")}
      ${statCard("Расход/день", fmtMoney(s.averageDailySpend || 0), "с первой покупки")}
      ${statCard("Расход/месяц", fmtMoney(s.averageMonthlySpend || 0), "расчетно")}
      ${statCard("Диспуты", s.disputes, "история")}
      ${statCard("Последнее действие", fmtDate(s.lastActivityAt), "активность")}
    </section>
    <h3>Покупки</h3>${payload.products.map((p) => `<p>${esc(p.name)} — ${p.count} покупок</p>`).join("") || "<p class='muted'>Покупок нет</p>"}
    <h3>Заказы</h3><div class="table-card">${smallTable(["ID", "Товар", "Сумма", "Статус", "Дата"], payload.orders.map((o) => [o.id, o.product || o.productName || o.productId || "-", fmtMoney(o.amountUsd || o.priceUsd), o.status || o.paymentStatus, fmtDate(o.createdAt)]))}</div>
    <h3>Чаты</h3><div class="table-card">${smallTable(["Дата", "От", "Кому", "Тема", "Сообщение"], payload.messages.slice(0, 80).map((m) => [fmtDate(m.createdAt), m.fromLogin || "-", m.toLogin || "-", m.subject || "-", m.body || m.text || ""]))}</div>
    <h3>Telegram зеркала</h3><div class="table-card">${smallTable(["Источник", "Кто создал", "Telegram", "Бот", "Дата", "Статус"], bots.map((b) => [b.source || "-", b.loginKey || b.login || "-", b.username || b.chatId || "-", b.botUsername || "-", fmtDate(b.createdAt), b.blocked ? "blocked" : b.verified ? "active" : "pending"]))}</div>
  </article>`;
}

function smallTable(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderDeals() {
  return `<article class="table-card"><table><thead><tr><th>ID</th><th>Тип</th><th>Пользователь</th><th>Магазин</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
    ${data.deals.map((o) => `<tr><td>${esc(o.id)}</td><td>${esc(o.type || "exchange")}</td><td>${esc(o.login || o.fromLogin || "")}</td><td>${esc(o.storeName || o.storeId || o.toLogin || "")}</td><td>${fmtMoney(o.amountUsd || o.priceUsd)}</td><td>${esc(o.status || o.paymentStatus || "")}</td><td>${fmtDate(o.createdAt || o.date)}</td></tr>`).join("")}
  </tbody></table></article>`;
}

function renderDisputes() {
  const allRows = Array.isArray(data.disputes) ? data.disputes : [];
  const rows = query ? allRows.filter((item) => disputeSearchText(item).includes(query.replace(/^#/, ""))) : allRows;
  return `<section class="split"><article class="table-card"><div class="admin-table-actions"><button class="primary" data-create-test-dispute>Создать тестовый диспут</button></div><table><thead><tr><th>Диспут</th><th>Заказ</th><th>Клиент</th><th>Магазин</th><th>Сумма</th><th>Статус</th><th>Открыт</th><th></th></tr></thead><tbody>
    ${rows.map((o) => {
      const closed = o.disputeOpen === false || o.disputeChatClosed;
      return `<tr><td><strong>${esc(disputeDisplayLabel(o))}</strong></td><td>${esc(o.id)}</td><td><button class="link-button" data-dispute="${esc(o.id)}">${esc(o.login || o.fromLogin || "-")}</button></td><td>${esc(o.storeName || o.storeId || o.toLogin || "")}</td><td>${fmtMoney(o.amountUsd || o.priceUsd)}</td><td><span class="status ${closed ? "" : "off"}">${closed ? "closed" : "open"}</span></td><td>${fmtDate(o.disputeOpenedAt || o.createdAt)}</td><td><button class="ghost" data-dispute="${esc(o.id)}">Профиль</button> <button class="primary" data-open-dispute-chat="${esc(o.id)}">Чат</button></td></tr>`;
    }).join("")}
    ${!rows.length ? `<tr><td colspan="8">${query && allRows.length ? `Поиск скрывает ${allRows.length} диспут(ов). Очистите поиск сверху.` : "Диспутов пока нет."}</td></tr>` : ""}
  </tbody></table><p class="muted">Показано: ${rows.length} из ${allRows.length}</p></article><article class="split-card" data-dispute-detail><h2>Диспут</h2><p class="muted">Нажми на профиль клиента или кнопку “Профиль”, чтобы увидеть всю информацию и действия.</p></article></section>`;
}

function selectOptions(items, valueGetter, labelGetter, emptyText) {
  const options = (Array.isArray(items) ? items : [])
    .map((item) => ({ value: String(valueGetter(item) || "").trim(), label: String(labelGetter(item) || "").trim() }))
    .filter((item) => item.value)
    .sort((a, b) => a.label.localeCompare(b.label, "ru"))
    .map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`)
    .join("");
  return `<option value="">${esc(emptyText)}</option>${options}`;
}

function showTestDisputeModal() {
  document.querySelector("[data-test-dispute-modal]")?.remove();
  const users = Array.isArray(data.users) ? data.users : [];
  const stores = Array.isArray(data.stores) ? data.stores : [];
  const modal = document.createElement("div");
  modal.className = "admin-modal";
  modal.dataset.testDisputeModal = "true";
  modal.innerHTML = `
    <div class="admin-modal-backdrop" data-close-test-dispute-modal></div>
    <section class="admin-modal-panel">
      <header class="admin-modal-head">
        <div>
          <h2>Создать тестовый диспут</h2>
          <p class="muted">Выбери клиента и магазин. После сохранения диспут появится у клиента, владельца и в панели магазина.</p>
        </div>
        <button class="ghost" type="button" data-close-test-dispute-modal>Закрыть</button>
      </header>
      <form class="form" data-test-dispute-form>
        <div class="row">
          <label class="field">Логин клиента
            <select name="login" required>${selectOptions(users, (u) => u.login, (u) => `${u.login || ""}${u.role ? ` · ${u.role}` : ""}`, "Выберите логин")}</select>
          </label>
          <label class="field">Магазин
            <select name="storeId" required>${selectOptions(stores, (s) => s.id, (s) => `${s.name || s.id}${s.ownerLogin ? ` · ${s.ownerLogin}` : ""}`, "Выберите магазин")}</select>
          </label>
        </div>
        <div class="row">
          <label class="field">Сумма, USD<input name="amountUsd" type="number" min="0.01" step="0.01" value="10"></label>
          <label class="field">Товар<input name="productTitle" value="Тестовый товар"></label>
        </div>
        <label class="field">Первое сообщение<textarea name="body" rows="3">Тестовый диспут создан владельцем сайта для проверки логики чата.</textarea></label>
        <div class="admin-form-actions">
          <button class="primary" type="submit">Создать диспут</button>
          <button class="ghost" type="button" data-close-test-dispute-modal>Отмена</button>
        </div>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
  bindAdminButtonFeedback(modal);
  const close = () => modal.remove();
  modal.querySelectorAll("[data-close-test-dispute-modal]").forEach((button) => button.addEventListener("click", close));
  modal.querySelector("[data-test-dispute-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const payload = await api("/api/admin/disputes/test", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      if (payload.overview) data = payload.overview;
      selectedDisputeId = payload.dispute?.id || "";
      selectedStoreId = "";
      selectedUserLogin = "";
      persistAdminUiState();
      close();
      renderShell();
      renderDisputePayload(payload, { openChat: true });
      toast("Тестовый диспут создан");
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
    }
  });
}

function adminDisputeMessageHtml(message) {
  const role = String(message.fromRole || "").toLowerCase();
  const from = message.fromLogin || (role === "owner" ? "owner" : "system");
  const own = role === "owner" || sameLogin(from, "cerber-owner") || sameLogin(from, data.admin?.login || "");
  const attachments = supportAttachmentsHtml(message.attachments || []);
  return `
    <article class="admin-dispute-message ${own ? "own" : ""}">
      <div class="admin-dispute-avatar">${esc(String(from || "?").slice(0, 1).toUpperCase())}</div>
      <div class="admin-dispute-bubble">
        <div class="admin-dispute-meta">
          <strong>${esc(from)}</strong>
          <span>${fmtDate(message.createdAt)}</span>
        </div>
        ${message.subject ? `<small>${esc(message.subject)}</small>` : ""}
        ${message.body || message.text ? `<p>${esc(message.body || message.text || "").replace(/\n/g, "<br>")}</p>` : ""}
        ${attachments}
      </div>
    </article>
  `;
}

function disputeChatHtml(payload) {
  const d = payload.dispute || {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const messageHtml = messages.length ? messages.map(adminDisputeMessageHtml).join("") : `<p class="muted">Сообщений в диспуте пока нет.</p>`;
  return `
    <div class="admin-dispute-chat">${messageHtml}</div>
    ${payload.canWrite !== false && d.disputeOpen !== false && !d.disputeChatClosed ? `<form class="form compact-form admin-dispute-reply" data-admin-dispute-reply="${esc(d.id || "")}">
      <label class="field">Ответ в чат<textarea name="body" rows="3" placeholder="Напишите сообщение клиенту/магазину"></textarea></label>
      <label class="field">Фото/видео<input name="attachment" type="file" accept="image/*,video/*,.webp,.gif"></label>
      <button class="primary" type="submit">Отправить в чат</button>
    </form>` : `<p class="muted">Диспут закрыт полностью. Историю можно смотреть, писать больше нельзя.</p>`}
  `;
}

function syncDisputeOverviewRow(payload) {
  if (!data || !Array.isArray(data.disputes) || !payload?.dispute?.id) return;
  const next = {
    ...payload.dispute,
    storeName: payload.store?.name || payload.dispute.storeName || "",
    storeLogin: payload.storeLogin || payload.dispute.toLogin || "",
    disputeNumber: payload.disputeNumber || payload.dispute.disputeNumber
  };
  const sameDispute = (item) => item?.id === next.id || item?.exchangeRequestId === next.id || next.exchangeRequestId === item?.id;
  const index = data.disputes.findIndex(sameDispute);
  if (index >= 0) data.disputes[index] = { ...data.disputes[index], ...next };
  else data.disputes.unshift(next);
}

function renderDisputePayload(payload, { openChat = false, closeChat = false } = {}) {
  if (!payload?.dispute) return;
  selectedDisputeId = payload.dispute.id || selectedDisputeId;
  persistAdminUiState();
  syncDisputeOverviewRow(payload);
  const box = root.querySelector("[data-dispute-detail]");
  if (box) {
    box.dataset.restoredDispute = selectedDisputeId;
    box.innerHTML = disputeDetail(payload);
  }
  if (closeChat) document.querySelector("[data-dispute-modal]")?.remove();
  else if (openChat || document.querySelector("[data-dispute-modal]")) showDisputeChatModal(payload);
  bindActions();
  bindAdminButtonFeedback(root);
}

function disputeDetail(payload) {
  const d = payload.dispute || {};
  const label = payload.disputeNumber ? `#${payload.disputeNumber}` : disputeDisplayLabel(d);
  const closed = payload.canWrite === false || d.disputeOpen === false || d.disputeChatClosed;
  return `<h2>Диспут ${esc(label)}</h2>
    <div class="admin-dispute-summary">
      <p><strong>Заказ:</strong> ${esc(d.id || "-")}</p>
      <p><strong>Клиент:</strong> ${esc(payload.clientLogin || "-")}</p>
      <p><strong>Дата рега клиента:</strong> ${fmtDate(payload.client?.created_at)}</p>
      <p><strong>Магазин:</strong> ${esc(payload.store?.name || payload.storeLogin || "-")}</p>
      <p><strong>Сумма:</strong> ${fmtMoney(payload.amount || 0)}</p>
      <p><strong>Открыт:</strong> ${fmtDate(payload.openedAt || d.disputeOpenedAt || d.createdAt)}</p>
      <p><strong>Закрыт:</strong> ${fmtDate(payload.closedAt || d.disputeClosedAt || d.closedAt)}</p>
      <p><strong>Статус:</strong> ${closed ? "closed" : esc(d.status || "dispute")}</p>
      <p><strong>Причина закрытия:</strong> ${esc(d.closeReason || d.closedReason || "-")}</p>
    </div>
    <div class="admin-dispute-actions">
      <button class="primary" data-open-dispute-chat="${esc(d.id || "")}">Открыть чат</button>
      ${!closed ? `<button class="ghost" data-join-dispute="${esc(d.id || "")}">Войти в диспут</button>` : ""}
      ${!closed ? `<button class="ghost danger" data-close-dispute="${esc(d.id || "")}">Закрыть диспут полностью</button>` : ""}
    </div>
    <h3>Последние сообщения</h3>
    <div class="admin-dispute-chat">
      ${(payload.messages || []).slice(-4).length ? (payload.messages || []).slice(-4).map(adminDisputeMessageHtml).join("") : `<p class="muted">Сообщений в диспуте пока нет.</p>`}
    </div>`;
}

function showDisputeChatModal(payload) {
  document.querySelector("[data-dispute-modal]")?.remove();
  const d = payload.dispute || {};
  const label = payload.disputeNumber ? `#${payload.disputeNumber}` : disputeDisplayLabel(d);
  const modal = document.createElement("div");
  modal.className = "admin-modal open";
  modal.dataset.disputeModal = "true";
  modal.innerHTML = `
    <div class="admin-modal-backdrop" data-close-dispute-modal></div>
    <section class="admin-modal-panel dispute-chat-modal">
      <header class="admin-modal-head">
        <div>
          <h2>Чат диспута ${esc(label)}</h2>
          <p class="muted">Клиент: ${esc(payload.clientLogin || "-")} · Магазин: ${esc(payload.store?.name || payload.storeLogin || "-")}</p>
        </div>
        <button class="ghost" data-close-dispute-modal>Закрыть</button>
      </header>
      ${disputeChatHtml(payload)}
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-dispute-modal]").forEach((button) => button.addEventListener("click", () => modal.remove()));
  modal.querySelector("[data-admin-dispute-reply]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const attachments = await filesToSupportAttachments(form.querySelector('input[type="file"]'));
    try {
      const nextPayload = await api(`/api/admin/disputes/${encodeURIComponent(form.dataset.adminDisputeReply)}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: formData.get("body"), attachments })
      });
      renderDisputePayload(nextPayload, { openChat: true });
      toast("Сообщение отправлено");
    } catch (error) {
      toast(error.message, true);
    }
  });
  requestAnimationFrame(() => {
    const chat = modal.querySelector(".admin-dispute-chat");
    if (chat) chat.scrollTop = chat.scrollHeight;
    modal.querySelector("textarea")?.focus();
  });
}

function renderBroadcasts() {
  return `<section class="split"><article class="split-card"><h2>Новая рассылка</h2><form data-broadcast-form>
    <label class="field">Фото файлом<input name="photoFile" type="file" accept="image/*"></label>
    <label class="field">Заголовок<input name="title" required></label>
    <label class="field">Текст<textarea name="body" required></textarea></label>
    <div class="row"><label class="field">Канал<select name="channel"><option value="both">Сайт + Telegram</option><option value="site">Только сайт</option><option value="telegram">Только Telegram</option></select></label></div>
    <div class="row"><label class="field">Текст кнопки<input name="buttonText" placeholder="Открыть"></label><label class="field">Ссылка кнопки<input name="buttonUrl" placeholder="https://..."></label></div>
    <div class="row"><label class="field">Тип<select name="type"><option value="popup">Popup</option><option value="banner">Баннер</option><option value="push">Push</option></select></label><label class="field">Кому отправить<select name="audience"><option value="all">Всем пользователям</option><option value="online">Онлайн пользователям</option><option value="buyers">С покупками</option><option value="no_purchases">Без покупок</option><option value="balance">С балансом</option><option value="custom">По фильтрам ниже</option></select></label></div>
    <div class="row"><label class="field">Мин. сумма покупок<input name="minPurchase" type="number" step="0.01" placeholder="1"></label><label class="field">Макс. сумма покупок<input name="maxPurchase" type="number" step="0.01" placeholder="1000"></label></div>
    <div class="row"><label class="field">Без покупок N дней<input name="noPurchasesDays" type="number" step="1" placeholder="2"></label><label class="field">Баланс<select name="balanceMode"><option value="">Не важно</option><option value="with">С балансом</option><option value="without">Без баланса</option></select></label></div>
    <div class="row"><label class="field">Магазин<select name="storeId"><option value="">Любой</option>${data.stores.map((store) => `<option value="${esc(store.id)}">${esc(store.name)}</option>`).join("")}</select></label><label class="field">Товар<input name="product" placeholder="название или ID"></label></div>
    <label class="field">Категория<input name="category" placeholder="категория товара"></label>
    <label class="field">Конкретные пользователи<input name="specificLogins" placeholder="login1, login2, login3"></label>
    <button class="primary">Отправить рассылку</button>
  </form></article><article class="table-card"><table><thead><tr><th>Название</th><th>Канал</th><th>Отправлено</th><th>Ошибки</th><th>Клики</th><th>Закрыли</th><th>Дата</th></tr></thead><tbody>
    ${data.broadcasts.map((b) => `<tr><td>${esc(b.title)}<br><span class="muted">получателей: ${(b.recipients || []).length}</span></td><td>${esc(b.channel)}<br><span class="muted">site ${b.stats?.siteSent || 0} / tg ${b.stats?.telegramSent || 0} / targets ${b.stats?.telegramTargets || 0}</span></td><td>${b.stats?.sent || 0}</td><td>${b.stats?.telegramFailed || b.stats?.notDelivered || 0}</td><td>${b.stats?.clicked || 0}</td><td>${b.stats?.closed || 0}</td><td>${fmtDate(b.createdAt)}</td></tr>`).join("")}
  </tbody></table></article></section>`;
}

function renderFinance() {
  const buckets = data.finances.depositsByStatus || {};
  const bucketCard = (label, rows) => statCard(label, rows?.length || 0, fmtMoney((rows || []).reduce((sum, item) => sum + Number(item.amountUsd || item.priceAmount || 0), 0)));
  const deposits = data.finances.walletDeposits || [];
  const withdrawals = data.finances.walletWithdrawals || [];
  const withdrawalActions = (w) => {
    const status = String(w.status || "pending").toLowerCase();
    if (!["pending", "processing"].includes(status)) {
      return `<span class="muted">${w.processedAt ? `Обработано ${fmtDate(w.processedAt)}` : "История"}</span>`;
    }
    return `<div class="row-actions">
      <button class="ghost" type="button" data-withdrawal-status="${esc(w.id)}" data-status="paid">Выплачено</button>
      <button class="ghost danger" type="button" data-withdrawal-status="${esc(w.id)}" data-status="rejected">Отклонить</button>
    </div>`;
  };
  return `<section class="grid">${bucketCard("Успешные депозиты", buckets.successful)}${bucketCard("В ожидании", buckets.pending)}${bucketCard("Отмененные", buckets.cancelled)}${bucketCard("Ошибочные", buckets.failed)}</section>
  <article class="table-card"><h3>Пополнения</h3><table><thead><tr><th>ID</th><th>Логин</th><th>Сумма</th><th>Монета</th><th>Статус</th><th>Адрес</th><th>Дата</th></tr></thead><tbody>${deposits.slice(0, 160).map((d) => `<tr><td>${esc(d.id)}</td><td>${esc(d.login)}</td><td>${fmtMoney(d.amountUsd || d.priceAmount || 0)}</td><td>${esc(d.payCurrency || d.coinId || "ltc")}</td><td><span class="status ${statusClass(d.status)}">${esc(d.status)}</span></td><td>${esc(d.payAddress || "")}</td><td>${fmtDate(d.createdAt)}</td></tr>`).join("")}</tbody></table></article>
  <article class="table-card"><h3>Заявки на вывод</h3><table><thead><tr><th>ID</th><th>Магазин</th><th>Логин</th><th>Сумма</th><th>Адрес</th><th>Статус</th><th>Дата</th><th>Действия</th></tr></thead><tbody>${withdrawals.slice(0, 160).map((w) => `<tr><td>${esc(w.id)}</td><td>${esc(w.scope === "owner" ? "Владелец сайта" : (w.storeName || w.storeId || "-"))}</td><td>${esc(w.login)}</td><td>${Number(w.amountLtc || 0).toFixed(8)} LTC<br><span class="muted">${fmtMoney(w.amountUsd || 0)}</span></td><td>${esc(w.address || "")}</td><td><span class="status ${statusClass(w.status)}">${esc(w.status)}</span></td><td>${fmtDate(w.createdAt)}</td><td>${withdrawalActions(w)}</td></tr>`).join("")}</tbody></table></article>`;
}
function renderSettings() {
  const owner = data.settings.ownerSettings || {};
  const payment = data.settings.paymentSettings || {};
  return `<article class="split-card"><h2>Глобальные комиссии</h2><form data-settings-form>
    <p class="muted">Комиссия анонимизации — комиссия за смешивание и защиту криптовалютных переводов.</p>
    <div class="row"><label class="field">Комиссия площадки, %<input name="platformCommissionPercent" type="number" step="0.1" value="${esc(owner.platformCommissionPercent || 0)}"></label><label class="field">Комиссия анонимизации, %<input name="swapCommissionPercent" type="number" step="0.1" value="${esc(owner.swapCommissionPercent || 0)}"></label></div>
    <div class="row"><label class="field">Комиссия вывода, %<input name="walletServiceFeePercent" type="number" step="0.1" value="${esc(owner.walletServiceFeePercent || 0)}"></label><label class="field">Автозакрытие сделок, часов<input name="defaultAutoReleaseHours" type="number" min="0" max="168" value="${esc(owner.defaultAutoReleaseHours || 24)}"></label></div>
    <p class="muted">Автозакрытие: если клиент оплатил, не подтвердил заказ и не открыл диспут, после указанного времени сделка станет успешной, а сумма будет учтена в доходе магазина.</p>
    <label class="field">Platform LTC wallet<input name="platformLtcWallet" value="${esc(payment.platformLtcWallet || "")}" placeholder="ltc1..."></label>
    <button class="primary">Сохранить настройки</button>
  </form><hr><form data-password-form><h3>Сменить пароль админки</h3><div class="row"><label class="field">Текущий пароль<input name="currentPassword" type="password"></label><label class="field">Новый пароль<input name="nextPassword" type="password"></label></div><button class="ghost">Сменить пароль</button></form><hr><div><h3>Очистка маркетплейса</h3><p class="muted">Удаляет все магазины и очищает обменники, заявки магазинов и старые owner-кэши. Admin-пользователи не удаляются.</p><button class="ghost danger" type="button" data-clear-marketplace>Очистить магазины и обменники</button></div></article>`;
}

function renderMiscLegacy() {
  const tickets = Array.isArray(data.supportTickets) ? data.supportTickets : [];
  const openCount = tickets.filter((ticket) => ticket.status !== "closed").length;
  return `
    <section class="split">
      <article class="split-card">
        <h2>Разное</h2>
        <h3>Legacy support routing</h3>
        <p class="muted">Включи нужные разделы и впиши логин аккаунта поддержки. На сайте пользователь увидит только включённые разделы.</p>
        <form data-disabled-support-routing>
          <div class="support-topic-grid">
            ${supportTopics.map((topic, index) => {
              const existing = recipientByTitle.get(topic.toLowerCase()) || recipients.find((item) => item.id === `support-topic-${index}`);
              return `
                <label class="support-topic-row">
                  <input type="checkbox" data-support-topic-enabled="${index}" ${existing ? "checked" : ""}>
                  <span>${esc(topic)}</span>
                  <input data-support-topic-login="${index}" data-support-topic-title="${esc(topic)}" data-support-topic-id="support-topic-${index}" placeholder="логин поддержки" value="${esc(existing?.login || "")}">
                </label>
              `;
            }).join("")}
          </div>
          <button class="primary">Сохранить разделы поддержки</button>
        </form>
      </article>
      <article class="split-card">
        <h2>Обращения</h2>
        <section class="grid">
          ${statCard("Открытые", openCount, "ожидают ответа")}
          ${statCard("Всего", tickets.length, "все тикеты")}
        </section>
      </article>
    </section>
    <section class="support-ticket-list">
      ${supportTicketGroups(tickets)}
    </section>
  `;
}

function renderMisc() {
  const tickets = Array.isArray(data.supportTickets) ? data.supportTickets : [];
  const openCount = tickets.filter((ticket) => ticket.status !== "closed").length;
  return `
    <section class="split">
      <article class="split-card">
        <h2>Разное</h2>
        <p class="muted">Все обращения клиентов из поддержки приходят сюда. Открой логин ниже, чтобы посмотреть переписку, фото и ответить.</p>
      </article>
      <article class="split-card">
        <h2>Обращения</h2>
        <section class="grid">
          ${statCard("Открытые", openCount, "ожидают ответа")}
          ${statCard("Всего", tickets.length, "все тикеты")}
        </section>
      </article>
    </section>
    <section class="support-ticket-list">
      ${supportTicketGroups(tickets)}
    </section>
  `;
}

function supportTicketGroups(tickets) {
  if (!tickets.length) return `<article class="split-card"><p class="muted">Обращений пока нет.</p></article>`;
  const groups = new Map();
  tickets.forEach((ticket) => {
    const login = String(ticket.fromLogin || "-");
    if (!groups.has(login)) groups.set(login, []);
    groups.get(login).push(ticket);
  });
  return [...groups.entries()].map(([login, items]) => {
    const openCount = items.filter((ticket) => ticket.status !== "closed").length;
    const last = items.slice().sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0];
    return `
      <details class="split-card support-user-ticket">
        <summary>
          <strong>${esc(login)}</strong>
          <span>${openCount ? `+${openCount} обращ.` : "нет открытых"} · ${esc(last?.recipientTitle || last?.subject || "")}</span>
        </summary>
        ${items.map(supportTicketCard).join("")}
      </details>
    `;
  }).join("");
}

function supportAttachmentsHtml(attachments = []) {
  const items = Array.isArray(attachments) ? attachments : [];
  if (!items.length) return "";
  return `<div class="support-attachments">${items.map((file) => `<a href="${esc(file.url)}" target="_blank" rel="noopener"><img src="${esc(file.url)}" alt="${esc(file.name || "photo")}"></a>`).join("")}</div>`;
}

function supportTicketCardLegacy(ticket) {
  const closed = ticket.status === "closed";
  return `
    <article class="support-ticket-card">
      <div class="ticket-head">
        <div>
          <h3>${esc(ticket.subject || ticket.id)}</h3>
          <p class="muted">#${esc(ticket.id)} · от ${esc(ticket.fromLogin || "-")} · кому ${esc(ticket.recipientLogin || "-")} · ${fmtDate(ticket.createdAt)}</p>
        </div>
        <span class="status ${closed ? "off" : ""}">${closed ? "closed" : "open"}</span>
      </div>
      <p>${esc(ticket.body || (ticket.attachments?.length ? "[фото]" : "")).replace(/\n/g, "<br>")}</p>
      ${supportAttachmentsHtml(ticket.attachments)}
      ${(ticket.replies || []).length ? `<h4>Ответы</h4>${ticket.replies.map((reply) => `<div class="notice"><strong>${esc(reply.fromLogin || "admin")}</strong> · ${fmtDate(reply.createdAt)}<br>${esc(reply.body || (reply.attachments?.length ? "[фото]" : "")).replace(/\n/g, "<br>")}${supportAttachmentsHtml(reply.attachments)}</div>`).join("")}` : ""}
      ${closed ? `<p class="muted">Обращение закрыто ${fmtDate(ticket.closedAt)}. Ответы заблокированы.</p>` : `
        <form data-support-reply-form="${esc(ticket.id)}">
          <label class="field">Ответ пользователю<textarea name="body"></textarea></label>
          <label class="field">Фото<input name="attachments" type="file" accept="image/*" multiple></label>
          <button class="primary">Ответить</button>
          <button class="ghost danger" type="button" data-support-close="${esc(ticket.id)}">Закрыть обращение</button>
        </form>
      `}
    </article>
  `;
}

function supportTicketCard(ticket) {
  const closed = ticket.status === "closed";
  return `
    <article class="support-ticket-card">
      <div class="ticket-head">
        <div>
          <h3>${esc(ticket.subject || ticket.id)}</h3>
          <p class="muted">#${esc(ticket.id)} · от ${esc(ticket.fromLogin || "-")} · ${fmtDate(ticket.createdAt)}</p>
        </div>
        <span class="status ${closed ? "off" : ""}">${closed ? "closed" : "open"}</span>
      </div>
      <p>${esc(ticket.body || (ticket.attachments?.length ? "[фото]" : "")).replace(/\n/g, "<br>")}</p>
      ${supportAttachmentsHtml(ticket.attachments)}
      ${(ticket.replies || []).length ? `<h4>Ответы</h4>${ticket.replies.map((reply) => `<div class="notice"><strong>${esc(reply.fromLogin || "admin")}</strong> · ${fmtDate(reply.createdAt)}<br>${esc(reply.body || (reply.attachments?.length ? "[фото]" : "")).replace(/\n/g, "<br>")}${supportAttachmentsHtml(reply.attachments)}</div>`).join("")}` : ""}
      ${closed ? `<p class="muted">Обращение закрыто ${fmtDate(ticket.closedAt)}. Ответы заблокированы.</p>` : `
        <form data-support-reply-form="${esc(ticket.id)}">
          <label class="field">Ответ пользователю<textarea name="body"></textarea></label>
          <label class="field">Фото<input name="attachments" type="file" accept="image/*" multiple></label>
          <button class="primary">Ответить</button>
          <button class="ghost danger" type="button" data-support-close="${esc(ticket.id)}">Закрыть обращение</button>
        </form>
      `}
    </article>
  `;
}

function renderLogs() {
  const rows = filterRows(data.logs, ["action", "actor"]);
  const label = (action) => ({
    admin_login_success: "Вход администратора",
    admin_login_failed: "Ошибка входа",
    user_blocked: "Блокировка пользователя",
    user_unblocked: "Разблокировка пользователя",
    store_deleted: "Удаление магазина",
    store_updated: "Изменение магазина",
    settings_updated: "Изменение настроек",
    broadcast_created: "Создание рассылки",
    mirror_bot_created: "Создано зеркало",
    mirror_bot_saved: "Зеркало сохранено",
    mirror_bot_error: "Ошибка зеркала",
    mirror_bot_enable: "Зеркало включено",
    mirror_bot_disable: "Зеркало отключено",
    mirror_bot_block: "Зеркало заблокировано",
    mirror_bot_unblock: "Зеркало разблокировано",
    mirror_bot_restartWebhook: "Webhook зеркала обновлён",
    mirror_bot_checkApi: "Проверка API зеркала",
    mirror_bot_delete: "Зеркало удалено"
  }[action] || action);
  return `<article class="table-card"><table><thead><tr><th>Дата</th><th>Категория</th><th>Админ</th><th>Действие</th><th>Детали</th></tr></thead><tbody>${rows.map((log) => `<tr><td>${fmtDate(log.createdAt)}</td><td>${esc(String(log.action || "").split("_")[0])}</td><td>${esc(log.actor)}</td><td>${esc(label(log.action))}</td><td>${esc(JSON.stringify(log.details || {}))}</td></tr>`).join("")}</tbody></table></article>`;
}

function healthStatus(value) {
  return value ? `<span class="status">ok</span>` : `<span class="status off">fail</span>`;
}

function renderHealth() {
  if (!data.health) {
    api("/api/health").then((health) => {
      data.health = health;
      render();
    }).catch((error) => {
      data.health = { ok: false, error: error.message || "Health error", checks: {} };
      render();
    });
  }
  const health = data.health || { checks: {} };
  const checks = health.checks || {};
  const tables = checks.tables || {};
  const tableRows = Object.entries(tables).map(([name, item]) => [
    name,
    item.ok ? "ok" : (item.reason || "error"),
    item.count ?? "-"
  ]);
  return `
    <section class="grid">
      ${statCard("Health", health.ok ? "OK" : "FAIL", health.time || "")}
      ${statCard("Supabase", checks.supabase?.ok ? "OK" : "FAIL", "database")}
      ${statCard("NOWPayments", checks.nowpayments?.readyForPayouts ? "READY" : "CHECK", "payments")}
      ${statCard("Telegram", checks.telegram?.mainBot ? "OK" : "CHECK", "bots")}
    </section>
    <section class="split">
      <article class="table-card">
        <h3>Services</h3>
        <table><tbody>
          <tr><td>Supabase</td><td>${healthStatus(checks.supabase?.ok)}</td></tr>
          <tr><td>NOWPayments API</td><td>${healthStatus(checks.nowpayments?.apiKey)}</td></tr>
          <tr><td>NOWPayments IPN secret</td><td>${healthStatus(checks.nowpayments?.ipnSecret)}</td></tr>
          <tr><td>NOWPayments payouts</td><td>${healthStatus(checks.nowpayments?.readyForPayouts)}</td></tr>
          <tr><td>Telegram main bot</td><td>${healthStatus(checks.telegram?.mainBot)}</td></tr>
          <tr><td>Telegram webhook secret</td><td>${healthStatus(checks.telegram?.webhookSecret)}</td></tr>
          <tr><td>Site notify bot</td><td>${healthStatus(checks.telegram?.siteNotifyBot)}</td></tr>
        </tbody></table>
      </article>
      <article class="table-card">
        <h3>Telegram mirrors</h3>
        <table><tbody>
          <tr><td>Mirrors</td><td>${esc(checks.bots?.mirrors ?? "-")}</td></tr>
          <tr><td>Active</td><td>${esc(checks.bots?.active ?? "-")}</td></tr>
          <tr><td>Errors</td><td>${esc(checks.bots?.errors ?? "-")}</td></tr>
          <tr><td>Last error</td><td>${checks.bots?.lastErrorAt ? fmtDate(checks.bots.lastErrorAt) : "-"}</td></tr>
        </tbody></table>
      </article>
    </section>
    <article class="table-card"><h3>SQL tables</h3>${smallTable(["Table", "Status", "Rows"], tableRows)}</article>
    ${health.error ? `<article class="notice danger">${esc(health.error)}</article>` : ""}
  `;
}

function renderBots() {
  return renderMirrorBots();
}

function renderMirrorBots() {
  const rows = data.bots.items || [];
  const selected = rows.find((b) => b.id === data.selectedBotId) || rows[0];
  const statusLabel = (bot) => bot.status || (bot.blocked ? "blocked" : bot.active ? "active" : "disabled");
  const usersTable = selected?.users?.length
    ? smallTable(["Логин сайта", "TG ID", "Username", "Имя", "Дата рега", "Первый вход", "Последний вход"], selected.users.map((user) => [
      user.login || user.loginKey || "-",
      user.telegramId || "-",
      user.username ? `@${user.username}` : "-",
      [user.firstName, user.lastName].filter(Boolean).join(" ") || "-",
      fmtDate(user.registeredAt),
      fmtDate(user.firstSeenAt),
      fmtDate(user.lastSeenAt)
    ]))
    : "<p class='muted'>Пользователей внутри зеркала пока нет.</p>";
  const errorsTable = selected?.telegramErrors?.length
    ? smallTable(["Дата", "Действие", "Ошибка"], selected.telegramErrors.map((error) => [fmtDate(error.createdAt), error.action || "-", error.error || "-"]))
    : "<p class='muted'>Ошибок Telegram API нет.</p>";
  const detail = selected ? `<article class="split-card">
    <h3>Зеркало ${esc(selected.displayName || (selected.botUsername ? `@${selected.botUsername}` : selected.botName || "-"))}</h3>
    <section class="grid">
      ${statCard("Пользователей", selected.usersCount || 0, "в зеркале")}
      ${statCard("Сообщений", selected.sentMessagesCount || 0, "отправлено ботом")}
      ${statCard("Рассылок", selected.broadcastsCount || 0, "через зеркало")}
      ${statCard("Ошибок API", selected.telegramErrorsCount || 0, "Telegram")}
    </section>
    <div class="mirror-detail">
      <p><strong>Создал:</strong> ${esc(selected.createdByLabel || selected.creatorLogin || selected.loginKey || selected.login || "-")}</p>
      <p><strong>Telegram ID:</strong> ${esc(selected.createdByTelegramId || selected.ownerTelegramId || selected.chatId || "-")} · <strong>Chat ID:</strong> ${esc(selected.chatId || "-")}</p>
      <p><strong>Имя в Telegram:</strong> ${esc(selected.telegramName || "-")} · <strong>Username:</strong> ${esc(selected.username ? `@${selected.username}` : "-")}</p>
      <p><strong>Бот:</strong> ${esc(selected.botUsername ? `@${selected.botUsername}` : selected.botName || "-")} · <strong>Название:</strong> ${esc(selected.botName || "-")}</p>
      <p><strong>Создано:</strong> ${fmtDate(selected.createdAt)} · <strong>Обновлено:</strong> ${fmtDate(selected.updatedAt)} · <strong>Активность:</strong> ${fmtDate(selected.lastActivityAt)}</p>
      <p><strong>Webhook:</strong> ${selected.webhookOk ? "ok" : "error"} · <code>${esc(selected.webhookUrl || "-")}</code></p>
      <p><strong>Token:</strong> <code>${esc(selected.tokenMasked || (selected.hasToken ? "скрыт" : "-"))}</code> · <strong>Хранилище:</strong> ${esc(selected.storage || "-")}</p>
      <p><strong>Последняя ошибка:</strong> ${esc(selected.lastTelegramError || "-")}</p>
    </div>
    <h3>Пользователи зеркала</h3>
    <div class="table-card">${usersTable}</div>
    <h3>Ошибки Telegram API</h3>
    <div class="table-card">${errorsTable}</div>
  </article>` : `<article class="split-card"><h3>Зеркал пока нет</h3><p class="muted">Зеркала появятся автоматически после подключения токена через основной Telegram-бот.</p></article>`;
  return `<section class="grid">
    ${statCard("Всего зеркал", data.bots.total || 0, "автоматический реестр")}
    ${statCard("Активные", data.bots.active || 0, "работают")}
    ${statCard("Создано за 24ч", data.bots.createdToday || 0, "новые зеркала")}
    ${statCard("Пользователей", data.bots.users || 0, "во всех зеркалах")}
    ${statCard("Сообщений", data.bots.sentMessages || 0, "отправлено ботами")}
    ${statCard("Ошибок API", data.bots.errors || 0, "Telegram")}
  </section>
  <article class="table-card"><table><thead><tr><th>ID</th><th>Создал</th><th>TG username</th><th>Telegram ID</th><th>Chat ID</th><th>Бот</th><th>Создано</th><th>Активность</th><th>Польз.</th><th>Webhook</th><th>Статус</th><th>Управление</th></tr></thead><tbody>${rows.map((b) => `<tr data-bot-select="${esc(b.id)}"><td>${esc(b.id || "-")}</td><td>${esc(b.createdByLogin || b.creatorLogin || b.loginKey || b.login || "-")}</td><td>${esc(b.createdByTelegram || b.creatorTelegram || (b.username ? `@${b.username}` : "-"))}</td><td>${esc(b.createdByTelegramId || b.ownerTelegramId || "-")}</td><td>${esc(b.chatId || "-")}</td><td>${esc(b.displayName || (b.botUsername ? `@${b.botUsername}` : b.botName || "-"))}</td><td>${fmtDate(b.createdAt)}</td><td>${fmtDate(b.lastActivityAt || b.updatedAt)}</td><td>${Number(b.usersCount || 0)}</td><td>${b.webhookOk ? "ok" : "error"}</td><td>${esc(statusLabel(b))}</td><td><button class="ghost" data-bot-action="${b.active ? "disable" : "enable"}" data-bot-id="${esc(b.id)}">${b.active ? "Отключить" : "Включить"}</button> <button class="ghost" data-bot-action="restartWebhook" data-bot-id="${esc(b.id)}">Webhook</button> <button class="ghost" data-bot-action="checkApi" data-bot-id="${esc(b.id)}">Проверить</button> <button class="ghost danger" data-bot-action="delete" data-bot-id="${esc(b.id)}">Удалить</button></td></tr>`).join("")}</tbody></table></article>${detail}`;
}

function bindActions() {
  root.querySelector("[data-exchanger-create-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      const image = await formImageValue(fd, "imageFile");
      const avatar = await formImageValue(fd, "avatarFile");
      data = await api("/api/admin/exchangers", {
        method: "POST",
        body: JSON.stringify({
          login: fd.get("login"),
          name: fd.get("name"),
          description: fd.get("description"),
          image: image || undefined,
          avatar: avatar || undefined,
          position: Number(fd.get("position") || 0),
          status: fd.get("status")
        })
      });
      toast("Обменник создан");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-exchanger-edit]").forEach((button) => {
    button.onclick = () => {
      const box = root.querySelector("[data-exchanger-detail]");
      if (box) box.innerHTML = exchangerDetail(button.dataset.exchangerEdit);
      bindActions();
      bindAdminButtonFeedback(root);
    };
  });
  root.querySelectorAll("[data-exchanger-update-form]").forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      try {
        const image = await formImageValue(fd, "imageFile");
        const avatar = await formImageValue(fd, "avatarFile");
        data = await api(`/api/admin/exchangers/${encodeURIComponent(form.dataset.exchangerUpdateForm)}`, {
          method: "PATCH",
          body: JSON.stringify({
            login: fd.get("login"),
            name: fd.get("name"),
            description: fd.get("description"),
            image: image || undefined,
            avatar: avatar || undefined,
            position: Number(fd.get("position") || 0),
            status: fd.get("status")
          })
        });
        toast("Обменник сохранен");
        renderShell();
      } catch (error) {
        toast(error.message, true);
      }
    };
  });
  root.querySelectorAll("[data-exchanger-delete]").forEach((button) => {
    button.onclick = async () => {
      if (!confirm("Удалить обменник из каталога?")) return;
      try {
        data = await api(`/api/admin/exchangers/${encodeURIComponent(button.dataset.exchangerDelete)}`, { method: "DELETE" });
        toast("Обменник удален");
        renderShell();
      } catch (error) {
        toast(error.message, true);
      }
    };
  });
  root.querySelector("[data-create-store-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const countries = [];
    if (fd.get("region_moldova")) countries.push("moldova");
    if (fd.get("region_transnistria")) countries.push("transnistria");
    const placements = [];
    if (fd.get("placement_TOP10")) placements.push("TOP 10");
    if (fd.get("placement_TOP")) placements.push("TOP");
    if (fd.get("placement_NEW")) placements.push("NEW");
    if (fd.get("placement_stores")) placements.push("stores");
    const enabledCoins = Object.fromEntries(coins.map((coin) => [coin, Boolean(fd.get(`coin_${coin}`))]));
    try {
      const image = await formImageValue(fd, "imageFile");
      const result = await api("/api/admin/stores", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          ownerLogin: fd.get("ownerLogin"),
          adminPassword: fd.get("adminPassword"),
          image,
          description: fd.get("description"),
          placement: placements[0] || "stores",
          placements,
          position: Number(fd.get("position")),
          commissionPercent: Number(fd.get("commissionPercent") || 0),
          countries,
          enabledCoins
        })
      });
      data = result.overview;
      toast("Магазин создан");
      renderShell();
      setTimeout(() => {
        const box = root.querySelector("[data-created-store]");
        if (box) box.innerHTML = `<p class="muted">Панель: <a href="${esc(result.panel.shopPanelUrl)}" target="_blank">${esc(result.panel.shopPanelUrl)}</a><br>Логин: <strong>${esc(result.panel.login)}</strong> · Пароль: <strong>${esc(result.panel.password)}</strong></p>`;
      });
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-store]").forEach((row) => row.onclick = () => {
    selectedStoreId = row.dataset.store;
    selectedUserLogin = "";
    selectedDisputeId = "";
    persistAdminUiState();
    root.querySelector("[data-store-detail]").innerHTML = storeDetail(row.dataset.store);
    bindActions();
  });
  root.querySelectorAll("[data-store-form]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const enabledCoins = Object.fromEntries(coins.map((coin) => [coin, Boolean(fd.get(`coin_${coin}`))]));
    const countries = [];
    if (fd.get("region_moldova")) countries.push("moldova");
    if (fd.get("region_transnistria")) countries.push("transnistria");
    const placements = [];
    if (fd.get("placement_TOP10")) placements.push("TOP 10");
    if (fd.get("placement_TOP")) placements.push("TOP");
    if (fd.get("placement_NEW")) placements.push("NEW");
    if (fd.get("placement_stores")) placements.push("stores");
    try {
      const image = await formImageValue(fd, "imageFile");
      const cover = await formImageValue(fd, "coverFile");
      data = await api(`/api/admin/stores/${encodeURIComponent(form.dataset.storeForm)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: fd.get("name"),
          ownerLogin: fd.get("ownerLogin"),
          description: fd.get("description"),
          image: image || undefined,
          cover: cover || undefined,
          status: fd.get("status"),
          placement: placements[0] || "stores",
          placements,
          position: Number(fd.get("position")),
          commissionPercent: Number(fd.get("commissionPercent")),
          homepagePosition: Number(fd.get("position") || fd.get("homepagePosition")),
          autoReleaseHours: Number(fd.get("autoReleaseHours")),
          adminPassword: fd.get("adminPassword") || undefined,
          countries,
          enabledCoins
        })
      });
      toast("Магазин сохранен");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-delete-store]").forEach((button) => button.onclick = async () => {
    if (!confirm("DELETE удалит магазин, товары и данные магазина с сайта. Удалить?")) return;
    try {
      data = await api(`/api/admin/stores/${encodeURIComponent(button.dataset.deleteStore)}`, { method: "DELETE" });
      toast("Магазин удален");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-user]").forEach((button) => button.onclick = async () => {
    try {
      selectedUserLogin = button.dataset.user;
      selectedStoreId = "";
      selectedDisputeId = "";
      persistAdminUiState();
      const payload = await api(`/api/admin/users/${encodeURIComponent(button.dataset.user)}`);
      root.querySelector("[data-user-detail]").innerHTML = userDetail(payload);
      bindActions();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-user-form]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    try {
      data = await api(`/api/admin/users/${encodeURIComponent(form.dataset.userForm)}`, {
        method: "PATCH",
        body: JSON.stringify({ role: fd.get("role"), storePassword: fd.get("storePassword") })
      });
      toast("Пользователь сохранен");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-block-user], [data-unblock-user]").forEach((button) => button.onclick = async () => {
    const login = button.dataset.blockUser || button.dataset.unblockUser;
    const blocked = Boolean(button.dataset.blockUser);
    const form = button.closest("form");
    try {
      data = await api(`/api/admin/users/${encodeURIComponent(login)}`, {
        method: "PATCH",
        body: JSON.stringify({ blocked, blockReason: new FormData(form).get("blockReason") })
      });
      toast(blocked ? "Пользователь заблокирован" : "Пользователь разблокирован");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelector("[data-create-test-dispute]")?.addEventListener("click", showTestDisputeModal);
  root.querySelectorAll("[data-dispute]").forEach((button) => button.onclick = async () => {
    try {
      selectedDisputeId = button.dataset.dispute;
      selectedStoreId = "";
      selectedUserLogin = "";
      persistAdminUiState();
      const payload = await api(`/api/admin/disputes/${encodeURIComponent(button.dataset.dispute)}`);
      renderDisputePayload(payload);
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-open-dispute-chat]").forEach((button) => button.onclick = async (event) => {
    event.stopPropagation();
    try {
      selectedDisputeId = button.dataset.openDisputeChat;
      persistAdminUiState();
      const payload = await api(`/api/admin/disputes/${encodeURIComponent(selectedDisputeId)}`);
      renderDisputePayload(payload, { openChat: true });
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-join-dispute]").forEach((button) => button.onclick = async () => {
    try {
      selectedDisputeId = button.dataset.joinDispute;
      persistAdminUiState();
      const payload = await api(`/api/admin/disputes/${encodeURIComponent(selectedDisputeId)}/join`, { method: "POST" });
      renderDisputePayload(payload, { openChat: true });
      toast("Чат диспута открыт");
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-admin-dispute-reply]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      const disputeId = form.dataset.adminDisputeReply;
      const formData = new FormData(form);
      const attachments = await filesToSupportAttachments(form.querySelector('input[type="file"]'));
      const payload = await api(`/api/admin/disputes/${encodeURIComponent(disputeId)}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: formData.get("body"), attachments })
      });
      renderDisputePayload(payload, { openChat: Boolean(document.querySelector("[data-dispute-modal]")) });
      toast("Сообщение отправлено клиенту");
      requestAnimationFrame(() => root.querySelector("[data-dispute-detail] textarea")?.focus());
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-close-dispute]").forEach((button) => button.onclick = async () => {
    const reason = prompt("Причина закрытия диспута", "Диспут закрыт владельцем сайта");
    if (reason === null) return;
    try {
      const payload = await api(`/api/admin/disputes/${encodeURIComponent(button.dataset.closeDispute)}/close`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      renderDisputePayload(payload, { closeChat: true });
      toast("Диспут закрыт полностью");
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelector("[data-broadcast-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const formData = new FormData(event.currentTarget);
    const photoUrl = await formImageValue(formData, "photoFile");
    const filters = {
      audience: body.audience,
      minPurchase: body.minPurchase,
      maxPurchase: body.maxPurchase,
      noPurchasesDays: body.noPurchasesDays,
      balanceMode: body.balanceMode,
      storeId: body.storeId,
      product: body.product,
      category: body.category,
      specificLogins: body.specificLogins
    };
    try {
      const result = await api("/api/admin/broadcasts", {
        method: "POST",
        body: JSON.stringify({ title: body.title, body: body.body, photoUrl, buttonText: body.buttonText, buttonUrl: body.buttonUrl, channel: body.channel, type: body.type, filters })
      });
      data = result.overview;
      toast(`Рассылка отправлена: ${result.broadcast.stats.sent}, ошибок: ${result.broadcast.stats.telegramFailed || 0}`);
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-bot-action]").forEach((button) => button.onclick = async () => {
    if (button.dataset.botAction === "delete" && !confirm("Удалить зеркало?")) return;
    try {
      data = await api("/api/admin/bots", { method: "PATCH", body: JSON.stringify({ id: button.dataset.botId, action: button.dataset.botAction }) });
      toast("Зеркало обновлено");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-bot-select]").forEach((row) => row.onclick = (event) => {
    if (event.target.closest("button")) return;
    data.selectedBotId = row.dataset.botSelect;
    renderShell();
  });
  root.querySelector("[data-owner-withdraw-all]")?.addEventListener("click", (event) => {
    const input = root.querySelector("[data-owner-withdraw-form] input[name='amountUsd']");
    if (input) input.value = event.currentTarget.dataset.ownerWithdrawAll || "0.00";
  });
  root.querySelector("[data-owner-withdraw-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const availableUsd = Number(data?.stats?.ownerWithdrawableUsd || 0);
    if (availableUsd <= 0) return toast("Нет комиссии владельца для вывода", true);
    const form = event.currentTarget;
    const fd = new FormData(form);
    const amountUsd = Number(fd.get("amountUsd") || 0);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return toast("Укажите сумму вывода", true);
    if (amountUsd > availableUsd) return toast("Сумма больше доступного баланса", true);
    const address = String(fd.get("address") || "").trim();
    if (!address) return toast("Укажите LTC кошелек", true);
    if (!confirm(`Создать заявку на вывод ${amountUsd.toFixed(2)} $ на ${address}?`)) return;
    const button = form.querySelector("button.primary");
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Создаём заявку...";
    try {
      data = await api("/api/admin/withdrawals/owner", {
        method: "POST",
        body: JSON.stringify({ amountUsd, address })
      });
      toast("Заявка владельца на вывод создана");
      renderShell();
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
      button.textContent = oldText;
    }
  });
  root.querySelectorAll("[data-withdrawal-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.withdrawalStatus;
      const status = button.dataset.status;
      const label = status === "paid" ? "отметить как выплаченную" : "отклонить";
      if (!id || !status) return;
      if (!confirm(`Вы уверены, что хотите ${label} заявку ${id}?`)) return;
      const oldText = button.textContent;
      button.disabled = true;
      button.textContent = "Сохраняем...";
      try {
        data = await api(`/api/admin/withdrawals/${encodeURIComponent(id)}/status`, {
          method: "POST",
          body: JSON.stringify({ status })
        });
        toast(status === "paid" ? "Заявка отмечена как выплаченная" : "Заявка отклонена");
        renderShell();
      } catch (error) {
        toast(error.message, true);
        button.disabled = false;
        button.textContent = oldText;
      }
    });
  });
  root.querySelector("[data-settings-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      data = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          ownerSettings: {
            platformCommissionPercent: Number(fd.get("platformCommissionPercent") || 0),
            swapCommissionPercent: Number(fd.get("swapCommissionPercent") || 0),
            walletServiceFeePercent: Number(fd.get("walletServiceFeePercent") || 0),
            defaultAutoReleaseHours: Number(fd.get("defaultAutoReleaseHours") || 24)
          },
          paymentSettings: {
            platformLtcWallet: String(fd.get("platformLtcWallet") || "").trim()
          }
        })
      });
      toast("Настройки сохранены");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-support-reply-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = String(new FormData(form).get("body") || "").trim();
      const attachments = await filesToSupportAttachments(form.querySelector('input[type="file"]'));
      if (!body && !attachments.length) return;
      try {
        data = await api(`/api/admin/support-tickets/${encodeURIComponent(form.dataset.supportReplyForm)}/reply`, {
          method: "POST",
          body: JSON.stringify({ body, attachments })
        });
        toast("Ответ отправлен");
        renderShell();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
  root.querySelectorAll("[data-support-close]").forEach((button) => {
    button.onclick = async () => {
      if (!confirm("Закрыть обращение? После закрытия отвечать по нему нельзя.")) return;
      try {
        data = await api(`/api/admin/support-tickets/${encodeURIComponent(button.dataset.supportClose)}/close`, { method: "POST" });
        toast("Обращение закрыто");
        renderShell();
      } catch (error) {
        toast(error.message, true);
      }
    };
  });
  root.querySelector("[data-password-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/password", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      event.currentTarget.reset();
      toast("Пароль обновлен");
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelector("[data-clear-marketplace]")?.addEventListener("click", async () => {
    if (!confirm("Удалить все магазины и очистить обменники? Admin-пользователь останется.")) return;
    try {
      data = await api("/api/admin/marketplace-data", { method: "DELETE" });
      toast("Магазины и обменники очищены");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
  });
}

function drawCharts() {
  root.querySelectorAll("[data-chart]").forEach((canvas) => {
    const rows = data.charts[canvas.dataset.chart] || [];
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const max = Math.max(1, ...rows.map((row) => row.value));
    const step = canvas.width / rows.length;
    ctx.strokeStyle = "#f3a536";
    ctx.lineWidth = 3;
    ctx.beginPath();
    rows.forEach((row, index) => {
      const x = index * step + step / 2;
      const y = canvas.height - 24 - (row.value / max) * (canvas.height - 42);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#aaa69a";
    ctx.font = "11px Arial";
    rows.forEach((row, index) => {
      if (index % 3 === 0) ctx.fillText(row.label, index * step + 4, canvas.height - 6);
    });
  });
}

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, a, input, textarea, select, label, .sidebar, [data-view]")) {
    adminLastInteractionAt = Date.now();
  }
}, { passive: true });

if (token) load().catch(() => renderLogin("Сессия истекла"));
else renderLogin();
