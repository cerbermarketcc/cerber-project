import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import WebSocket, { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || "";
const nowpaymentsApiKey = process.env.NOWPAYMENTS_API_KEY || "";
const nowpaymentsIpnSecret = process.env.NOWPAYMENTS_IPN_SECRET || "";
const nowpaymentsPublicKey = process.env.NOWPAYMENTS_PUBLIC_KEY || "";
const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://cerber.vip";
const mainLtcWallet = process.env.NOWPAYMENTS_LTC_WALLET || "ltc1qnl73w78t8v39kkjqd5jgr2y8a62g4mh4rhu6lu";
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const walletDepositTtlMs = 40 * 60 * 1000;
const nowpaymentsTimeoutMs = 25000;
const walletCoins = [
  { id: "ltc", payCurrency: "ltc", symbol: "LTC" },
  { id: "usdt_trc20", payCurrency: "usdttrc20", symbol: "USDT" },
  { id: "usdt_erc20", payCurrency: "usdterc20", symbol: "USDT" },
  { id: "usdt_sol", payCurrency: "usdtsol", symbol: "USDT" },
  { id: "trx", payCurrency: "trx", symbol: "TRX" },
  { id: "eth", payCurrency: "eth", symbol: "ETH" },
  { id: "sol", payCurrency: "sol", symbol: "SOL" }
];

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for persistent storage.");
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

const defaultExchangeCards = [];
const cmsTextsPath = path.join(__dirname, "cms-texts.json");
const adminLoginAttempts = new Map();
const adminTokenTtlMs = 12 * 60 * 60 * 1000;
let adminRealtimeServer = null;

app.use(express.json({ limit: "25mb" }));
app.use((req, res, next) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
  if (/^\/(?:server\.js|package(?:-lock)?\.json|render\.yaml|supabase-schema\.sql|.*\.env(?:\..*)?|cms-texts\.json)$/i.test(pathname) || /\.(?:php|ini)$/i.test(pathname)) {
    return res.status(404).send("Not found");
  }
  next();
});
app.use(express.static(__dirname));

async function readCmsTexts() {
  try {
    return JSON.parse(await fs.readFile(cmsTextsPath, "utf8"));
  } catch {
    return {};
  }
}

async function writeCmsTexts(payload) {
  await fs.writeFile(cmsTextsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function verifyCmsAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD || "admincerbercc1212";
  const password = String(req.headers["x-admin-password"] || req.body?.password || "");
  if (password !== expected) {
    const error = new Error("Bad admin password");
    error.status = 401;
    throw error;
  }
}

function adminSecret() {
  return supabaseServiceKey || process.env.ADMIN_JWT_SECRET || "cerber-local-admin-secret";
}

function signAdminToken(login, role = "admin") {
  const payload = Buffer.from(JSON.stringify({ login, role, createdAt: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", adminSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAdminToken(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", adminSecret()).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() - Number(data.createdAt || 0) > adminTokenTtlMs) return null;
    return data;
  } catch {
    return null;
  }
}

function requireAdmin(req) {
  const admin = verifyAdminToken(req);
  if (!admin) {
    const error = new Error("Admin session required");
    error.status = 401;
    throw error;
  }
  return admin;
}

function adminClientKey(req, login = "") {
  return `${req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local"}:${loginKey(login)}`;
}

function assertAdminRateLimit(req, login) {
  const key = adminClientKey(req, login);
  const record = adminLoginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const error = new Error("Too many login attempts. Try later.");
    error.status = 429;
    throw error;
  }
}

function markAdminLoginAttempt(req, login, ok) {
  const key = adminClientKey(req, login);
  if (ok) {
    adminLoginAttempts.delete(key);
    return;
  }
  const record = adminLoginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) record.lockedUntil = Date.now() + 10 * 60 * 1000;
  adminLoginAttempts.set(key, record);
}

async function ensureAdminSecurity() {
  await ensureSeed();
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  state.adminSecurity = state.adminSecurity || {};
  if (!state.adminSecurity.passwordHash) {
    state.adminSecurity.passwordHash = await bcrypt.hash(process.env.MARKET_ADMIN_PASSWORD || "admin1212", 12);
    state.adminSecurity.login = "admin";
    await saveSettingsState(state);
  }
  return state;
}

async function appendAdminLog(action, actor = "admin", details = {}) {
  const state = await loadSettingsState();
  state.adminLogs = Array.isArray(state.adminLogs) ? state.adminLogs : [];
  state.adminLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actor,
    details,
    createdAt: Date.now()
  });
  state.adminLogs = state.adminLogs.slice(0, 500);
  await saveSettingsState(state);
  notifyAdminRealtime(action, details);
}

function notifyAdminRealtime(type = "update", details = {}) {
  if (!adminRealtimeServer) return;
  const payload = JSON.stringify({ type, details, createdAt: Date.now() });
  adminRealtimeServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function loginKey(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUser(row) {
  return row ? { login: row.login, name: row.name, role: row.role } : null;
}

function sameLogin(a, b) {
  return loginKey(a) === loginKey(b);
}

function requireDb() {
  if (!supabase) {
    const error = new Error("Supabase is not configured");
    error.status = 500;
    throw error;
  }
}

async function verifyCaptcha(token, req) {
  if (!turnstileSecretKey) {
    const error = new Error("Captcha is not configured");
    error.status = 500;
    throw error;
  }
  if (!token) {
    const error = new Error("Подтвердите, что вы не робот");
    error.status = 400;
    throw error;
  }

  const form = new URLSearchParams();
  form.set("secret", turnstileSecretKey);
  form.set("response", token);
  const remoteIp = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (remoteIp) form.set("remoteip", String(remoteIp).split(",")[0].trim());

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!result.success) {
    const error = new Error("Капча не пройдена, попробуйте ещё раз");
    error.status = 400;
    throw error;
  }
}

async function ensureSeed() {
  if (!supabase) return;
  const adminPassword = process.env.ADMIN_PASSWORD || "admincerbercc1212";
  const adminHash = await bcrypt.hash(adminPassword, 12);
  await supabase.from("profiles").upsert([
    { login: "admin", login_key: "admin", password_hash: adminHash, name: "Admin", role: "admin" }
  ], { onConflict: "login_key" });

  const { data: existingSettings } = await supabase.from("app_settings").select("id").eq("id", "main").maybeSingle();
  if (existingSettings) return;

  await supabase.from("app_settings").upsert({
    id: "main",
    data: {
      theme: "light",
      lang: "ru",
      orders: [],
      exchangeCards: defaultExchangeCards,
      exchangeRequests: [],
      groupMessages: [],
      groupSettings: {
        title: "Общий чат",
        pinnedMessageId: "",
        mutedUntil: {},
        rollTimers: []
      },
      referrals: [],
      referralPayments: [],
      referralCodes: {},
      balances: {},
      ltcBalances: {},
      walletTransactions: [],
      walletDeposits: [],
      telegramBot: {
        users: {},
        sentMessages: {}
      },
      paymentSettings: {
        provider: "nowpayments",
        payBaseUrl: "",
        platformCommissionPercent: 0,
        platformLtcWallet: mainLtcWallet
      },
      referralPeriod: {},
      filters: {
        country: "moldova",
        city: "chisinau",
        district: "",
        category: "Все товары",
        sort: "relevance"
      }
    }
  }, { onConflict: "id" });
}

async function stateFor(user) {
  await ensureSeed();
  const [{ data: stores }, { data: messages }, { data: settings }, { data: profiles }] = await Promise.all([
    supabase.from("stores").select("data").order("created_at", { ascending: true }),
    supabase.from("messages").select("data").order("created_at", { ascending: false }),
    supabase.from("app_settings").select("data").eq("id", "main").maybeSingle(),
    supabase.from("profiles").select("login,name,role")
  ]);
  const settingsData = settings?.data || {};
  const orders = (Array.isArray(settingsData.orders) ? [...settingsData.orders] : []).filter((order) => order.id !== "order-cerber-paid-preview" && order.storeId !== "skboy");
  const visibleStores = (stores || []).map((row) => row.data).filter((store) => store.id !== "skboy" && !/сол[её]ный мальчик/i.test(String(store.name || "")));
  const visibleExchangeCards = (settingsData.exchangeCards || defaultExchangeCards).filter((card) => card.id !== "kent-ltc" && !/kent\s*ltc/i.test(String(card.name || "")));

  return {
    user: publicUser(user),
    state: {
      currentUser: user?.login || "",
      theme: settingsData.theme || "light",
      lang: settingsData.lang || "ru",
      users: profiles || [],
      stores: visibleStores,
      messages: (messages || []).map((row) => row.data),
      orders,
      exchangeCards: visibleExchangeCards,
      exchangeRequests: settingsData.exchangeRequests || [],
      groupMessages: Array.isArray(settingsData.groupMessages) ? settingsData.groupMessages : [],
      groupSettings: settingsData.groupSettings || { title: "Общий чат", pinnedMessageId: "", mutedUntil: {}, rollTimers: [] },
      referrals: settingsData.referrals || [],
      referralPayments: settingsData.referralPayments || [],
      referralCodes: settingsData.referralCodes || {},
      balances: settingsData.balances || {},
      ltcBalances: settingsData.ltcBalances || {},
      walletTransactions: Array.isArray(settingsData.walletTransactions) ? settingsData.walletTransactions : [],
      walletDeposits: Array.isArray(settingsData.walletDeposits) ? settingsData.walletDeposits : [],
      siteNotifications: Array.isArray(settingsData.siteNotifications) && user ? settingsData.siteNotifications.filter((item) => sameLogin(item.login, user.login)) : [],
      broadcasts: Array.isArray(settingsData.broadcasts) ? settingsData.broadcasts : [],
      userFilters: Array.isArray(settingsData.userFilters) ? settingsData.userFilters : [],
      blockedUsers: settingsData.blockedUsers || {},
      storeApplications: Array.isArray(settingsData.storeApplications) ? settingsData.storeApplications : [],
      ownerSettings: settingsData.ownerSettings || {},
      paymentSettings: settingsData.paymentSettings || {},
      referralPeriod: settingsData.referralPeriod || {},
      filters: settingsData.filters || {}
    }
  };
}

async function userFromRequest(req) {
  requireDb();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: session } = await supabase.from("sessions").select("login_key").eq("token", token).maybeSingle();
  if (!session) return null;
  const { data: user } = await supabase.from("profiles").select("*").eq("login_key", session.login_key).maybeSingle();
  if (user) {
    const state = await loadSettingsState();
    if (adminIsUserBlocked(state, user.login)) return null;
  }
  return user || null;
}

function privatePeer(message, login) {
  if (sameLogin(message.fromLogin, login)) return message.toLogin || message.storeTag || message.storeId || "system";
  return message.fromLogin || message.storeTag || message.storeId || "system";
}

function publicGroupMessage(message) {
  return {
    id: message.id,
    fromLogin: message.fromLogin,
    body: message.body || "",
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    createdAt: message.createdAt || 0,
    date: message.date || ""
  };
}

async function telegramUserSummary(user) {
  await ensureSeed();
  const [{ data: settings }, { data: messageRows }] = await Promise.all([
    supabase.from("app_settings").select("data").eq("id", "main").maybeSingle(),
    supabase.from("messages").select("data").order("created_at", { ascending: false })
  ]);
  const state = settings?.data || {};
  const login = user.login;
  const key = loginKey(login);

  state.referralCodes = state.referralCodes || {};
  if (!state.referralCodes[key]) {
    const seed = `${key}${Date.now()}CERBER`.toUpperCase().replace(/[^A-Z0-9]/g, "");
    state.referralCodes[key] = `${seed.slice(0, 4)}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    await saveSettingsState(state);
  }

  const orders = (Array.isArray(state.orders) ? state.orders : []).filter((order) => sameLogin(order.login, login));
  const exchangeRequests = (Array.isArray(state.exchangeRequests) ? state.exchangeRequests : []).filter((request) => (
    sameLogin(request.fromLogin, login) || sameLogin(request.toLogin, login)
  ));
  const orderDisputes = orders.filter((order) => order.disputeOpen || order.status === "dispute");
  const exchangeDisputes = exchangeRequests.filter((request) => request.disputeOpen || request.status === "dispute");
  const allPurchases = [...orders, ...exchangeRequests];
  const totalPurchaseUsd = allPurchases.reduce((sum, item) => sum + Number(item.amountUsd || item.priceUsd || 0), 0);
  const walletDeposits = (Array.isArray(state.walletDeposits) ? state.walletDeposits : []).filter((deposit) => sameLogin(deposit.login, login));
  const completedDeposits = walletDeposits.filter((deposit) => ["completed", "paid", "finished"].includes(String(deposit.status || "").toLowerCase()));
  const totalDepositUsd = completedDeposits.reduce((sum, deposit) => sum + Number(deposit.amountUsd || deposit.priceAmount || 0), 0);
  const totalDepositLtc = completedDeposits.reduce((sum, deposit) => sum + Number(deposit.amountLtc || deposit.payAmount || 0), 0);
  const messages = (messageRows || [])
    .map((row) => row.data)
    .filter((message) => sameLogin(message.fromLogin, login) || sameLogin(message.toLogin, login))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const inboundMessages = messages.filter((message) => sameLogin(message.toLogin, login));
  const inboundNotifications = inboundMessages.slice(0, 20).map((message) => ({
    id: message.id,
    from: privatePeer(message, login),
    subject: message.subject || "",
    text: message.body || message.text || message.message || "",
    system: message.system || "",
    createdAt: message.createdAt || null
  }));

  return {
    profile: {
      login,
      name: user.name,
      role: user.role,
      registeredAt: user.created_at,
      balanceUsd: Number(state.balances?.[login] || state.balances?.[key] || 0),
      balanceLtc: Number(state.ltcBalances?.[login] || state.ltcBalances?.[key] || 0),
      totalPurchases: allPurchases.length,
      totalPurchaseUsd,
      totalDisputes: orderDisputes.length + exchangeDisputes.length,
      totalDepositUsd,
      totalDepositLtc
    },
    disputes: {
      count: orderDisputes.length + exchangeDisputes.length,
      items: [...orderDisputes, ...exchangeDisputes].slice(0, 10).map((item) => ({
        id: item.id,
        title: item.product || item.title || item.type || "Диспут",
        status: item.status || "dispute",
        createdAt: item.createdAt || item.disputeUntil || null
      }))
    },
    orders: {
      count: orders.length + exchangeRequests.length,
      items: [...orders, ...exchangeRequests].slice(0, 10).map((item) => ({
        id: item.id,
        title: item.product || item.title || item.type || "Заказ",
        status: item.status || "",
        amountUsd: Number(item.amountUsd || item.priceUsd || 0),
        createdAt: item.createdAt || null
      }))
    },
    referral: {
      code: state.referralCodes[key],
      link: `${publicBaseUrl}/?ref=${encodeURIComponent(state.referralCodes[key])}`
    },
    messages: {
      count: inboundMessages.length,
      notifications: inboundNotifications,
      items: inboundMessages.slice(0, 10).map((message) => ({
        from: privatePeer(message, login),
        subject: message.subject || "",
        text: message.text || message.message || message.body || "",
        createdAt: message.createdAt || null
      }))
    }
  };
}

async function telegramGroupChat() {
  await ensureSeed();
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  const settingsData = state.groupSettings || {};
  const now = Date.now();
  const presence = state.telegramChatPresence || {};
  const onlineCount = Object.values(presence).filter((item) => now - Number(item.seenAt || 0) < 60 * 1000).length;
  const messages = (Array.isArray(state.groupMessages) ? state.groupMessages : [])
    .filter((message) => !message.deleted)
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
    .slice(-20)
    .map(publicGroupMessage);

  return {
    title: "Cerber Чат",
    onlineCount,
    messages
  };
}

async function updateTelegramChatPresence(user) {
  await ensureSeed();
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  const now = Date.now();
  const presence = state.telegramChatPresence || {};
  presence[loginKey(user.login)] = {
    login: user.login,
    seenAt: now
  };
  for (const [key, item] of Object.entries(presence)) {
    if (now - Number(item.seenAt || 0) > 5 * 60 * 1000) {
      delete presence[key];
    }
  }
  state.telegramChatPresence = presence;
  await saveSettingsState(state);
  return Object.values(presence).filter((item) => now - Number(item.seenAt || 0) < 60 * 1000).length;
}

async function addTelegramGroupMessage(user, payload = {}) {
  await ensureSeed();
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  const body = String(payload.body || "").trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 3).map((file) => ({
    name: String(file.name || "file").slice(0, 120),
    type: String(file.type || "application/octet-stream").slice(0, 80),
    url: String(file.url || "")
  })).filter((file) => file.url) : [];

  if (!body && !attachments.length) {
    const error = new Error("Сообщение пустое");
    error.status = 400;
    throw error;
  }

  state.groupMessages = Array.isArray(state.groupMessages) ? state.groupMessages : [];
  const message = {
    id: `group-tg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    fromLogin: user.login,
    body,
    attachments,
    likes: [],
    createdAt: Date.now(),
    date: new Date().toLocaleString("ru-RU")
  };
  state.groupMessages.push(message);
  await saveSettingsState(state);
  return publicGroupMessage(message);
}

function sellerAdminSecret() {
  return supabaseServiceKey || process.env.SELLER_ADMIN_SECRET || "cerber-local-seller-admin";
}

function signSellerAdminToken(storeId) {
  const payload = Buffer.from(JSON.stringify({ storeId, createdAt: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", sellerAdminSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySellerAdminToken(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", sellerAdminSecret()).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    requireDb();
    await verifyCaptcha(req.body.captchaToken, req);
    await ensureSeed();
    const login = String(req.body.login || "").trim();
    const password = String(req.body.password || "");
    const name = String(req.body.name || login).trim();
    if (!login || !password) return res.status(400).json({ error: "Введите логин и пароль" });

    const key = loginKey(login);
    const { data: existing } = await supabase.from("profiles").select("login_key").eq("login_key", key).maybeSingle();
    if (existing) return res.status(409).json({ error: "Такой логин уже есть" });

    const passwordHash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase.from("profiles").insert({
      login,
      login_key: key,
      password_hash: passwordHash,
      name,
      role: "user"
    }).select("*").single();
    if (error) throw error;

    const token = crypto.randomBytes(32).toString("hex");
    await supabase.from("sessions").insert({ token, login_key: key });
    res.json({ token, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    requireDb();
    await verifyCaptcha(req.body.captchaToken, req);
    await ensureSeed();
    const key = loginKey(req.body.login);
    const password = String(req.body.password || "");
    const { data: user } = await supabase.from("profiles").select("*").eq("login_key", key).maybeSingle();
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const state = await loadSettingsState();
    if (adminIsUserBlocked(state, user.login)) {
      return res.status(403).json({ error: state.blockedUsers?.[key]?.reason || "Ваш аккаунт заблокирован" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    await supabase.from("sessions").insert({ token, login_key: user.login_key });
    res.json({ token, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/telegram/login", async (req, res, next) => {
  try {
    requireDb();
    await ensureSeed();
    const key = loginKey(req.body.login);
    const password = String(req.body.password || "");
    const { data: user } = await supabase.from("profiles").select("*").eq("login_key", key).maybeSingle();
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const state = await loadSettingsState();
    if (adminIsUserBlocked(state, user.login)) {
      return res.status(403).json({ error: state.blockedUsers?.[key]?.reason || "Ваш аккаунт заблокирован" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    await supabase.from("sessions").insert({ token, login_key: user.login_key });
    res.json({ token, user: publicUser(user), summary: await telegramUserSummary(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/telegram/wallet/address", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "РЎРµСЃСЃРёСЏ РЅРµ РЅР°Р№РґРµРЅР°" });
    const coin = walletCoinFromRequest({ coinId: req.query.coinId || "ltc" });
    if (coin.id !== "ltc") {
      return res.status(400).json({ error: "РџРѕСЃС‚РѕСЏРЅРЅС‹Р№ Р°РґСЂРµСЃ СЃРµР№С‡Р°СЃ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ LTC" });
    }
    res.json({
      address: mainLtcWallet,
      coinId: coin.id,
      payCurrency: coin.payCurrency,
      login: user.login,
      note: "РџРѕСЃС‚РѕСЏРЅРЅС‹Р№ LTC Р°РґСЂРµСЃ РґР»СЏ РїРѕРїРѕР»РЅРµРЅРёСЏ Р±Р°Р»Р°РЅСЃР°"
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/telegram/me", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    res.json({ user: publicUser(user), summary: await telegramUserSummary(user) });
  } catch (error) {
    next(error);
  }
});

app.use("/api/telegram/group-chat", (_req, res) => {
  res.status(410).json({ error: "Общий чат в Telegram-боте отключен" });
});

app.get("/api/telegram/group-chat", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    res.json(await telegramGroupChat());
  } catch (error) {
    next(error);
  }
});

app.post("/api/telegram/group-chat", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    res.json({ message: await addTelegramGroupMessage(user, req.body || {}) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/telegram/group-chat/presence", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    res.json({ onlineCount: await updateTelegramChatPresence(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/config", async (_req, res, next) => {
  try {
    res.json({ turnstileSiteKey, cmsTexts: await readCmsTexts() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/cms-texts", async (_req, res, next) => {
  try {
    res.json({ texts: await readCmsTexts() });
  } catch (error) {
    next(error);
  }
});

app.put("/api/cms-texts", async (req, res, next) => {
  try {
    verifyCmsAdmin(req);
    const texts = req.body?.texts && typeof req.body.texts === "object" ? req.body.texts : {};
    await writeCmsTexts(texts);
    res.json({ ok: true, texts });
  } catch (error) {
    next(error);
  }
});

app.post("/api/store-admin/login", async (req, res, next) => {
  try {
    requireDb();
    await ensureSeed();
    const storeId = String(req.body.storeId || "").trim();
    const login = String(req.body.login || "").trim();
    const password = String(req.body.password || "");
    let store = null;
    if (storeId) {
      const { data: row } = await supabase.from("stores").select("data").eq("id", storeId).maybeSingle();
      store = row?.data || null;
    }
    if (!store && login) {
      const { data: rows } = await supabase.from("stores").select("data");
      store = (rows || []).map((row) => row.data).find((item) => (
        item && (loginKey(item.ownerLogin) === loginKey(login) || loginKey(item.id) === loginKey(login))
      ));
    }
    const loginOk = !login || loginKey(store?.ownerLogin) === loginKey(login) || loginKey(store?.id) === loginKey(login);
    if (!store || !loginOk || password !== (store.adminPassword || "")) {
      return res.status(401).json({ error: "Неверный пароль" });
    }
    res.json({ token: signSellerAdminToken(store.id), ...(await stateFor(null)) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/store-admin/store", async (req, res, next) => {
  try {
    requireDb();
    const token = verifySellerAdminToken(req);
    const store = req.body.store || {};
    if (!token || !token.storeId || store.id !== token.storeId) {
      return res.status(401).json({ error: "Нет доступа к этой админке" });
    }
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    res.json(await stateFor(null));
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    res.json(await stateFor(user));
  } catch (error) {
    next(error);
  }
});

app.put("/api/state", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });

    const state = req.body.state || {};
    const { data: currentSettings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const currentSettingsData = currentSettings?.data || {};
    if (Array.isArray(state.stores)) {
      for (const store of state.stores.filter((item) => item && item.id)) {
        await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
      }
    }
    await supabase.from("app_settings").upsert({
      id: "main",
      data: {
        theme: state.theme || "light",
        lang: state.lang || "ru",
        orders: Array.isArray(state.orders) ? state.orders : [],
        exchangeCards: Array.isArray(state.exchangeCards) ? state.exchangeCards : defaultExchangeCards,
        exchangeRequests: Array.isArray(state.exchangeRequests) ? state.exchangeRequests : [],
        groupMessages: Array.isArray(state.groupMessages) ? state.groupMessages : [],
        groupSettings: state.groupSettings || { title: "Общий чат", pinnedMessageId: "", mutedUntil: {}, rollTimers: [] },
        referrals: Array.isArray(state.referrals) ? state.referrals : [],
        referralPayments: Array.isArray(state.referralPayments) ? state.referralPayments : [],
        referralCodes: state.referralCodes || {},
        balances: state.balances || {},
        ltcBalances: state.ltcBalances || {},
        walletTransactions: Array.isArray(state.walletTransactions) ? state.walletTransactions : [],
        walletDeposits: Array.isArray(state.walletDeposits) ? state.walletDeposits : [],
        telegramBot: state.telegramBot || currentSettingsData.telegramBot || { users: {}, sentMessages: {} },
        mirrorBots: Array.isArray(state.mirrorBots) ? state.mirrorBots : (currentSettingsData.mirrorBots || []),
        siteNotifications: Array.isArray(state.siteNotifications) ? state.siteNotifications : (currentSettingsData.siteNotifications || []),
        broadcasts: Array.isArray(state.broadcasts) ? state.broadcasts : (currentSettingsData.broadcasts || []),
        userFilters: Array.isArray(state.userFilters) ? state.userFilters : (currentSettingsData.userFilters || []),
        blockedUsers: state.blockedUsers || currentSettingsData.blockedUsers || {},
        storeApplications: Array.isArray(state.storeApplications) ? state.storeApplications : [],
        ownerSettings: state.ownerSettings || {},
        paymentSettings: state.paymentSettings || {},
        referralPeriod: state.referralPeriod || {},
        filters: state.filters || {}
      }
    }, { onConflict: "id" });

    if (Array.isArray(state.stores)) {
      for (const store of state.stores) {
        await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
        const ownerKey = loginKey(store.ownerLogin);
        if (ownerKey) {
          const { data: owner } = await supabase.from("profiles").select("login_key").eq("login_key", ownerKey).maybeSingle();
          if (!owner) {
            await supabase.from("profiles").insert({
              login: store.ownerLogin,
              login_key: ownerKey,
              password_hash: await bcrypt.hash("123", 12),
              name: store.ownerLogin,
              role: "seller"
            });
          }
        }
      }
    }

    if (Array.isArray(state.exchangeCards)) {
      for (const card of state.exchangeCards) {
        const ownerKey = loginKey(card.ownerLogin);
        if (ownerKey) {
          const { data: owner } = await supabase.from("profiles").select("login_key").eq("login_key", ownerKey).maybeSingle();
          if (!owner) {
            await supabase.from("profiles").insert({
              login: card.ownerLogin,
              login_key: ownerKey,
              password_hash: await bcrypt.hash("123", 12),
              name: card.ownerLogin,
              role: "seller"
            });
          }
        }
      }
    }

    if (Array.isArray(state.messages)) {
      for (const message of state.messages) {
        await supabase.from("messages").upsert({ id: message.id, data: message }, { onConflict: "id" });
      }
    }

    res.json(await stateFor(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", async (req, res, next) => {
  const login = String(req.body.login || "").trim();
  try {
    requireDb();
    assertAdminRateLimit(req, login);
    const state = await ensureAdminSecurity();
    const expectedLogin = state.adminSecurity?.login || "admin";
    const password = String(req.body.password || "");
    const ok = loginKey(login) === loginKey(expectedLogin) && await bcrypt.compare(password, state.adminSecurity.passwordHash);
    markAdminLoginAttempt(req, login, ok);
    await appendAdminLog(ok ? "admin_login_success" : "admin_login_failed", login || "unknown", {
      ip: req.headers["cf-connecting-ip"] || req.socket.remoteAddress || ""
    });
    if (!ok) return res.status(401).json({ error: "Неверный логин или пароль" });
    res.json({ token: signAdminToken(expectedLogin, "admin"), admin: { login: expectedLogin, role: "admin" } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/overview", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const data = await adminLoadMarketplace();
    res.json({ admin, ...adminBuildOverview(data) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users/:login", async (req, res, next) => {
  try {
    requireAdmin(req);
    const login = req.params.login;
    const data = await adminLoadMarketplace();
    const user = data.profiles.find((item) => sameLogin(item.login, login));
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });
    const orders = (data.state.orders || []).filter((order) => sameLogin(order.login, login));
    const deposits = (data.state.walletDeposits || []).filter((deposit) => sameLogin(deposit.login, login));
    const messages = data.messages.filter((message) => sameLogin(message.fromLogin, login) || sameLogin(message.toLogin, login));
    const balanceUsd = adminMoney(data.state.balances?.[login] || data.state.balances?.[user.login_key]);
    const balanceLtc = adminMoney(data.state.ltcBalances?.[login] || data.state.ltcBalances?.[user.login_key]);
    const userBots = adminCollectBots(data.state).filter((bot) => (
      sameLogin(bot.loginKey, login) ||
      sameLogin(bot.login, login) ||
      sameLogin(bot.username, login)
    ));
    const products = new Map();
    orders.forEach((order) => {
      const name = order.product || order.productName || order.productId || "Товар";
      products.set(name, (products.get(name) || 0) + 1);
    });
    const completed = orders.filter((order) => ["completed", "closed", "paid"].includes(String(order.status || order.paymentStatus || "").toLowerCase()));
    const dates = completed.map(adminTimestamp).filter(Boolean).sort((a, b) => a - b);
    const purchaseTotal = completed.reduce((sum, item) => sum + adminOrderAmount(item), 0);
    const successfulDeposits = deposits.filter((item) => ["completed", "paid", "finished"].includes(String(item.status || "").toLowerCase()));
    const firstPurchaseAt = dates[0] || null;
    const lastPurchaseAt = dates[dates.length - 1] || null;
    const activeDays = firstPurchaseAt ? Math.max(1, (Date.now() - firstPurchaseAt) / (24 * 60 * 60 * 1000)) : 1;
    const disputes = orders.filter((order) => order.disputeOpen || order.status === "dispute");
    const closedDisputes = orders.filter((order) => !order.disputeOpen && ["closed", "completed"].includes(String(order.status || "").toLowerCase()) && order.disputeUntil);
    const messageTimes = messages.map(adminTimestamp).filter(Boolean);
    const orderTimes = orders.map(adminTimestamp).filter(Boolean);
    const lastActivityAt = Math.max(0, ...messageTimes, ...orderTimes) || null;
    res.json({
      user: { ...user, status: adminPublicUserStatus(data.state, login) },
      status: data.state.blockedUsers?.[user.login_key] || { blocked: false },
      balanceUsd,
      balanceLtc,
      summary: {
        visits: data.messages.filter((message) => sameLogin(message.fromLogin, login)).length,
        totalDeposits: successfulDeposits.reduce((sum, item) => sum + adminMoney(item.amountUsd || item.priceAmount), 0),
        totalPurchases: purchaseTotal,
        averageDailySpend: purchaseTotal / activeDays,
        averageMonthlySpend: (purchaseTotal / activeDays) * 30,
        averageCheck: completed.length ? purchaseTotal / completed.length : 0,
        turnover: purchaseTotal + balanceUsd,
        firstPurchaseAt,
        lastPurchaseAt,
        averageIntervalMs: dates.length > 1 ? (dates[dates.length - 1] - dates[0]) / completed.length : 0,
        disputes: disputes.length,
        openDisputes: disputes.length,
        closedDisputes: closedDisputes.length,
        disputeAmount: disputes.reduce((sum, item) => sum + adminOrderAmount(item), 0),
        lastActivityAt
      },
      orders,
      deposits,
      products: Array.from(products.entries()).map(([name, count]) => ({ name, count })),
      messages,
      bots: userBots
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/users/:login", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const login = req.params.login;
    const key = loginKey(login);
    const { role, name, storePassword, blocked, blockReason } = req.body || {};
    const updates = {};
    if (role) updates.role = String(role);
    if (name) updates.name = String(name).trim();
    if (Object.keys(updates).length) await supabase.from("profiles").update(updates).eq("login_key", key);

    const state = await loadSettingsState();
    state.blockedUsers = state.blockedUsers || {};
    if (typeof blocked === "boolean") {
      if (blocked) {
        state.blockedUsers[key] = {
          blocked: true,
          reason: String(blockReason || "Ваш аккаунт заблокирован").trim(),
          blockedAt: Date.now(),
          blockedBy: admin.login
        };
      } else {
        delete state.blockedUsers[key];
      }
      await saveSettingsState(state);
      await appendAdminLog(blocked ? "user_blocked" : "user_unblocked", admin.login, { login, reason: blockReason || "" });
    }

    if (role === "seller" || storePassword) {
      const { data: rows } = await supabase.from("stores").select("id,data");
      let row = (rows || []).find((item) => sameLogin(item.data?.ownerLogin, login));
      const store = row?.data || {
        id: `store-${key}`,
        tag: `@${key}`,
        ownerLogin: login,
        name: login,
        short: "Новый магазин",
        description: "",
        image: "assets/cerber-emblem.png",
        cover: "assets/market-banner.png",
        status: "active",
        visibleInCatalog: true,
        products: [],
        reviewsList: []
      };
      store.ownerLogin = login;
      store.adminPassword = String(storePassword || store.adminPassword || "123");
      await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    }

    await appendAdminLog("user_updated", admin.login, { login, role, name: name || "", sellerPanel: Boolean(role === "seller" || storePassword) });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/disputes/:id", async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await adminLoadMarketplace();
    const id = req.params.id;
    const order = (data.state.orders || []).find((item) => item.id === id || item.exchangeRequestId === id);
    const request = (data.state.exchangeRequests || []).find((item) => item.id === id);
    const dispute = order || request;
    if (!dispute) return res.status(404).json({ error: "Диспут не найден" });
    const store = data.stores.find((item) => item.id === dispute.storeId || sameLogin(item.ownerLogin, dispute.toLogin));
    const clientLogin = dispute.login || dispute.fromLogin || "";
    const storeLogin = store?.ownerLogin || dispute.toLogin || "";
    const messages = data.messages.filter((message) => (
      message.system?.includes("dispute") ||
      message.subject?.includes(id) ||
      sameLogin(message.fromLogin, clientLogin) ||
      sameLogin(message.toLogin, clientLogin) ||
      sameLogin(message.fromLogin, storeLogin) ||
      sameLogin(message.toLogin, storeLogin)
    )).slice(0, 120);
    res.json({ dispute, order, request, store, clientLogin, storeLogin, amount: adminOrderAmount(dispute), messages });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/disputes/:id/join", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const data = await adminLoadMarketplace();
    const id = req.params.id;
    const order = (data.state.orders || []).find((item) => item.id === id || item.exchangeRequestId === id);
    const request = (data.state.exchangeRequests || []).find((item) => item.id === id);
    const dispute = order || request;
    if (!dispute) return res.status(404).json({ error: "Диспут не найден" });
    const store = data.stores.find((item) => item.id === dispute.storeId || sameLogin(item.ownerLogin, dispute.toLogin));
    const message = {
      id: `admin-dispute-${Date.now()}`,
      storeId: store?.id || dispute.storeId || "",
      storeTag: store?.tag || store?.name || "",
      toLogin: dispute.login || dispute.fromLogin || "",
      fromLogin: "cerber-owner",
      subject: `Диспут: ${id}`,
      body: "Владелец Cerber вошел в диспут",
      createdAt: Date.now(),
      date: new Date().toLocaleString("ru-RU"),
      system: "admin-dispute-join"
    };
    await supabase.from("messages").upsert({ id: message.id, data: message }, { onConflict: "id" });
    await appendAdminLog("admin_joined_dispute", admin.login, { disputeId: id });
    res.json(await adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/stores", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const store = adminBuildStoreFromBody(req.body || {});
    if (!store.name || !store.ownerLogin || !store.adminPassword) {
      return res.status(400).json({ error: "Укажите название магазина, логин владельца и пароль панели" });
    }
    const { data: existing } = await supabase.from("stores").select("id").eq("id", store.id).maybeSingle();
    if (existing) return res.status(409).json({ error: "Магазин с таким ID уже существует" });
    await adminEnsureSellerProfile(store.ownerLogin, store.adminPassword, store.ownerLogin);
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    const panel = adminStorePanelLinks(store);
    await appendAdminLog("store_created", admin.login, { storeId: store.id, ownerLogin: store.ownerLogin, panelUrl: panel.shopPanelUrl });
    res.json({ store, panel, overview: adminBuildOverview(await adminLoadMarketplace()) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/stores/:id", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    if (!row?.data) return res.status(404).json({ error: "Магазин не найден" });
    const store = adminBuildStoreFromBody(req.body || {}, row.data);
    if (store.ownerLogin) await adminEnsureSellerProfile(store.ownerLogin, store.adminPassword, store.ownerLogin);
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await appendAdminLog("store_updated", admin.login, { storeId: store.id, fields: Object.keys(req.body || {}) });
    res.json({ ...adminBuildOverview(await adminLoadMarketplace()), panel: adminStorePanelLinks(store) });
    return;
    const allowed = ["status", "commissionPercent", "homepagePosition", "adminPassword", "salesBlocked", "autoReleaseHours", "enabledCoins", "name", "short", "description"];
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) store[key] = req.body[key];
    });
    if (store.status === "ACTIVE") store.status = "active";
    if (store.status === "DISABLE") store.status = "disabled";
    store.commissionPercent = Math.min(20, Math.max(0, Number(store.commissionPercent || 0)));
    store.homepagePosition = Math.max(0, Number(store.homepagePosition || 0));
    store.autoReleaseHours = Math.min(72, Math.max(0, Number(store.autoReleaseHours || 24)));
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await appendAdminLog("store_updated", admin.login, { storeId: store.id, fields: Object.keys(req.body || {}) });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/stores/:id", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    if (!row?.data) return res.status(404).json({ error: "Магазин не найден" });
    const state = await loadSettingsState();
    const storeId = req.params.id;
    state.orders = (state.orders || []).filter((order) => order.storeId !== storeId);
    state.storeApplications = (state.storeApplications || []).filter((item) => item.storeId !== storeId && item.id !== storeId);
    await saveSettingsState(state);
    await supabase.from("stores").delete().eq("id", storeId);
    await appendAdminLog("store_deleted", admin.login, { storeId, name: row.data.name || "" });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/stores/:id/products/:productId", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    if (!row?.data) return res.status(404).json({ error: "Магазин не найден" });
    const store = row.data;
    const product = (store.products || []).find((item) => item.id === req.params.productId);
    if (!product) return res.status(404).json({ error: "Товар не найден" });
    ["title", "category", "description", "priceUsd", "status"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) product[key] = req.body[key];
    });
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await appendAdminLog("product_updated", admin.login, { storeId: store.id, productId: product.id });
    res.json({ store });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/stores/:id/products/:productId", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    if (!row?.data) return res.status(404).json({ error: "Магазин не найден" });
    const store = row.data;
    store.products = (store.products || []).filter((item) => item.id !== req.params.productId);
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await appendAdminLog("product_deleted", admin.login, { storeId: store.id, productId: req.params.productId });
    res.json({ store });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/settings", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const state = await loadSettingsState();
    state.ownerSettings = { ...(state.ownerSettings || {}), ...(req.body.ownerSettings || {}) };
    state.paymentSettings = { ...(state.paymentSettings || {}), ...(req.body.paymentSettings || {}) };
    state.userFilters = Array.isArray(req.body.userFilters) ? req.body.userFilters : (state.userFilters || []);
    await saveSettingsState(state);
    await appendAdminLog("settings_updated", admin.login, { sections: Object.keys(req.body || {}) });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/logs", async (req, res, next) => {
  try {
    requireAdmin(req);
    const state = await loadSettingsState();
    state.adminLogs = [];
    await saveSettingsState(state);
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/password", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const state = await ensureAdminSecurity();
    const currentPassword = String(req.body.currentPassword || "");
    const nextPassword = String(req.body.nextPassword || "");
    if (!(await bcrypt.compare(currentPassword, state.adminSecurity.passwordHash))) return res.status(401).json({ error: "Текущий пароль неверный" });
    if (nextPassword.length < 8) return res.status(400).json({ error: "Минимум 8 символов" });
    state.adminSecurity.passwordHash = await bcrypt.hash(nextPassword, 12);
    await saveSettingsState(state);
    await appendAdminLog("admin_password_changed", admin.login);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/broadcasts", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const market = await adminLoadMarketplace();
    const state = market.state;
    state.broadcasts = Array.isArray(state.broadcasts) ? state.broadcasts : [];
    const broadcast = {
      id: `broadcast-${Date.now()}`,
      title: String(req.body.title || "Рассылка").trim(),
      body: String(req.body.body || "").trim(),
      channel: String(req.body.channel || "site"),
      type: String(req.body.type || "popup"),
      photoUrl: String(req.body.photoUrl || "").trim(),
      buttonText: String(req.body.buttonText || "").trim(),
      buttonUrl: String(req.body.buttonUrl || "").trim(),
      filters: req.body.filters || {},
      stats: { sent: 0, delivered: 0, clicked: 0, closed: 0, botBlocked: 0, chatDeleted: 0 },
      createdAt: Date.now(),
      createdBy: admin.login
    };
    await adminDeliverBroadcast(state, broadcast, market.profiles, market.sessions);
    state.broadcasts.unshift(broadcast);
    await saveSettingsState(state);
    await appendAdminLog("broadcast_created", admin.login, { broadcastId: broadcast.id, channel: broadcast.channel, sent: broadcast.stats.sent });
    res.json({ broadcast, overview: adminBuildOverview(await adminLoadMarketplace()) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/bots", async (req, res, next) => {
  try {
    requireAdmin(req);
    return res.status(405).json({ error: "Зеркало создает только пользователь через Telegram-бота" });
    const admin = requireAdmin(req);
    const state = await loadSettingsState();
    state.mirrorBots = Array.isArray(state.mirrorBots) ? state.mirrorBots : [];
    const chatId = String(req.body.chatId || "").trim();
    const token = String(req.body.token || "").trim();
    const loginKeyValue = loginKey(req.body.loginKey || req.body.login || "");
    if (!chatId && !token) return res.status(400).json({ error: "Укажите chatId или token бота" });
    const existing = state.mirrorBots.find((bot) => (
      (chatId && String(bot.chatId || "") === chatId) || (token && String(bot.token || "") === token)
    ));
    const bot = existing || {};
    bot.chatId = chatId || bot.chatId || "";
    bot.token = token || bot.token || "";
    bot.loginKey = loginKeyValue || bot.loginKey || "";
    bot.verified = req.body.verified !== false;
    bot.blocked = Boolean(req.body.blocked);
    bot.createdAt = bot.createdAt || Date.now();
    bot.updatedAt = Date.now();
    if (!existing) state.mirrorBots.unshift(bot);
    await saveSettingsState(state);
    await appendAdminLog("mirror_bot_saved", admin.login, { chatId: bot.chatId, loginKey: bot.loginKey });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/bots", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const state = await loadSettingsState();
    const id = String(req.body.id || "");
    const action = String(req.body.action || "");
    const bots = adminCollectBots(state);
    const target = bots.find((bot) => bot.id === id || bot.chatId === req.body.chatId || bot.token === req.body.token);
    if (!target) return res.status(404).json({ error: "Зеркало не найдено" });

    const applyToBot = (bot) => {
      if (action === "disable") bot.verified = false;
      if (action === "enable") bot.verified = true;
      if (action === "block") bot.blocked = true;
      if (action === "unblock") bot.blocked = false;
      bot.updatedAt = Date.now();
    };

    if (target.source.startsWith("telegramBot.users")) {
      const bot = state.telegramBot?.users?.[target.chatId];
      if (bot && action === "delete") delete state.telegramBot.users[target.chatId];
      else if (bot) applyToBot(bot);
    } else {
      const lists = ["mirrorBots", "telegramBots", "clientMirrorBots", "telegramMirrors"];
      for (const listName of lists) {
        if (!Array.isArray(state[listName])) continue;
        const index = state[listName].findIndex((bot) => (
          String(bot.chatId || bot.chat_id || "") === target.chatId ||
          String(bot.token || bot.botToken || "") === target.token
        ));
        if (index >= 0) {
          if (action === "delete") state[listName].splice(index, 1);
          else applyToBot(state[listName][index]);
          break;
        }
      }
    }
    await saveSettingsState(state);
    await appendAdminLog(`mirror_bot_${action}`, admin.login, { id, chatId: target.chatId, loginKey: target.loginKey });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/broadcasts/:id/track", async (req, res, next) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const state = await loadSettingsState();
    const notification = (state.siteNotifications || []).find((item) => item.id === req.params.id && sameLogin(item.login, user.login));
    if (!notification) return res.status(404).json({ error: "Уведомление не найдено" });
    const action = String(req.body.action || "closed");
    if (action === "clicked") notification.clickedAt = Date.now();
    if (action === "closed") notification.closedAt = Date.now();
    const broadcast = (state.broadcasts || []).find((item) => item.id === notification.broadcastId);
    if (broadcast) {
      broadcast.stats = broadcast.stats || {};
      if (action === "clicked") broadcast.stats.clicked = Number(broadcast.stats.clicked || 0) + 1;
      if (action === "closed") broadcast.stats.closed = Number(broadcast.stats.closed || 0) + 1;
    }
    await saveSettingsState(state);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortedObject(value[key]);
      return acc;
    }, {});
  }
  return value;
}

async function nowpaymentsJson(pathname, payload) {
  const response = await fetch(`https://api.nowpayments.io/v1/${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": nowpaymentsApiKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(nowpaymentsTimeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || "Payment gateway error");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function createNowpaymentsWalletPayment(paymentPayload) {
  const payment = await nowpaymentsJson("payment", paymentPayload);
  const payAddress = payment.pay_address || payment.address || "";
  const payAmount = Number(payment.pay_amount || 0);
  if (!payAddress || !payAmount) {
    const error = new Error("Платежный шлюз не выдал адрес оплаты. Попробуйте другую сумму или монету.");
    error.status = 502;
    error.body = payment;
    throw error;
  }
  return payment;
}

function walletCoinFromRequest(body = {}) {
  const requested = String(body.payCurrency || body.coinId || "ltc").toLowerCase();
  return walletCoins.find((coin) => coin.id === requested || coin.payCurrency === requested) || walletCoins[0];
}

function verifyNowpaymentsSignature(req) {
  if (!nowpaymentsIpnSecret) return true;
  const signature = String(req.headers["x-nowpayments-sig"] || "");
  if (!signature) return false;
  const body = JSON.stringify(sortedObject(req.body));
  const expected = crypto.createHmac("sha512", nowpaymentsIpnSecret).update(body).digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function saveSettingsState(state) {
  await supabase.from("app_settings").upsert({ id: "main", data: state }, { onConflict: "id" });
  notifyAdminRealtime("state_updated");
}

async function loadSettingsState() {
  await ensureSeed();
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  state.telegramBot = state.telegramBot || { users: {}, sentMessages: {} };
  state.telegramBot.users = state.telegramBot.users || {};
  state.telegramBot.sentMessages = state.telegramBot.sentMessages || {};
  return state;
}

async function adminLoadMarketplace() {
  await ensureSeed();
  const [{ data: stores }, { data: messages }, { data: settings }, { data: profiles }, { data: sessions }] = await Promise.all([
    supabase.from("stores").select("id,data,created_at,updated_at").order("created_at", { ascending: true }),
    supabase.from("messages").select("data,created_at").order("created_at", { ascending: false }),
    supabase.from("app_settings").select("data").eq("id", "main").maybeSingle(),
    supabase.from("profiles").select("login_key,login,name,role,created_at").order("created_at", { ascending: true }),
    supabase.from("sessions").select("login_key,created_at")
  ]);
  const state = settings?.data || {};
  return {
    state,
    stores: (stores || []).map((row) => ({ ...row.data, createdAt: row.data?.createdAt || row.created_at, updatedAt: row.updated_at })),
    messages: (messages || []).map((row) => ({ ...row.data, createdAt: row.data?.createdAt || Date.parse(row.created_at) || 0 })),
    profiles: profiles || [],
    sessions: sessions || []
  };
}

function adminMoney(value) {
  return Number(value || 0) || 0;
}

function adminTimestamp(item) {
  return Number(item.createdAt || item.paidAt || item.completedAt || item.closedAt || Date.parse(item.date || item.created_at || "") || 0);
}

function adminWithin(item, from) {
  const ts = adminTimestamp(item);
  return ts && ts >= from;
}

function adminOrderAmount(order) {
  return adminMoney(order.amountUsd || order.priceUsd || order.totalUsd || order.total || order.price);
}

function adminIsUserBlocked(state, login) {
  const key = loginKey(login);
  const record = state.blockedUsers?.[key];
  return Boolean(record?.blocked);
}

function adminPublicUserStatus(state, login) {
  const record = state.blockedUsers?.[loginKey(login)];
  return record?.blocked ? "blocked" : "active";
}

function adminSlug(value, fallback = "store") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `${fallback}-${Date.now()}`;
}

function adminNormalizeStoreStatus(value) {
  const status = String(value || "ACTIVE").toUpperCase();
  if (status === "DELETE") return "deleted";
  if (status === "DISABLE" || status === "DISABLED") return "disabled";
  return "active";
}

function adminNormalizeStoreRegions(input) {
  const values = Array.isArray(input) ? input : String(input || "moldova").split(",");
  const normalized = values.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  const result = [];
  if (normalized.includes("both")) result.push("moldova", "transnistria");
  if (normalized.includes("moldova")) result.push("moldova");
  if (normalized.includes("transnistria") || normalized.includes("pmr") || normalized.includes("pridnestrovie")) result.push("transnistria");
  return Array.from(new Set(result.length ? result : ["moldova"]));
}

function adminNormalizeStorePlacements(input, fallback = "stores") {
  const values = Array.isArray(input) ? input : String(input || fallback).split(",");
  const result = [];
  values.forEach((item) => {
    const value = String(item || "").trim().toUpperCase();
    if (value === "TOP 10" || value === "TOP10") result.push("TOP 10");
    else if (value === "TOP") result.push("TOP");
    else if (value === "NEW") result.push("NEW");
    else if (value === "STORES" || value === "STORE" || value === "MAGAZINES") result.push("stores");
  });
  return Array.from(new Set(result.length ? result : ["stores"]));
}

function adminStorePanelLinks(store) {
  return {
    shopPanelUrl: `${publicBaseUrl}/#shop-panel-${store.id}`,
    sellerPanelUrl: `${publicBaseUrl}/#seller-${store.id}`,
    login: store.ownerLogin || store.id,
    password: store.adminPassword || ""
  };
}

async function adminEnsureSellerProfile(login, password, name = "") {
  const key = loginKey(login);
  if (!key) return null;
  const { data: existing } = await supabase.from("profiles").select("*").eq("login_key", key).maybeSingle();
  if (existing) {
    const updates = { role: "seller" };
    if (name) updates.name = existing.name || name;
    if (password) updates.password_hash = await bcrypt.hash(String(password), 12);
    await supabase.from("profiles").update(updates).eq("login_key", key);
    return { ...existing, ...updates };
  }
  const passwordHash = await bcrypt.hash(String(password || "123"), 12);
  const { data: user, error } = await supabase.from("profiles").insert({
    login,
    login_key: key,
    password_hash: passwordHash,
    name: name || login,
    role: "seller"
  }).select("*").single();
  if (error) throw error;
  return user;
}

function adminBuildStoreFromBody(body = {}, existing = null) {
  const ownerLogin = String(body.ownerLogin || body.login || existing?.ownerLogin || "").trim();
  const name = String(body.name || existing?.name || ownerLogin || "New store").trim();
  const id = existing?.id || adminSlug(body.id || name || ownerLogin, "store");
  const countries = adminNormalizeStoreRegions(body.countries || body.regions || existing?.countries);
  const placements = adminNormalizeStorePlacements(body.placements || body.placement || existing?.placements || existing?.placement);
  const placement = placements[0] || "stores";
  const position = Math.max(0, Number(body.homepagePosition ?? body.position ?? existing?.homepagePosition ?? 0));
  const image = String(body.image || body.avatar || existing?.image || "assets/cerber-emblem.png").trim();
  const cover = String(body.cover || body.banner || existing?.cover || image || "assets/market-banner.png").trim();
  return {
    ...(existing || {}),
    id,
    name,
    tag: existing?.tag || `@${adminSlug(name, "store")}`,
    short: String(body.short || existing?.short || "").trim(),
    description: String(body.description || existing?.description || "").trim(),
    ownerLogin,
    adminPassword: String(body.adminPassword || existing?.adminPassword || "123").trim(),
    image,
    avatar: image,
    cover,
    banner: cover,
    status: adminNormalizeStoreStatus(body.status || existing?.status || "ACTIVE"),
    visibleInCatalog: body.visibleInCatalog !== false,
    placement,
    placements,
    homepagePosition: position,
    position,
    countries,
    regions: countries,
    cities: Array.isArray(body.cities) ? body.cities : (existing?.cities || []),
    districts: Array.isArray(body.districts) ? body.districts : (existing?.districts || []),
    commissionPercent: Math.min(20, Math.max(0, Number(body.commissionPercent ?? existing?.commissionPercent ?? 0))),
    autoReleaseHours: Math.min(72, Math.max(0, Number(body.autoReleaseHours ?? existing?.autoReleaseHours ?? 24))),
    enabledCoins: body.enabledCoins || existing?.enabledCoins || {},
    products: Array.isArray(existing?.products) ? existing.products : [],
    reviewsList: Array.isArray(existing?.reviewsList) ? existing.reviewsList : [],
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

function adminPlatformCommission(order, state, store) {
  const storeCommission = Number(store?.commissionPercent ?? store?.platformCommissionPercent ?? state.ownerSettings?.platformCommissionPercent ?? state.paymentSettings?.platformCommissionPercent ?? 0);
  return adminOrderAmount(order) * Math.max(0, storeCommission) / 100;
}

function adminPeriods() {
  const now = Date.now();
  return [
    { id: "h1", label: "1 час", from: now - 60 * 60 * 1000 },
    { id: "h3", label: "3 часа", from: now - 3 * 60 * 60 * 1000 },
    { id: "day", label: "Сутки", from: now - 24 * 60 * 60 * 1000 },
    { id: "week", label: "Неделя", from: now - 7 * 24 * 60 * 60 * 1000 },
    { id: "month", label: "Месяц", from: now - 30 * 24 * 60 * 60 * 1000 },
    { id: "year", label: "Год", from: now - 365 * 24 * 60 * 60 * 1000 },
    { id: "all", label: "Всё время", from: 0 }
  ];
}

function adminBucketCharts(source, valueFn = () => 1) {
  const now = Date.now();
  const days = Array.from({ length: 14 }, (_, index) => {
    const start = new Date(now - (13 - index) * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    return { label: start.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), from: start.getTime(), value: 0 };
  });
  source.forEach((item) => {
    const ts = adminTimestamp(item);
    const bucket = days.find((day, index) => ts >= day.from && (index === days.length - 1 || ts < days[index + 1].from));
    if (bucket) bucket.value += valueFn(item);
  });
  return days.map(({ label, value }) => ({ label, value: Number(value.toFixed(2)) }));
}

function adminCollectBots(state) {
  const found = new Map();
  const addBot = (id, value = {}, source = "telegramBot") => {
    if (!value || typeof value !== "object") return;
    const chatId = String(value.chatId || value.chat_id || id || "").trim();
    const token = String(value.token || value.botToken || value.telegramToken || value.accessToken || "").trim();
    const loginKeyValue = String(value.loginKey || value.login_key || value.login || value.ownerLogin || "").trim();
    if (!chatId && !token && !loginKeyValue) return;
    const key = `${source}:${chatId || token || loginKeyValue}`;
    found.set(key, {
      id: key,
      chatId,
      loginKey: loginKeyValue,
      user_id: value.user_id || value.userId || loginKeyValue,
      owner_id: value.owner_id || value.ownerId || loginKeyValue,
      login: value.login || value.ownerLogin || "",
      username: value.username || value.telegramUsername || value.tgUsername || value.telegram || "",
      botUsername: value.botUsername || value.bot_username || value.name || value.title || "",
      createdAt: value.createdAt || value.created_at || value.registeredAt || null,
      updatedAt: value.updatedAt || value.lastActivityAt || value.seenAt || value.lastSeenAt || null,
      verified: value.verified !== false,
      blocked: Boolean(value.blocked || value.isBlocked || value.deleted),
      status: value.blocked || value.isBlocked || value.deleted ? "blocked" : value.verified === false ? "disabled" : "active",
      storage: source,
      token,
      source
    });
  };

  Object.entries(state.telegramBot?.users || {}).forEach(([chatId, bot]) => addBot(chatId, bot, "telegramBot.users"));
  const scan = (value, source = "state", depth = 0) => {
    if (!value || typeof value !== "object" || depth > 5) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${source}[${index}]`, depth + 1));
      return;
    }
    const keys = Object.keys(value);
    const looksLikeBot = keys.some((key) => /token|chatId|chat_id|botToken|loginKey/i.test(key));
    if (looksLikeBot) addBot(value.chatId || value.chat_id || value.id || source, value, source);
    keys.forEach((key) => {
      if (/bot|mirror|telegram|зерк/i.test(key)) scan(value[key], `${source}.${key}`, depth + 1);
    });
  };
  scan(state.telegramBots, "telegramBots");
  scan(state.mirrorBots, "mirrorBots");
  scan(state.clientMirrorBots, "clientMirrorBots");
  scan(state.telegramMirrors, "telegramMirrors");
  scan(state.telegramBot?.mirrors, "telegramBot.mirrors");
  return Array.from(found.values());
}

function adminAudienceUsers({ state, profiles, sessions }, filters = {}) {
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const completed = orders.filter((order) => ["completed", "closed", "paid"].includes(String(order.status || order.paymentStatus || "").toLowerCase()));
  const onlineKeys = new Set(sessions.filter((session) => Date.now() - Date.parse(session.created_at) < 30 * 60 * 1000).map((session) => session.login_key));
  const specific = String(filters.specificLogins || "").split(",").map((item) => loginKey(item)).filter(Boolean);
  const minPurchase = filters.minPurchase === "" || filters.minPurchase == null ? null : Number(filters.minPurchase);
  const maxPurchase = filters.maxPurchase === "" || filters.maxPurchase == null ? null : Number(filters.maxPurchase);
  const noPurchasesDays = filters.noPurchasesDays === "" || filters.noPurchasesDays == null ? null : Number(filters.noPurchasesDays);
  const productNeedle = loginKey(filters.product || "");
  const storeId = String(filters.storeId || "").trim();
  const categoryNeedle = loginKey(filters.category || "");
  const balanceMode = String(filters.balanceMode || "");

  return profiles.filter((user) => {
    const key = user.login_key;
    const login = user.login;
    const userOrders = completed.filter((order) => sameLogin(order.login, login));
    const purchaseUsd = userOrders.reduce((sum, order) => sum + adminOrderAmount(order), 0);
    const balance = adminMoney(state.balances?.[login] || state.balances?.[key]) + adminMoney(state.ltcBalances?.[login] || state.ltcBalances?.[key]);
    const lastPurchase = Math.max(0, ...userOrders.map(adminTimestamp));

    if (specific.length && !specific.includes(key) && !specific.includes(loginKey(login))) return false;
    if (filters.audience === "online" && !onlineKeys.has(key)) return false;
    if (filters.audience === "buyers" && !userOrders.length) return false;
    if (filters.audience === "no_purchases" && userOrders.length) return false;
    if (filters.audience === "balance" && balance <= 0) return false;
    if (balanceMode === "with" && balance <= 0) return false;
    if (balanceMode === "without" && balance > 0) return false;
    if (minPurchase != null && purchaseUsd < minPurchase) return false;
    if (maxPurchase != null && purchaseUsd > maxPurchase) return false;
    if (noPurchasesDays != null && lastPurchase && Date.now() - lastPurchase < noPurchasesDays * 24 * 60 * 60 * 1000) return false;
    if (noPurchasesDays != null && !lastPurchase && Date.now() - Date.parse(user.created_at) < noPurchasesDays * 24 * 60 * 60 * 1000) return false;
    if (storeId && !userOrders.some((order) => order.storeId === storeId)) return false;
    if (productNeedle && !userOrders.some((order) => loginKey(`${order.product || ""} ${order.productName || ""} ${order.productId || ""}`).includes(productNeedle))) return false;
    if (categoryNeedle && !userOrders.some((order) => loginKey(order.category || "").includes(categoryNeedle))) return false;
    return true;
  });
}

async function adminDeliverBroadcast(state, broadcast, profiles, sessions) {
  const recipients = adminAudienceUsers({ state, profiles, sessions }, broadcast.filters || {});
  const recipientKeys = new Set(recipients.map((user) => user.login_key));
  state.siteNotifications = Array.isArray(state.siteNotifications) ? state.siteNotifications : [];
  let siteSent = 0;
  let telegramSent = 0;
  let telegramFailed = 0;
  let botBlocked = 0;
  let chatDeleted = 0;

  if (["site", "both"].includes(broadcast.channel)) {
    recipients.forEach((user) => {
      state.siteNotifications.unshift({
        id: `${broadcast.id}-${user.login_key}`,
        broadcastId: broadcast.id,
        loginKey: user.login_key,
        login: user.login,
        title: broadcast.title,
        body: broadcast.body,
        type: broadcast.type,
        photoUrl: broadcast.photoUrl || "",
        buttonText: broadcast.buttonText || "",
        buttonUrl: broadcast.buttonUrl || "",
        createdAt: Date.now(),
        clickedAt: null,
        closedAt: null
      });
      siteSent += 1;
    });
  }

  if (["telegram", "both"].includes(broadcast.channel)) {
    const bots = adminCollectBots(state).filter((bot) => !bot.blocked && bot.chatId && (!bot.loginKey || recipientKeys.has(loginKey(bot.loginKey))));
    for (const bot of bots) {
      try {
        const reply_markup = broadcast.buttonUrl ? {
          inline_keyboard: [[{ text: broadcast.buttonText || "Открыть", url: broadcast.buttonUrl }]]
        } : undefined;
        const payload = {
          chat_id: bot.chatId,
          text: `<b>${botHtml(broadcast.title)}</b>\n\n${botHtml(broadcast.body)}${broadcast.buttonUrl ? `\n\n${botHtml(broadcast.buttonUrl)}` : ""}`,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          ...(reply_markup ? { reply_markup } : {})
        };
        const method = broadcast.photoUrl ? "sendPhoto" : "sendMessage";
        if (broadcast.photoUrl) {
          payload.photo = broadcast.photoUrl;
          payload.caption = payload.text;
          delete payload.text;
        }
        const tokenForDelivery = bot.token || telegramBotToken;
        if (broadcast.photoUrl && String(broadcast.photoUrl).startsWith("data:")) {
          await telegramTokenFormApi(tokenForDelivery, method, payload);
        } else if (bot.token) {
          await telegramTokenApi(bot.token, method, payload);
        } else {
          await telegramApi(method, payload);
        }
        telegramSent += 1;
      } catch (error) {
        const errorText = String(error.message || error);
        if (/blocked|bot was blocked|forbidden/i.test(errorText)) botBlocked += 1;
        if (/chat not found|deactivated|kicked|migrate/i.test(errorText)) chatDeleted += 1;
        broadcast.deliveryErrors = Array.isArray(broadcast.deliveryErrors) ? broadcast.deliveryErrors : [];
        broadcast.deliveryErrors.push({
          chatId: bot.chatId,
          loginKey: bot.loginKey,
          source: bot.source,
          error: errorText.slice(0, 300),
          createdAt: Date.now()
        });
        telegramFailed += 1;
      }
    }
  }

  broadcast.recipients = recipients.map((user) => ({ login: user.login, loginKey: user.login_key }));
  broadcast.stats.sent = siteSent + telegramSent;
  broadcast.stats.delivered = siteSent + telegramSent;
  broadcast.stats.telegramFailed = telegramFailed;
  broadcast.stats.notDelivered = telegramFailed;
  broadcast.stats.botBlocked = botBlocked;
  broadcast.stats.chatDeleted = chatDeleted;
  broadcast.stats.siteSent = siteSent;
  broadcast.stats.telegramSent = telegramSent;
}

function adminBuildOverview(data) {
  const { state, stores, profiles, sessions, messages } = data;
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const exchangeRequests = Array.isArray(state.exchangeRequests) ? state.exchangeRequests : [];
  const walletDeposits = Array.isArray(state.walletDeposits) ? state.walletDeposits : [];
  const walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const productOrders = orders.filter((order) => order.type === "product" || order.storeId);
  const completedOrders = productOrders.filter((order) => ["completed", "closed", "paid"].includes(String(order.status || order.paymentStatus || "").toLowerCase()));
  const activeOrders = productOrders.filter((order) => ["active", "pending_payment", "processing"].includes(String(order.status || "").toLowerCase()));
  const disputes = [
    ...orders.filter((order) => order.disputeOpen || order.status === "dispute"),
    ...exchangeRequests.filter((request) => request.disputeOpen || request.status === "dispute")
  ];
  const buyers = new Set(completedOrders.map((order) => loginKey(order.login)).filter(Boolean));
  const productsCount = stores.reduce((sum, store) => sum + (Array.isArray(store.products) ? store.products.length : 0), 0);
  const onlineUsers = new Set(sessions.filter((session) => Date.now() - Date.parse(session.created_at) < 30 * 60 * 1000).map((session) => session.login_key)).size;

  const periods = adminPeriods().map((period) => {
    const periodOrders = completedOrders.filter((order) => adminWithin(order, period.from));
    const periodUsers = profiles.filter((user) => Date.parse(user.created_at) >= period.from);
    const periodDisputes = disputes.filter((item) => adminWithin(item, period.from));
    const turnover = periodOrders.reduce((sum, order) => sum + adminOrderAmount(order), 0);
    const commission = periodOrders.reduce((sum, order) => sum + adminPlatformCommission(order, state, storeById.get(order.storeId)), 0);
    return {
      id: period.id,
      label: period.label,
      sales: periodOrders.length,
      turnover,
      commission,
      newUsers: periodUsers.length,
      disputes: periodDisputes.length,
      activeDeals: activeOrders.filter((order) => adminWithin(order, period.from)).length,
      closedDeals: periodOrders.length
    };
  });

  const storeRows = stores.map((store) => {
    const storeOrders = productOrders.filter((order) => order.storeId === store.id);
    const storeCompleted = storeOrders.filter((order) => ["completed", "closed", "paid"].includes(String(order.status || order.paymentStatus || "").toLowerCase()));
    const storeDisputes = storeOrders.filter((order) => order.disputeOpen || order.status === "dispute");
    const clients = new Set(storeOrders.map((order) => loginKey(order.login)).filter(Boolean));
    const revenue = storeCompleted.reduce((sum, order) => sum + adminOrderAmount(order), 0);
    return {
      id: store.id,
      name: store.name || store.tag || store.id,
      status: store.status || "active",
      ownerLogin: store.ownerLogin || "",
      sales: storeCompleted.length,
      revenue,
      commission: storeCompleted.reduce((sum, order) => sum + adminPlatformCommission(order, state, store), 0),
      clients: clients.size,
      products: Array.isArray(store.products) ? store.products.length : 0,
      disputes: storeDisputes.length,
      registeredAt: store.createdAt || null,
      commissionPercent: Number(store.commissionPercent ?? state.ownerSettings?.platformCommissionPercent ?? 0),
      homepagePosition: Number(store.homepagePosition || 0),
      autoReleaseHours: Number(store.autoReleaseHours ?? state.ownerSettings?.defaultAutoReleaseHours ?? 24),
      short: store.short || "",
      description: store.description || "",
      image: store.image || store.avatar || "",
      cover: store.cover || store.banner || "",
      placement: store.placement || "",
      placements: Array.isArray(store.placements) ? store.placements : [],
      position: Number(store.position || store.homepagePosition || 0),
      countries: Array.isArray(store.countries) ? store.countries : [],
      regions: Array.isArray(store.regions) ? store.regions : (Array.isArray(store.countries) ? store.countries : []),
      panel: adminStorePanelLinks(store),
      coins: store.enabledCoins || {}
    };
  });

  const userRows = profiles.map((user, index) => {
    const login = user.login;
    const userOrders = productOrders.filter((order) => sameLogin(order.login, login));
    const userCompleted = userOrders.filter((order) => ["completed", "closed", "paid"].includes(String(order.status || order.paymentStatus || "").toLowerCase()));
    const userDisputes = userOrders.filter((order) => order.disputeOpen || order.status === "dispute");
    const deposits = walletDeposits.filter((deposit) => sameLogin(deposit.login, login));
    return {
      id: user.login_key,
      number: index + 1,
      login,
      name: user.name,
      role: user.role,
      registeredAt: user.created_at,
      purchases: userCompleted.length,
      purchaseUsd: userCompleted.reduce((sum, order) => sum + adminOrderAmount(order), 0),
      balance: adminMoney(state.balances?.[login] || state.balances?.[user.login_key]),
      balanceLtc: adminMoney(state.ltcBalances?.[login] || state.ltcBalances?.[user.login_key]),
      disputes: userDisputes.length,
      deposits: deposits.reduce((sum, item) => sum + adminMoney(item.amountUsd || item.priceAmount), 0),
      status: adminPublicUserStatus(state, login),
      blockReason: state.blockedUsers?.[user.login_key]?.reason || ""
    };
  });

  const botUsers = adminCollectBots(state);

  return {
    stats: {
      totalSales: completedOrders.length,
      totalTurnover: completedOrders.reduce((sum, order) => sum + adminOrderAmount(order), 0),
      totalCommission: completedOrders.reduce((sum, order) => sum + adminPlatformCommission(order, state, storeById.get(order.storeId)), 0),
      newUsers: periods.find((period) => period.id === "day")?.newUsers || 0,
      totalUsers: profiles.length,
      usersWithPurchase: buyers.size,
      disputes: disputes.length,
      closedDeals: completedOrders.length,
      activeDeals: activeOrders.length,
      products: productsCount,
      stores: stores.length,
      onlineUsers
    },
    periods,
    charts: {
      sales: adminBucketCharts(completedOrders),
      registrations: adminBucketCharts(profiles.map((user) => ({ createdAt: Date.parse(user.created_at) }))),
      revenue: adminBucketCharts(completedOrders, adminOrderAmount),
      disputes: adminBucketCharts(disputes),
      activity: adminBucketCharts(sessions.map((session) => ({ createdAt: Date.parse(session.created_at) })))
    },
    stores: storeRows,
    users: userRows,
    deals: [...productOrders, ...exchangeRequests].sort((a, b) => adminTimestamp(b) - adminTimestamp(a)).slice(0, 250),
    disputes,
    finances: {
      walletDeposits,
      walletTransactions,
      balances: state.balances || {},
      ltcBalances: state.ltcBalances || {},
      depositsByStatus: {
        successful: walletDeposits.filter((item) => ["completed", "paid", "finished"].includes(String(item.status || "").toLowerCase())),
        pending: walletDeposits.filter((item) => ["waiting", "processing", "pending"].includes(String(item.status || "").toLowerCase())),
        cancelled: walletDeposits.filter((item) => ["cancelled", "canceled", "expired"].includes(String(item.status || "").toLowerCase())),
        failed: walletDeposits.filter((item) => ["failed", "error"].includes(String(item.status || "").toLowerCase()))
      }
    },
    settings: {
      ownerSettings: state.ownerSettings || {},
      paymentSettings: state.paymentSettings || {},
      adminSecurity: { login: state.adminSecurity?.login || "admin", hasPassword: Boolean(state.adminSecurity?.passwordHash) }
    },
    broadcasts: Array.isArray(state.broadcasts) ? state.broadcasts : [],
    userFilters: Array.isArray(state.userFilters) ? state.userFilters : [],
    bots: {
      total: botUsers.length,
      active: botUsers.filter((bot) => bot.verified && !bot.blocked).length,
      blocked: botUsers.filter((bot) => bot.blocked).length,
      items: botUsers
    },
    logs: Array.isArray(state.adminLogs) ? state.adminLogs : [],
    messages
  };
}

async function createWalletDepositRecord(user, options = {}) {
  if (!nowpaymentsApiKey) {
    const error = new Error("NOWPAYMENTS_API_KEY не настроен на сервере");
    error.status = 500;
    throw error;
  }

  const amountUsd = Number(options.amountUsd || 0);
  const coin = walletCoinFromRequest(options);
  const amountLtcExpected = Math.max(0, Number(options.amountLtcEstimate || 0));
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    const error = new Error("Укажите сумму пополнения");
    error.status = 400;
    throw error;
  }

  const state = await loadSettingsState();
  const deposits = Array.isArray(state.walletDeposits) ? state.walletDeposits : [];
  const walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
  const deposit = {
    id: `deposit-${Date.now()}`,
    login: user.login,
    status: "waiting",
    amountUsd,
    amountLtcExpected,
    coinId: coin.id,
    payCurrency: coin.payCurrency,
    createdAt: Date.now(),
    expiresAt: Date.now() + walletDepositTtlMs,
    date: new Date().toLocaleString("ru-RU")
  };

  const paymentPayload = {
    price_amount: amountUsd,
    price_currency: "usd",
    pay_currency: coin.payCurrency,
    order_id: deposit.id,
    order_description: `CERBER MARKET wallet top up / ${user.login}`,
    ipn_callback_url: `${publicBaseUrl}/api/payments/nowpayments/ipn`
  };

  const payment = await createNowpaymentsWalletPayment(paymentPayload);

  deposit.paymentId = payment.payment_id || payment.id || "";
  deposit.payAddress = payment.pay_address || payment.address || "";
  deposit.payAmount = Number(payment.pay_amount || 0);
  deposit.payCurrency = coin.payCurrency;
  deposit.coinId = coin.id;
  deposit.paymentUrl = payment.payment_url || payment.invoice_url || "";
  deposit.paymentStatus = payment.payment_status || "waiting";
  deposit.paymentProviderPayload = {
    paymentId: deposit.paymentId,
    payAddress: deposit.payAddress,
    payAmount: deposit.payAmount,
    payCurrency: deposit.payCurrency,
    coinId: deposit.coinId,
    paymentUrl: deposit.paymentUrl
  };

  deposits.unshift(deposit);
  walletTransactions.unshift({
    id: `tx-${deposit.id}`,
    login: user.login,
    type: "deposit",
    title: "Пополнение баланса",
    amountLtc: amountLtcExpected,
    amountUsd,
    payAmount: deposit.payAmount,
    payCurrency: deposit.payCurrency,
    coinId: deposit.coinId,
    createdAt: deposit.createdAt,
    expiresAt: deposit.expiresAt,
    date: deposit.date,
    status: "processing"
  });
  await saveSettingsState({ ...state, walletDeposits: deposits, walletTransactions });
  return deposit;
}

async function completeProductOrder(order, state, providerPayload = {}) {
  order.status = "completed";
  order.paymentStatus = "paid";
  order.paidAt = Date.now();
  order.completedAt = Date.now();
  order.paymentProviderPayload = providerPayload;

  await saveSettingsState(state);

  if (order.storeId) {
    const { data: row } = await supabase.from("stores").select("data").eq("id", order.storeId).maybeSingle();
    const store = row?.data;
    if (store) {
      store.orders = Number(store.orders || 0) + 1;
      const product = (store.products || []).find((item) => item.id === order.productId);
      if (product) {
        product.purchases = Number(product.purchases || 0) + 1;
      }
      await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    }
  }
}

async function completeWalletDeposit(deposit, state, providerPayload = {}) {
  if (deposit.status === "completed") {
    await saveSettingsState(state);
    return;
  }

  const paidUsd = Number(deposit.amountUsd || providerPayload.price_amount || 0);
  const paidLtc = Number(deposit.amountLtcExpected || deposit.amountLtc || (deposit.payCurrency === "ltc" ? (providerPayload.pay_amount || providerPayload.actually_paid || deposit.payAmount || 0) : (paidUsd / 54.2)));
  deposit.status = "completed";
  deposit.paidAt = Date.now();
  deposit.amountLtc = paidLtc;
  deposit.paymentProviderPayload = providerPayload;

  state.ltcBalances = state.ltcBalances || {};
  state.walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
  state.ltcBalances[deposit.login] = Number(state.ltcBalances[deposit.login] || 0) + paidLtc;

  const txId = `tx-${deposit.id}`;
  const existingTx = state.walletTransactions.find((tx) => tx.id === txId);
  if (existingTx) {
    existingTx.status = "completed";
    existingTx.amountLtc = paidLtc;
    existingTx.amountUsd = paidUsd;
    existingTx.coinId = deposit.coinId || "ltc";
    existingTx.payCurrency = deposit.payCurrency || "ltc";
    existingTx.payAmount = Number(providerPayload.pay_amount || providerPayload.actually_paid || deposit.payAmount || 0);
    existingTx.completedAt = Date.now();
  } else {
    state.walletTransactions.unshift({
      id: txId,
      login: deposit.login,
      type: "deposit",
      title: "Пополнение баланса",
      amountLtc: paidLtc,
      amountUsd: paidUsd,
      coinId: deposit.coinId || "ltc",
      payCurrency: deposit.payCurrency || "ltc",
      payAmount: Number(providerPayload.pay_amount || providerPayload.actually_paid || deposit.payAmount || 0),
      createdAt: Date.now(),
      date: new Date().toLocaleString("ru-RU"),
      status: "completed"
    });
  }

  await saveSettingsState(state);
}

async function cancelWalletDeposit(deposit, state, providerPayload = {}) {
  deposit.status = "cancelled";
  deposit.cancelledAt = Date.now();
  deposit.paymentProviderPayload = providerPayload;
  state.walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
  const tx = state.walletTransactions.find((item) => item.id === `tx-${deposit.id}`);
  if (tx) {
    tx.status = "cancelled";
    tx.cancelledAt = Date.now();
  }
  await saveSettingsState(state);
}

app.post(["/api/payments/gateway/create", "/api/payments/nowpayments/create"], async (req, res, next) => {
  try {
    requireDb();
    if (!nowpaymentsApiKey) return res.status(500).json({ error: "NOWPAYMENTS_API_KEY не настроен на сервере" });
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });

    const orderId = String(req.body.orderId || "");
    const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const state = settings?.data || {};
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const order = orders.find((item) => item.id === orderId && item.type === "product");
    if (!order) return res.status(404).json({ error: "Заказ не найден" });
    if (loginKey(order.login) !== loginKey(user.login)) return res.status(403).json({ error: "Нет доступа к заказу" });
    if (order.status !== "pending_payment") return res.status(400).json({ error: "Заказ не ожидает оплату" });
    if (order.paymentExpiresAt && Date.now() > Number(order.paymentExpiresAt)) return res.status(400).json({ error: "Бронь на оплату истекла" });

    if (order.paymentUrl) return res.json({ paymentUrl: order.paymentUrl, ...(await stateFor(user)) });

    const invoicePayload = {
      price_amount: Number(order.amountUsd || 0),
      price_currency: "usd",
      pay_currency: "ltc",
      order_id: order.id,
      order_description: `${order.product || "CERBER order"} / ${order.storeName || ""}`,
      ipn_callback_url: `${publicBaseUrl}/api/payments/nowpayments/ipn`,
      success_url: `${publicBaseUrl}/`,
      cancel_url: `${publicBaseUrl}/`
    };

    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": nowpaymentsApiKey
      },
      body: JSON.stringify(invoicePayload)
    });
    const invoice = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: invoice.message || "Payment invoice error" });

    order.paymentInvoiceId = invoice.id || invoice.invoice_id || "";
    order.paymentUrl = invoice.invoice_url || invoice.payment_url || "";
    order.nowpaymentsPublicKey = nowpaymentsPublicKey ? "configured" : "";
    order.paymentProviderPayload = { invoiceId: order.paymentInvoiceId };
    await saveSettingsState({ ...state, orders });

    res.json({ paymentUrl: order.paymentUrl, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/wallet/deposits/create", "/api/wallet/nowpayments/create"], async (req, res, next) => {
  try {
    requireDb();
    if (!nowpaymentsApiKey) return res.status(500).json({ error: "NOWPAYMENTS_API_KEY не настроен на сервере" });
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });

    const amountUsd = Number(req.body.amountUsd || 0);
    const coin = walletCoinFromRequest(req.body);
    const amountLtcExpected = Math.max(0, Number(req.body.amountLtcEstimate || 0));
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: "Укажите сумму пополнения" });

    const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const state = settings?.data || {};
    const deposits = Array.isArray(state.walletDeposits) ? state.walletDeposits : [];
    const walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
    const deposit = {
      id: `deposit-${Date.now()}`,
      login: user.login,
      status: "waiting",
      amountUsd,
      amountLtcExpected,
      coinId: coin.id,
      payCurrency: coin.payCurrency,
      createdAt: Date.now(),
      expiresAt: Date.now() + walletDepositTtlMs,
      date: new Date().toLocaleString("ru-RU")
    };

    const paymentPayload = {
      price_amount: amountUsd,
      price_currency: "usd",
      pay_currency: coin.payCurrency,
      order_id: deposit.id,
      order_description: `CERBER MARKET wallet top up / ${user.login}`,
      ipn_callback_url: `${publicBaseUrl}/api/payments/nowpayments/ipn`
    };

    const payment = await createNowpaymentsWalletPayment(paymentPayload);

    deposit.paymentId = payment.payment_id || payment.id || "";
    deposit.payAddress = payment.pay_address || payment.address || "";
    deposit.payAmount = Number(payment.pay_amount || 0);
    deposit.payCurrency = coin.payCurrency;
    deposit.coinId = coin.id;
    deposit.paymentUrl = payment.payment_url || payment.invoice_url || "";
    deposit.paymentStatus = payment.payment_status || "waiting";
    deposit.paymentProviderPayload = {
      paymentId: deposit.paymentId,
      payAddress: deposit.payAddress,
      payAmount: deposit.payAmount,
      payCurrency: deposit.payCurrency,
      coinId: deposit.coinId,
      paymentUrl: deposit.paymentUrl
    };

    deposits.unshift(deposit);
    walletTransactions.unshift({
      id: `tx-${deposit.id}`,
      login: user.login,
      type: "deposit",
      title: "Пополнение LTC",
      title: "Пополнение баланса",
      amountLtc: amountLtcExpected,
      amountUsd,
      payAmount: deposit.payAmount,
      payCurrency: deposit.payCurrency,
      coinId: deposit.coinId,
      createdAt: deposit.createdAt,
      expiresAt: deposit.expiresAt,
      date: deposit.date,
      status: "processing"
    });
    await saveSettingsState({ ...state, walletDeposits: deposits, walletTransactions });

    res.json({ deposit, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/telegram/wallet/deposits/:id", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const state = settings?.data || {};
    const deposits = Array.isArray(state.walletDeposits) ? state.walletDeposits : [];
    const deposit = deposits.find((item) => item.id === req.params.id && sameLogin(item.login, user.login));
    if (!deposit) return res.status(404).json({ error: "Пополнение не найдено" });
    res.json({ deposit });
  } catch (error) {
    next(error);
  }
});

app.post("/api/telegram/wallet/deposits/:id/extend", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const state = settings?.data || {};
    const deposits = Array.isArray(state.walletDeposits) ? state.walletDeposits : [];
    const deposit = deposits.find((item) => item.id === req.params.id && sameLogin(item.login, user.login));
    if (!deposit) return res.status(404).json({ error: "Пополнение не найдено" });
    if (String(deposit.status || "").toLowerCase() === "completed") {
      return res.json({ deposit });
    }
    const minutes = Math.min(15, Math.max(10, Number(req.body.minutes || 15)));
    deposit.expiresAt = Math.max(Date.now(), Number(deposit.expiresAt || 0)) + minutes * 60 * 1000;
    deposit.extendedAt = Date.now();
    await saveSettingsState({ ...state, walletDeposits: deposits });
    res.json({ deposit });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/nowpayments/ipn", async (req, res, next) => {
  try {
    requireDb();
    if (!verifyNowpaymentsSignature(req)) return res.status(401).json({ error: "Bad NOWPayments signature" });
    const orderId = String(req.body.order_id || req.body.order || req.body.orderId || "");
    const status = String(req.body.payment_status || req.body.status || "").toLowerCase();
    const paid = ["finished", "confirmed", "sending", "partially_paid"].includes(status);
    const cancelled = ["failed", "expired", "refunded", "cancelled", "canceled"].includes(status);
    if (!orderId) return res.status(400).json({ error: "Unsupported payment callback" });

    const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const state = settings?.data || {};
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const order = orders.find((item) => item.id === orderId);
    if (!order) {
      const deposits = Array.isArray(state.walletDeposits) ? state.walletDeposits : [];
      const paymentId = String(req.body.payment_id || req.body.id || "");
      const deposit = deposits.find((item) => item.id === orderId || String(item.paymentId || "") === paymentId);
      if (!deposit) return res.status(404).json({ error: "Order not found" });
      if (paid) await completeWalletDeposit(deposit, { ...state, walletDeposits: deposits }, req.body);
      else if (cancelled) await cancelWalletDeposit(deposit, { ...state, walletDeposits: deposits }, req.body);
      else return res.json({ ok: true, ignored: status });
      return res.json({ ok: true });
    }

    if (!paid) return res.json({ ok: true, ignored: status });
    await completeProductOrder(order, { ...state, orders }, req.body);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const botCaptchaEmojis = ["😀", "🔥", "💎", "🍀", "⚡", "🌙", "⭐", "🍋", "🎯", "🧊", "🚀", "✅"];
const torLinks = [
  "u725c5lilm6dipuwdesddow7bnzppeqcoqxlcs3xa5yur2lmt7zl5eqd.onion",
  "ptxutaluz75azssnxnfp5l4ygy7f67svtnkqdn6eolmykgx3ft5pp3ad.onion",
  "ncfou7zv7qv2zscufcc6q2wgb3r22gq3a4wkdq2jbkw3tmdbah4wwuyd.onion"
];
const browserLinks = ["cerber.vip", "cerber.to", "cerber.love"];

function botHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function botDateOnly(value) {
  if (!value) return "не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "не указана";
  return date.toLocaleDateString("ru-RU");
}

function initTelegramBotState(state) {
  state.telegramBot = state.telegramBot || {};
  state.telegramBot.users = state.telegramBot.users || {};
  state.telegramBot.sentMessages = state.telegramBot.sentMessages || {};
  return state.telegramBot;
}

function telegramChatState(state, chatId) {
  const botState = initTelegramBotState(state);
  const key = String(chatId);
  botState.users[key] = botState.users[key] || {
    chatId: key,
    verified: false,
    login: "",
    loginKey: "",
    createdAt: Date.now()
  };
  botState.sentMessages[key] = botState.sentMessages[key] || [];
  return botState.users[key];
}

function createBotCaptcha(chatState) {
  const shuffled = [...botCaptchaEmojis].sort(() => Math.random() - 0.5);
  const target = shuffled[0];
  const options = [target, ...shuffled.slice(1, 5)].sort(() => Math.random() - 0.5);
  chatState.verified = false;
  chatState.captcha = { target, options, createdAt: Date.now() };
  return chatState.captcha;
}

function botMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🔴 Профиль", callback_data: "menu:profile" },
        { text: "🟡 Диспуты", callback_data: "menu:disputes" }
      ],
      [
        { text: "🟩 Кошелёк", callback_data: "menu:wallet" },
        { text: "🟢 Tor ссылки", callback_data: "menu:tor" }
      ],
      [
        { text: "🟦 Браузер ссылки", callback_data: "menu:browser" },
        { text: "🔵 Сообщения", callback_data: "menu:messages" }
      ],
      [
        { text: "⚪ Мои заказы", callback_data: "menu:orders" }
      ],
      [
        { text: "⬜ Удалить бота и очистить историю", callback_data: "menu:delete" }
      ]
    ]
  };
}

function botBackKeyboard() {
  return { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "menu:home" }]] };
}

function botWalletKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🟦 Litecoin LTC", callback_data: "wallet:deposit:ltc" }],
      [
        { text: "🟢 USDT TRC-20", callback_data: "wallet:deposit:usdt_trc20" },
        { text: "🔵 USDT ERC-20", callback_data: "wallet:deposit:usdt_erc20" }
      ],
      [
        { text: "🟣 USDT Solana", callback_data: "wallet:deposit:usdt_sol" },
        { text: "🔴 TRX", callback_data: "wallet:deposit:trx" }
      ],
      [
        { text: "🟪 Ethereum", callback_data: "wallet:deposit:eth" },
        { text: "🟨 Solana", callback_data: "wallet:deposit:sol" }
      ],
      [{ text: "⬅️ В меню", callback_data: "menu:home" }]
    ]
  };
}

function botCoinLabel(coinId) {
  const labels = {
    ltc: "LTC",
    usdt_trc20: "USDT TRC-20",
    usdt_erc20: "USDT ERC-20",
    usdt_sol: "USDT SOL",
    trx: "TRX",
    eth: "ETH",
    sol: "SOL"
  };
  return labels[coinId] || String(coinId || "").toUpperCase();
}

async function telegramApi(method, payload = {}) {
  if (!telegramBotToken) {
    const error = new Error("TELEGRAM_BOT_TOKEN не настроен");
    error.status = 500;
    throw error;
  }
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const error = new Error(body.description || `Telegram ${method} error`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function telegramTokenApi(token, method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const error = new Error(body.description || `Telegram ${method} error`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function dataUrlBlob(value = "") {
  const match = String(value).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return new Blob([Buffer.from(match[2], "base64")], { type: match[1] || "application/octet-stream" });
}

async function telegramTokenFormApi(token, method, payload = {}) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value == null) return;
    if (key === "photo" && String(value).startsWith("data:")) {
      const blob = dataUrlBlob(value);
      if (blob) form.append("photo", blob, "photo.png");
      return;
    }
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const error = new Error(body.description || `Telegram ${method} error`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function botSendMessage(state, chatId, text, replyMarkup = botMainKeyboard()) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const result = await telegramApi("sendMessage", payload);
  const messageId = result?.result?.message_id;
  if (messageId) {
    const botState = initTelegramBotState(state);
    const key = String(chatId);
    botState.sentMessages[key] = botState.sentMessages[key] || [];
    botState.sentMessages[key].push(messageId);
    botState.sentMessages[key] = botState.sentMessages[key].slice(-80);
  }
  return result;
}

async function botEditOrSend(state, callback, text, replyMarkup = botMainKeyboard()) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  if (!chatId || !messageId) return botSendMessage(state, chatId, text, replyMarkup);
  try {
    await telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup
    });
  } catch {
    await botSendMessage(state, chatId, text, replyMarkup);
  }
}

async function botAnswer(callback, text = "") {
  if (!callback?.id) return;
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callback.id,
    text,
    show_alert: false
  }).catch(() => {});
}

async function botProfileByChat(state, chatId) {
  const chat = telegramChatState(state, chatId);
  if (!chat.loginKey) return null;
  const { data: user } = await supabase.from("profiles").select("*").eq("login_key", chat.loginKey).maybeSingle();
  return user || null;
}

function botUserStats(state, login) {
  const productOrders = (Array.isArray(state.orders) ? state.orders : []).filter((order) => sameLogin(order.login, login) && order.type === "product");
  const paidOrders = productOrders.filter((order) => !["pending_payment", "canceled", "cancelled"].includes(String(order.status || "")));
  const exchangeRequests = (Array.isArray(state.exchangeRequests) ? state.exchangeRequests : []).filter((request) => (
    sameLogin(request.fromLogin, login) || sameLogin(request.toLogin, login)
  ));
  const orderDisputes = productOrders.filter((order) => order.disputeOpen || order.status === "dispute");
  const exchangeDisputes = exchangeRequests.filter((request) => request.disputeOpen || request.status === "dispute");
  const walletTxs = (Array.isArray(state.walletTransactions) ? state.walletTransactions : []).filter((tx) => sameLogin(tx.login, login));
  const completedDeposits = walletTxs.filter((tx) => tx.type === "deposit" && tx.status === "completed");
  return {
    purchases: paidOrders.length,
    totalPurchaseUsd: paidOrders.reduce((sum, order) => sum + Number(order.amountUsd || order.priceUsd || 0), 0),
    disputes: orderDisputes.length + exchangeDisputes.length,
    balanceLtc: Number(state.ltcBalances?.[login] || state.ltcBalances?.[loginKey(login)] || 0),
    balanceUsd: Number(state.balances?.[login] || state.balances?.[loginKey(login)] || 0),
    totalDepositsUsd: completedDeposits.reduce((sum, tx) => sum + Number(tx.amountUsd || 0), 0),
    orders: productOrders,
    exchangeRequests,
    disputesList: [...orderDisputes, ...exchangeDisputes]
  };
}

function botNeedLoginText() {
  return [
    "<b>Аккаунт не привязан</b>",
    "Напишите в этот чат:",
    "<code>/login ваш_логин ваш_пароль</code>",
    "",
    "После привязки откроются профиль, кошелек, заказы и сообщения."
  ].join("\n");
}

async function botShowCaptcha(state, chatId, intro = "Для начала пройдите проверку.") {
  const chat = telegramChatState(state, chatId);
  const captcha = createBotCaptcha(chat);
  await botSendMessage(state, chatId, `${botHtml(intro)}\n\nВыберите нужный смайлик: <b>${botHtml(captcha.target)}</b>`, {
    inline_keyboard: [
      captcha.options.map((emoji, index) => ({ text: emoji, callback_data: `captcha:${index}` }))
    ]
  });
}

async function botShowMenu(state, chatId, text = "Меню CERBER") {
  const chat = telegramChatState(state, chatId);
  if (!chat.verified) return botShowCaptcha(state, chatId);
  if (!chat.loginKey) return botSendMessage(state, chatId, botNeedLoginText(), botMainKeyboard());
  return botSendMessage(state, chatId, `<b>${botHtml(text)}</b>`, botMainKeyboard());
}

async function botMenuText(state, user, section) {
  const stats = botUserStats(state, user.login);
  if (section === "profile") {
    return [
      "<b>🔴 Профиль</b>",
      `Логин: <b>${botHtml(user.login)}</b>`,
      `Дата регистрации: <b>${botHtml(botDateOnly(user.created_at))}</b>`,
      "",
      `Общее число покупок на сайте: <b>${stats.purchases}</b>`,
      `Общая сумма покупок: <b>${stats.totalPurchaseUsd.toFixed(2)} $</b>`,
      `Общее число диспутов: <b>${stats.disputes}</b>`
    ].join("\n");
  }
  if (section === "wallet") {
    return [
      "<b>🟩 Кошелёк</b>",
      `Баланс сейчас: <b>${stats.balanceLtc.toFixed(8)} LTC</b>`,
      `Дополнительно USD: <b>${stats.balanceUsd.toFixed(2)} $</b>`,
      `Общая сумма вложений: <b>${stats.totalDepositsUsd.toFixed(2)} $</b>`,
      "",
      "Выберите монету, чтобы получить счет пополнения баланса."
    ].join("\n");
  }
  if (section === "disputes") {
    const items = stats.disputesList.slice(0, 8).map((item, index) => `${index + 1}. ${botHtml(item.product || item.title || item.type || item.id)} — ${botHtml(item.status || "спор")}`);
    return [`<b>🟡 Диспуты</b>`, `Всего: <b>${stats.disputes}</b>`, "", items.length ? items.join("\n") : "Активных диспутов нет."].join("\n");
  }
  if (section === "orders") {
    const items = [...stats.orders, ...stats.exchangeRequests].slice(0, 10).map((item, index) => `${index + 1}. ${botHtml(item.product || item.title || item.type || item.id)} — ${botHtml(item.status || "в работе")}`);
    return [`<b>⚪ Мои заказы</b>`, `Всего: <b>${stats.orders.length + stats.exchangeRequests.length}</b>`, "", items.length ? items.join("\n") : "Заказов пока нет."].join("\n");
  }
  return "<b>Меню</b>";
}

async function botMessagesText(user) {
  const { data: rows } = await supabase.from("messages").select("data").order("created_at", { ascending: false }).limit(50);
  const messages = (rows || [])
    .map((row) => row.data)
    .filter((message) => sameLogin(message.fromLogin, user.login) || sameLogin(message.toLogin, user.login))
    .slice(0, 8);
  if (!messages.length) return "<b>🔵 Сообщения</b>\nСообщений пока нет.";
  return [
    "<b>🔵 Сообщения</b>",
    ...messages.map((message, index) => `${index + 1}. <b>${botHtml(privatePeer(message, user.login))}</b>: ${botHtml(message.body || message.text || message.message || "вложение").slice(0, 180)}`)
  ].join("\n");
}

async function handleBotLogin(state, chatId, text) {
  const chat = telegramChatState(state, chatId);
  if (!chat.verified) {
    await botShowCaptcha(state, chatId, "Сначала пройдите проверку.");
    return;
  }
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) {
    await botSendMessage(state, chatId, "Формат входа:\n<code>/login логин пароль</code>", botMainKeyboard());
    return;
  }
  const key = loginKey(parts[1]);
  const password = parts.slice(2).join(" ");
  const { data: user } = await supabase.from("profiles").select("*").eq("login_key", key).maybeSingle();
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await botSendMessage(state, chatId, "Неверный логин или пароль.", botMainKeyboard());
    return;
  }
  chat.login = user.login;
  chat.loginKey = user.login_key;
  chat.linkedAt = Date.now();
  await botSendMessage(state, chatId, `Аккаунт <b>${botHtml(user.login)}</b> привязан.`, botMainKeyboard());
}

async function handleBotDepositAmount(state, chatId, text) {
  const chat = telegramChatState(state, chatId);
  const coinId = chat.pendingDepositCoin;
  if (!coinId) return false;
  const user = await botProfileByChat(state, chatId);
  if (!user) {
    chat.pendingDepositCoin = "";
    await botSendMessage(state, chatId, botNeedLoginText(), botMainKeyboard());
    return true;
  }
  const amountUsd = Number(String(text).replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] || 0);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    await botSendMessage(state, chatId, "Введите сумму пополнения числом в USD, например: <code>25</code>", botBackKeyboard());
    return true;
  }
  chat.pendingDepositCoin = "";
  await saveSettingsState(state);
  const deposit = await createWalletDepositRecord(user, { amountUsd, coinId });
  const freshState = await loadSettingsState();
  state.walletDeposits = freshState.walletDeposits;
  state.walletTransactions = freshState.walletTransactions;
  state.ltcBalances = freshState.ltcBalances;
  state.telegramBot = freshState.telegramBot;
  const label = botCoinLabel(deposit.coinId);
  const copyText = [
    `Сеть: ${label}`,
    `Адрес: ${deposit.payAddress || "откройте ссылку оплаты"}`,
    `Сумма: ${Number(deposit.payAmount || 0).toFixed(8)} ${label}`
  ].join("\n");
  await botSendMessage(state, chatId, [
    `<b>Счет пополнения создан</b>`,
    `Монета: <b>${botHtml(label)}</b>`,
    `Сумма в USD: <b>${amountUsd.toFixed(2)} $</b>`,
    `К оплате: <b>${Number(deposit.payAmount || 0).toFixed(8)} ${botHtml(label)}</b>`,
    deposit.payAddress ? `Адрес:\n<code>${botHtml(deposit.payAddress)}</code>` : "",
    deposit.paymentUrl ? `Ссылка оплаты:\n${botHtml(deposit.paymentUrl)}` : "",
    "",
    "Скопировать всё вместе:",
    `<code>${botHtml(copyText)}</code>`,
    "",
    "Счет истекает через 40 минут."
  ].filter(Boolean).join("\n"), botMainKeyboard());
  return true;
}

async function clearBotHistory(state, chatId) {
  const botState = initTelegramBotState(state);
  const key = String(chatId);
  const sent = botState.sentMessages[key] || [];
  for (const messageId of sent) {
    await telegramApi("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => {});
  }
  delete botState.sentMessages[key];
  delete botState.users[key];
  await saveSettingsState(state);
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "История очищена. Связка с аккаунтом удалена. Для полного удаления самого бота удалите чат в Telegram.",
    disable_web_page_preview: true
  }).catch(() => {});
}

async function handleTelegramCallback(state, callback) {
  const chatId = callback.message?.chat?.id;
  const data = String(callback.data || "");
  if (!chatId) return;
  const chat = telegramChatState(state, chatId);

  if (data.startsWith("captcha:")) {
    const index = Number(data.split(":")[1]);
    const picked = chat.captcha?.options?.[index];
    if (picked && picked === chat.captcha.target) {
      chat.verified = true;
      chat.captcha = null;
      await botAnswer(callback, "Проверка пройдена");
      await botEditOrSend(state, callback, chat.loginKey ? "<b>Меню CERBER</b>" : botNeedLoginText(), botMainKeyboard());
    } else {
      const captcha = createBotCaptcha(chat);
      await botAnswer(callback, "Неверный смайлик");
      await botEditOrSend(state, callback, `Неверно. Выберите нужный смайлик: <b>${botHtml(captcha.target)}</b>`, {
        inline_keyboard: [captcha.options.map((emoji, optionIndex) => ({ text: emoji, callback_data: `captcha:${optionIndex}` }))]
      });
    }
    return;
  }

  if (!chat.verified) {
    await botAnswer(callback);
    await botShowCaptcha(state, chatId);
    return;
  }

  if (data === "menu:delete") {
    await botAnswer(callback, "Очищаю");
    await clearBotHistory(state, chatId);
    return;
  }

  if (data === "menu:home") {
    await botAnswer(callback);
    await botEditOrSend(state, callback, "<b>Меню CERBER</b>", botMainKeyboard());
    return;
  }

  const user = await botProfileByChat(state, chatId);
  if (!user) {
    await botAnswer(callback);
    await botEditOrSend(state, callback, botNeedLoginText(), botMainKeyboard());
    return;
  }

  if (data === "menu:profile") await botEditOrSend(state, callback, await botMenuText(state, user, "profile"), botBackKeyboard());
  else if (data === "menu:disputes") await botEditOrSend(state, callback, await botMenuText(state, user, "disputes"), botBackKeyboard());
  else if (data === "menu:wallet") await botEditOrSend(state, callback, await botMenuText(state, user, "wallet"), botWalletKeyboard());
  else if (data === "menu:orders") await botEditOrSend(state, callback, await botMenuText(state, user, "orders"), botBackKeyboard());
  else if (data === "menu:messages") await botEditOrSend(state, callback, await botMessagesText(user), botBackKeyboard());
  else if (data === "menu:tor") await botEditOrSend(state, callback, `<b>🟢 Tor ссылки</b>\n${torLinks.map((link) => `<code>${botHtml(link)}</code>`).join("\n")}`, botBackKeyboard());
  else if (data === "menu:browser") await botEditOrSend(state, callback, `<b>🟦 Браузер ссылки</b>\n${browserLinks.map((link) => `<code>${botHtml(link)}</code>`).join("\n")}`, botBackKeyboard());
  else if (data.startsWith("wallet:deposit:")) {
    chat.pendingDepositCoin = data.replace("wallet:deposit:", "");
    await botEditOrSend(state, callback, `Введите сумму пополнения в USD для <b>${botHtml(botCoinLabel(chat.pendingDepositCoin))}</b>.\nНапример: <code>25</code>`, botBackKeyboard());
  }
  await botAnswer(callback);
}

async function handleBotMirrorCommand(state, chatId, message, text) {
  const chat = telegramChatState(state, chatId);
  const token = text.replace(/^\/(?:mirror|addmirror)\s*/i, "").trim();
  if (!chat.loginKey) {
    await botSendMessage(state, chatId, "Сначала войдите командой /login ЛОГИН ПАРОЛЬ");
    return true;
  }
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    await botSendMessage(state, chatId, "Отправьте токен зеркала так: /mirror 123456:ABCDEF...");
    return true;
  }
  try {
    const info = await telegramTokenApi(token, "getMe");
    const bot = info?.result || {};
    state.mirrorBots = Array.isArray(state.mirrorBots) ? state.mirrorBots : [];
    const existing = state.mirrorBots.find((item) => String(item.token || "") === token || String(item.chatId || "") === String(chatId));
    const mirror = existing || {};
    mirror.chatId = String(chatId);
    mirror.ownerChatId = String(chatId);
    mirror.token = token;
    mirror.loginKey = chat.loginKey;
    mirror.login = chat.login || "";
    mirror.username = message.from?.username || chat.username || "";
    mirror.botUsername = bot.username || "";
    mirror.botName = bot.first_name || bot.username || "";
    mirror.verified = true;
    mirror.blocked = false;
    mirror.createdAt = mirror.createdAt || Date.now();
    mirror.updatedAt = Date.now();
    if (!existing) state.mirrorBots.unshift(mirror);
    state.adminLogs = Array.isArray(state.adminLogs) ? state.adminLogs : [];
    state.adminLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: "mirror_bot_created",
      actor: chat.login || chat.loginKey || "telegram",
      details: {
        id: mirror.token ? `mirror-${crypto.createHash("sha1").update(mirror.token).digest("hex").slice(0, 10)}` : String(chatId),
        userId: chat.loginKey,
        ownerId: chat.loginKey,
        chatId: String(chatId),
        username: mirror.username,
        botUsername: mirror.botUsername,
        status: "active",
        storage: "app_settings.mirrorBots"
      },
      createdAt: Date.now()
    });
    state.adminLogs = state.adminLogs.slice(0, 500);
    await appendAdminLog("mirror_bot_created", chat.login || chat.loginKey || "telegram", {
      id: mirror.token ? `mirror-${crypto.createHash("sha1").update(mirror.token).digest("hex").slice(0, 10)}` : String(chatId),
      userId: chat.loginKey,
      ownerId: chat.loginKey,
      chatId: String(chatId),
      username: mirror.username,
      botUsername: mirror.botUsername,
      status: "active",
      storage: "app_settings.mirrorBots"
    });
    await botSendMessage(state, chatId, `Зеркало сохранено: @${botHtml(mirror.botUsername || mirror.botName || "bot")}`).catch(() => {});
  } catch (error) {
    state.adminLogs = Array.isArray(state.adminLogs) ? state.adminLogs : [];
    state.adminLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: "mirror_bot_error",
      actor: chat.login || chat.loginKey || "telegram",
      details: {
        userId: chat.loginKey || "",
        chatId: String(chatId),
        error: String(error.message || error).slice(0, 300),
        storage: "app_settings.mirrorBots"
      },
      createdAt: Date.now()
    });
    state.adminLogs = state.adminLogs.slice(0, 500);
    await appendAdminLog("mirror_bot_error", chat.login || chat.loginKey || "telegram", {
      userId: chat.loginKey || "",
      chatId: String(chatId),
      error: String(error.message || error).slice(0, 300),
      storage: "app_settings.mirrorBots"
    }).catch(() => {});
    await botSendMessage(state, chatId, `Не удалось проверить токен зеркала: ${botHtml(error.message || error)}`).catch(() => {});
  }
  return true;
}

async function handleTelegramMessage(state, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const text = String(message.text || "").trim();
  const chat = telegramChatState(state, chatId);
  chat.username = message.from?.username || chat.username || "";
  chat.updatedAt = Date.now();
  if (text === "/start") {
    if (chat.verified) await botShowMenu(state, chatId);
    else await botShowCaptcha(state, chatId);
    return;
  }
  if (!chat.verified) {
    await botShowCaptcha(state, chatId);
    return;
  }
  if (text.startsWith("/login")) {
    await handleBotLogin(state, chatId, text);
    return;
  }
  if (/^\/(?:mirror|addmirror)\b/i.test(text)) {
    await handleBotMirrorCommand(state, chatId, message, text);
    return;
  }
  if (await handleBotDepositAmount(state, chatId, text)) return;
  await botShowMenu(state, chatId);
}

app.get("/api/telegram/webhook", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(telegramBotToken),
    webhook: `${publicBaseUrl}/api/telegram/webhook`
  });
});

app.post("/api/telegram/webhook", async (req, res, next) => {
  try {
    requireDb();
    if (!telegramBotToken) return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN не настроен" });
    if (telegramWebhookSecret && req.headers["x-telegram-bot-api-secret-token"] !== telegramWebhookSecret) {
      return res.status(401).json({ error: "Bad Telegram secret" });
    }
    const state = await loadSettingsState();
    if (req.body.callback_query) await handleTelegramCallback(state, req.body.callback_query);
    else if (req.body.message) await handleTelegramMessage(state, req.body.message);
    await saveSettingsState(state);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get(["/text-admin", "/text-admin.html"], (_req, res) => {
  res.sendFile(path.join(__dirname, "text-admin.html"));
});

app.get(["/market-admin", "/market-admin.html"], (_req, res) => {
  res.sendFile(path.join(__dirname, "market-admin.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  let message = String(error.message || "Server error");
  if (/nowpayments|NOWPAYMENTS/i.test(message)) message = "Платежный шлюз не настроен или временно недоступен";
  if (message.includes("Could not find the table")) {
    return res.status(500).json({
      error: "В Supabase ещё не созданы таблицы. Выполни SQL из файла supabase-schema.sql."
    });
  }
  res.status(error.status || 500).json({ error: message });
});

const server = app.listen(port, () => {
  console.log(`CERBER server listening on ${port}`);
});

adminRealtimeServer = new WebSocketServer({ server, path: "/api/admin/realtime" });
adminRealtimeServer.on("connection", (socket, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const token = url.searchParams.get("token") || "";
  const admin = verifyAdminToken({ headers: { authorization: `Bearer ${token}` } });
  if (!admin) {
    socket.close(1008, "Unauthorized");
    return;
  }
  socket.send(JSON.stringify({ type: "connected", createdAt: Date.now() }));
});
