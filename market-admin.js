const root = document.getElementById("admin-app");
const TOKEN_KEY = "cerber_market_admin_token";
const PRIMARY_API_ORIGIN = "https://cerber.vip";
const LOCAL_API_HOSTS = ["127.0.0.1", "localhost"];
const API_ORIGIN = LOCAL_API_HOSTS.includes(location.hostname) || location.hostname === "cerber.vip" ? location.origin : PRIMARY_API_ORIGIN;
const coins = ["ltc", "eth", "trx", "usdt_trc20", "usdt_erc20", "usdt_sol", "sol"];
const nav = ["Dashboard", "Магазины", "Пользователи", "Сделки", "Диспуты", "Рассылки", "Финансы", "Настройки", "Логи", "Боты"];

let token = localStorage.getItem(TOKEN_KEY) || "";
let data = null;
let section = "Dashboard";
let query = "";
let realtimeSocket = null;
let refreshTimer = null;

function adminIsEditing() {
  const element = document.activeElement;
  return Boolean(element && element.closest("form") && /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

async function formImageValue(formData, fileName, fallbackName = "") {
  const file = formData.get(fileName);
  if (file && file.size) return fileToDataUrl(file);
  return String(formData.get(fallbackName || fileName) || "").trim();
}

async function api(path, options = {}) {
  const target = /^https?:\/\//i.test(String(path || "")) ? path : `${API_ORIGIN}${path}`;
  const response = await fetch(target, {
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

async function refreshData(silent = false) {
  if (!token) return;
  try {
    data = await api("/api/admin/overview");
    if (!silent) renderShell();
    else if (!adminIsEditing()) root.querySelector("[data-view]") && (root.querySelector("[data-view]").innerHTML = renderSection(), bindActions(), drawCharts());
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
    root.querySelector("[data-view]").innerHTML = renderSection();
    bindActions();
    drawCharts();
  };
  bindActions();
  drawCharts();
}

function renderSection() {
  if (!data) return "";
  if (section === "Dashboard") return renderDashboard();
  if (section === "Магазины") return renderStores();
  if (section === "Пользователи") return renderUsers();
  if (section === "Сделки") return renderDeals();
  if (section === "Диспуты") return renderDisputes();
  if (section === "Рассылки") return renderBroadcasts();
  if (section === "Финансы") return renderFinance();
  if (section === "Настройки") return renderSettings();
  if (section === "Логи") return renderLogs();
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
      ${statCard("Новые пользователи", s.newUsers, "за сутки")}
      ${statCard("Всего пользователей", s.totalUsers, `${s.usersWithPurchase} с покупкой`)}
      ${statCard("Диспуты", s.disputes, "открытые")}
      ${statCard("Активные сделки", s.activeDeals, "в работе")}
      ${statCard("Онлайн", s.onlineUsers, "realtime")}
    </section>
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
        <label class="field">Описание магазина<textarea name="description"></textarea></label>
        <div class="checks">
          <label><input name="region_moldova" type="checkbox" checked> Молдова</label>
          <label><input name="region_transnistria" type="checkbox"> Приднестровье</label>
        </div>
        <button class="primary">Создать магазин</button>
      </form>
      <div data-created-store></div>
    </article>
    <section class="split">
      <article class="table-card"><table><thead><tr><th>Магазин</th><th>ID</th><th>Статус</th><th>Продажи</th><th>Доход</th><th>Комиссия</th><th>Клиенты</th><th>Товары</th><th>Диспуты</th><th>Дата</th></tr></thead><tbody>
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
  const panelUrl = store.panel?.shopPanelUrl || `https://cerber.vip/#shop-panel-${store.id}`;
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
        <label class="field">Автозакрытие, часов<input name="autoReleaseHours" type="number" min="0" max="72" value="${esc(store.autoReleaseHours || 24)}"></label>
      </div>
      <div class="row">
        <label class="field">Баннер URL<input name="cover" value="${esc(store.cover || "")}"></label>
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
        <label class="field">Автозакрытие, часов<input name="autoReleaseHours" type="number" min="0" max="72" value="${esc(store.autoReleaseHours || 24)}"></label>
      </div>
      <label class="field">Пароль панели магазина<input name="adminPassword" placeholder="новый пароль магазина"></label>
      <div class="checks">${coins.map((coin) => `<label><input name="coin_${coin}" type="checkbox" ${store.coins?.[coin] !== false ? "checked" : ""}> ${coin.toUpperCase()}</label>`).join("")}</div>
      <p><button class="primary">Сохранить магазин</button> <button class="ghost danger" type="button" data-delete-store="${esc(store.id)}">DELETE магазин</button></p>
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
    <h3>Telegram зеркала</h3><div class="table-card">${smallTable(["Источник", "Кто создал", "Telegram", "Бот", "Дата", "Статус", "Token"], bots.map((b) => [b.source || "-", b.loginKey || b.login || "-", b.username || b.chatId || "-", b.botUsername || "-", fmtDate(b.createdAt), b.blocked ? "blocked" : b.verified ? "active" : "pending", b.token || "-"]))}</div>
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
  const rows = filterRows(data.disputes, ["id", "login", "fromLogin", "storeId", "status"]);
  return `<section class="split"><article class="table-card"><table><thead><tr><th>ID</th><th>Клиент</th><th>Магазин</th><th>Сумма</th><th>Статус</th><th>Срок</th><th></th></tr></thead><tbody>
    ${rows.map((o) => `<tr><td>${esc(o.id)}</td><td>${esc(o.login || o.fromLogin || "")}</td><td>${esc(o.storeName || o.storeId || o.toLogin || "")}</td><td>${fmtMoney(o.amountUsd || o.priceUsd)}</td><td><span class="status off">dispute</span></td><td>${fmtDate(o.disputeUntil || o.createdAt)}</td><td><button class="ghost" data-dispute="${esc(o.id)}">Открыть</button></td></tr>`).join("")}
  </tbody></table></article><article class="split-card" data-dispute-detail><h2>Диспут</h2><p class="muted">Открой диспут, чтобы увидеть заказ, клиента, магазин, сумму и переписку.</p></article></section>`;
}

function disputeDetail(payload) {
  const d = payload.dispute;
  return `<h2>Диспут ${esc(d.id)}</h2>
    <p><strong>Клиент:</strong> ${esc(payload.clientLogin || "-")}</p>
    <p><strong>Магазин:</strong> ${esc(payload.store?.name || payload.storeLogin || "-")}</p>
    <p><strong>Сумма:</strong> ${fmtMoney(payload.amount)}</p>
    <p><strong>Статус:</strong> ${esc(d.status || "dispute")}</p>
    <button class="primary" data-join-dispute="${esc(d.id)}">Войти в диспут</button>
    <h3>Переписка</h3>
    <div class="table-card">${smallTable(["Дата", "От", "Кому", "Тема", "Сообщение"], payload.messages.map((m) => [fmtDate(m.createdAt), m.fromLogin || "-", m.toLogin || "-", m.subject || "-", m.body || m.text || ""]))}</div>`;
}

function renderBroadcasts() {
  return `<section class="split"><article class="split-card"><h2>Новая рассылка</h2><form data-broadcast-form>
    <label class="field">Фото файлом<input name="photoFile" type="file" accept="image/*"></label>
    <label class="field">Заголовок<input name="title" required></label>
    <label class="field">Текст<textarea name="body" required></textarea></label>
    <div class="row"><label class="field">Фото URL<input name="photoUrl" placeholder="https://..."></label><label class="field">Канал<select name="channel"><option value="both">Сайт + Telegram</option><option value="site">Только сайт</option><option value="telegram">Только Telegram</option></select></label></div>
    <div class="row"><label class="field">Текст кнопки<input name="buttonText" placeholder="Открыть"></label><label class="field">Ссылка кнопки<input name="buttonUrl" placeholder="https://..."></label></div>
    <div class="row"><label class="field">Тип<select name="type"><option value="popup">Popup</option><option value="banner">Баннер</option><option value="push">Push</option></select></label><label class="field">Кому отправить<select name="audience"><option value="all">Всем пользователям</option><option value="online">Онлайн пользователям</option><option value="buyers">С покупками</option><option value="no_purchases">Без покупок</option><option value="balance">С балансом</option><option value="custom">По фильтрам ниже</option></select></label></div>
    <div class="row"><label class="field">Мин. сумма покупок<input name="minPurchase" type="number" step="0.01" placeholder="1"></label><label class="field">Макс. сумма покупок<input name="maxPurchase" type="number" step="0.01" placeholder="1000"></label></div>
    <div class="row"><label class="field">Без покупок N дней<input name="noPurchasesDays" type="number" step="1" placeholder="2"></label><label class="field">Баланс<select name="balanceMode"><option value="">Не важно</option><option value="with">С балансом</option><option value="without">Без баланса</option></select></label></div>
    <div class="row"><label class="field">Магазин<select name="storeId"><option value="">Любой</option>${data.stores.map((store) => `<option value="${esc(store.id)}">${esc(store.name)}</option>`).join("")}</select></label><label class="field">Товар<input name="product" placeholder="название или ID"></label></div>
    <label class="field">Категория<input name="category" placeholder="категория товара"></label>
    <label class="field">Конкретные пользователи<input name="specificLogins" placeholder="login1, login2, login3"></label>
    <button class="primary">Отправить рассылку</button>
  </form></article><article class="table-card"><table><thead><tr><th>Название</th><th>Канал</th><th>Отправлено</th><th>Ошибки</th><th>Клики</th><th>Закрыли</th><th>Дата</th></tr></thead><tbody>
    ${data.broadcasts.map((b) => `<tr><td>${esc(b.title)}<br><span class="muted">получателей: ${(b.recipients || []).length}</span></td><td>${esc(b.channel)}<br><span class="muted">site ${b.stats?.siteSent || 0} / tg ${b.stats?.telegramSent || 0}</span></td><td>${b.stats?.sent || 0}</td><td>${b.stats?.telegramFailed || b.stats?.notDelivered || 0}</td><td>${b.stats?.clicked || 0}</td><td>${b.stats?.closed || 0}</td><td>${fmtDate(b.createdAt)}</td></tr>`).join("")}
  </tbody></table></article></section>`;
}

function renderFinance() {
  const buckets = data.finances.depositsByStatus || {};
  const bucketCard = (label, rows) => statCard(label, rows?.length || 0, fmtMoney((rows || []).reduce((sum, item) => sum + Number(item.amountUsd || item.priceAmount || 0), 0)));
  const deposits = data.finances.walletDeposits || [];
  return `<section class="grid">${bucketCard("Успешные депозиты", buckets.successful)}${bucketCard("В ожидании", buckets.pending)}${bucketCard("Отмененные", buckets.cancelled)}${bucketCard("Ошибочные", buckets.failed)}</section>
  <article class="table-card"><table><thead><tr><th>ID</th><th>Пользователь</th><th>Монета</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead><tbody>${deposits.slice(0, 160).map((d) => `<tr><td>${esc(d.id)}</td><td>${esc(d.login)}</td><td>${esc(d.coinId || d.payCurrency)}</td><td>${fmtMoney(d.amountUsd)}</td><td><span class="status ${statusClass(d.status)}">${esc(d.status)}</span></td><td>${fmtDate(d.createdAt)}</td></tr>`).join("")}</tbody></table></article>`;
}

function renderSettings() {
  const owner = data.settings.ownerSettings || {};
  return `<article class="split-card"><h2>Глобальные комиссии</h2><form data-settings-form>
    <p class="muted">Комиссия анонимизации — комиссия за смешивание и защиту криптовалютных переводов.</p>
    <div class="row"><label class="field">Комиссия площадки, %<input name="platformCommissionPercent" type="number" step="0.1" value="${esc(owner.platformCommissionPercent || 0)}"></label><label class="field">Комиссия анонимизации, %<input name="swapCommissionPercent" type="number" step="0.1" value="${esc(owner.swapCommissionPercent || 0)}"></label></div>
    <div class="row"><label class="field">Комиссия вывода, %<input name="walletServiceFeePercent" type="number" step="0.1" value="${esc(owner.walletServiceFeePercent || 0)}"></label><label class="field">Автозакрытие сделок, часов<input name="defaultAutoReleaseHours" type="number" min="0" max="72" value="${esc(owner.defaultAutoReleaseHours || 24)}"></label></div>
    <p class="muted">Автозакрытие: если клиент оплатил, не подтвердил заказ и не открыл диспут, после указанного времени сделка станет успешной, а сумма будет учтена в доходе магазина.</p>
    <button class="primary">Сохранить настройки</button>
  </form><hr><form data-password-form><h3>Сменить пароль админки</h3><div class="row"><label class="field">Текущий пароль<input name="currentPassword" type="password"></label><label class="field">Новый пароль<input name="nextPassword" type="password"></label></div><button class="ghost">Сменить пароль</button></form></article>`;
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
    broadcast_created: "Создание рассылки"
  }[action] || action);
  return `<article class="table-card"><table><thead><tr><th>Дата</th><th>Категория</th><th>Админ</th><th>Действие</th><th>Детали</th></tr></thead><tbody>${rows.map((log) => `<tr><td>${fmtDate(log.createdAt)}</td><td>${esc(String(log.action || "").split("_")[0])}</td><td>${esc(log.actor)}</td><td>${esc(label(log.action))}</td><td>${esc(JSON.stringify(log.details || {}))}</td></tr>`).join("")}</tbody></table></article>`;
}

function renderBots() {
  return `<section class="grid">${statCard("Всего ботов", data.bots.total, "зеркала клиентов")}${statCard("Активные", data.bots.active, "verified")}${statCard("Заблокированные", data.bots.blocked, "blocked")}</section>
  <article class="table-card"><table><thead><tr><th>Источник</th><th>Кто создал</th><th>Telegram</th><th>Бот</th><th>Дата</th><th>Активность</th><th>Статус</th><th>Token</th><th>Управление</th></tr></thead><tbody>${data.bots.items.map((b) => `<tr><td>${esc(b.source || "")}</td><td>${esc(b.loginKey || b.login || "-")}</td><td>${esc(b.username || b.chatId || "-")}</td><td>${esc(b.botUsername || "-")}</td><td>${fmtDate(b.createdAt)}</td><td>${fmtDate(b.updatedAt)}</td><td>${b.blocked ? "blocked" : b.verified ? "active" : "disabled"}</td><td>${esc(b.token || "-")}</td><td><button class="ghost" data-bot-action="${b.verified ? "disable" : "enable"}" data-bot-id="${esc(b.id)}">${b.verified ? "Отключить" : "Включить"}</button> <button class="ghost danger" data-bot-action="${b.blocked ? "unblock" : "block"}" data-bot-id="${esc(b.id)}">${b.blocked ? "Разблокировать" : "Заблокировать"}</button> <button class="ghost danger" data-bot-action="delete" data-bot-id="${esc(b.id)}">Удалить</button></td></tr>`).join("")}</tbody></table></article>`;
  return `<section class="grid">${statCard("Всего ботов", data.bots.total, "зеркала клиентов")}${statCard("Активные", data.bots.active, "verified")}${statCard("Заблокированные", data.bots.blocked, "blocked")}</section>
  <article class="table-card"><table><thead><tr><th>Источник</th><th>Chat ID</th><th>Создатель</th><th>Статус</th><th>Token</th><th>Управление</th></tr></thead><tbody>${data.bots.items.map((b) => `<tr><td>${esc(b.source || "")}</td><td>${esc(b.chatId)}</td><td>${esc(b.loginKey || "-")}</td><td>${b.blocked ? "blocked" : b.verified ? "active" : "disabled"}</td><td>${esc(b.token || "-")}</td><td><button class="ghost" data-bot-action="disable" data-bot-id="${esc(b.id)}">Отключить</button> <button class="ghost danger" data-bot-action="block" data-bot-id="${esc(b.id)}">Заблокировать</button> <button class="ghost danger" data-bot-action="delete" data-bot-id="${esc(b.id)}">Удалить</button></td></tr>`).join("")}</tbody></table></article>`;
}

function renderMirrorBots() {
  const rows = data.bots.items || [];
  const selected = rows.find((b) => b.id === data.selectedBotId) || rows[0];
  const detail = selected ? `<article class="split-card">
    <h3>Зеркало @${esc(selected.botUsername || selected.botName || "-")}</h3>
    <p class="muted">Токен: <code>${esc(selected.token || "-")}</code><br>Webhook: <code>${esc(selected.webhookUrl || "-")}</code><br>Telegram ID владельца: <strong>${esc(selected.ownerTelegramId || selected.chatId || "-")}</strong><br>Username владельца: <strong>${esc(selected.username || "-")}</strong><br>Дата регистрации: ${fmtDate(selected.createdAt)}<br>Последняя ошибка Telegram API: ${esc(selected.lastTelegramError || "-")}</p>
    <section class="grid">${statCard("Пользователей", selected.usersCount || 0, "в зеркале")}${statCard("Сообщений", selected.sentMessagesCount || 0, "отправлено")}${statCard("Рассылок", selected.broadcastsCount || 0, "через зеркало")}${statCard("Ошибок API", selected.telegramErrorsCount || 0, "Telegram")}</section>
  </article>` : `<article class="split-card"><h3>Зеркал пока нет</h3><p class="muted">Зеркала появляются автоматически после подключения токена через основной Telegram-бот.</p></article>`;
  return `<section class="grid">${statCard("Всего зеркал", data.bots.total, "автоматический реестр")}${statCard("Активные", data.bots.active, "работают")}${statCard("Заблокированные", data.bots.blocked, "blocked")}</section>
  <article class="table-card"><table><thead><tr><th>ID</th><th>Username пользователя</th><th>Username бота</th><th>Название</th><th>Статус</th><th>Webhook</th><th>Дата</th><th>Активность</th><th>Управление</th></tr></thead><tbody>${rows.map((b) => `<tr data-bot-select="${esc(b.id)}"><td>${esc(b.id || "-")}</td><td>${esc(b.username || b.loginKey || "-")}</td><td>${esc(b.botUsername || "-")}</td><td>${esc(b.botName || "-")}</td><td>${esc(b.status || (b.blocked ? "blocked" : b.active ? "active" : "disabled"))}</td><td>${b.webhookOk ? "ok" : "error"}</td><td>${fmtDate(b.createdAt)}</td><td>${fmtDate(b.lastActivityAt || b.updatedAt)}</td><td><button class="ghost" data-bot-action="${b.active ? "disable" : "enable"}" data-bot-id="${esc(b.id)}">${b.active ? "Отключить" : "Включить"}</button> <button class="ghost" data-bot-action="restartWebhook" data-bot-id="${esc(b.id)}">Webhook</button> <button class="ghost" data-bot-action="checkApi" data-bot-id="${esc(b.id)}">Проверить</button> <button class="ghost danger" data-bot-action="delete" data-bot-id="${esc(b.id)}">Удалить</button></td></tr>`).join("")}</tbody></table></article>${detail}`;
}

function bindActions() {
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
          countries
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
      const cover = await formImageValue(fd, "coverFile", "cover");
      data = await api(`/api/admin/stores/${encodeURIComponent(form.dataset.storeForm)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: fd.get("name"),
          ownerLogin: fd.get("ownerLogin"),
          description: fd.get("description"),
          image,
          cover,
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
  root.querySelectorAll("[data-dispute]").forEach((button) => button.onclick = async () => {
    try {
      const payload = await api(`/api/admin/disputes/${encodeURIComponent(button.dataset.dispute)}`);
      root.querySelector("[data-dispute-detail]").innerHTML = disputeDetail(payload);
      bindActions();
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelectorAll("[data-join-dispute]").forEach((button) => button.onclick = async () => {
    try {
      await api(`/api/admin/disputes/${encodeURIComponent(button.dataset.joinDispute)}/join`, { method: "POST" });
      toast("Администратор вошел в диспут");
      await refreshData(true);
    } catch (error) {
      toast(error.message, true);
    }
  });
  root.querySelector("[data-broadcast-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const formData = new FormData(event.currentTarget);
    const photoUrl = await formImageValue(formData, "photoFile", "photoUrl");
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
  root.querySelector("[data-settings-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      data = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ownerSettings: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, Number(v)])) }) });
      toast("Настройки сохранены");
      renderShell();
    } catch (error) {
      toast(error.message, true);
    }
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

if (token) load().catch(() => renderLogin("Сессия истекла"));
else renderLogin();
