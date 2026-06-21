const root = document.getElementById("admin-app");
const TOKEN_KEY = "cerber_market_admin_token";
const PRIMARY_API_ORIGIN = "https://cerber-project.onrender.com";
const LOCAL_API_HOSTS = ["127.0.0.1", "localhost"];
const API_ORIGIN = location.protocol === "file:" ? PRIMARY_API_ORIGIN : location.origin;
const API_ORIGINS = Array.from(new Set([API_ORIGIN, PRIMARY_API_ORIGIN].filter(Boolean)));
const coins = ["ltc", "eth", "trx", "usdt_trc20", "usdt_erc20", "usdt_sol", "sol"];
const nav = ["Dashboard", "Магазины", "Пользователи", "Сделки", "Диспуты", "Рассылки", "Финансы", "Настройки", "Разное", "Логи", "Боты"];
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
let section = "Dashboard";
let query = "";
let realtimeSocket = null;
let refreshTimer = null;
let adminLastInteractionAt = 0;

function adminIsEditing() {
  const element = document.activeElement;
  return Boolean(element && element.closest("form") && /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
}

function adminCanSilentRender() {
  if (adminIsEditing()) return false;
  if (Date.now() - adminLastInteractionAt < 5000) return false;
  return true;
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
    else if (adminCanSilentRender()) root.querySelector("[data-view]") && (root.querySelector("[data-view]").innerHTML = renderSection(), bindActions(), bindAdminButtonFeedback(root), drawCharts());
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
    bindAdminButtonFeedback(root);
    drawCharts();
  };
  bindActions();
  bindAdminButtonFeedback(root);
  drawCharts();
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
  if (section === "Пользователи") return renderUsers();
  if (section === "Сделки") return renderDeals();
  if (section === "Диспуты") return renderDisputes();
  if (section === "Рассылки") return renderBroadcasts();
  if (section === "Финансы") return renderFinance();
  if (section === "Настройки") return renderSettings();
  if (section === "Разное") return renderMisc();
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
      <p class="muted">Доступно к выводу: <strong>${fmtMoney(s.ownerWithdrawableUsd || 0)}</strong>. Вывод создается на LTC счет площадки из настроек.</p>
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
        <label class="field">Автозакрытие, часов<input name="autoReleaseHours" type="number" min="0" max="168" value="${esc(store.autoReleaseHours || 24)}"></label>
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
    ${d.disputeOpen !== false ? `<button class="ghost" data-close-dispute="${esc(d.id)}">Закрыть спор</button>` : ""}
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
  const withdrawals = data.finances.walletWithdrawals || [];
  return `<section class="grid">${bucketCard("Успешные депозиты", buckets.successful)}${bucketCard("В ожидании", buckets.pending)}${bucketCard("Отмененные", buckets.cancelled)}${bucketCard("Ошибочные", buckets.failed)}</section>
  <article class="table-card"><h3>Пополнения</h3><table><thead><tr><th>ID</th><th>Логин</th><th>Сумма</th><th>Монета</th><th>Статус</th><th>Адрес</th><th>Дата</th></tr></thead><tbody>${deposits.slice(0, 160).map((d) => `<tr><td>${esc(d.id)}</td><td>${esc(d.login)}</td><td>${fmtMoney(d.amountUsd || d.priceAmount || 0)}</td><td>${esc(d.payCurrency || d.coinId || "ltc")}</td><td><span class="status ${statusClass(d.status)}">${esc(d.status)}</span></td><td>${esc(d.payAddress || "")}</td><td>${fmtDate(d.createdAt)}</td></tr>`).join("")}</tbody></table></article>
  <article class="table-card"><h3>Заявки на вывод</h3><table><thead><tr><th>ID</th><th>Магазин</th><th>Логин</th><th>Сумма</th><th>Адрес</th><th>Статус</th><th>Дата</th></tr></thead><tbody>${withdrawals.slice(0, 160).map((w) => `<tr><td>${esc(w.id)}</td><td>${esc(w.scope === "owner" ? "Владелец сайта" : (w.storeName || w.storeId || "-"))}</td><td>${esc(w.login)}</td><td>${Number(w.amountLtc || 0).toFixed(8)} LTC<br><span class="muted">${fmtMoney(w.amountUsd || 0)}</span></td><td>${esc(w.address || "")}</td><td><span class="status ${statusClass(w.status)}">${esc(w.status)}</span></td><td>${fmtDate(w.createdAt)}</td></tr>`).join("")}</tbody></table></article>`;
}
function renderSettings() {
  const owner = data.settings.ownerSettings || {};
  return `<article class="split-card"><h2>Глобальные комиссии</h2><form data-settings-form>
    <p class="muted">Комиссия анонимизации — комиссия за смешивание и защиту криптовалютных переводов.</p>
    <div class="row"><label class="field">Комиссия площадки, %<input name="platformCommissionPercent" type="number" step="0.1" value="${esc(owner.platformCommissionPercent || 0)}"></label><label class="field">Комиссия анонимизации, %<input name="swapCommissionPercent" type="number" step="0.1" value="${esc(owner.swapCommissionPercent || 0)}"></label></div>
    <div class="row"><label class="field">Комиссия вывода, %<input name="walletServiceFeePercent" type="number" step="0.1" value="${esc(owner.walletServiceFeePercent || 0)}"></label><label class="field">Автозакрытие сделок, часов<input name="defaultAutoReleaseHours" type="number" min="0" max="168" value="${esc(owner.defaultAutoReleaseHours || 24)}"></label></div>
    <p class="muted">Автозакрытие: если клиент оплатил, не подтвердил заказ и не открыл диспут, после указанного времени сделка станет успешной, а сумма будет учтена в доходе магазина.</p>
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
  root.querySelectorAll("[data-close-dispute]").forEach((button) => button.onclick = async () => {
    try {
      await api(`/api/orders/${encodeURIComponent(button.dataset.closeDispute)}/dispute/close`, { method: "POST" });
      toast("Спор закрыт");
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
  root.querySelector("[data-disabled-support-routing-handler]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedRecipients = [...event.currentTarget.querySelectorAll("[data-support-topic-login]")]
      .map((input) => {
        const index = input.dataset.supportTopicLogin;
        const enabled = event.currentTarget.querySelector(`[data-support-topic-enabled="${index}"]`)?.checked;
        const login = String(input.value || "").trim();
        const title = input.dataset.supportTopicTitle || `Раздел ${Number(index) + 1}`;
        const id = input.dataset.supportTopicId || `support-topic-${index}`;
        return enabled && login ? { id, title, login } : null;
      })
      .filter(Boolean);
    try {
      data = await api("/api/admin/support-settings", {
        method: "PUT",
        body: JSON.stringify({ supportSettings: { recipients: selectedRecipients } })
      });
      toast("Разделы поддержки сохранены");
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
