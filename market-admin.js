const root = document.getElementById("admin-app");
const TOKEN_KEY = "cerber_market_admin_token";
const coins = ["ltc", "eth", "trx", "usdt_trc20", "usdt_erc20", "usdt_sol", "sol"];
const nav = ["Dashboard", "Магазины", "Пользователи", "Сделки", "Диспуты", "Рассылки", "Финансы", "Настройки", "Логи", "Боты"];

let token = localStorage.getItem(TOKEN_KEY) || "";
let data = null;
let section = "Dashboard";
let query = "";

function fmtMoney(value) {
  return `${Number(value || 0).toFixed(2)} $`;
}

function fmtDate(value) {
  const date = Number(value) ? new Date(Number(value)) : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

async function api(path, options = {}) {
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
      await load();
    } catch (error) {
      renderLogin(error.message);
    }
  };
}

async function load() {
  data = await api("/api/admin/overview");
  renderShell();
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
    renderLogin();
  };
  root.querySelector("[data-search]").oninput = (event) => {
    query = event.target.value.toLowerCase();
    root.querySelector("[data-view]").innerHTML = renderSection();
    bindActions();
  };
  bindActions();
  drawCharts();
}

function renderSection() {
  if (section === "Dashboard") return renderDashboard();
  if (section === "Магазины") return renderStores();
  if (section === "Пользователи") return renderUsers();
  if (section === "Сделки") return renderDeals();
  if (section === "Диспуты") return renderDisputes();
  if (section === "Рассылки") return renderBroadcasts();
  if (section === "Финансы") return renderFinance();
  if (section === "Настройки") return renderSettings();
  if (section === "Логи") return renderLogs();
  if (section === "Боты") return renderBots();
  return "";
}

function statCard(label, value, hint = "") {
  return `<article class="card"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
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
      ${statCard("Онлайн", s.onlineUsers, "по сессиям")}
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

function filterRows(rows, keys) {
  if (!query) return rows;
  return rows.filter((row) => keys.some((key) => String(row[key] ?? "").toLowerCase().includes(query)));
}

function renderStores() {
  const rows = filterRows(data.stores, ["id", "name", "ownerLogin", "status"]);
  return `
    <section class="split">
      <article class="table-card"><table><thead><tr><th>Магазин</th><th>ID</th><th>Статус</th><th>Продажи</th><th>Доход</th><th>Комиссия</th><th>Клиенты</th><th>Товары</th><th>Диспуты</th><th>Дата</th></tr></thead><tbody>
        ${rows.map((s) => `<tr data-store="${esc(s.id)}"><td><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.ownerLogin)}</span></td><td>${esc(s.id)}</td><td><span class="status ${s.status === "active" ? "" : "off"}">${esc(s.status)}</span></td><td>${s.sales}</td><td>${fmtMoney(s.revenue)}</td><td>${fmtMoney(s.commission)}</td><td>${s.clients}</td><td>${s.products}</td><td>${s.disputes}</td><td>${fmtDate(s.registeredAt)}</td></tr>`).join("")}
      </tbody></table></article>
      <article class="split-card" data-store-detail><h2>Магазин</h2><p class="muted">Выбери строку магазина для управления комиссией, позицией, статусом и монетами.</p></article>
    </section>
  `;
}

function storeDetail(id) {
  const store = data.stores.find((item) => item.id === id);
  if (!store) return "";
  return `
    <h2>${esc(store.name)}</h2>
    <form data-store-form="${esc(store.id)}">
      <div class="row">
        <label class="field">Статус<select name="status"><option value="active" ${store.status === "active" ? "selected" : ""}>active</option><option value="disabled" ${store.status !== "active" ? "selected" : ""}>disabled</option></select></label>
        <label class="field">Комиссия 0-20%<input name="commissionPercent" type="number" min="0" max="20" step="0.1" value="${esc(store.commissionPercent)}"></label>
      </div>
      <div class="row">
        <label class="field">Позиция на главной<input name="homepagePosition" type="number" min="0" step="1" value="${esc(store.homepagePosition)}"></label>
        <label class="field">Автозакрытие, часов<input name="autoReleaseHours" type="number" min="0" max="72" value="24"></label>
      </div>
      <label class="field">Пароль панели магазина<input name="adminPassword" placeholder="новый пароль магазина"></label>
      <div class="checks">${coins.map((coin) => `<label><input name="coin_${coin}" type="checkbox" ${store.coins?.[coin] !== false ? "checked" : ""}> ${coin.toUpperCase()}</label>`).join("")}</div>
      <p><button class="primary">Сохранить магазин</button></p>
    </form>
    <h3>Товары</h3>
    <p class="muted">Редактирование полного товара доступно в текущей панели магазина; здесь можно быстро удалить товар через API.</p>
  `;
}

function renderUsers() {
  const rows = filterRows(data.users, ["login", "name", "role", "status"]);
  return `<article class="table-card"><table><thead><tr><th>№</th><th>Пользователь</th><th>Роль</th><th>Регистрация</th><th>Покупки</th><th>Сумма</th><th>Баланс</th><th>Диспуты</th><th>Действие</th></tr></thead><tbody>
    ${rows.map((u) => `<tr><td>${u.number}</td><td><strong>${esc(u.login)}</strong><br><span class="muted">${esc(u.name)}</span></td><td>${esc(u.role)}</td><td>${fmtDate(u.registeredAt)}</td><td>${u.purchases}</td><td>${fmtMoney(u.purchaseUsd)}</td><td>${fmtMoney(u.balance)}</td><td>${u.disputes}</td><td><button class="ghost" data-user="${esc(u.login)}">Открыть</button></td></tr>`).join("")}
  </tbody></table></article><div data-user-detail></div>`;
}

function renderDeals() {
  return `<article class="table-card"><table><thead><tr><th>ID</th><th>Тип</th><th>Пользователь</th><th>Магазин</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
    ${data.deals.map((o) => `<tr><td>${esc(o.id)}</td><td>${esc(o.type || "exchange")}</td><td>${esc(o.login || o.fromLogin || "")}</td><td>${esc(o.storeName || o.storeId || o.toLogin || "")}</td><td>${fmtMoney(o.amountUsd || o.priceUsd)}</td><td>${esc(o.status || o.paymentStatus || "")}</td><td>${fmtDate(o.createdAt || o.date)}</td></tr>`).join("")}
  </tbody></table></article>`;
}

function renderDisputes() {
  return `<article class="table-card"><table><thead><tr><th>ID</th><th>Пользователь</th><th>Сумма</th><th>Статус</th><th>Срок</th></tr></thead><tbody>
    ${data.disputes.map((o) => `<tr><td>${esc(o.id)}</td><td>${esc(o.login || o.fromLogin || "")}</td><td>${fmtMoney(o.amountUsd || o.priceUsd)}</td><td><span class="status off">dispute</span></td><td>${fmtDate(o.disputeUntil || o.createdAt)}</td></tr>`).join("")}
  </tbody></table></article>`;
}

function renderBroadcasts() {
  return `<section class="split"><article class="split-card"><h2>Новая рассылка</h2><form data-broadcast-form>
    <label class="field">Заголовок<input name="title" required></label>
    <label class="field">Текст<textarea name="body" required></textarea></label>
    <div class="row"><label class="field">Канал<select name="channel"><option value="both">Сайт + Telegram</option><option value="site">Только сайт</option><option value="telegram">Только Telegram</option></select></label><label class="field">Тип<select name="type"><option value="popup">Popup</option><option value="banner">Баннер</option><option value="push">Push</option></select></label></div>
    <label class="field">Кому отправить<select name="audience">
      <option value="all">Всем пользователям</option>
      <option value="online">Онлайн пользователям</option>
      <option value="buyers">Пользователям с покупками</option>
      <option value="no_purchases">Без покупок</option>
      <option value="balance">С балансом</option>
      <option value="custom">По фильтрам ниже</option>
    </select></label>
    <div class="row"><label class="field">Мин. сумма покупок<input name="minPurchase" type="number" step="0.01" placeholder="1"></label><label class="field">Макс. сумма покупок<input name="maxPurchase" type="number" step="0.01" placeholder="1000"></label></div>
    <div class="row"><label class="field">Без покупок N дней<input name="noPurchasesDays" type="number" step="1" placeholder="2"></label><label class="field">Баланс<select name="balanceMode"><option value="">Не важно</option><option value="with">С балансом</option><option value="without">Без баланса</option></select></label></div>
    <div class="row"><label class="field">Магазин<select name="storeId"><option value="">Любой</option>${data.stores.map((store) => `<option value="${esc(store.id)}">${esc(store.name)}</option>`).join("")}</select></label><label class="field">Товар<input name="product" placeholder="название или ID"></label></div>
    <label class="field">Категория<input name="category" placeholder="категория товара"></label>
    <label class="field">Конкретные пользователи<input name="specificLogins" placeholder="login1, login2, login3"></label>
    <button class="primary">Создать</button>
  </form></article><article class="table-card"><table><thead><tr><th>Название</th><th>Канал</th><th>Клики</th><th>Закрыли</th><th>Дата</th></tr></thead><tbody>
    ${data.broadcasts.map((b) => `<tr><td>${esc(b.title)}<br><span class="muted">получателей: ${(b.recipients || []).length}</span></td><td>${esc(b.channel)}<br><span class="muted">site ${b.stats?.siteSent || 0} / tg ${b.stats?.telegramSent || 0}</span></td><td>${b.stats?.clicked || 0}</td><td>${b.stats?.closed || 0}</td><td>${fmtDate(b.createdAt)}</td></tr>`).join("")}
  </tbody></table></article></section>`;
}

function renderFinance() {
  const deposits = data.finances.walletDeposits || [];
  const tx = data.finances.walletTransactions || [];
  return `<section class="grid">${statCard("Депозиты", deposits.length, fmtMoney(deposits.reduce((s, d) => s + Number(d.amountUsd || 0), 0)))}${statCard("Транзакции", tx.length, "история кошельков")}${statCard("Комиссия", fmtMoney(data.stats.totalCommission), "площадка")}${statCard("Оборот", fmtMoney(data.stats.totalTurnover), "площадка")}</section>
  <article class="table-card"><table><thead><tr><th>ID</th><th>Пользователь</th><th>Монета</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead><tbody>${deposits.slice(0, 120).map((d) => `<tr><td>${esc(d.id)}</td><td>${esc(d.login)}</td><td>${esc(d.coinId || d.payCurrency)}</td><td>${fmtMoney(d.amountUsd)}</td><td>${esc(d.status)}</td><td>${fmtDate(d.createdAt)}</td></tr>`).join("")}</tbody></table></article>`;
}

function renderSettings() {
  const owner = data.settings.ownerSettings || {};
  return `<article class="split-card"><h2>Глобальные комиссии и безопасность</h2><form data-settings-form>
    <div class="row"><label class="field">Комиссия площадки, %<input name="platformCommissionPercent" type="number" step="0.1" value="${esc(owner.platformCommissionPercent || 0)}"></label><label class="field">Комиссия анонимизации, %<input name="swapCommissionPercent" type="number" step="0.1" value="${esc(owner.swapCommissionPercent || 0)}"></label></div>
    <div class="row"><label class="field">Комиссия вывода, %<input name="walletServiceFeePercent" type="number" step="0.1" value="${esc(owner.walletServiceFeePercent || 0)}"></label><label class="field">Автозакрытие сделок, часов<input name="defaultAutoReleaseHours" type="number" min="0" max="72" value="${esc(owner.defaultAutoReleaseHours || 24)}"></label></div>
    <button class="primary">Сохранить настройки</button>
  </form><hr><form data-password-form><h3>Сменить пароль админки</h3><div class="row"><label class="field">Текущий пароль<input name="currentPassword" type="password"></label><label class="field">Новый пароль<input name="nextPassword" type="password"></label></div><button class="ghost">Сменить пароль</button></form></article>`;
}

function renderLogs() {
  return `<article class="table-card"><table><thead><tr><th>Дата</th><th>Админ</th><th>Действие</th><th>Детали</th></tr></thead><tbody>${data.logs.map((log) => `<tr><td>${fmtDate(log.createdAt)}</td><td>${esc(log.actor)}</td><td>${esc(log.action)}</td><td>${esc(JSON.stringify(log.details || {}))}</td></tr>`).join("")}</tbody></table></article>`;
}

function renderBots() {
  return `<section class="grid">${statCard("Всего ботов", data.bots.total, "зеркала клиентов")}${statCard("Активные", data.bots.active, "verified")}${statCard("Заблокированные", data.bots.blocked, "blocked")}</section>
  <article class="table-card"><table><thead><tr><th>Источник</th><th>Chat ID</th><th>Login key</th><th>Статус</th><th>Token</th></tr></thead><tbody>${data.bots.items.map((b) => `<tr><td>${esc(b.source || "")}</td><td>${esc(b.chatId)}</td><td>${esc(b.loginKey)}</td><td>${b.blocked ? "blocked" : b.verified ? "active" : "pending"}</td><td>${esc(b.token)}</td></tr>`).join("")}</tbody></table></article>`;
}

function bindActions() {
  root.querySelectorAll("[data-store]").forEach((row) => row.onclick = () => {
    root.querySelector("[data-store-detail]").innerHTML = storeDetail(row.dataset.store);
    bindActions();
  });
  root.querySelectorAll("[data-store-form]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const enabledCoins = Object.fromEntries(coins.map((coin) => [coin, Boolean(fd.get(`coin_${coin}`))]));
    await api(`/api/admin/stores/${encodeURIComponent(form.dataset.storeForm)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: fd.get("status"),
        commissionPercent: Number(fd.get("commissionPercent")),
        homepagePosition: Number(fd.get("homepagePosition")),
        autoReleaseHours: Number(fd.get("autoReleaseHours")),
        adminPassword: fd.get("adminPassword") || undefined,
        enabledCoins
      })
    });
    data = await api("/api/admin/overview");
    renderShell();
  });
  root.querySelectorAll("[data-user]").forEach((button) => button.onclick = async () => {
    const payload = await api(`/api/admin/users/${encodeURIComponent(button.dataset.user)}`);
    root.querySelector("[data-user-detail]").innerHTML = userDetail(payload);
    bindActions();
  });
  root.querySelectorAll("[data-user-form]").forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    await api(`/api/admin/users/${encodeURIComponent(form.dataset.userForm)}`, {
      method: "PATCH",
      body: JSON.stringify({ role: fd.get("role"), storePassword: fd.get("storePassword") })
    });
    data = await api("/api/admin/overview");
    renderShell();
  });
  root.querySelector("[data-broadcast-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = Object.fromEntries(fd.entries());
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
    await api("/api/admin/broadcasts", {
      method: "POST",
      body: JSON.stringify({ title: body.title, body: body.body, channel: body.channel, type: body.type, filters })
    });
    data = await api("/api/admin/overview");
    renderShell();
  });
  root.querySelector("[data-settings-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ownerSettings: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, Number(v)])) }) });
    data = await api("/api/admin/overview");
    renderShell();
  });
  root.querySelector("[data-password-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await api("/api/admin/password", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
    event.currentTarget.reset();
    alert("Пароль обновлен");
  });
}

function userDetail(payload) {
  const u = payload.user;
  return `<article class="split-card"><h2>${esc(u.login)}</h2><form data-user-form="${esc(u.login)}"><div class="row"><label class="field">Роль<select name="role">${["admin", "moderator", "seller", "user"].map((role) => `<option value="${role}" ${u.role === role ? "selected" : ""}>${role}</option>`).join("")}</select></label><label class="field">Пароль магазина<input name="storePassword" placeholder="задать для роли Магазин"></label></div><button class="primary">Сохранить пользователя</button></form><h3>Статистика</h3><p>Покупки: ${fmtMoney(payload.summary.totalPurchases)} · Депозиты: ${fmtMoney(payload.summary.totalDeposits)} · Средний чек: ${fmtMoney(payload.summary.averageCheck)} · Диспуты: ${payload.summary.disputes}</p><h3>Купленные товары</h3>${payload.products.map((p) => `<p>${esc(p.name)} — ${p.count} покупок</p>`).join("") || "<p class='muted'>Покупок нет</p>"}</article>`;
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
