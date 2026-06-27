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
const turnstileEnabled = Boolean(turnstileSiteKey && turnstileSecretKey);
const nowpaymentsApiKey = process.env.NOWPAYMENTS_API_KEY || "";
const nowpaymentsIpnSecret = process.env.NOWPAYMENTS_IPN_SECRET || "";
const nowpaymentsPublicKey = process.env.NOWPAYMENTS_PUBLIC_KEY || "";
const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://cerber-project.onrender.com";
const mainLtcWallet = process.env.NOWPAYMENTS_LTC_WALLET || "ltc1qnl73w78t8v39kkjqd5jgr2y8a62g4mh4rhu6lu";
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const proverkaBotToken = process.env.PROVERKA_BOT_TOKEN || "";
const siteNotifyBotToken = process.env.SITE_NOTIFY_BOT_TOKEN || "";
const walletDepositTtlMs = 40 * 60 * 1000;
const storeWithdrawalCooldownMs = 3 * 24 * 60 * 60 * 1000;
const nowpaymentsTimeoutMs = 25000;
const groupChatHiddenSiteEmojiIds = new Set(["030", "031", "032", "033", "034", "035", "036"]);
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
let publicRealtimeServer = null;
let seedReady = false;
let seedPromise = null;
const maxDataImageLength = 7_000_000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-password, x-owner-password, x-telegram-bot-api-secret-token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "40mb" }));
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

function verifyOwnerPanel(req) {
  const expected = process.env.OWNER_PANEL_PASSWORD || process.env.ADMIN_PASSWORD || "admincerbercc1212";
  const password = String(req.headers["x-owner-password"] || req.body?.ownerPassword || "");
  if (password !== expected) {
    const error = new Error("Bad owner password");
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
  console.log(`[admin-log] ${action}`, { actor, ...details });
  notifyRealtime(action, details);
}

function notifyAdminRealtime(type = "update", details = {}) {
  if (!adminRealtimeServer) return;
  const payload = JSON.stringify({ type, details, createdAt: Date.now() });
  adminRealtimeServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function notifyPublicRealtime(type = "state_updated", details = {}) {
  if (!publicRealtimeServer) return;
  const payload = JSON.stringify({ type, details, createdAt: Date.now() });
  publicRealtimeServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function notifyRealtime(type = "state_updated", details = {}) {
  notifyAdminRealtime(type, details);
  notifyPublicRealtime(type, details);
}

function loginKey(value) {
  return String(value || "").trim().toLowerCase();
}

function groupRoomKey(value) {
  const room = String(value || "").trim().toLowerCase();
  return ["ru", "md", "en"].includes(room) ? room : "ru";
}

function groupMemberEntryKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [room, ...loginParts] = raw.includes(":") ? raw.split(":") : ["ru", raw];
  const cleanLogin = loginKey(loginParts.join(":"));
  return cleanLogin ? `${groupRoomKey(room)}:${cleanLogin}` : "";
}

function publicUser(row) {
  return row ? { login: row.login, name: row.name, role: row.role } : null;
}

function sameLogin(a, b) {
  return loginKey(a) === loginKey(b);
}

function storeDeletedByState(state = {}, store = {}) {
  const deletedIds = Array.isArray(state.deletedStoreIds) ? state.deletedStoreIds.map(String) : [];
  const id = String(store.id || "");
  const status = String(store.status || "").toLowerCase();
  return (
    deletedIds.includes(id) ||
    store.is_deleted === true ||
    store.deleted === true ||
    ["deleted", "delete"].includes(status)
  );
}

function mergeStoreSources(primaryStores = [], fallbackStores = []) {
  const map = new Map();
  (fallbackStores || []).forEach((store) => {
    if (store?.id) map.set(String(store.id), store);
  });
  (primaryStores || []).forEach((store) => {
    if (store?.id) map.set(String(store.id), store);
  });
  return Array.from(map.values());
}

function publicProductForState(product = {}, store = {}) {
  const item = { ...product };
  const images = Array.isArray(item.images) ? item.images : [];
  if (images.length) item.image = item.image || images[0] || store.image || "";
  item.image = publicImageForState(item.image || store.image || "", "assets/cerber-emblem.png");
  item.images = images.length
    ? images.map((image) => publicImageForState(image, item.image)).slice(0, 5)
    : [item.image];
  item.gallery = Array.isArray(item.gallery)
    ? item.gallery.map((image) => publicImageForState(image, "assets/cerber-emblem.png")).slice(0, 8)
    : [];
  return item;
}

function isBrokenImageValue(value = "") {
  const image = String(value || "").trim();
  return !image || image === "[object File]" || image === "[object Blob]" || image === "undefined" || image === "null";
}

function publicImageForState(value = "", fallback = "assets/cerber-emblem.png") {
  const image = String(value || "").trim();
  if (isBrokenImageValue(image)) return fallback;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(image) && image.length > maxDataImageLength) return fallback;
  return image;
}

function publicStoreForState(store = {}) {
  const item = { ...store };
  item.image = publicImageForState(item.image || item.avatar, "assets/cerber-emblem.png");
  item.avatar = item.image;
  item.cover = publicImageForState(item.cover || item.banner || item.image, "assets/market-banner.png");
  item.banner = item.cover;
  item.gallery = Array.isArray(item.gallery)
    ? item.gallery.map((image) => publicImageForState(image, "assets/cerber-emblem.png")).slice(0, 12)
    : [];
  item.products = Array.isArray(item.products) ? item.products.map((product) => publicProductForState(product, item)) : [];
  return item;
}

function sellerImagePatch(existingValue = "", inputValue = "") {
  const existing = String(existingValue || "");
  const incoming = String(inputValue || "");
  if (isBrokenImageValue(incoming)) return isBrokenImageValue(existing) ? "" : existing;
  if (["assets/cerber-emblem.png", "assets/market-banner.png"].includes(incoming) && /^data:image\/[a-z0-9.+-]+;base64,/i.test(existing)) return existing;
  return incoming || existing;
}

function sellerProductPatch(existing = {}, input = {}) {
  const item = { ...existing, ...input };
  item.image = sellerImagePatch(existing.image, input.image);
  if (Array.isArray(input.images) && input.images.length) {
    const hasOnlyPlaceholder = input.images.every((image) => image === "assets/cerber-emblem.png");
    item.images = hasOnlyPlaceholder && Array.isArray(existing.images) && existing.images.length ? existing.images : input.images;
  } else if (Array.isArray(existing.images)) {
    item.images = existing.images;
  }
  return item;
}

function requireDb() {
  if (!supabase) {
    const error = new Error("Supabase is not configured");
    error.status = 500;
    throw error;
  }
}

function withTimeout(promise, label, timeoutMs = 8000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timeout after ${timeoutMs}ms`);
      error.status = 504;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function verifyCaptcha(token, req) {
  if (!turnstileEnabled) {
    console.warn("[captcha] Turnstile is not fully configured; captcha verification skipped");
    return;
  }
  if (!token) {
    const error = new Error("Подтвердите, что вы не робот");
    error.status = 400;
    throw error;
  }

  const form = new URLSearchParams();
  form.set("secret", turnstileSecretKey);
  form.set("response", token);

  let response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    console.warn("[captcha] Turnstile verification request failed", { message: error.message });
    const captchaError = new Error("Капча временно не отвечает, попробуйте ещё раз");
    captchaError.status = 503;
    throw captchaError;
  }
  const result = await response.json().catch(() => ({}));
  if (!result.success) {
    console.warn("[captcha] Turnstile verification failed", {
      errors: result["error-codes"] || [],
      hostname: result.hostname || "",
      action: result.action || "",
      cdata: result.cdata || ""
    });
    const error = new Error("Капча не пройдена, попробуйте ещё раз");
    error.status = 400;
    throw error;
  }
}

async function ensureSeed() {
  if (!supabase || seedReady) return;
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const startedAt = Date.now();
    const [{ data: existingSettings, error: settingsError }, { data: existingAdmin, error: adminError }] = await Promise.all([
      supabase.from("app_settings").select("id").eq("id", "main").maybeSingle(),
      supabase.from("profiles").select("login_key").eq("login_key", "admin").maybeSingle()
    ]);
    if (settingsError) throw settingsError;
    if (adminError) throw adminError;

    if (!existingAdmin) {
      const adminPassword = process.env.ADMIN_PASSWORD || "admincerbercc1212";
      const adminHash = await bcrypt.hash(adminPassword, 12);
      const { error } = await supabase.from("profiles").upsert([
        { login: "admin", login_key: "admin", password_hash: adminHash, name: "Admin", role: "admin" }
      ], { onConflict: "login_key" });
      if (error) throw error;
    }

    if (!existingSettings) {
      const { error } = await supabase.from("app_settings").upsert({
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
      walletWithdrawals: [],
      telegramBot: {
        users: {},
        sentMessages: {}
      },
      mirrorBots: [],
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
      if (error) throw error;
    }

    seedReady = true;
    console.log("[ensureSeed] ready", { ms: Date.now() - startedAt, createdAdmin: !existingAdmin, createdSettings: !existingSettings });
  })();
  try {
    await seedPromise;
  } finally {
    seedPromise = null;
  }
}

async function stateFor(user) {
  const totalStartedAt = Date.now();
  try {
    const seedStartedAt = Date.now();
    await withTimeout(ensureSeed(), "ensureSeed", 8000);
    const seedMs = Date.now() - seedStartedAt;
    const queriesStartedAt = Date.now();
    const messagesQuery = withTimeout(
      supabase.from("messages").select("data").order("created_at", { ascending: false }).limit(1000),
      "messages query",
      8000
    );
    const settingsQuery = withTimeout(
      supabase.from("app_settings").select("data").eq("id", "main").maybeSingle(),
      "app_settings query",
      8000
    );
    const [messagesResult, settingsResult] = await Promise.all([
      messagesQuery,
      settingsQuery
    ]);
    const storesResult = await withTimeout(
      supabase.from("stores").select("data").order("created_at", { ascending: true }).limit(500),
      "stores query",
      8000
    ).catch((error) => {
      console.error("[stateFor] stores query failed; using publicStoresCache fallback", {
        message: error.message,
        status: error.status || 500,
        ms: Date.now() - queriesStartedAt
      });
      return { data: null, error: null, failed: true };
    });
    const queriesMs = Date.now() - queriesStartedAt;
    const { data: stores, error: storesError } = storesResult;
    const { data: messages, error: messagesError } = messagesResult;
    const { data: settings, error: settingsError } = settingsResult;
    if (storesError) throw storesError;
    if (messagesError) throw messagesError;
    if (settingsError) throw settingsError;
    console.log("[stateFor] timings", {
      seedMs,
      queriesMs,
      totalMs: Date.now() - totalStartedAt,
      stores: stores?.length || 0,
      messages: messages?.length || 0
    });
    const settingsData = settings?.data || {};
    if (await normalizeServerOrders(settingsData)) {
      saveSettingsState(settingsData).catch((error) => {
        console.error("[stateFor] order normalization save failed", { message: error.message });
      });
    }
    const allMessages = (messages || []).map((row) => row.data);
    const orders = hydrateOrdersDisputeHistory(
      (Array.isArray(settingsData.orders) ? [...settingsData.orders] : []).filter((order) => order.id !== "order-cerber-paid-preview" && order.storeId !== "skboy"),
      allMessages
    );
    const storesFromDb = Array.isArray(storesResult.data)
      ? storesResult.data.map((row) => row.data)
      : null;
    const fallbackStores = Array.isArray(settingsData.publicStoresCache)
      ? settingsData.publicStoresCache
      : [];
    const allStores = storesFromDb
      ? mergeStoreSources(storesFromDb, settingsData.ownerStores || [])
      : fallbackStores;
    const visibleStores = allStores
      .filter((store) => store.id !== "skboy" && !/сол[её]ный мальчик/i.test(String(store.name || "")) && !storeDeletedByState(settingsData, store))
      .map(publicStoreForState);
    if (storesFromDb) {
      savePublicStoresCache(visibleStores).catch((error) => {
        console.error("[stateFor] public stores cache save failed", { message: error.message });
      });
    }
    const visibleExchangeCards = (settingsData.exchangeCards || defaultExchangeCards).filter((card) => card.id !== "kent-ltc" && !/kent\s*ltc/i.test(String(card.name || "")));
    const userLogin = user?.login || "";
    const userKey = loginKey(userLogin);
    const sameUser = (value) => userKey && loginKey(value) === userKey;
    const privateMessages = user
      ? allMessages.filter((message) => (
        sameUser(message.fromLogin) ||
        sameUser(message.toLogin) ||
        sameUser(message.login) ||
        sameUser(message.recipientLogin)
      ))
      : [];
    const userOrders = user
      ? orders.filter((order) => (
        sameUser(order.login) ||
        sameUser(order.fromLogin) ||
        sameUser(order.toLogin) ||
        sameUser(order.ownerLogin)
      ))
      : [];
    const userExchangeRequests = user
      ? (settingsData.exchangeRequests || []).filter((request) => (
        sameUser(request.login) ||
        sameUser(request.fromLogin) ||
        sameUser(request.toLogin) ||
        sameUser(request.ownerLogin)
      ))
      : [];
    const userWalletTransactions = user
      ? (Array.isArray(settingsData.walletTransactions) ? settingsData.walletTransactions : []).filter((item) => sameUser(item.login))
      : [];
    const userWalletDeposits = user
      ? (Array.isArray(settingsData.walletDeposits) ? settingsData.walletDeposits : []).filter((item) => sameUser(item.login))
      : [];
    const userWalletWithdrawals = user
      ? (Array.isArray(settingsData.walletWithdrawals) ? settingsData.walletWithdrawals : []).filter((item) => sameUser(item.login))
      : [];
    const userBalances = user ? {
      ...(settingsData.balances?.[userLogin] != null ? { [userLogin]: settingsData.balances[userLogin] } : {}),
      ...(settingsData.balances?.[userKey] != null ? { [userKey]: settingsData.balances[userKey] } : {})
    } : {};
    const userLtcBalances = user ? {
      ...(settingsData.ltcBalances?.[userLogin] != null ? { [userLogin]: settingsData.ltcBalances[userLogin] } : {}),
      ...(settingsData.ltcBalances?.[userKey] != null ? { [userKey]: settingsData.ltcBalances[userKey] } : {})
    } : {};
    const userSupportTickets = Array.isArray(settingsData.supportTickets) && user
      ? settingsData.supportTickets.filter((ticket) => sameUser(ticket.fromLogin) || sameUser(ticket.recipientLogin)).map(supportTicketPublic)
      : [];

    return {
      user: publicUser(user),
      state: {
        currentUser: user?.login || "",
        theme: settingsData.theme || "light",
        lang: settingsData.lang || "ru",
        users: user ? [publicUser(user)] : [],
        stores: visibleStores,
        messages: privateMessages,
        orders: userOrders,
        exchangeCards: visibleExchangeCards,
        exchangeRequests: userExchangeRequests,
        groupMessages: Array.isArray(settingsData.groupMessages) ? settingsData.groupMessages : [],
        groupSettings: settingsData.groupSettings || { title: "Общий чат", pinnedMessageId: "", mutedUntil: {}, rollTimers: [] },
        referrals: settingsData.referrals || [],
        referralPayments: settingsData.referralPayments || [],
        referralCodes: settingsData.referralCodes || {},
        balances: userBalances,
        ltcBalances: userLtcBalances,
        walletTransactions: userWalletTransactions,
        walletDeposits: userWalletDeposits,
        walletWithdrawals: userWalletWithdrawals,
        mirrorBots: [],
        bots: {
          total: 0,
          active: 0,
          blocked: 0,
          items: []
        },
        siteNotifications: Array.isArray(settingsData.siteNotifications) && user ? settingsData.siteNotifications.filter((item) => sameLogin(item.login, user.login)) : [],
        broadcasts: Array.isArray(settingsData.broadcasts) ? settingsData.broadcasts : [],
        supportSettings: { recipients: [] },
        supportTickets: userSupportTickets,
        userFilters: Array.isArray(settingsData.userFilters) ? settingsData.userFilters : [],
        blockedUsers: settingsData.blockedUsers || {},
        storeApplications: Array.isArray(settingsData.storeApplications) ? settingsData.storeApplications : [],
        ownerSettings: {},
        paymentSettings: {},
        referralPeriod: settingsData.referralPeriod || {},
        filters: settingsData.filters || {}
      }
    };

  } catch (error) {
    console.error("[stateFor] failed", {
      message: error.message,
      status: error.status || 500,
      ms: Date.now() - totalStartedAt
    });
    throw error;
  }
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
  const messageItems = (messageRows || []).map((row) => row.data);
  const hydratedOrders = hydrateOrdersDisputeHistory(orders, messageItems);
  const orderDisputes = hydratedOrders.filter(orderHasDisputeHistory);
  const exchangeDisputes = exchangeRequests.filter(requestHasDisputeHistory);
  const allPurchases = [...orders, ...exchangeRequests];
  const totalPurchaseUsd = allPurchases.reduce((sum, item) => sum + Number(item.amountUsd || item.priceUsd || 0), 0);
  const walletDeposits = (Array.isArray(state.walletDeposits) ? state.walletDeposits : []).filter((deposit) => sameLogin(deposit.login, login));
  const completedDeposits = walletDeposits.filter((deposit) => ["completed", "paid", "finished"].includes(String(deposit.status || "").toLowerCase()));
  const totalDepositUsd = completedDeposits.reduce((sum, deposit) => sum + Number(deposit.amountUsd || deposit.priceAmount || 0), 0);
  const totalDepositLtc = completedDeposits.reduce((sum, deposit) => sum + Number(deposit.amountLtc || deposit.payAmount || 0), 0);
  const messages = messageItems
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

function signSellerAdminToken(storeId, meta = {}) {
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({ storeId, ...meta, createdAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", sellerAdminSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function sellerTokenCanAccess(token = {}, ...permissions) {
  if (token.role !== "staff") return true;
  const allowed = Array.isArray(token.permissions) ? token.permissions.map(String) : [];
  return permissions.some((permission) => allowed.includes(permission));
}

function sellerForbidden(res) {
  return res.status(403).json({ error: "Нет доступа к этому разделу админки магазина" });
}

async function stateForStoreAdmin(storeId, token = {}) {
  const payload = await stateFor(null);
  const id = String(storeId || "");
  const state = await loadSettingsState();
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const messages = (await supabase.from("messages").select("data").order("created_at", { ascending: false }).limit(1000)).data || [];
  const storeMessages = messages
    .map((row) => row.data)
    .filter((message) => String(message.storeId || "") === id || String(message.storeTag || "") === id);
  const storeOrders = hydrateOrdersDisputeHistory(
    orders.filter((order) => String(order.storeId || "") === id),
    storeMessages
  );
  const isStaff = token?.role === "staff";
  payload.state.stores = (payload.state.stores || []).filter((store) => String(store.id || "") === id);
  payload.state.orders = isStaff && !sellerTokenCanAccess(token, "orders", "clients", "finances", "disputes")
    ? []
    : isStaff && sellerTokenCanAccess(token, "disputes") && !sellerTokenCanAccess(token, "orders", "clients", "finances")
      ? storeOrders.filter(orderHasDisputeHistory)
      : storeOrders;
  payload.state.messages = isStaff && !sellerTokenCanAccess(token, "connect", "disputes") ? [] : storeMessages;
  payload.state.walletWithdrawals = sellerTokenCanAccess(token, "finances")
    ? (Array.isArray(state.walletWithdrawals) ? state.walletWithdrawals : []).filter((item) => item.storeId === id)
    : [];
  return payload;
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
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.expiresAt && Date.now() > Number(data.expiresAt)) return null;
    return data;
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
    res.json({ turnstileSiteKey: turnstileEnabled ? turnstileSiteKey : "", turnstileEnabled, cmsTexts: await readCmsTexts() });
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

function sellerStorePatch(existing = {}, input = {}) {
  const image = sellerImagePatch(existing.image || existing.avatar, input.image || input.avatar);
  const cover = sellerImagePatch(existing.cover || existing.banner, input.cover || input.banner) || image;
  const existingProducts = Array.isArray(existing.products) ? existing.products : [];
  const staff = Array.isArray(input.staff)
    ? input.staff.map((member) => ({
      login: String(member?.login || "").trim(),
      password: String(member?.password || "").trim(),
      name: String(member?.name || "").trim(),
      permissions: Array.isArray(member?.permissions) ? member.permissions.map(String).filter(Boolean) : [],
      createdAt: Number(member?.createdAt || Date.now()),
      updatedAt: Number(member?.updatedAt || Date.now())
    })).filter((member) => member.login && member.password)
    : (Array.isArray(existing.staff) ? existing.staff : []);
  return {
    ...existing,
    name: String(input.name ?? existing.name ?? "").trim(),
    short: String(input.short ?? existing.short ?? "").trim(),
    description: String(input.description ?? existing.description ?? "").trim(),
    image,
    avatar: image,
    cover,
    banner: cover,
    gallery: Array.isArray(input.gallery) ? input.gallery.slice(0, 5) : (Array.isArray(existing.gallery) ? existing.gallery : []),
    products: Array.isArray(input.products) ? input.products.map((product) => sellerProductPatch(existingProducts.find((item) => String(item?.id || "") === String(product?.id || "")) || {}, product)) : existingProducts,
    reviewsList: Array.isArray(input.reviewsList) ? input.reviewsList : (Array.isArray(existing.reviewsList) ? existing.reviewsList : []),
    enabledCoins: input.enabledCoins && typeof input.enabledCoins === "object" ? input.enabledCoins : (existing.enabledCoins || {}),
    wallets: input.wallets && typeof input.wallets === "object" ? input.wallets : (existing.wallets || {}),
    autoReleaseHours: Math.min(168, Math.max(0, Number(input.autoReleaseHours ?? existing.autoReleaseHours ?? 24))),
    ltcWallet: String(input.ltcWallet ?? existing.ltcWallet ?? "").trim(),
    adminPassword: String(input.adminPassword ?? existing.adminPassword ?? "").trim(),
    staff,
    updatedAt: Date.now()
  };
}

function sellerStoreInputForToken(existing = {}, input = {}, token = {}) {
  if (token.role !== "staff") return input;
  const permissions = Array.isArray(token.permissions) ? token.permissions.map(String) : [];
  const allowed = {};
  if (permissions.includes("profile")) {
    ["name", "short", "description", "image", "avatar", "cover", "banner", "gallery"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(input, key)) allowed[key] = input[key];
    });
  }
  if (permissions.some((key) => ["cards", "products", "storage"].includes(key)) && Array.isArray(input.products)) {
    allowed.products = input.products;
  }
  if (permissions.includes("connect") && Array.isArray(input.reviewsList)) {
    allowed.reviewsList = input.reviewsList;
  }
  return { ...existing, ...allowed, id: existing.id || input.id };
}

async function loadStoreWithFallback(storeId) {
  const id = String(storeId || "").trim();
  if (!id) return null;
  const { data: row } = await withTimeout(
    supabase.from("stores").select("data").eq("id", id).maybeSingle(),
    "store-admin load store",
    5000
  );
  if (row?.data) return row.data;
  const state = await withTimeout(loadSettingsState(), "store-admin fallback state", 5000);
  return (state.ownerStores || []).find((item) => String(item?.id || "") === id) || null;
}

async function findSellerAdminStore(storeId, login) {
  if (storeId) return loadStoreWithFallback(storeId);
  const key = loginKey(login);
  if (!key) return null;
  const [{ data: rows }, state] = await Promise.all([
    supabase.from("stores").select("data").limit(500),
    loadSettingsState()
  ]);
  return mergeStoreSources((rows || []).map((row) => row.data), state.ownerStores || []).find((item) => (
    item && (loginKey(item.ownerLogin) === key || loginKey(item.id) === key)
  )) || null;
}

app.post("/api/store-admin/login", async (req, res, next) => {
  try {
    requireDb();
    await withTimeout(ensureSeed(), "store-admin ensureSeed", 5000).catch((error) => {
      console.error("[store-admin] login seed skipped", { message: error.message });
    });
    const storeId = String(req.body.storeId || "").trim();
    const login = String(req.body.login || "").trim();
    const password = String(req.body.password || "");
    const store = await findSellerAdminStore(storeId, login);
    if (!store) {
      return res.status(401).json({ error: "Неверный пароль" });
    }
    const ownerLoginOk = !login || loginKey(store?.ownerLogin) === loginKey(login) || loginKey(store?.id) === loginKey(login);
    if (ownerLoginOk && password === (store.adminPassword || "")) {
      const ownerToken = { role: "owner" };
      return res.json({ token: signSellerAdminToken(store.id, ownerToken), store, staff: { role: "owner", permissions: null }, ...(await stateForStoreAdmin(store.id, ownerToken)) });
    }
    const staff = (Array.isArray(store.staff) ? store.staff : []).find((member) => loginKey(member?.login) === loginKey(login));
    if (!staff || password !== String(staff.password || "")) {
      return res.status(401).json({ error: "Неверный пароль" });
    }
    const permissions = Array.isArray(staff.permissions) ? staff.permissions.map(String).filter(Boolean) : [];
    res.json({
      token: signSellerAdminToken(store.id, { role: "staff", staffLogin: staff.login, permissions }),
      store,
      staff: { role: "staff", login: staff.login, name: staff.name || "", permissions },
      ...(await stateForStoreAdmin(store.id, { role: "staff", staffLogin: staff.login, permissions }))
    });
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
    const existing = await loadStoreWithFallback(token.storeId) || {};
    if (token.role === "staff") {
      const staff = (Array.isArray(existing.staff) ? existing.staff : []).find((member) => loginKey(member?.login) === loginKey(token.staffLogin));
      if (!staff) return res.status(401).json({ error: "Доступ сотрудника удалён" });
      token.permissions = Array.isArray(staff.permissions) ? staff.permissions.map(String).filter(Boolean) : [];
    }
    const mergedStore = sellerStorePatch(existing, sellerStoreInputForToken(existing, store, token));
    await supabase.from("stores").upsert({ id: mergedStore.id, data: mergedStore }, { onConflict: "id" });
    await saveOwnerStoreFallback(mergedStore);
    console.log("[store-admin] store saved", {
      storeId: mergedStore.id,
      ownerLogin: mergedStore.ownerLogin || "",
      image: Boolean(mergedStore.image),
      cover: Boolean(mergedStore.cover),
      products: Array.isArray(mergedStore.products) ? mergedStore.products.length : 0,
      positions: Array.isArray(mergedStore.products)
        ? mergedStore.products.reduce((sum, product) => sum + (Array.isArray(product.positions) ? product.positions.length : 0), 0)
        : 0,
      productTitles: Array.isArray(mergedStore.products) ? mergedStore.products.map((product) => product.title).slice(0, 10) : []
    });
    notifyRealtime("store_updated", { storeId: mergedStore.id, source: "store-admin" });
    res.json({ store: mergedStore, ...(await stateForStoreAdmin(mergedStore.id, token)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:id/dispute/close", async (req, res, next) => {
  try {
    requireDb();
    const admin = verifyAdminToken(req);
    const sellerToken = admin ? null : verifySellerAdminToken(req);
    const user = (!admin && !sellerToken) ? await userFromRequest(req) : null;
    if (!admin && !sellerToken && !user) return res.status(401).json({ error: "Нет доступа" });
    if (sellerToken && !sellerTokenCanAccess(sellerToken, "disputes")) return sellerForbidden(res);
    const state = await loadSettingsState();
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const order = orders.find((item) => item.id === req.params.id && item.type === "product");
    if (!order) return res.status(404).json({ error: "Заказ не найден" });
    if (sellerToken && String(order.storeId || "") !== String(sellerToken.storeId || "")) {
      return res.status(403).json({ error: "Нет доступа к спору этого магазина" });
    }
    if (user && !sameLogin(order.login, user.login)) {
      return res.status(403).json({ error: "Нет доступа к этому спору" });
    }
    const now = Date.now();
    const publicNumber = ensureDisputeNumber(state, order);
    order.status = "completed";
    order.paymentStatus = order.paymentStatus || "paid";
    order.disputeOpen = false;
    order.disputeChatClosed = true;
    order.disputeClosedAt = now;
    order.closedAt = now;
    order.closeReason = "Спор закрыт";
    const store = await loadStoreWithFallback(order.storeId);
    await ensureProductOrderSettlement(state, order, store);
    await notifySiteUser(state, order.login, {
      id: `notice-dispute-closed-${order.id}-${loginKey(order.login)}`,
      eventType: "dispute_closed",
      orderId: order.id,
      storeId: order.storeId,
      title: "Диспут закрыт",
      body: `Диспут #${publicNumber} по заказу ${order.product || order.id} закрыт.`
    });
    await notifySiteUser(state, store?.ownerLogin || "admin", {
      id: `notice-store-dispute-closed-${order.id}-${loginKey(store?.ownerLogin || "admin")}`,
      eventType: "store_dispute_closed",
      orderId: order.id,
      storeId: order.storeId,
      title: "Диспут закрыт",
      body: `Диспут #${publicNumber} по заказу ${order.id} закрыт.`
    });
    await saveSettingsState({ ...state, orders });
    await upsertPrivateMessage({
      id: `dispute-closed-${order.id}-${now}`,
      storeId: order.storeId,
      storeTag: store?.name || order.storeName || order.storeId,
      toLogin: order.login,
      fromLogin: admin?.login || sellerToken?.login || user?.login || store?.ownerLogin || store?.id || "admin",
      subject: `Диспут #${publicNumber} по заказу ${order.id}`,
      body: "Диспут закрыт. История переписки сохранена.",
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      system: "product-dispute-closed",
      orderId: order.id,
      disputeThreadId: order.disputeThreadId || `dispute-${order.id}`
    });
    notifyRealtime("dispute_closed", { orderId: order.id, storeId: order.storeId });
    res.json({ order, ...(await stateFor(user || null)) });
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

app.post("/api/store-admin/withdrawals", async (req, res, next) => {
  try {
    requireDb();
    const sellerToken = verifySellerAdminToken(req);
    if (!sellerToken) return res.status(401).json({ error: "Нет доступа" });
    if (!sellerTokenCanAccess(sellerToken, "finances")) return sellerForbidden(res);
    const storeId = String(req.body.storeId || sellerToken.storeId || "").trim();
    if (!storeId || storeId !== sellerToken.storeId) return res.status(403).json({ error: "Нет доступа к магазину" });
    const address = String(req.body.address || "").trim();
    if (!address || address.length < 12) return res.status(400).json({ error: "Укажите LTC кошелек магазина" });

    const { data: row } = await supabase.from("stores").select("data").eq("id", storeId).maybeSingle();
    const store = row?.data || await loadStoreForAdmin(storeId);
    if (!store) return res.status(404).json({ error: "Магазин не найден" });
    const state = await loadSettingsState();
    const orders = Array.isArray(state.orders) ? state.orders : [];
    state.walletWithdrawals = Array.isArray(state.walletWithdrawals) ? state.walletWithdrawals : [];

    const completed = orders.filter((order) => order.storeId === storeId && adminIsWithdrawableStoreOrder(order));
    const earnedUsd = completed.reduce((sum, order) => sum + adminStoreNetAmount(order, state, store), 0);
    const lastStoreWithdrawal = state.walletWithdrawals
      .filter((item) => item.scope === "store" && item.storeId === storeId && !["cancelled", "canceled", "rejected"].includes(String(item.status || "").toLowerCase()))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
    if (lastStoreWithdrawal && Date.now() - Number(lastStoreWithdrawal.createdAt || 0) < storeWithdrawalCooldownMs) {
      const nextAt = Number(lastStoreWithdrawal.createdAt || 0) + storeWithdrawalCooldownMs;
      return res.status(429).json({ error: `Вывод магазина доступен раз в 3 дня. Следующий вывод: ${new Date(nextAt).toLocaleString("ru-RU")}` });
    }
    const requestedUsd = state.walletWithdrawals
      .filter((item) => item.scope === "store" && item.storeId === storeId && !["cancelled", "canceled", "rejected"].includes(String(item.status || "").toLowerCase()))
      .reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
    const availableUsd = Math.max(0, earnedUsd - requestedUsd);
    if (availableUsd <= 0) return res.status(400).json({ error: "Нет доступного дохода для вывода" });
    const amountUsd = requestedWithdrawalUsd(req.body, availableUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: "Укажите сумму вывода" });
    if (amountUsd > availableUsd + 0.000001) return res.status(400).json({ error: "Сумма вывода больше доступного баланса" });

    const request = {
      id: `store-withdraw-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      kind: "ltc_withdraw",
      scope: "store",
      storeId,
      storeName: store.name || store.id,
      login: store.ownerLogin || store.id,
      amountUsd,
      amountLtc: amountUsd / 54.2,
      coinId: "ltc",
      payCurrency: "ltc",
      address,
      status: "pending",
      provider: "manual",
      createdAt: Date.now(),
      date: new Date().toLocaleString("ru-RU")
    };
    state.walletWithdrawals.unshift(request);
    await notifySiteUser(state, store.ownerLogin || store.id, {
      id: `notice-store-withdrawal-${request.id}-${loginKey(store.ownerLogin || store.id)}`,
      eventType: "store_withdrawal_requested",
      withdrawalId: request.id,
      storeId,
      title: "Заявка на вывод создана",
      body: `Запрошен вывод ${amountUsd.toFixed(2)} $ (${request.amountLtc.toFixed(8)} LTC) на ${address}.`
    });
    await notifySiteUser(state, "admin", {
      id: `notice-admin-store-withdrawal-${request.id}`,
      eventType: "store_withdrawal_requested",
      withdrawalId: request.id,
      storeId,
      title: "Магазин запросил вывод",
      body: `${store.name || store.id}: ${amountUsd.toFixed(2)} $ на ${address}.`
    });
    await saveSettingsState(state);
    await appendAdminLog("store_withdrawal_requested", store.ownerLogin || store.id, { storeId, amountUsd, address });
    notifyRealtime("wallet_withdrawal_created", { id: request.id, storeId, scope: "store" });
    res.json({ withdrawal: request, ...(await stateForStoreAdmin(storeId, sellerToken)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/support/tickets", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const state = await loadSettingsState();
    const subject = String(req.body.subject || "Обращение").trim();
    const body = String(req.body.body || "").trim();
    const attachments = normalizeSupportAttachments(req.body.attachments);
    if (!body && !attachments.length) return res.status(400).json({ error: "Введите текст или прикрепите фото" });
    const ticket = {
      id: `support-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      subject,
      body,
      attachments,
      fromLogin: user.login,
      recipientLogin: "admin",
      recipientTitle: "Поддержка",
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      replies: []
    };
    state.supportTickets = [ticket, ...(Array.isArray(state.supportTickets) ? state.supportTickets : [])];
    await notifySiteUser(state, "admin", {
      id: `notice-support-created-${ticket.id}-admin`,
      eventType: "support_ticket_created",
      ticketId: ticket.id,
      title: "Новое обращение",
      body: `${user.login}: ${ticket.subject || "Обращение в поддержку"}`
    });
    await saveSettingsState(state);
    await upsertPrivateMessage({
      id: `${ticket.id}-message`,
      storeId: "support",
      storeTag: "support",
      toLogin: ticket.recipientLogin,
      fromLogin: user.login,
      subject: `[${ticket.recipientTitle}] ${ticket.subject}`,
      body: `${ticket.body || "[фото]"}\n\nТикет: ${ticket.id}`,
      attachments,
      createdAt: ticket.createdAt,
      date: new Date(ticket.createdAt).toLocaleString("ru-RU"),
      system: "support",
      supportTicketId: ticket.id
    });
    notifyRealtime("support_ticket_created", { ticketId: ticket.id, recipientLogin: ticket.recipientLogin });
    res.json({ ticket: supportTicketPublic(ticket), ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/support/tickets/:id/reply", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const state = await loadSettingsState();
    const ticket = (state.supportTickets || []).find((item) => String(item.id) === String(req.params.id));
    if (!ticket || !sameLogin(ticket.fromLogin, user.login)) return res.status(404).json({ error: "Обращение не найдено" });
    if (ticket.status === "closed") return res.status(409).json({ error: "Обращение закрыто" });
    const body = String(req.body.body || "").trim();
    const attachments = normalizeSupportAttachments(req.body.attachments);
    if (!body && !attachments.length) return res.status(400).json({ error: "Введите текст или прикрепите фото" });
    const reply = { id: `reply-${Date.now()}`, fromLogin: user.login, body, attachments, createdAt: Date.now() };
    ticket.replies = Array.isArray(ticket.replies) ? ticket.replies : [];
    ticket.replies.push(reply);
    ticket.updatedAt = reply.createdAt;
    await notifySiteUser(state, ticket.recipientLogin || "admin", {
      id: `notice-support-user-reply-${ticket.id}-${reply.id}-${loginKey(ticket.recipientLogin || "admin")}`,
      eventType: "support_ticket_replied",
      ticketId: ticket.id,
      title: "Ответ в обращении",
      body: `${user.login} ответил по обращению: ${ticket.subject || ticket.id}`
    });
    await saveSettingsState(state);
    await upsertPrivateMessage({
      id: `${ticket.id}-${reply.id}`,
      storeId: "support",
      storeTag: "support",
      toLogin: ticket.recipientLogin,
      fromLogin: user.login,
      subject: `Ответ по тикету ${ticket.id}`,
      body: body || "[фото]",
      attachments,
      createdAt: reply.createdAt,
      date: new Date(reply.createdAt).toLocaleString("ru-RU"),
      system: "support_reply",
      supportTicketId: ticket.id
    });
    notifyRealtime("support_ticket_replied", { ticketId: ticket.id });
    res.json({ ticket: supportTicketPublic(ticket), ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/state", async (_req, res, next) => {
  try {
    res.json(await stateFor(null));
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
    const currentGroupSettings = currentSettingsData.groupSettings || {};
    const incomingGroupSettings = state.groupSettings || {};
    const mergedGroupMessages = [
      ...(Array.isArray(currentSettingsData.groupMessages) ? currentSettingsData.groupMessages : []),
      ...(Array.isArray(state.groupMessages) ? state.groupMessages : [])
    ].reduce((items, message) => {
      if (!message?.id) return items;
      message.room = groupRoomKey(message.room);
      const index = items.findIndex((item) => String(item?.id || "") === String(message.id));
      if (index >= 0) items[index] = { ...items[index], ...message };
      else items.push(message);
      return items;
    }, []).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-1500);
    const mergedGroupMembers = [
      ...(Array.isArray(currentGroupSettings.members) ? currentGroupSettings.members : []),
      ...(Array.isArray(incomingGroupSettings.members) ? incomingGroupSettings.members : [])
    ].reduce((items, login) => {
      const cleanLogin = groupMemberEntryKey(login);
      if (cleanLogin && !items.some((item) => groupMemberEntryKey(item) === cleanLogin)) items.push(cleanLogin);
      return items;
    }, []);
    const mergedGroupSettings = {
      ...currentGroupSettings,
      ...incomingGroupSettings,
      members: mergedGroupMembers,
      presence: {
        ...(currentGroupSettings.presence || {}),
        ...(incomingGroupSettings.presence || {})
      }
    };
    await supabase.from("app_settings").upsert({
      id: "main",
      data: {
        ...currentSettingsData,
        theme: state.theme || "light",
        lang: state.lang || "ru",
        orders: Array.isArray(currentSettingsData.orders) ? currentSettingsData.orders : [],
        exchangeCards: currentSettingsData.exchangeCards || defaultExchangeCards,
        exchangeRequests: currentSettingsData.exchangeRequests || [],
        groupMessages: mergedGroupMessages,
        groupSettings: mergedGroupSettings,
        referrals: Array.isArray(state.referrals) ? state.referrals : [],
        referralPayments: Array.isArray(state.referralPayments) ? state.referralPayments : [],
        referralCodes: state.referralCodes || {},
        balances: currentSettingsData.balances || {},
        ltcBalances: currentSettingsData.ltcBalances || {},
        walletTransactions: Array.isArray(currentSettingsData.walletTransactions) ? currentSettingsData.walletTransactions : [],
        walletDeposits: Array.isArray(currentSettingsData.walletDeposits) ? currentSettingsData.walletDeposits : [],
        walletWithdrawals: Array.isArray(currentSettingsData.walletWithdrawals) ? currentSettingsData.walletWithdrawals : [],
        telegramBot: currentSettingsData.telegramBot || { users: {}, sentMessages: {} },
        mirrorBots: currentSettingsData.mirrorBots || [],
        siteNotifications: currentSettingsData.siteNotifications || [],
        broadcasts: currentSettingsData.broadcasts || [],
        userFilters: currentSettingsData.userFilters || [],
        blockedUsers: currentSettingsData.blockedUsers || {},
        storeApplications: Array.isArray(currentSettingsData.storeApplications) ? currentSettingsData.storeApplications : [],
        ownerSettings: currentSettingsData.ownerSettings || {},
        paymentSettings: currentSettingsData.paymentSettings || {},
        referralPeriod: state.referralPeriod || {},
        filters: state.filters || {}
      }
    }, { onConflict: "id" });

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

    console.log("[state] saved", {
      user: user.login,
      ignoredStores: Array.isArray(state.stores) ? state.stores.length : 0,
      ignoredOrders: Array.isArray(state.orders) ? state.orders.length : 0,
      mirrorBots: (currentSettingsData.mirrorBots || []).length
    });
    notifyRealtime("state_updated", { source: "api-state", user: user.login });
    res.json(await stateFor(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/group/join", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const room = groupRoomKey(req.body?.room);
    const state = await loadSettingsState();
    const groupSettings = state.groupSettings || {};
    const members = Array.isArray(groupSettings.members) ? groupSettings.members : [];
    const memberKey = groupMemberEntryKey(`${room}:${user.login}`);
    if (memberKey && !members.some((item) => groupMemberEntryKey(item) === memberKey)) {
      members.push(memberKey);
    }
    const now = Date.now();
    groupSettings.members = members;
    groupSettings.presence = groupSettings.presence || {};
    groupSettings.presence[memberKey] = now;
    Object.entries(groupSettings.presence).forEach(([key, value]) => {
      if (now - Number(value || 0) > 5 * 60 * 1000) delete groupSettings.presence[key];
    });
    state.groupSettings = groupSettings;
    await saveSettingsState(state);
    notifyRealtime("group_member_joined", { login: user.login, room });
    res.json(await stateFor(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/group/presence", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const room = groupRoomKey(req.body?.room);
    const state = await loadSettingsState();
    const groupSettings = state.groupSettings || {};
    const memberKey = groupMemberEntryKey(`${room}:${user.login}`);
    const members = Array.isArray(groupSettings.members) ? groupSettings.members : [];
    if (memberKey && !members.some((item) => groupMemberEntryKey(item) === memberKey)) members.push(memberKey);
    const now = Date.now();
    groupSettings.members = members;
    groupSettings.presence = groupSettings.presence || {};
    groupSettings.presence[memberKey] = now;
    Object.entries(groupSettings.presence).forEach(([key, value]) => {
      if (now - Number(value || 0) > 5 * 60 * 1000) delete groupSettings.presence[key];
    });
    state.groupSettings = groupSettings;
    await saveSettingsState(state);
    const onlineCount = Object.entries(groupSettings.presence)
      .filter(([key, value]) => String(key).toLowerCase().startsWith(`${room}:`) && now - Number(value || 0) < 60 * 1000)
      .length;
    res.json({ ok: true, room, onlineCount, groupSettings });
  } catch (error) {
    next(error);
  }
});

function sanitizeGroupMessagePayload(payload = {}) {
  const body = String(payload.body || "").trim();
  const room = groupRoomKey(payload.room);
  const stickerUrl = String(payload.stickerUrl || "").trim();
  const stickerMatch = stickerUrl.match(/telegram-(\d{3})\.png$/i);
  if (stickerMatch && groupChatHiddenSiteEmojiIds.has(stickerMatch[1])) {
    const error = new Error("Стикер убран из общего чата");
    error.status = 400;
    throw error;
  }
  const emojiUrls = Array.isArray(payload.emojiUrls) ? payload.emojiUrls.slice(0, 12).map((value) => {
    const url = String(value || "").trim();
    const match = url.match(/^(?:\/)?assets\/site-emojis\/telegram-(\d{3})\.png$/i);
    if (!match) return null;
    if (groupChatHiddenSiteEmojiIds.has(match[1])) {
      const error = new Error("Стикер убран из общего чата");
      error.status = 400;
      throw error;
    }
    return url.replace(/^\//, "");
  }).filter(Boolean) : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 4).map((file, index) => {
    const url = String(file?.url || "").trim();
    if (!url || url.length > maxDataImageLength) return null;
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(url) && !/^https?:\/\//i.test(url)) return null;
    return {
      name: String(file?.name || `file-${index + 1}`).slice(0, 120),
      type: String(file?.type || "image/png").slice(0, 80),
      url
    };
  }).filter(Boolean) : [];
  if (!body && !stickerUrl && !emojiUrls.length && !attachments.length) {
    const error = new Error("Сообщение пустое");
    error.status = 400;
    throw error;
  }
  return { body, room, stickerUrl, emojiUrls, attachments };
}

app.post("/api/group/messages", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const state = await loadSettingsState();
    const payload = sanitizeGroupMessagePayload(req.body || {});
    const message = {
      id: `group-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      fromLogin: user.login,
      room: payload.room,
      body: payload.body,
      emojiUrls: payload.emojiUrls,
      attachments: payload.attachments,
      likes: [],
      reactions: {},
      createdAt: Date.now(),
      date: new Date().toLocaleString("ru-RU")
    };
    if (payload.stickerUrl) message.stickerUrl = payload.stickerUrl;
    state.groupMessages = Array.isArray(state.groupMessages) ? state.groupMessages : [];
    state.groupMessages.push(message);
    state.groupMessages = state.groupMessages
      .map((item) => ({ ...item, room: groupRoomKey(item.room) }))
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .slice(-1500);
    await saveSettingsState(state);
    notifyRealtime("group_message_created", { id: message.id, fromLogin: user.login, room: message.room });
    res.json({ message, ...(await stateFor(user)) });
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

app.post("/api/admin/private-messages", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const toLogin = String(req.body.toLogin || req.body.login || "").trim();
    const subject = String(req.body.subject || "Сообщение от сайта").trim();
    const body = String(req.body.body || req.body.message || "").trim();
    if (!toLogin || !body) return res.status(400).json({ error: "Укажите получателя и текст сообщения" });
    const { data: user } = await supabase.from("profiles").select("login,login_key").eq("login_key", loginKey(toLogin)).maybeSingle();
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });
    const now = Date.now();
    const message = {
      id: `admin-private-${now}-${crypto.randomBytes(3).toString("hex")}`,
      storeId: "site",
      storeTag: "CERBER",
      toLogin: user.login,
      fromLogin: req.body.fromLogin || "CERBER",
      subject,
      body,
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      system: "admin_private_message",
      createdBy: admin.login
    };
    await upsertPrivateMessage(message);
    await appendAdminLog("private_message_sent", admin.login, { toLogin: user.login, messageId: message.id });
    res.json({ ok: true, message });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/support-settings", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const state = await loadSettingsState();
    state.supportSettings = normalizeSupportSettings(req.body.supportSettings || req.body);
    await saveSettingsState(state);
    await appendAdminLog("support_settings_updated", admin.login, { recipients: state.supportSettings.recipients.length });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/support-tickets/:id/reply", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const state = await loadSettingsState();
    const ticket = (state.supportTickets || []).find((item) => String(item.id) === String(req.params.id));
    if (!ticket) return res.status(404).json({ error: "Обращение не найдено" });
    if (ticket.status === "closed") return res.status(409).json({ error: "Обращение уже закрыто" });
    const body = String(req.body.body || "").trim();
    const attachments = normalizeSupportAttachments(req.body.attachments);
    if (!body && !attachments.length) return res.status(400).json({ error: "Введите ответ или прикрепите фото" });
    const reply = { id: `reply-${Date.now()}`, fromLogin: admin.login, body, attachments, createdAt: Date.now() };
    ticket.replies = Array.isArray(ticket.replies) ? ticket.replies : [];
    ticket.replies.push(reply);
    ticket.updatedAt = Date.now();
    await notifySiteUser(state, ticket.fromLogin, {
      id: `notice-support-admin-reply-${ticket.id}-${reply.id}-${loginKey(ticket.fromLogin)}`,
      eventType: "support_ticket_replied",
      ticketId: ticket.id,
      title: "Ответ поддержки",
      body: `Поддержка ответила по обращению: ${ticket.subject || ticket.id}`
    });
    await saveSettingsState(state);
    await upsertPrivateMessage({
      id: `${ticket.id}-${reply.id}`,
      storeId: "support",
      storeTag: "support",
      toLogin: ticket.fromLogin,
      fromLogin: ticket.recipientLogin || admin.login,
      subject: `Ответ по тикету ${ticket.id}`,
      body: body || "[фото]",
      attachments,
      createdAt: reply.createdAt,
      date: new Date(reply.createdAt).toLocaleString("ru-RU"),
      system: "support_reply",
      supportTicketId: ticket.id
    });
    notifyRealtime("support_ticket_replied", { ticketId: ticket.id });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/support-tickets/:id/close", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const state = await loadSettingsState();
    const ticket = (state.supportTickets || []).find((item) => String(item.id) === String(req.params.id));
    if (!ticket) return res.status(404).json({ error: "Обращение не найдено" });
    ticket.status = "closed";
    ticket.closedAt = Date.now();
    ticket.updatedAt = ticket.closedAt;
    ticket.closedBy = admin.login;
    await notifySiteUser(state, ticket.fromLogin, {
      id: `notice-support-closed-${ticket.id}-${loginKey(ticket.fromLogin)}`,
      eventType: "support_ticket_closed",
      ticketId: ticket.id,
      title: "Обращение закрыто",
      body: `Обращение ${ticket.subject || ticket.id} закрыто. История переписки сохранена.`
    });
    await saveSettingsState(state);
    await upsertPrivateMessage({
      id: `${ticket.id}-closed`,
      storeId: "support",
      storeTag: "support",
      toLogin: ticket.fromLogin,
      fromLogin: ticket.recipientLogin || admin.login,
      subject: `Тикет ${ticket.id} закрыт`,
      body: "Обращение закрыто.",
      createdAt: ticket.closedAt,
      date: new Date(ticket.closedAt).toLocaleString("ru-RU"),
      system: "support_closed",
      supportTicketId: ticket.id
    });
    notifyRealtime("support_ticket_closed", { ticketId: ticket.id });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/marketplace-data", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    requireDb();
    const { error: storesError } = await supabase.from("stores").delete().neq("id", "__never__");
    if (storesError) throw storesError;
    const state = await loadSettingsState();
    Object.assign(state, {
      stores: [],
      ownerStores: [],
      publicStoresCache: [],
      publicStoresCacheAt: Date.now(),
      deletedStoreIds: [],
      exchangeCards: [],
      exchangers: [],
      exchangeRequests: [],
      storeApplications: []
    });
    await saveSettingsState(state);
    await appendAdminLog("marketplace_data_cleared", admin.login, {
      stores: "deleted",
      exchangeCards: "cleared",
      exchangeRequests: "cleared",
      storeApplications: "cleared"
    });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/public-stores-cache", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    requireDb();
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("data")
      .eq("id", "main")
      .maybeSingle();
    if (settingsError) throw settingsError;
    const state = settings?.data || {};
    delete state.publicStoresCache;
    delete state.publicStoresCacheAt;
    const { error: saveError } = await supabase
      .from("app_settings")
      .upsert({ id: "main", data: state }, { onConflict: "id" });
    if (saveError) throw saveError;
    await appendAdminLog("public_stores_cache_cleared", admin.login, {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use("/api/owner", (_req, res) => {
  res.status(410).json({
    error: "Legacy owner API is disabled. Use /market-admin.html and /api/admin endpoints."
  });
});

app.post("/api/owner/stores", async (req, res, next) => {
  try {
    requireDb();
    verifyOwnerPanel(req);
    const store = adminBuildStoreFromBody(req.body || {});
    if (!store.name || !store.ownerLogin || !store.adminPassword) {
      return res.status(400).json({ error: "Укажите название, логин владельца и пароль панели магазина" });
    }
    const { data: savedRow, error: storeError } = await supabase
      .from("stores")
      .upsert({ id: store.id, data: store }, { onConflict: "id" })
      .select("id,data")
      .single();
    if (storeError) {
      console.error("[owner-store] db save failed", { storeId: store.id, ownerLogin: store.ownerLogin, error: storeError.message });
      throw storeError;
    }
    const savedStore = savedRow?.data || store;
    const { data: readBack, error: readBackError } = await supabase.from("stores").select("id,data").eq("id", savedStore.id).maybeSingle();
    if (readBackError || !readBack?.data) {
      console.error("[owner-store] db readback failed", { storeId: savedStore.id, ownerLogin: savedStore.ownerLogin, error: readBackError?.message || "missing row" });
      const error = new Error("Store was not saved in database");
      error.status = 500;
      throw error;
    }
    await saveOwnerStoreFallback(readBack.data);
    await clearDeletedStoreTombstone(savedStore.id);
    notifyRealtime("store_created", { storeId: savedStore.id, ownerLogin: savedStore.ownerLogin, source: "owner-panel" });
    res.json({ store: readBack.data, panel: adminStorePanelLinks(readBack.data), verifiedSaved: Boolean(savedRow?.id), verifiedReadBack: true });
    Promise.resolve().then(async () => {
      await adminEnsureSellerProfile(savedStore.ownerLogin, savedStore.adminPassword, savedStore.ownerLogin);
      await appendAdminLog("owner_store_created", "owner-panel", { storeId: savedStore.id, ownerLogin: savedStore.ownerLogin });
      console.log("[owner-store] created", { storeId: savedStore.id, ownerLogin: savedStore.ownerLogin });
    }).catch((error) => {
      console.error("[owner-store] post-create task failed", { storeId: savedStore.id, ownerLogin: savedStore.ownerLogin, error: error.message });
    });
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
    const completed = orders.filter(adminIsPaidProductOrder);
    const dates = completed.map(adminTimestamp).filter(Boolean).sort((a, b) => a - b);
    const purchaseTotal = completed.reduce((sum, item) => sum + adminOrderAmount(item), 0);
    const successfulDeposits = deposits.filter((item) => ["completed", "paid", "finished"].includes(String(item.status || "").toLowerCase()));
    const firstPurchaseAt = dates[0] || null;
    const lastPurchaseAt = dates[dates.length - 1] || null;
    const activeDays = firstPurchaseAt ? Math.max(1, (Date.now() - firstPurchaseAt) / (24 * 60 * 60 * 1000)) : 1;
    const disputes = orders.filter(orderHasDisputeHistory);
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
        openDisputes: disputes.filter(orderHasOpenDispute).length,
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
    const order = hydrateOrdersDisputeHistory(data.state.orders || [], data.messages).find((item) => item.id === id || item.exchangeRequestId === id);
    const request = (data.state.exchangeRequests || []).find((item) => item.id === id);
    const dispute = order || request;
    if (!dispute) return res.status(404).json({ error: "Диспут не найден" });
    const store = data.stores.find((item) => item.id === dispute.storeId || sameLogin(item.ownerLogin, dispute.toLogin));
    const clientLogin = dispute.login || dispute.fromLogin || "";
    const storeLogin = store?.ownerLogin || dispute.toLogin || "";
    const threadId = dispute.disputeThreadId || "";
    const messages = data.messages.filter((message) => (
      (threadId && message.disputeThreadId === threadId) ||
      message.orderId === id ||
      message.subject?.includes(id)
    )).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-160);
    res.json({ dispute, order, request, store, clientLogin, storeLogin, amount: adminOrderAmount(dispute), disputeNumber: disputeNumber(dispute), messages });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/disputes/:id/join", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const data = await adminLoadMarketplace();
    const id = req.params.id;
    const order = hydrateOrdersDisputeHistory(data.state.orders || [], data.messages).find((item) => item.id === id || item.exchangeRequestId === id);
    const request = (data.state.exchangeRequests || []).find((item) => item.id === id);
    const dispute = order || request;
    if (!dispute) return res.status(404).json({ error: "Диспут не найден" });
    const store = data.stores.find((item) => item.id === dispute.storeId || sameLogin(item.ownerLogin, dispute.toLogin));
    const now = Date.now();
    const threadId = dispute.disputeThreadId || `dispute-${dispute.id}-${now}`;
    const publicNumber = order ? ensureDisputeNumber(data.state, dispute) : disputeNumber(dispute);
    dispute.disputeThreadId = threadId;
    if (order) {
      data.state.orders = (Array.isArray(data.state.orders) ? data.state.orders : []).map((item) => item.id === order.id ? { ...item, ...order } : item);
      await saveSettingsState(data.state);
    }
    const message = {
      id: `admin-dispute-${id}-${now}`,
      storeId: store?.id || dispute.storeId || "",
      storeTag: store?.tag || store?.name || "",
      toLogin: dispute.login || dispute.fromLogin || "",
      fromLogin: admin.login || "cerber-owner",
      subject: `Диспут #${publicNumber} по заказу ${id}`,
      body: "Владелец Cerber вошел в диспут",
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      system: "admin-dispute-join",
      orderId: id,
      disputeThreadId: threadId
    };
    await supabase.from("messages").upsert({ id: message.id, data: message }, { onConflict: "id" });
    await appendAdminLog("admin_joined_dispute", admin.login, { disputeId: id, disputeNumber: publicNumber });
    const nextData = await adminLoadMarketplace();
    const nextOrder = hydrateOrdersDisputeHistory(nextData.state.orders || [], nextData.messages).find((item) => item.id === id || item.exchangeRequestId === id);
    const nextRequest = (nextData.state.exchangeRequests || []).find((item) => item.id === id);
    const nextDispute = nextOrder || nextRequest || dispute;
    const messages = nextData.messages.filter((item) => (
      item.disputeThreadId === threadId ||
      item.orderId === id ||
      item.subject?.includes(id)
    )).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-160);
    res.json({ dispute: nextDispute, order: nextOrder, request: nextRequest, store, clientLogin: nextDispute.login || nextDispute.fromLogin || "", storeLogin: store?.ownerLogin || nextDispute.toLogin || "", amount: adminOrderAmount(nextDispute), disputeNumber: publicNumber, messages });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/disputes/:id/reply", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const data = await adminLoadMarketplace();
    const id = req.params.id;
    const order = hydrateOrdersDisputeHistory(data.state.orders || [], data.messages).find((item) => item.id === id || item.exchangeRequestId === id);
    const request = (data.state.exchangeRequests || []).find((item) => item.id === id);
    const dispute = order || request;
    if (!dispute) return res.status(404).json({ error: "Диспут не найден" });
    if (dispute.disputeOpen === false || dispute.disputeChatClosed) return res.status(409).json({ error: "Диспут закрыт" });
    const body = String(req.body.body || "").trim();
    const attachments = normalizeSupportAttachments(req.body.attachments, 4);
    if (!body && !attachments.length) return res.status(400).json({ error: "Введите сообщение или прикрепите файл" });
    const store = data.stores.find((item) => item.id === dispute.storeId || sameLogin(item.ownerLogin, dispute.toLogin));
    const now = Date.now();
    const threadId = dispute.disputeThreadId || `dispute-${dispute.id}-${now}`;
    const publicNumber = order ? ensureDisputeNumber(data.state, dispute) : disputeNumber(dispute);
    dispute.disputeThreadId = threadId;
    if (order) {
      data.state.orders = (Array.isArray(data.state.orders) ? data.state.orders : []).map((item) => item.id === order.id ? { ...item, ...order } : item);
      await saveSettingsState(data.state);
    }
    await upsertPrivateMessage({
      id: `admin-dispute-reply-${id}-${now}-${crypto.randomBytes(3).toString("hex")}`,
      storeId: store?.id || dispute.storeId || "",
      storeTag: store?.tag || store?.name || "",
      toLogin: dispute.login || dispute.fromLogin || "",
      fromLogin: admin.login || "cerber-owner",
      subject: `Диспут #${publicNumber} по заказу ${id}`,
      body,
      attachments,
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      system: "admin-dispute-reply",
      orderId: id,
      disputeThreadId: threadId
    });
    await appendAdminLog("admin_replied_dispute", admin.login, { disputeId: id, disputeNumber: publicNumber });
    const nextData = await adminLoadMarketplace();
    const nextOrder = hydrateOrdersDisputeHistory(nextData.state.orders || [], nextData.messages).find((item) => item.id === id || item.exchangeRequestId === id);
    const nextRequest = (nextData.state.exchangeRequests || []).find((item) => item.id === id);
    const nextDispute = nextOrder || nextRequest || dispute;
    const messages = nextData.messages.filter((item) => (
      item.disputeThreadId === threadId ||
      item.orderId === id ||
      item.subject?.includes(id)
    )).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-160);
    res.json({ dispute: nextDispute, order: nextOrder, request: nextRequest, store, clientLogin: nextDispute.login || nextDispute.fromLogin || "", storeLogin: store?.ownerLogin || nextDispute.toLogin || "", amount: adminOrderAmount(nextDispute), disputeNumber: publicNumber, messages });
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
    await clearDeletedStoreTombstone(store.id);
    const panel = adminStorePanelLinks(store);
    await appendAdminLog("store_created", admin.login, { storeId: store.id, ownerLogin: store.ownerLogin, panelUrl: panel.shopPanelUrl });
    console.log("[admin-store] created", { storeId: store.id, ownerLogin: store.ownerLogin, panelUrl: panel.shopPanelUrl });
    notifyRealtime("store_created", { storeId: store.id, ownerLogin: store.ownerLogin, source: "market-admin" });
    res.json({ store, panel, overview: adminBuildOverview(await adminLoadMarketplace()) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/stores/:id", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    if (!row?.data) return res.status(404).json({ error: "Store not found" });
    const store = adminBuildStoreFromBody(req.body || {}, row.data);
    if (store.ownerLogin) await adminEnsureSellerProfile(store.ownerLogin, store.adminPassword, store.ownerLogin);
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await clearDeletedStoreTombstone(store.id);
    await appendAdminLog("store_updated", admin.login, { storeId: store.id, fields: Object.keys(req.body || {}) });
    console.log("[admin-store] updated", { storeId: store.id, fields: Object.keys(req.body || {}) });
    notifyRealtime("store_updated", { storeId: store.id, source: "market-admin" });
    res.json({ ...adminBuildOverview(await adminLoadMarketplace()), panel: adminStorePanelLinks(store) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/stores/:id", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    // Fallback stores are stored in app_settings.ownerStores, so load settings before deciding 404.
    const state = await loadSettingsState();
    const storeId = req.params.id;
    const fallbackStore = (state.ownerStores || []).find((item) => String(item?.id || "") === String(storeId));
    const storeData = row?.data || fallbackStore;
    if (!storeData) return res.status(404).json({ error: "Store not found" });
    state.deletedStoreIds = Array.isArray(state.deletedStoreIds) ? state.deletedStoreIds : [];
    if (!state.deletedStoreIds.includes(storeId)) state.deletedStoreIds.push(storeId);
    state.orders = (state.orders || []).filter((order) => order.storeId !== storeId);
    state.storeApplications = (state.storeApplications || []).filter((item) => item.storeId !== storeId && item.id !== storeId);
    await saveSettingsState(state);
    await supabase.from("stores").delete().eq("id", storeId);
    await removeOwnerStoreFallback(storeId);
    await appendAdminLog("store_deleted", admin.login, { storeId, name: storeData.name || "" });
    console.log("[admin-store] deleted", { storeId, name: storeData.name || "" });
    notifyRealtime("store_deleted", { storeId, source: "market-admin" });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/orders/recover", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const data = await adminLoadMarketplace();
    const result = recoverProductOrderFromHistory(data.state, data.stores, data.messages, req.body || {});
    if (result.created) {
      result.order.recoveredBy = admin.login;
      await notifySiteUser(data.state, result.order.login, {
        id: `notice-order-recovered-${result.order.id}-${loginKey(result.order.login)}`,
        eventType: "order_recovered",
        orderId: result.order.id,
        storeId: result.order.storeId,
        title: "Order restored",
        body: `Order ${result.order.product || result.order.id} was restored in your orders.`
      });
      await saveSettingsState(data.state);
      await appendAdminLog("order_recovered", admin.login, {
        orderId: result.order.id,
        login: result.order.login,
        storeId: result.order.storeId,
        disputeThreadId: result.order.disputeThreadId
      });
    }
    res.json({ ...result, overview: adminBuildOverview(await adminLoadMarketplace()) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/stores/:id/products/:productId", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    if (!row?.data) return res.status(404).json({ error: "Store not found" });
    const store = row.data;
    const product = (store.products || []).find((item) => item.id === req.params.productId);
    if (!product) return res.status(404).json({ error: "Товар не найден" });
    ["title", "category", "description", "priceUsd", "status"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) product[key] = req.body[key];
    });
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await appendAdminLog("product_updated", admin.login, { storeId: store.id, productId: product.id });
    console.log("[product] updated", { storeId: store.id, productId: product.id });
    notifyRealtime("product_updated", { storeId: store.id, productId: product.id });
    res.json({ store });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/stores/:id/products/:productId", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const { data: row } = await supabase.from("stores").select("data").eq("id", req.params.id).maybeSingle();
    if (!row?.data) return res.status(404).json({ error: "Store not found" });
    const store = row.data;
    store.products = (store.products || []).filter((item) => item.id !== req.params.productId);
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await appendAdminLog("product_deleted", admin.login, { storeId: store.id, productId: req.params.productId });
    console.log("[product] deleted", { storeId: store.id, productId: req.params.productId });
    notifyRealtime("product_deleted", { storeId: store.id, productId: req.params.productId });
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

app.post("/api/admin/withdrawals/owner", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const data = await adminLoadMarketplace();
    const state = data.state;
    const storeById = new Map(data.stores.map((store) => [store.id, store]));
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const completedOrders = orders.filter((order) => (order.type === "product" || order.storeId) && adminIsPaidProductOrder(order));
    const totalCommissionUsd = completedOrders.reduce((sum, order) => sum + adminPlatformCommission(order, state, storeById.get(order.storeId)), 0);
    const availableUsd = Math.max(0, totalCommissionUsd - activeWithdrawalUsd(state, "owner"));
    if (availableUsd <= 0) return res.status(400).json({ error: "Нет комиссии владельца для вывода" });
    const amountUsd = requestedWithdrawalUsd(req.body, availableUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: "Укажите сумму вывода" });
    if (amountUsd > availableUsd + 0.000001) return res.status(400).json({ error: "Сумма вывода больше доступной комиссии" });
    const address = String(req.body.address || state.paymentSettings?.platformLtcWallet || mainLtcWallet || "").trim();
    if (!address || address.length < 12) return res.status(400).json({ error: "Укажите LTC счет для вывода" });
    state.walletWithdrawals = Array.isArray(state.walletWithdrawals) ? state.walletWithdrawals : [];
    const request = {
      id: `owner-withdraw-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      kind: "ltc_withdraw",
      scope: "owner",
      login: admin.login,
      amountUsd,
      amountLtc: amountUsd / 54.2,
      coinId: "ltc",
      payCurrency: "ltc",
      address,
      status: "pending",
      provider: "manual",
      createdAt: Date.now(),
      date: new Date().toLocaleString("ru-RU")
    };
    state.walletWithdrawals.unshift(request);
    await notifySiteUser(state, admin.login, {
      id: `notice-owner-withdrawal-${request.id}-${loginKey(admin.login)}`,
      eventType: "owner_withdrawal_requested",
      withdrawalId: request.id,
      title: "Заявка на вывод владельца создана",
      body: `Запрошен вывод ${amountUsd.toFixed(2)} $ (${request.amountLtc.toFixed(8)} LTC) на ${address}.`
    });
    await saveSettingsState(state);
    await appendAdminLog("owner_withdrawal_requested", admin.login, { amountUsd, address });
    notifyRealtime("wallet_withdrawal_created", { id: request.id, scope: "owner" });
    res.json(adminBuildOverview(await adminLoadMarketplace()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/withdrawals/:id/status", async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const state = await loadSettingsState();
    state.walletWithdrawals = Array.isArray(state.walletWithdrawals) ? state.walletWithdrawals : [];
    state.walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
    state.ltcBalances = state.ltcBalances || {};
    const withdrawal = state.walletWithdrawals.find((item) => String(item.id || "") === String(req.params.id || ""));
    if (!withdrawal) return res.status(404).json({ error: "Заявка на вывод не найдена" });
    const nextStatus = String(req.body.status || "").trim().toLowerCase();
    if (!["pending", "processing", "paid", "completed", "rejected", "cancelled", "canceled"].includes(nextStatus)) {
      return res.status(400).json({ error: "Неверный статус вывода" });
    }
    const prevStatus = String(withdrawal.status || "pending").toLowerCase();
    withdrawal.status = nextStatus;
    withdrawal.processedAt = Date.now();
    withdrawal.processedBy = admin.login;
    withdrawal.adminNote = String(req.body.note || "").trim().slice(0, 500);

    const isRejected = ["rejected", "cancelled", "canceled"].includes(nextStatus);
    const wasRejected = ["rejected", "cancelled", "canceled"].includes(prevStatus);
    if (isRejected && !wasRejected && !withdrawal.scope && withdrawal.login && Number(withdrawal.amountLtc || 0) > 0 && !withdrawal.refundedAt) {
      state.ltcBalances[withdrawal.login] = Number(state.ltcBalances[withdrawal.login] || 0) + Number(withdrawal.amountLtc || 0);
      withdrawal.refundedAt = Date.now();
      state.walletTransactions.unshift({
        id: `tx-refund-${withdrawal.id}`,
        login: withdrawal.login,
        type: "withdrawal_refund",
        title: "Возврат отклонённого вывода LTC",
        amountLtc: Number(withdrawal.amountLtc || 0),
        amountUsd: Number(withdrawal.amountUsd || 0),
        coinId: withdrawal.coinId || "ltc",
        payCurrency: withdrawal.payCurrency || "ltc",
        address: withdrawal.address || "",
        createdAt: withdrawal.refundedAt,
        date: new Date(withdrawal.refundedAt).toLocaleString("ru-RU"),
        status: "completed"
      });
    }

    const recipientLogin = withdrawal.scope === "owner"
      ? withdrawal.login || admin.login
      : withdrawal.scope === "store"
        ? withdrawal.login || withdrawal.storeId
        : withdrawal.login;
    await notifySiteUser(state, recipientLogin, {
      id: `notice-withdrawal-status-${withdrawal.id}-${nextStatus}-${loginKey(recipientLogin)}`,
      eventType: "withdrawal_status_changed",
      withdrawalId: withdrawal.id,
      storeId: withdrawal.storeId || "",
      title: "Статус вывода изменён",
      body: `Заявка ${withdrawal.id}: ${nextStatus}.`
    });
    await saveSettingsState(state);
    await appendAdminLog("withdrawal_status_updated", admin.login, {
      id: withdrawal.id,
      scope: withdrawal.scope || "user",
      login: withdrawal.login || "",
      storeId: withdrawal.storeId || "",
      prevStatus,
      nextStatus
    });
    notifyRealtime("wallet_withdrawal_status_updated", { id: withdrawal.id, status: nextStatus, scope: withdrawal.scope || "user" });
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
    state.mirrorBots = Array.isArray(state.mirrorBots) ? state.mirrorBots : [];
    const bots = adminCollectMirrorBots(state);
    const target = bots.find((bot) => bot.id === id || bot.webhookId === id || bot.chatId === req.body.chatId || bot.token === req.body.token);
    if (!target) return res.status(404).json({ error: "Зеркало не найдено" });

    const mirror = state.mirrorBots[target.index];
    if (!mirror) return res.status(404).json({ error: "Зеркало не найдено" });
    const markError = (error) => {
      const errorText = String(error?.message || error || "").slice(0, 300);
      mirror.lastTelegramError = errorText;
      mirror.telegramErrors = Array.isArray(mirror.telegramErrors) ? mirror.telegramErrors : [];
      mirror.telegramErrors.unshift({ error: errorText, createdAt: Date.now(), action });
      mirror.telegramErrors = mirror.telegramErrors.slice(0, 50);
      mirror.telegramErrorsCount = Number(mirror.telegramErrorsCount || 0) + 1;
      mirror.webhookOk = false;
    };

    try {
      if (action === "disable") {
        mirror.verified = false;
        mirror.active = false;
        mirror.status = "disabled";
      } else if (action === "enable") {
        mirror.verified = true;
        mirror.active = true;
        mirror.blocked = false;
        mirror.status = "active";
      } else if (action === "block") {
        mirror.blocked = true;
        mirror.active = false;
        mirror.status = "blocked";
      } else if (action === "unblock") {
        mirror.blocked = false;
        mirror.active = mirror.verified !== false;
        mirror.status = mirror.active ? "active" : "disabled";
      } else if (action === "restartWebhook") {
        if (!mirror.token) return res.status(400).json({ error: "У зеркала нет токена" });
        mirror.webhookId = mirror.webhookId || mirrorWebhookId(mirror.token);
        mirror.webhookUrl = mirror.webhookUrl || mirrorWebhookUrl(mirror.token);
        await telegramTokenApi(mirror.token, "setWebhook", {
          url: mirror.webhookUrl,
          ...(telegramWebhookSecret ? { secret_token: telegramWebhookSecret } : {})
        });
        const webhook = await telegramTokenApi(mirror.token, "getWebhookInfo");
        mirror.webhookOk = Boolean(webhook?.result?.url);
        mirror.lastTelegramError = webhook?.result?.last_error_message || "";
        mirror.status = mirror.blocked ? "blocked" : mirror.verified === false ? "disabled" : "active";
      } else if (action === "checkApi") {
        if (!mirror.token) return res.status(400).json({ error: "У зеркала нет токена" });
        const [info, webhook] = await Promise.all([
          telegramTokenApi(mirror.token, "getMe"),
          telegramTokenApi(mirror.token, "getWebhookInfo")
        ]);
        const bot = info?.result || {};
        mirror.botUsername = bot.username || mirror.botUsername || "";
        mirror.botName = bot.first_name || mirror.botName || mirror.botUsername || "";
        mirror.webhookOk = Boolean(webhook?.result?.url);
        mirror.lastTelegramError = webhook?.result?.last_error_message || "";
        mirror.active = mirror.verified !== false && !mirror.blocked;
        mirror.status = mirror.blocked ? "blocked" : mirror.active ? "active" : "disabled";
      } else if (action === "delete") {
        if (mirror.token) await telegramTokenApi(mirror.token, "deleteWebhook", { drop_pending_updates: true }).catch(markError);
        state.mirrorBots.splice(target.index, 1);
      } else {
        return res.status(400).json({ error: "Неизвестное действие" });
      }
    } catch (error) {
      markError(error);
    }
    if (action !== "delete" && state.mirrorBots[target.index]) state.mirrorBots[target.index].updatedAt = Date.now();
    await saveSettingsState(state);
    await appendAdminLog(`mirror_bot_${action}`, admin.login, { id, chatId: target.chatId, loginKey: target.loginKey });
    console.log("[mirror-bot] action", { action, id, chatId: target.chatId, loginKey: target.loginKey });
    notifyRealtime(`mirror_bot_${action}`, { id, chatId: target.chatId, loginKey: target.loginKey });
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
  const { data: currentSettings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const currentData = currentSettings?.data || {};
  const next = {
    ...currentData,
    ...(state || {}),
    telegramBot: state?.telegramBot || { users: {}, sentMessages: {} },
    mirrorBots: Array.isArray(state?.mirrorBots) ? state.mirrorBots : (currentData.mirrorBots || []),
    ownerStores: Array.isArray(state?.ownerStores) ? state.ownerStores : (currentData.ownerStores || []),
    publicStoresCache: Array.isArray(state?.publicStoresCache) ? state.publicStoresCache : (currentData.publicStoresCache || [])
  };
  await supabase.from("app_settings").upsert({ id: "main", data: next }, { onConflict: "id" });
  notifyRealtime("state_updated");
}

async function savePublicStoresCache(stores = []) {
  if (!Array.isArray(stores) || !stores.length) return;
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  const nextCache = stores.map(publicStoreForState);
  if (JSON.stringify(state.publicStoresCache || []) === JSON.stringify(nextCache)) return;
  state.publicStoresCache = nextCache;
  state.publicStoresCacheAt = Date.now();
  await supabase.from("app_settings").upsert({ id: "main", data: state }, { onConflict: "id" });
}

async function clearDeletedStoreTombstone(storeId) {
  const id = String(storeId || "");
  if (!id) return;
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  const deletedIds = Array.isArray(state.deletedStoreIds) ? state.deletedStoreIds.map(String) : [];
  if (!deletedIds.includes(id)) return;
  state.deletedStoreIds = deletedIds.filter((item) => item !== id);
  await supabase.from("app_settings").upsert({ id: "main", data: state }, { onConflict: "id" });
  console.log("[store] tombstone cleared", { storeId: id });
}

async function saveOwnerStoreFallback(store = {}) {
  if (!store.id) return;
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  const ownerStores = Array.isArray(state.ownerStores) ? state.ownerStores : [];
  state.ownerStores = [store, ...ownerStores.filter((item) => String(item?.id || "") !== String(store.id))];
  const publicStoresCache = Array.isArray(state.publicStoresCache) ? state.publicStoresCache : [];
  state.publicStoresCache = [publicStoreForState(store), ...publicStoresCache.filter((item) => String(item?.id || "") !== String(store.id))];
  state.publicStoresCacheAt = Date.now();
  await supabase.from("app_settings").upsert({ id: "main", data: state }, { onConflict: "id" });
  console.log("[owner-store] fallback saved", { storeId: store.id, ownerStores: state.ownerStores.length });
}

async function removeOwnerStoreFallback(storeId) {
  const id = String(storeId || "");
  if (!id) return;
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  const ownerStores = Array.isArray(state.ownerStores) ? state.ownerStores : [];
  state.ownerStores = ownerStores.filter((item) => String(item?.id || "") !== id);
  const publicStoresCache = Array.isArray(state.publicStoresCache) ? state.publicStoresCache : [];
  state.publicStoresCache = publicStoresCache.filter((item) => String(item?.id || "") !== id);
  state.publicStoresCacheAt = Date.now();
  await supabase.from("app_settings").upsert({ id: "main", data: state }, { onConflict: "id" });
}

function stableDisputeNumber(value = "") {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return 100 + (hash % 900);
}

function disputeNumber(order = {}) {
  return Number(order.disputeNumber || order.disputeNo || stableDisputeNumber(order.disputeThreadId || order.id || Date.now()));
}

function orderHasDisputeHistory(order = {}) {
  return Boolean(
    order.disputeOpen ||
    String(order.status || "").toLowerCase() === "dispute" ||
    order.disputeThreadId ||
    order.disputeOpenedAt ||
    order.disputeNumber ||
    order.disputeNo ||
    order.disputeChatClosed ||
    order.disputeClosedAt
  );
}

function orderHasOpenDispute(order = {}) {
  if (!orderHasDisputeHistory(order)) return false;
  if (order.disputeChatClosed || order.disputeOpen === false) return false;
  return !["completed", "closed", "canceled", "cancelled"].includes(String(order.status || "").toLowerCase());
}

function requestHasDisputeHistory(request = {}) {
  return Boolean(
    request.disputeOpen ||
    String(request.status || "").toLowerCase() === "dispute" ||
    request.disputeThreadId ||
    request.disputeOpenedAt ||
    request.disputeNumber ||
    request.disputeNo ||
    request.disputeChatClosed ||
    request.disputeClosedAt
  );
}

function messageLooksLikeDispute(message = {}) {
  const system = String(message.system || "").toLowerCase();
  const text = `${message.subject || ""} ${message.body || ""}`.toLowerCase();
  return Boolean(
    message.disputeThreadId ||
    system.includes("dispute") ||
    text.includes("dispute") ||
    text.includes("диспут") ||
    text.includes("спор")
  );
}

function disputeMessagesForServerOrder(order = {}, messages = []) {
  const id = String(order.id || order.exchangeRequestId || "");
  const threadId = String(order.disputeThreadId || "");
  if (!id && !threadId) return [];
  return messages
    .filter((message) => {
      if (!messageLooksLikeDispute(message)) return false;
      const messageThreadId = String(message.disputeThreadId || "");
      const messageOrderId = String(message.orderId || message.exchangeRequestId || "");
      const subject = String(message.subject || "");
      return (
        (threadId && messageThreadId === threadId) ||
        (id && messageOrderId === id) ||
        (id && subject.includes(id))
      );
    })
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function hydrateOrderDisputeHistory(order = {}, messages = []) {
  if (!order || orderHasDisputeHistory(order)) return order;
  const disputeMessages = disputeMessagesForServerOrder(order, messages);
  if (!disputeMessages.length) return order;
  const firstMessage = disputeMessages[0] || {};
  const lastMessage = disputeMessages[disputeMessages.length - 1] || {};
  const closedByMessage = disputeMessages.some((message) => {
    const system = String(message.system || "").toLowerCase();
    const text = `${message.subject || ""} ${message.body || ""}`.toLowerCase();
    return system.includes("closed") || text.includes("закрыт");
  });
  const threadId = firstMessage.disputeThreadId || lastMessage.disputeThreadId || `dispute-${order.id}`;
  return {
    ...order,
    status: closedByMessage ? (order.status || "completed") : "dispute",
    disputeOpen: !closedByMessage,
    disputeThreadId: threadId,
    disputeOpenedAt: firstMessage.createdAt || order.createdAt || Date.now(),
    disputeClosedAt: closedByMessage ? (lastMessage.createdAt || order.disputeClosedAt || Date.now()) : order.disputeClosedAt,
    disputeChatClosed: closedByMessage || order.disputeChatClosed,
    disputeNumber: order.disputeNumber || disputeNumber({ ...order, disputeThreadId: threadId }),
    disputeRecovered: true
  };
}

function hydrateOrdersDisputeHistory(orders = [], messages = []) {
  return orders.map((order) => hydrateOrderDisputeHistory(order, messages));
}

function ensureDisputeNumber(state = {}, order = {}) {
  if (order.disputeNumber) return Number(order.disputeNumber);
  const used = new Set((Array.isArray(state.orders) ? state.orders : []).map((item) => Number(item?.disputeNumber || 0)).filter(Boolean));
  let value = stableDisputeNumber(order.id || order.disputeThreadId || Date.now());
  for (let guard = 0; used.has(value) && guard < 900; guard += 1) {
    value = 100 + Math.floor(Math.random() * 900);
  }
  order.disputeNumber = value;
  return value;
}

async function lifecycleStoreForOrder(state = {}, storeId = "") {
  const id = String(storeId || "").trim();
  if (!id) return null;
  const { data: row } = await supabase.from("stores").select("data").eq("id", id).maybeSingle();
  return row?.data || (Array.isArray(state.ownerStores) ? state.ownerStores.find((item) => String(item?.id || "") === id) : null) || null;
}

async function restoreExpiredProductReservation(state = {}, order = {}) {
  if (order.reservationRestored || order.stockRestoredAt) return false;
  const store = await lifecycleStoreForOrder(state, order.storeId);
  if (!store) return false;
  const product = (Array.isArray(store.products) ? store.products : []).find((item) => String(item?.id || "") === String(order.productId || ""));
  const position = (Array.isArray(product?.positions) ? product.positions : []).find((item) => String(item?.id || "") === String(order.positionId || ""));
  if (!product && !position) return false;
  if (order.reservedDescription) {
    if (order.reservedFromPosition && position) {
      position.deliveryItems = Array.isArray(position.deliveryItems) ? position.deliveryItems : [];
      if (!position.deliveryItems.includes(order.reservedDescription)) position.deliveryItems.unshift(order.reservedDescription);
    } else if (product) {
      product.deliveryItems = Array.isArray(product.deliveryItems) ? product.deliveryItems : [];
      if (!product.deliveryItems.includes(order.reservedDescription)) product.deliveryItems.unshift(order.reservedDescription);
    }
  }
  if (position) {
    position.stock = Math.max(0, Number(position.stock || 0)) + 1;
    order.stockRestoredAt = Date.now();
  }
  order.reservationRestored = true;
  if (store.id) {
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    if (Array.isArray(state.ownerStores)) {
      state.ownerStores = state.ownerStores.map((item) => String(item?.id || "") === String(store.id) ? { ...item, ...store } : item);
    }
  }
  return true;
}

async function ensureProductOrderSettlement(state = {}, order = {}, store = null) {
  if (!order || order.type !== "product") return false;
  if (String(order.paymentStatus || "").toLowerCase() !== "paid") return false;
  if (!adminIsWithdrawableStoreOrder(order)) return false;

  state.walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
  const beforeTxCount = state.walletTransactions.length;
  const hadLedger = Boolean(order.ledgerRecordedAt);
  const resolvedStore = store || await lifecycleStoreForOrder(state, order.storeId);

  recordProductOrderLedger(order, state, resolvedStore);

  return !hadLedger || state.walletTransactions.length !== beforeTxCount;
}

async function normalizeServerOrders(state = {}) {
  const now = Date.now();
  let changed = false;
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const nextOrders = [];
  for (const order of orders) {
    if (!order || order.type !== "product") {
      nextOrders.push(order);
      continue;
    }
    const status = String(order.status || "").toLowerCase();
    const paymentStatus = String(order.paymentStatus || "").toLowerCase();
    if (status === "pending_payment" && paymentStatus !== "paid" && order.paymentExpiresAt && now >= Number(order.paymentExpiresAt || 0)) {
      await restoreExpiredProductReservation(state, order);
      changed = true;
      pushSiteNotification(state, order.login, {
        id: `notice-order-expired-${order.id}-${loginKey(order.login)}`,
        eventType: "order_expired",
        orderId: order.id,
        storeId: order.storeId,
        title: "Счёт истёк",
        body: `Бронь на оплату заказа ${order.product || order.id} истекла, товар вернулся на склад.`
      });
      nextOrders.push({
        ...order,
        status: "canceled",
        paymentStatus: "expired",
        canceledAt: now,
        cancelReason: "Бронь на оплату истекла"
      });
      continue;
    }
    if (status === "active" && paymentStatus === "paid" && !order.disputeOpen) {
      const paidAt = Number(order.paidAt || order.createdAt || now);
      const hours = Math.max(0, Number(order.autoReleaseHours ?? state.ownerSettings?.defaultAutoReleaseHours ?? 24));
      const autoReleaseAt = Number(order.autoReleaseAt || (paidAt + hours * 60 * 60 * 1000));
      if (!order.autoReleaseAt) {
        order.autoReleaseAt = autoReleaseAt;
        changed = true;
      }
      if (autoReleaseAt && now >= autoReleaseAt) {
        changed = true;
        const store = await lifecycleStoreForOrder(state, order.storeId);
        pushSiteNotification(state, order.login, {
          id: `notice-order-auto-completed-${order.id}-${loginKey(order.login)}`,
          eventType: "order_auto_completed",
          orderId: order.id,
          storeId: order.storeId,
          title: "Заказ завершён автоматически",
          body: `Заказ ${order.product || order.id} завершён по таймеру автозакрытия.`
        });
        pushSiteNotification(state, store?.ownerLogin || "admin", {
          id: `notice-store-order-auto-completed-${order.id}-${loginKey(store?.ownerLogin || "admin")}`,
          eventType: "store_order_auto_completed",
          orderId: order.id,
          storeId: order.storeId,
          title: "Заказ завершён автоматически",
          body: `Заказ ${order.product || order.id} закрыт по таймеру автозавершения.`
        });
        const autoCompletedOrder = { ...order, status: "completed", completedAt: now, closedAt: now };
        if (await ensureProductOrderSettlement(state, autoCompletedOrder, store)) {
          order.ledgerRecordedAt = autoCompletedOrder.ledgerRecordedAt;
          order.platformCommissionPercent = autoCompletedOrder.platformCommissionPercent;
          order.platformCommissionUsd = autoCompletedOrder.platformCommissionUsd;
          order.sellerAmountUsd = autoCompletedOrder.sellerAmountUsd;
        }
        nextOrders.push({
          ...order,
          status: "completed",
          completedAt: now,
          closedAt: now,
          closeReason: "Автозакрытие сделки"
        });
        continue;
      }
    }
    if (await ensureProductOrderSettlement(state, order)) changed = true;
    nextOrders.push(order);
  }
  state.orders = nextOrders;
  return changed;
}

async function loadSettingsState() {
  await ensureSeed();
  const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
  const state = settings?.data || {};
  state.telegramBot = state.telegramBot || { users: {}, sentMessages: {} };
  state.telegramBot.users = state.telegramBot.users || {};
  state.telegramBot.sentMessages = state.telegramBot.sentMessages || {};
  state.siteNotifyBot = state.siteNotifyBot || { users: {}, sentMessages: {} };
  state.siteNotifyBot.users = state.siteNotifyBot.users || {};
  state.siteNotifyBot.sentMessages = state.siteNotifyBot.sentMessages || {};
  state.mirrorBots = Array.isArray(state.mirrorBots) ? state.mirrorBots : [];
  state.supportSettings = normalizeSupportSettings(state.supportSettings);
  state.supportTickets = Array.isArray(state.supportTickets) ? state.supportTickets : [];
  if (await normalizeServerOrders(state)) {
    await saveSettingsState(state);
  }
  return state;
}

function normalizeSupportSettings(settings = {}) {
  const recipients = Array.isArray(settings.recipients) ? settings.recipients : [];
  const normalized = recipients.map((item, index) => {
    const login = String(item?.login || item?.recipientLogin || "").trim();
    const title = String(item?.title || item?.name || login || `Раздел ${index + 1}`).trim();
    const id = String(item?.id || title || login || `support-${index + 1}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return login ? { id: id || `support-${index + 1}`, title, login } : null;
  }).filter(Boolean);
  return {
    recipients: normalized.length ? normalized : [{ id: "general", title: "Общая поддержка", login: "support" }]
  };
}

function supportTicketPublic(ticket = {}) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    body: ticket.body,
    attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
    fromLogin: ticket.fromLogin,
    recipientLogin: ticket.recipientLogin,
    recipientTitle: ticket.recipientTitle,
    status: ticket.status || "open",
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt || ticket.createdAt || 0,
    closedAt: ticket.closedAt || 0,
    closedBy: ticket.closedBy || "",
    replies: Array.isArray(ticket.replies) ? ticket.replies.map((reply) => ({
      id: reply.id,
      fromLogin: reply.fromLogin,
      body: reply.body || "",
      attachments: Array.isArray(reply.attachments) ? reply.attachments : [],
      createdAt: reply.createdAt || 0
    })) : []
  };
}

function normalizeSupportAttachments(value, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((file, index) => {
    const url = String(file?.url || "").trim();
    if (!url || url.length > maxDataImageLength) return null;
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(url) && !/^https?:\/\//i.test(url)) return null;
    return {
      name: String(file?.name || `image-${index + 1}`).slice(0, 120),
      type: String(file?.type || "image/png").slice(0, 80),
      url
    };
  }).filter(Boolean);
}

function pushSiteNotification(state, login, notification = {}) {
  const cleanLogin = String(login || "").trim();
  if (!cleanLogin) return null;
  state.siteNotifications = Array.isArray(state.siteNotifications) ? state.siteNotifications : [];
  const key = loginKey(cleanLogin);
  const eventId = String(notification.id || [
    "notice",
    notification.eventType || "system",
    notification.orderId || notification.ticketId || notification.withdrawalId || "",
    key,
    notification.unique || ""
  ].filter(Boolean).join("-"));
  if (state.siteNotifications.some((item) => String(item.id || "") === eventId && sameLogin(item.login || item.loginKey, cleanLogin))) {
    return null;
  }
  const item = {
    id: eventId,
    login: cleanLogin,
    loginKey: key,
    title: String(notification.title || "CERBER"),
    body: String(notification.body || ""),
    type: notification.type || "popup",
    eventType: notification.eventType || "system",
    orderId: notification.orderId || "",
    storeId: notification.storeId || "",
    ticketId: notification.ticketId || "",
    withdrawalId: notification.withdrawalId || "",
    buttonText: notification.buttonText || "",
    buttonUrl: notification.buttonUrl || "",
    createdAt: notification.createdAt || Date.now(),
    clickedAt: null,
    closedAt: null
  };
  state.siteNotifications.unshift(item);
  state.siteNotifications = state.siteNotifications.slice(0, 500);
  return item;
}

async function notifySiteUser(state, login, notification = {}) {
  const item = pushSiteNotification(state, login, notification);
  if (!item || !siteNotifyBotToken) return item;
  try {
    const botState = initSiteNotifyBotState(state);
    const recipients = Object.values(botState.users || {}).filter((user) => (
      user?.enabled &&
      user?.chatId &&
      (sameLogin(user.login, login) || sameLogin(user.loginKey, login))
    ));
    const sentKeyBase = `site-notice:${item.id}`;
    const text = [
      `<b>${botHtml(item.title)}</b>`,
      "",
      botHtml(item.body),
      item.buttonUrl ? `\n${botHtml(item.buttonUrl)}` : ""
    ].filter(Boolean).join("\n");
    for (const recipient of recipients) {
      const sentKey = `${recipient.chatId}:${sentKeyBase}`;
      if (botState.sentMessages[sentKey]) continue;
      await siteNotifySendMessage(recipient.chatId, text);
      botState.sentMessages[sentKey] = Date.now();
    }
    const entries = Object.entries(botState.sentMessages).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0, 1000);
    botState.sentMessages = Object.fromEntries(entries);
  } catch (error) {
    console.error("Site notification bot delivery error", { login, message: error.message });
  }
  return item;
}

async function upsertPrivateMessage(message) {
  await supabase.from("messages").upsert({ id: message.id, data: message }, { onConflict: "id" });
  siteNotifyDeliverPrivateMessage(message).catch((error) => {
    console.error("Site notify bot delivery error", error);
  });
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
  const mergedStores = mergeStoreSources((stores || []).map((row) => ({ ...row.data, createdAt: row.data?.createdAt || row.created_at, updatedAt: row.updated_at })), state.ownerStores || []);
  return {
    state,
    stores: mergedStores,
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

function adminIsPaidProductOrder(order) {
  const status = String(order.status || "").toLowerCase();
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  return paymentStatus === "paid" || ["active", "completed", "closed", "paid"].includes(status);
}

function adminIsWithdrawableStoreOrder(order) {
  if (!adminIsPaidProductOrder(order)) return false;
  const status = String(order.status || "").toLowerCase();
  if (order.disputeOpen || ["pending_payment", "canceled", "cancelled", "dispute"].includes(status)) return false;
  return true;
}

function adminStoreNetAmount(order, state, store) {
  return Math.max(0, adminOrderAmount(order) - adminPlatformCommission(order, state, store));
}

function storeCommissionPercentForOrder(store = null) {
  if (!store) return 0;
  if (store.commissionPercent != null) return Math.max(0, Number(store.commissionPercent || 0));
  if (store.platformCommissionPercent != null) return Math.max(0, Number(store.platformCommissionPercent || 0));
  return 0;
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

function storePlacementFlags(placements = []) {
  const list = Array.isArray(placements) ? placements : [];
  return {
    isTop: list.includes("TOP 10"),
    isFeatured: list.includes("TOP"),
    isNew: list.includes("NEW"),
    visibleInCatalog: list.includes("stores")
  };
}

function adminStoreVisible(body = {}, existing = null, flags = {}) {
  if (body.is_deleted === true || body.deleted === true) return false;
  if (body.published === false || body.is_active === false) return false;
  if (body.visibility === "hidden" || body.visibility === "private") return false;
  if (body.visibleInCatalog != null) return body.visibleInCatalog !== false;
  if (body.placements != null || body.placement != null) return flags.visibleInCatalog !== false;
  if (existing?.visibleInCatalog != null) return existing.visibleInCatalog !== false;
  return flags.visibleInCatalog !== false;
}

function adminLegacyStorePlacements(store = null) {
  if (!store) return ["stores"];
  const placements = [];
  if (store.isTop) placements.push("TOP 10");
  if (store.isFeatured) placements.push("TOP");
  if (store.isNew) placements.push("NEW");
  if (store.visibleInCatalog !== false) placements.push("stores");
  return placements.length ? placements : ["stores"];
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
  const placementInput = body.placements ?? body.placement ?? existing?.placements ?? existing?.placement ?? adminLegacyStorePlacements(existing);
  const placements = adminNormalizeStorePlacements(placementInput);
  const placement = placements[0] || "stores";
  let flags = storePlacementFlags(placements);
  if (body.is_top === true && !placements.includes("TOP 10")) placements.unshift("TOP 10");
  if (body.isNew === true && !placements.includes("NEW")) placements.push("NEW");
  if (body.isFeatured === true && !placements.includes("TOP")) placements.push("TOP");
  flags = storePlacementFlags(placements);
  const position = Math.max(0, Number(body.homepagePosition ?? body.position ?? existing?.homepagePosition ?? 0));
  const topPosition = Math.max(0, Number(body.top_position ?? body.topPosition ?? existing?.top_position ?? position));
  const image = sellerImagePatch(existing?.image || existing?.avatar, body.image || body.avatar) || "assets/cerber-emblem.png";
  const cover = sellerImagePatch(existing?.cover || existing?.banner, body.cover || body.banner) || image || "assets/market-banner.png";
  const visibleInCatalog = adminStoreVisible(body, existing, flags);
  const isStopped = body.is_stopped === true || body.stopped === true || body.salesBlocked === true || existing?.salesBlocked === true || existing?.is_stopped === true;
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
    is_active: body.is_active !== false,
    is_deleted: body.is_deleted === true || body.deleted === true,
    is_stopped: isStopped,
    published: body.published !== false,
    visibility: String(body.visibility || existing?.visibility || "public"),
    visibleInCatalog,
    isTop: flags.isTop || body.is_top === true,
    is_top: flags.isTop || body.is_top === true,
    isFeatured: flags.isFeatured,
    isNew: flags.isNew,
    placement,
    placements,
    homepagePosition: position,
    position,
    top_position: topPosition,
    topPosition,
    domains: Array.isArray(body.domains) ? body.domains : (Array.isArray(existing?.domains) ? existing.domains : ["*"]),
    domain_id: body.domain_id || existing?.domain_id || "*",
    countries,
    regions: countries,
    cities: Array.isArray(body.cities) ? body.cities : (existing?.cities || []),
    districts: Array.isArray(body.districts) ? body.districts : (existing?.districts || []),
    commissionPercent: Math.min(20, Math.max(0, Number(body.commissionPercent ?? existing?.commissionPercent ?? 0))),
    autoReleaseHours: Math.min(168, Math.max(0, Number(body.autoReleaseHours ?? existing?.autoReleaseHours ?? 24))),
    enabledCoins: body.enabledCoins || existing?.enabledCoins || {},
    wallets: body.wallets && typeof body.wallets === "object" ? body.wallets : (existing?.wallets || {}),
    products: Array.isArray(existing?.products) ? existing.products : [],
    reviewsList: Array.isArray(existing?.reviewsList) ? existing.reviewsList : [],
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

function adminPlatformCommission(order, state, store) {
  const fixed = Number(order?.platformCommissionUsd || 0);
  if (fixed > 0) return fixed;
  const storeCommission = store ? storeCommissionPercentForOrder(store) : Number(order?.platformCommissionPercent || 0);
  return adminOrderAmount(order) * Math.max(0, storeCommission) / 100;
}

function activeWithdrawalUsd(state = {}, scope = "", storeId = "") {
  return (Array.isArray(state.walletWithdrawals) ? state.walletWithdrawals : [])
    .filter((item) => {
      if (scope && item.scope !== scope) return false;
      if (storeId && item.storeId !== storeId) return false;
      return !["cancelled", "canceled", "rejected"].includes(String(item.status || "").toLowerCase());
    })
    .reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
}

function requestedWithdrawalUsd(body = {}, availableUsd = 0) {
  const rawAll = String(body.amountMode || body.amount || "").trim().toLowerCase();
  if (rawAll === "all" || body.all === true) return Math.max(0, Number(availableUsd || 0));
  const amountUsd = Number(body.amountUsd || 0);
  if (Number.isFinite(amountUsd) && amountUsd > 0) return amountUsd;
  const amountLtc = Number(body.amountLtc || 0);
  if (Number.isFinite(amountLtc) && amountLtc > 0) return amountLtc * 54.2;
  return 0;
}

function applyProductOrderCommission(order, state = {}, store = null) {
  if (!order) return order;
  const amount = adminOrderAmount(order);
  const percent = Math.max(0, Number(store ? storeCommissionPercentForOrder(store) : (order.platformCommissionPercent || 0)));
  const fixedCommission = Number(order.platformCommissionUsd || 0);
  const commission = fixedCommission > 0 ? fixedCommission : amount * percent / 100;
  order.platformCommissionPercent = percent;
  order.platformCommissionUsd = Math.max(0, commission);
  order.sellerAmountUsd = Math.max(0, amount - order.platformCommissionUsd);
  return order;
}

function recordProductOrderLedger(order, state = {}, store = null) {
  if (!order || order.type !== "product" || String(order.paymentStatus || "").toLowerCase() !== "paid") return;
  state.walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
  state.storeBalancesUsd = state.storeBalancesUsd || {};
  state.ownerBalanceUsd = Number(state.ownerBalanceUsd || 0);

  applyProductOrderCommission(order, state, store);
  const amountUsd = adminOrderAmount(order);
  const commissionUsd = Math.max(0, Number(order.platformCommissionUsd || 0));
  const sellerUsd = Math.max(0, Number(order.sellerAmountUsd ?? (amountUsd - commissionUsd)));
  const createdAt = Number(order.paidAt || order.createdAt || Date.now());
  const storeId = String(order.storeId || "");
  const storeTxId = `tx-store-sale-${order.id}`;
  const ownerTxId = `tx-owner-commission-${order.id}`;

  if (storeId && !state.walletTransactions.some((tx) => tx.id === storeTxId)) {
    state.walletTransactions.unshift({
      id: storeTxId,
      scope: "store",
      storeId,
      storeName: store?.name || order.storeName || storeId,
      login: store?.ownerLogin || order.storeOwnerLogin || storeId,
      type: "store_sale",
      title: `Sale: ${order.product || order.id}`,
      orderId: order.id,
      amountUsd: sellerUsd,
      grossUsd: amountUsd,
      commissionUsd,
      amountLtc: sellerUsd / 54.2,
      coinId: "ltc",
      payCurrency: "ltc",
      createdAt,
      date: new Date(createdAt).toLocaleString("ru-RU"),
      status: "completed"
    });
    state.storeBalancesUsd[storeId] = Number(state.storeBalancesUsd[storeId] || 0) + sellerUsd;
  }

  if (commissionUsd > 0 && !state.walletTransactions.some((tx) => tx.id === ownerTxId)) {
    state.walletTransactions.unshift({
      id: ownerTxId,
      scope: "owner",
      login: "owner",
      type: "platform_commission",
      title: `Commission: ${order.product || order.id}`,
      orderId: order.id,
      storeId,
      storeName: store?.name || order.storeName || storeId,
      amountUsd: commissionUsd,
      grossUsd: amountUsd,
      commissionPercent: Number(order.platformCommissionPercent || 0),
      amountLtc: commissionUsd / 54.2,
      coinId: "ltc",
      payCurrency: "ltc",
      createdAt,
      date: new Date(createdAt).toLocaleString("ru-RU"),
      status: "completed"
    });
    state.ownerBalanceUsd += commissionUsd;
  }
  order.ledgerRecordedAt = order.ledgerRecordedAt || Date.now();
}

function recoverProductOrderFromHistory(state = {}, stores = [], messages = [], options = {}) {
  const orderId = String(options.orderId || "").trim();
  if (!orderId) {
    const error = new Error("orderId is required");
    error.status = 400;
    throw error;
  }
  state.orders = Array.isArray(state.orders) ? state.orders : [];
  const existing = state.orders.find((order) => String(order.id || "") === orderId);
  if (existing) return { order: existing, created: false };

  const relatedMessages = (Array.isArray(messages) ? messages : []).filter((message) => {
    if (String(message.orderId || "") === orderId) return true;
    return JSON.stringify(message || {}).includes(orderId);
  });
  if (!relatedMessages.length) {
    const error = new Error("No history found for order");
    error.status = 404;
    throw error;
  }

  const storeId = String(options.storeId || relatedMessages.find((message) => message.storeId)?.storeId || "").trim();
  const store = stores.find((item) => String(item.id || "") === storeId) || null;
  const clientLogin = String(
    options.login ||
    relatedMessages.find((message) => message.system === "product-dispute")?.fromLogin ||
    relatedMessages.find((message) => !sameLogin(message.fromLogin, "admin") && !sameLogin(message.fromLogin, "cerber-owner"))?.fromLogin ||
    relatedMessages.find((message) => message.toLogin)?.toLogin ||
    ""
  ).trim();
  if (!clientLogin) {
    const error = new Error("Client login could not be inferred");
    error.status = 400;
    throw error;
  }

  const subjectProduct = relatedMessages
    .map((message) => String(message.subject || ""))
    .map((subject) => subject.match(/(?:Dispute|Диспут):\s*(.+)$/i)?.[1] || "")
    .find(Boolean);
  const productName = String(options.product || subjectProduct || "Recovered product").trim();
  const products = Array.isArray(store?.products) ? store.products : [];
  const product = products.find((item) => sameLogin(item.title, productName) || sameLogin(item.id, productName)) || products[0] || {};
  const positions = Array.isArray(product.positions) ? product.positions : [];
  const position = positions.find((item) => sameLogin(item.title, productName)) || positions[0] || {};
  const createdAt = Number(orderId.match(/^order-(\d+)/)?.[1] || 0) || Math.min(...relatedMessages.map((message) => Number(message.createdAt || Date.now())).filter(Boolean));
  const disputeMessage = relatedMessages.find((message) => String(message.system || "").includes("dispute")) || relatedMessages[0] || {};
  const disputeThreadId = String(options.disputeThreadId || relatedMessages.find((message) => message.disputeThreadId)?.disputeThreadId || `dispute-${orderId}-${disputeMessage.createdAt || createdAt}`);
  const disputeNumberMatch = relatedMessages.map((message) => `${message.subject || ""} ${message.body || ""}`).join("\n").match(/#(\d{1,6})/);
  const amountUsd = Number(options.amountUsd || position.priceUsd || product.priceUsd || product.amountUsd || product.price || 0);

  const order = {
    id: orderId,
    type: "product",
    login: clientLogin,
    storeId: storeId || store?.id || "",
    productId: product.id || "",
    positionId: position.id || "",
    product: product.title || productName,
    storeName: store?.name || storeId || "",
    status: "dispute",
    paymentStatus: "paid",
    paymentProvider: "recovered",
    createdAt,
    paidAt: createdAt,
    amountUsd,
    ltcAmount: amountUsd > 0 ? amountUsd / 54.2 : 0,
    location: [position.city, position.district].filter(Boolean).join(", "),
    productDescription: product.description || "",
    reservedDescription: String(options.reservedDescription || position.description || product.description || "").trim(),
    reservedFromPosition: Boolean(position.id),
    reservedStock: false,
    autoReleaseHours: Math.max(0, Number(store?.autoReleaseHours ?? state.ownerSettings?.defaultAutoReleaseHours ?? 24)),
    autoReleaseAt: 0,
    disputeOpen: true,
    disputeThreadId,
    disputeOpenedAt: Number(disputeMessage.createdAt || createdAt),
    disputeChatClosed: false,
    disputeNumber: Number(options.disputeNumber || disputeNumberMatch?.[1] || 0) || disputeNumber({ id: orderId, disputeThreadId }),
    recoveredAt: Date.now(),
    recoveredFromMessages: relatedMessages.map((message) => message.id).filter(Boolean).slice(0, 20)
  };

  applyProductOrderCommission(order, state, store);
  state.orders.unshift(order);
  return { order, created: true };
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
      webhookId: value.webhookId || (token ? mirrorWebhookId(token) : ""),
      webhookUrl: value.webhookUrl || (token ? mirrorWebhookUrl(token) : ""),
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

function adminCollectMirrorBots(state) {
  const mirrors = Array.isArray(state.mirrorBots) ? state.mirrorBots : [];
  return mirrors.map((mirror, index) => {
    const token = String(mirror.token || "");
    const webhookId = mirror.webhookId || (token ? mirrorWebhookId(token) : "");
    const users = mirror.users && typeof mirror.users === "object" ? Object.values(mirror.users) : [];
    const errors = Array.isArray(mirror.telegramErrors) ? mirror.telegramErrors : [];
    const active = mirror.active !== false && mirror.verified !== false && !mirror.blocked;
    const creatorLogin = String(mirror.login || mirror.loginKey || mirror.userId || mirror.ownerId || "").trim();
    const creatorTelegram = mirror.username ? `@${String(mirror.username).replace(/^@/, "")}` : "";
    const creatorName = String(mirror.telegramName || [mirror.firstName, mirror.lastName].filter(Boolean).join(" ") || "").trim();
    const createdAt = Number(mirror.createdAt || mirror.created_at || mirror.registeredAt || 0) || null;
    const updatedAt = Number(mirror.updatedAt || mirror.lastActivityAt || mirror.seenAt || mirror.lastSeenAt || 0) || null;
    return {
      id: mirror.id || webhookId || `mirror-${index + 1}`,
      source: "mirrorBots",
      index,
      userId: mirror.userId || mirror.loginKey || mirror.ownerChatId || "",
      loginKey: mirror.loginKey || "",
      login: mirror.login || "",
      creatorLogin,
      createdByLogin: creatorLogin,
      creatorTelegram,
      createdByTelegram: creatorTelegram,
      createdByTelegramId: String(mirror.ownerTelegramId || mirror.telegramId || mirror.ownerChatId || mirror.chatId || ""),
      createdByLabel: [creatorLogin || "telegram", creatorTelegram || creatorName].filter(Boolean).join(" / "),
      chatId: String(mirror.chatId || mirror.ownerChatId || ""),
      ownerTelegramId: String(mirror.ownerTelegramId || mirror.ownerChatId || mirror.chatId || ""),
      username: mirror.username || "",
      telegramName: creatorName,
      token,
      botUsername: mirror.botUsername || "",
      botName: mirror.botName || "",
      displayName: mirror.botUsername ? `@${mirror.botUsername}` : mirror.botName || mirror.id || webhookId || `mirror-${index + 1}`,
      webhookId,
      webhookUrl: mirror.webhookUrl || (token ? mirrorWebhookUrl(token) : ""),
      createdAt,
      updatedAt,
      lastActivityAt: Number(mirror.lastActivityAt || mirror.updatedAt || 0) || updatedAt,
      status: mirror.blocked ? "blocked" : active ? "active" : "disabled",
      active,
      verified: mirror.verified !== false,
      blocked: Boolean(mirror.blocked),
      webhookOk: Boolean(mirror.webhookOk),
      lastTelegramError: mirror.lastTelegramError || "",
      usersCount: users.length,
      users: users.slice(0, 25).map((user) => ({
        telegramId: String(user.telegramId || ""),
        username: user.username || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        firstSeenAt: user.firstSeenAt || null,
        lastSeenAt: user.lastSeenAt || user.updatedAt || null
      })),
      sentMessagesCount: Number(mirror.sentMessagesCount || 0),
      broadcastsCount: Number(mirror.broadcastsCount || 0),
      telegramErrorsCount: errors.length + Number(mirror.telegramErrorsCount || 0),
      telegramErrors: errors.slice(0, 10).map((error) => ({
        error: error.error || error.message || String(error || ""),
        action: error.action || "",
        createdAt: error.createdAt || null
      })),
      storage: "app_settings.mirrorBots"
    };
  }).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function adminAudienceUsers({ state, profiles, sessions }, filters = {}) {
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const completed = orders.filter(adminIsPaidProductOrder);
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
  const orders = hydrateOrdersDisputeHistory(Array.isArray(state.orders) ? state.orders : [], messages);
  const exchangeRequests = Array.isArray(state.exchangeRequests) ? state.exchangeRequests : [];
  const walletDeposits = Array.isArray(state.walletDeposits) ? state.walletDeposits : [];
  const walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
  const walletWithdrawals = Array.isArray(state.walletWithdrawals) ? state.walletWithdrawals : [];
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const productOrders = orders.filter((order) => order.type === "product" || order.storeId);
  const completedOrders = productOrders.filter(adminIsPaidProductOrder);
  const totalCommissionUsd = completedOrders.reduce((sum, order) => sum + adminPlatformCommission(order, state, storeById.get(order.storeId)), 0);
  const totalStoresNetUsd = completedOrders.reduce((sum, order) => sum + adminStoreNetAmount(order, state, storeById.get(order.storeId)), 0);
  const ownerRequestedUsd = activeWithdrawalUsd(state, "owner");
  const storesRequestedUsd = activeWithdrawalUsd(state, "store");
  const activeOrders = productOrders.filter((order) => {
    const status = String(order.status || "").toLowerCase();
    return ["active", "pending_payment", "processing"].includes(status) || order.disputeOpen || status === "dispute";
  });
  const disputes = [
    ...orders.filter(orderHasDisputeHistory),
    ...exchangeRequests.filter(requestHasDisputeHistory)
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
    const storeCompleted = storeOrders.filter(adminIsPaidProductOrder);
    const storeDisputes = storeOrders.filter(orderHasDisputeHistory);
    const clients = new Set(storeOrders.map((order) => loginKey(order.login)).filter(Boolean));
    const grossRevenue = storeCompleted.reduce((sum, order) => sum + adminOrderAmount(order), 0);
    const commission = storeCompleted.reduce((sum, order) => sum + adminPlatformCommission(order, state, store), 0);
    const revenue = storeCompleted.reduce((sum, order) => sum + adminStoreNetAmount(order, state, store), 0);
    return {
      id: store.id,
      name: store.name || store.tag || store.id,
      status: store.status || "active",
      ownerLogin: store.ownerLogin || "",
      sales: storeCompleted.length,
      grossRevenue,
      revenue,
      commission,
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
      isTop: store.isTop === true,
      isFeatured: store.isFeatured === true,
      isNew: store.isNew === true,
      visibleInCatalog: store.visibleInCatalog !== false,
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
    const userCompleted = userOrders.filter(adminIsPaidProductOrder);
    const userDisputes = userOrders.filter(orderHasDisputeHistory);
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

  const mirrorBotUsers = adminCollectMirrorBots(state);

  return {
    stats: {
      totalSales: completedOrders.length,
      totalTurnover: completedOrders.reduce((sum, order) => sum + adminOrderAmount(order), 0),
      totalCommission: totalCommissionUsd,
      ownerWithdrawableUsd: Math.max(0, totalCommissionUsd - ownerRequestedUsd),
      storesWithdrawableUsd: Math.max(0, totalStoresNetUsd - storesRequestedUsd),
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
      walletWithdrawals,
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
      paymentSettings: {
        ...(state.paymentSettings || {}),
        platformLtcWallet: state.paymentSettings?.platformLtcWallet || mainLtcWallet || ""
      },
      adminSecurity: { login: state.adminSecurity?.login || "admin", hasPassword: Boolean(state.adminSecurity?.passwordHash) },
      supportSettings: normalizeSupportSettings(state.supportSettings)
    },
    supportTickets: Array.isArray(state.supportTickets) ? state.supportTickets.map(supportTicketPublic) : [],
    broadcasts: Array.isArray(state.broadcasts) ? state.broadcasts : [],
    userFilters: Array.isArray(state.userFilters) ? state.userFilters : [],
    bots: {
      total: mirrorBotUsers.length,
      active: mirrorBotUsers.filter((bot) => bot.active && !bot.blocked).length,
      blocked: mirrorBotUsers.filter((bot) => bot.blocked).length,
      users: mirrorBotUsers.reduce((sum, bot) => sum + Number(bot.usersCount || 0), 0),
      sentMessages: mirrorBotUsers.reduce((sum, bot) => sum + Number(bot.sentMessagesCount || 0), 0),
      errors: mirrorBotUsers.reduce((sum, bot) => sum + Number(bot.telegramErrorsCount || 0), 0),
      createdToday: mirrorBotUsers.filter((bot) => adminTimestamp(bot) >= Date.now() - 24 * 60 * 60 * 1000).length,
      items: mirrorBotUsers
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
  await notifySiteUser(state, user.login, {
    id: `notice-wallet-deposit-created-${deposit.id}-${loginKey(user.login)}`,
    eventType: "wallet_deposit_created",
    title: "Счёт пополнения создан",
    body: `Счёт на пополнение ${amountUsd.toFixed(2)} $ создан и ожидает оплату.`
  });
  await saveSettingsState({ ...state, walletDeposits: deposits, walletTransactions });
  return deposit;
}

async function completeProductOrder(order, state, providerPayload = {}) {
  const paidAt = Date.now();
  const wasAlreadyPaid = String(order.paymentStatus || "").toLowerCase() === "paid" || ["active", "completed", "closed", "paid"].includes(String(order.status || "").toLowerCase());
  order.paymentStatus = "paid";
  if (!wasAlreadyPaid) {
    order.status = "active";
    order.paidAt = paidAt;
    order.autoReleaseHours = Math.max(0, Number(order.autoReleaseHours ?? state.ownerSettings?.defaultAutoReleaseHours ?? 24));
    order.autoReleaseAt = paidAt + order.autoReleaseHours * 60 * 60 * 1000;
    delete order.completedAt;
  } else {
    order.paidAt = order.paidAt || paidAt;
    order.autoReleaseHours = Math.max(0, Number(order.autoReleaseHours ?? state.ownerSettings?.defaultAutoReleaseHours ?? 24));
    if (String(order.status || "").toLowerCase() === "active" && !order.autoReleaseAt) {
      order.autoReleaseAt = Number(order.paidAt || paidAt) + order.autoReleaseHours * 60 * 60 * 1000;
    }
  }
  order.paymentProviderPayload = providerPayload;

  if (order.storeId) {
    const { data: row } = await supabase.from("stores").select("data").eq("id", order.storeId).maybeSingle();
    const store = row?.data;
    if (store) {
      applyProductOrderCommission(order, state, store);
      recordProductOrderLedger(order, state, store);
      if (!wasAlreadyPaid) {
        store.orders = Number(store.orders || 0) + 1;
        const product = (store.products || []).find((item) => item.id === order.productId);
        if (product) {
          product.purchases = Number(product.purchases || 0) + 1;
          const position = (product.positions || []).find((item) => item.id === order.positionId);
          if (!order.reservedDescription) {
            const positionItems = Array.isArray(position?.deliveryItems) ? position.deliveryItems : [];
            const productItems = Array.isArray(product.deliveryItems) ? product.deliveryItems : [];
            const fromPosition = positionItems.length > 0;
            const sourceItems = fromPosition ? positionItems : productItems;
            const reservedDescription = sourceItems.shift() || "";
            if (reservedDescription) {
              order.reservedDescription = reservedDescription;
              order.reservedFromPosition = fromPosition;
              order.reservedStock = true;
            }
          }
          if (position && Number(position.stock || 0) > 0 && !order.reservedStock && !order.stockReleasedAt) {
            position.stock = Math.max(0, Number(position.stock || 0) - 1);
            order.stockReleasedAt = Date.now();
          }
        }
        await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
      }
      if (!wasAlreadyPaid) {
        await notifySiteUser(state, order.login, {
          id: `notice-order-paid-${order.id}-${loginKey(order.login)}`,
          eventType: "order_paid",
          orderId: order.id,
          storeId: order.storeId,
          title: "Оплата получена",
          body: `Заказ ${order.product || order.id} оплачен и перешёл в активные.`
        });
        await notifySiteUser(state, store.ownerLogin || "admin", {
          id: `notice-store-order-paid-${order.id}-${loginKey(store.ownerLogin || "admin")}`,
          eventType: "store_order_paid",
          orderId: order.id,
          storeId: order.storeId,
          title: "Новая оплаченная покупка",
          body: `В магазине ${store.name || store.id} оплатили ${order.product || "товар"} на ${Number(order.amountUsd || 0).toFixed(2)} $.`
        });
        if (Number(order.platformCommissionUsd || 0) > 0) {
          await notifySiteUser(state, "admin", {
            id: `notice-owner-commission-${order.id}`,
            eventType: "owner_commission",
            orderId: order.id,
            storeId: order.storeId,
            title: "Начислена комиссия",
            body: `Комиссия с заказа ${order.id}: ${Number(order.platformCommissionUsd || 0).toFixed(2)} $.`
          });
        }
      }
    } else {
      applyProductOrderCommission(order, state, null);
      recordProductOrderLedger(order, state, null);
    }
  } else {
    applyProductOrderCommission(order, state, null);
    recordProductOrderLedger(order, state, null);
  }

  await saveSettingsState(state);
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

  await notifySiteUser(state, deposit.login, {
    id: `notice-wallet-deposit-completed-${deposit.id}-${loginKey(deposit.login)}`,
    eventType: "wallet_deposit_completed",
    title: "Баланс пополнен",
    body: `Пополнение на ${Number(paidLtc || 0).toFixed(8)} LTC подтверждено.`
  });

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

app.post("/api/orders/product/balance", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const storeId = String(req.body.storeId || "").trim();
    const productId = String(req.body.productId || "").trim();
    const positionId = String(req.body.positionId || "").trim();
    const { data: row } = await supabase.from("stores").select("data").eq("id", storeId).maybeSingle();
    const store = row?.data || null;
    if (!store) return res.status(404).json({ error: "Магазин не найден" });
    const status = String(store.status || "active").toLowerCase();
    if (store.salesBlocked || store.is_stopped || ["disabled", "disable", "stopped", "blocked"].includes(status)) {
      return res.status(409).json({ error: "Магазин временно остановлен" });
    }
    const product = (Array.isArray(store.products) ? store.products : []).find((item) => String(item.id) === productId);
    const position = (Array.isArray(product?.positions) ? product.positions : []).find((item) => String(item.id) === positionId);
    if (!product || !position) return res.status(404).json({ error: "Товар не найден" });
    if (Number(position.stock || 0) <= 0) return res.status(409).json({ error: "Товара сейчас нет" });

    const state = await loadSettingsState();
    state.orders = Array.isArray(state.orders) ? state.orders : [];
    state.ltcBalances = state.ltcBalances || {};
    state.walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
    const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
    const ltcAmount = priceUsd / 54.2;
    const balance = Number(state.ltcBalances[user.login] || state.ltcBalances[user.login_key] || 0);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return res.status(400).json({ error: "Цена товара не задана" });
    if (balance + 0.00000001 < ltcAmount) return res.status(400).json({ error: "Недостаточно LTC на балансе" });

    const positionItems = Array.isArray(position.deliveryItems) ? position.deliveryItems : [];
    const productItems = Array.isArray(product.deliveryItems) ? product.deliveryItems : [];
    const fromPosition = positionItems.length > 0;
    const sourceItems = fromPosition ? positionItems : productItems;
    const reservedDescription = sourceItems.length ? sourceItems.shift() : "";
    if (!reservedDescription && (positionItems.length || productItems.length)) {
      return res.status(409).json({ error: "Нет доступных описаний для выдачи" });
    }

    position.stock = Math.max(0, Number(position.stock || 0) - 1);
    product.purchases = Number(product.purchases || 0) + 1;
    store.orders = Number(store.orders || 0) + 1;
    const now = Date.now();
    const order = {
      id: `order-${now}-${crypto.randomBytes(3).toString("hex")}`,
      type: "product",
      login: user.login,
      storeId,
      productId,
      positionId,
      product: product.title || "",
      storeName: store.name || store.id,
      status: "active",
      paymentStatus: "paid",
      paymentProvider: "balance",
      createdAt: now,
      paidAt: now,
      autoReleaseHours: Math.max(0, Number(store.autoReleaseHours ?? state.ownerSettings?.defaultAutoReleaseHours ?? 24)),
      autoReleaseAt: 0,
      amountUsd: priceUsd,
      ltcAmount,
      location: [position.city, position.district].filter(Boolean).join(", "),
      productDescription: product.description || "",
      reservedDescription,
      reservedFromPosition: fromPosition,
      reservedStock: true
    };
    order.autoReleaseAt = now + order.autoReleaseHours * 60 * 60 * 1000;
    applyProductOrderCommission(order, state, store);
    recordProductOrderLedger(order, state, store);
    state.ltcBalances[user.login] = Math.max(0, balance - ltcAmount);
    state.orders.unshift(order);
    state.walletTransactions.unshift({
      id: `tx-${order.id}`,
      login: user.login,
      type: "purchase",
      title: `Покупка: ${order.product}`,
      amountLtc: -ltcAmount,
      amountUsd: -priceUsd,
      coinId: "ltc",
      payCurrency: "ltc",
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      status: "completed"
    });
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await saveOwnerStoreFallback(store);
    await notifySiteUser(state, user.login, {
      id: `notice-order-paid-${order.id}-${loginKey(user.login)}`,
      eventType: "order_paid",
      orderId: order.id,
      storeId,
      title: "Заказ оплачен",
      body: `Заказ ${order.product || order.id} оплачен с баланса и перешёл в активные.`
    });
    await notifySiteUser(state, store.ownerLogin || "admin", {
      id: `notice-store-order-paid-${order.id}-${loginKey(store.ownerLogin || "admin")}`,
      eventType: "store_order_paid",
      orderId: order.id,
      storeId,
      title: "Новая оплаченная покупка",
      body: `В магазине ${store.name || store.id} оплатили ${order.product || "товар"} на ${priceUsd.toFixed(2)} $.`
    });
    if (Number(order.platformCommissionUsd || 0) > 0) {
      await notifySiteUser(state, "admin", {
        id: `notice-owner-commission-${order.id}`,
        eventType: "owner_commission",
        orderId: order.id,
        storeId,
        title: "Начислена комиссия",
        body: `Комиссия с заказа ${order.id}: ${Number(order.platformCommissionUsd || 0).toFixed(2)} $.`
      });
    }
    await saveSettingsState(state);
    notifyRealtime("order_paid", { orderId: order.id, storeId });
    res.json({ order, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/product/deposit", async (req, res, next) => {
  try {
    requireDb();
    if (!nowpaymentsApiKey) return res.status(500).json({ error: "NOWPAYMENTS_API_KEY не настроен на сервере" });
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });

    const storeId = String(req.body.storeId || "").trim();
    const productId = String(req.body.productId || "").trim();
    const positionId = String(req.body.positionId || "").trim();
    const coin = walletCoinFromRequest(req.body);
    const { data: row } = await supabase.from("stores").select("data").eq("id", storeId).maybeSingle();
    const store = row?.data || null;
    if (!store) return res.status(404).json({ error: "Магазин не найден" });
    const status = String(store.status || "active").toLowerCase();
    if (store.salesBlocked || store.is_stopped || ["disabled", "disable", "stopped", "blocked"].includes(status)) {
      return res.status(409).json({ error: "Магазин временно остановлен" });
    }
    const product = (Array.isArray(store.products) ? store.products : []).find((item) => String(item.id) === productId);
    const position = (Array.isArray(product?.positions) ? product.positions : []).find((item) => String(item.id) === positionId);
    if (!product || !position) return res.status(404).json({ error: "Товар не найден" });
    if (Number(position.stock || 0) <= 0) return res.status(409).json({ error: "Товара сейчас нет" });

    const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return res.status(400).json({ error: "Цена товара не задана" });

    const positionItems = Array.isArray(position.deliveryItems) ? position.deliveryItems : [];
    const productItems = Array.isArray(product.deliveryItems) ? product.deliveryItems : [];
    const fromPosition = positionItems.length > 0;
    const sourceItems = fromPosition ? positionItems : productItems;
    const requiresIssuedDescription = sourceItems.length > 0;
    const reservedDescription = sourceItems[0] || "";
    if (requiresIssuedDescription && !reservedDescription) {
      return res.status(409).json({ error: "Нет доступных описаний для выдачи" });
    }

    const state = await loadSettingsState();
    state.orders = Array.isArray(state.orders) ? state.orders : [];
    const now = Date.now();
    const order = {
      id: `order-${now}-${crypto.randomBytes(3).toString("hex")}`,
      type: "product",
      login: user.login,
      storeId,
      productId,
      positionId,
      product: product.title || "",
      storeName: store.name || store.id,
      status: "pending_payment",
      paymentStatus: "waiting",
      paymentProvider: "nowpayments",
      createdAt: now,
      paymentExpiresAt: now + walletDepositTtlMs,
      autoReleaseHours: Math.max(0, Number(store.autoReleaseHours ?? state.ownerSettings?.defaultAutoReleaseHours ?? 24)),
      autoReleaseAt: 0,
      amountUsd: priceUsd,
      ltcAmount: priceUsd / 54.2,
      coinId: coin.id,
      payCurrency: coin.payCurrency,
      sellerWallet: coin.id === "ltc" ? String(store.ltcWallet || "") : String(store.wallets?.[coin.id] || ""),
      location: [position.city, position.district].filter(Boolean).join(", "),
      productDescription: product.description || "",
      reservedDescription: "",
      reservedFromPosition: fromPosition,
      reservedStock: false
    };
    applyProductOrderCommission(order, state, store);

    const payment = await createNowpaymentsWalletPayment({
      price_amount: priceUsd,
      price_currency: "usd",
      pay_currency: coin.payCurrency,
      order_id: order.id,
      order_description: `${order.product || "CERBER order"} / ${order.storeName || ""}`,
      ipn_callback_url: `${publicBaseUrl}/api/payments/nowpayments/ipn`
    });

    order.paymentId = payment.payment_id || payment.id || "";
    order.payAddress = payment.pay_address || payment.address || "";
    order.payAmount = Number(payment.pay_amount || 0);
    order.paymentUrl = payment.payment_url || payment.invoice_url || "";
    order.paymentStatus = payment.payment_status || "waiting";
    order.walletDepositAmountUsd = priceUsd;
    order.walletDepositAmountLtc = order.payAmount || order.ltcAmount;
    order.walletDepositAddress = order.payAddress || "";
    order.walletDepositPaymentUrl = order.paymentUrl || "";
    order.paymentProviderPayload = {
      paymentId: order.paymentId,
      payAddress: order.payAddress,
      payAmount: order.payAmount,
      payCurrency: coin.payCurrency,
      coinId: coin.id,
      paymentUrl: order.paymentUrl
    };

    if (requiresIssuedDescription) {
      order.reservedDescription = sourceItems.shift() || "";
      order.reservedStock = Boolean(order.reservedDescription);
    }
    position.stock = Math.max(0, Number(position.stock || 0) - 1);
    state.orders.unshift(order);
    await notifySiteUser(state, user.login, {
      id: `notice-order-created-${order.id}-${loginKey(user.login)}`,
      eventType: "order_created",
      orderId: order.id,
      storeId,
      title: "Счёт создан",
      body: `Счёт на оплату ${order.product || "товара"} создан. Заказ ожидает оплату.`
    });
    await notifySiteUser(state, store.ownerLogin || "admin", {
      id: `notice-store-order-created-${order.id}-${loginKey(store.ownerLogin || "admin")}`,
      eventType: "store_order_created",
      orderId: order.id,
      storeId,
      title: "Новый заказ ожидает оплату",
      body: `Клиент ${user.login} создал заказ ${order.product || order.id} в магазине ${store.name || store.id}.`
    });
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await saveOwnerStoreFallback(store);
    await saveSettingsState(state);
    notifyRealtime("order_created", { orderId: order.id, storeId });
    res.json({ order, paymentUrl: order.paymentUrl, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

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

    const coin = walletCoinFromRequest({ coinId: order.coinId || "ltc", payCurrency: order.payCurrency || "" });
    const invoicePayload = {
      price_amount: Number(order.amountUsd || 0),
      price_currency: "usd",
      pay_currency: coin.payCurrency,
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
    order.coinId = coin.id;
    order.payCurrency = coin.payCurrency;
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

app.post("/api/wallet/withdrawals", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });

    const kind = String(req.body.kind || "ltc_withdraw").trim();
    if (kind !== "ltc_withdraw") return res.status(400).json({ error: "Неизвестный тип вывода" });

    const amountLtc = Number(req.body.amountLtc || 0);
    const address = String(req.body.address || "").trim();
    const note = String(req.body.note || "").trim().slice(0, 500);
    if (!Number.isFinite(amountLtc) || amountLtc <= 0) return res.status(400).json({ error: "Укажите сумму LTC" });
    if (!address || address.length < 12) return res.status(400).json({ error: "Укажите LTC адрес" });

    const state = await loadSettingsState();
    state.ltcBalances = state.ltcBalances || {};
    state.walletWithdrawals = Array.isArray(state.walletWithdrawals) ? state.walletWithdrawals : [];
    state.walletTransactions = Array.isArray(state.walletTransactions) ? state.walletTransactions : [];
    const balance = Number(state.ltcBalances[user.login] || state.ltcBalances[user.login_key] || 0);
    if (amountLtc > balance) return res.status(400).json({ error: "Недостаточно LTC для вывода" });

    const request = {
      id: `withdraw-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      kind,
      login: user.login,
      loginKey: user.login_key,
      amountLtc,
      amountUsd: amountLtc * 54.2,
      coinId: "ltc",
      payCurrency: "ltc",
      address,
      note,
      status: "pending",
      provider: "manual",
      createdAt: Date.now(),
      date: new Date().toLocaleString("ru-RU")
    };

    state.ltcBalances[user.login] = Math.max(0, balance - amountLtc);
    state.walletWithdrawals.unshift(request);
    state.walletTransactions.unshift({
      id: `tx-${request.id}`,
      login: user.login,
      type: "withdrawal",
      title: "Вывод LTC",
      amountLtc: -amountLtc,
      amountUsd: -request.amountUsd,
      coinId: "ltc",
      payCurrency: "ltc",
      address,
      createdAt: request.createdAt,
      date: request.date,
      status: "processing"
    });
    await notifySiteUser(state, user.login, {
      id: `notice-wallet-withdrawal-${request.id}-${loginKey(user.login)}`,
      eventType: "wallet_withdrawal_requested",
      withdrawalId: request.id,
      title: "Заявка на вывод создана",
      body: `Запрошен вывод ${amountLtc.toFixed(8)} LTC на ${address}.`
    });
    await notifySiteUser(state, "admin", {
      id: `notice-admin-wallet-withdrawal-${request.id}`,
      eventType: "wallet_withdrawal_requested",
      withdrawalId: request.id,
      title: "Пользователь запросил вывод",
      body: `${user.login}: ${amountLtc.toFixed(8)} LTC на ${address}.`
    });
    await saveSettingsState(state);
    notifyRealtime("wallet_withdrawal_created", { id: request.id, login: user.login, kind });
    res.json({ withdrawal: request, ...(await stateFor(user)) });
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

function botMirrorOnlyKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Создать зеркало", callback_data: "mirror:help" }]
    ]
  };
}

function botMirrorHelpText() {
  return [
    "<b>Создание зеркала CERBER</b>",
    "1. Создайте нового бота в @BotFather.",
    "2. Скопируйте API token.",
    "3. Отправьте сюда команду:",
    "<code>/mirror 123456:ABCDEF...</code>",
    "",
    "После сохранения откройте созданного бота. В зеркале будет полное меню сайта."
  ].join("\n");
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

function telegramTokenFromState(state) {
  return state?.__telegramToken || telegramBotToken;
}

function mirrorWebhookId(token) {
  return crypto.createHmac("sha256", adminSecret()).update(String(token || "")).digest("hex").slice(0, 24);
}

function mirrorWebhookUrl(token) {
  return `${publicBaseUrl}/api/telegram/mirror/${mirrorWebhookId(token)}`;
}

async function telegramApi(method, payload = {}, tokenOverride = "") {
  const token = tokenOverride || telegramBotToken;
  if (!token) {
    const error = new Error("TELEGRAM_BOT_TOKEN не настроен");
    error.status = 500;
    throw error;
  }
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

function initSiteNotifyBotState(state) {
  state.siteNotifyBot = state.siteNotifyBot || {};
  state.siteNotifyBot.users = state.siteNotifyBot.users || {};
  state.siteNotifyBot.sentMessages = state.siteNotifyBot.sentMessages || {};
  return state.siteNotifyBot;
}

function siteNotifyWebhookUrl() {
  return `${publicBaseUrl}/api/site-notify-bot/webhook`;
}

async function siteNotifyBotApi(method, payload = {}) {
  if (!siteNotifyBotToken) {
    const error = new Error("SITE_NOTIFY_BOT_TOKEN is not configured");
    error.status = 500;
    throw error;
  }
  return telegramTokenApi(siteNotifyBotToken, method, payload);
}

async function siteNotifySendMessage(chatId, text) {
  return siteNotifyBotApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

function siteNotifyHelpText() {
  return [
    "<b>Бот уведомлений CERBER</b>",
    "",
    "Войдите в аккаунт сайта:",
    "<code>/login ваш_логин ваш_пароль</code>",
    "",
    "После входа бот будет писать сюда, когда на сайте появится новое личное сообщение.",
    "",
    "Команды:",
    "/status - проверить привязку",
    "/logout - отключить уведомления"
  ].join("\n");
}

async function siteNotifyHandleLogin(state, chatId, telegramUser, text) {
  const parts = String(text || "").trim().split(/\s+/);
  if (parts.length < 3) {
    await siteNotifySendMessage(chatId, "Формат входа:\n<code>/login логин пароль</code>");
    return;
  }
  const key = loginKey(parts[1]);
  const password = parts.slice(2).join(" ");
  const { data: user } = await supabase.from("profiles").select("*").eq("login_key", key).maybeSingle();
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await siteNotifySendMessage(chatId, "Неверный логин или пароль.");
    return;
  }
  const botState = initSiteNotifyBotState(state);
  botState.users[String(chatId)] = {
    chatId: String(chatId),
    telegramId: String(telegramUser?.id || chatId),
    username: String(telegramUser?.username || ""),
    firstName: String(telegramUser?.first_name || ""),
    lastName: String(telegramUser?.last_name || ""),
    login: user.login,
    loginKey: user.login_key,
    enabled: true,
    linkedAt: Date.now(),
    updatedAt: Date.now()
  };
  await siteNotifySendMessage(chatId, `Вход выполнен: <b>${botHtml(user.login)}</b>.\nТеперь сюда будут приходить уведомления о новых сообщениях на сайте.`);
}

async function siteNotifyHandleMessage(state, message) {
  const chatId = message?.chat?.id;
  if (!chatId || !message.from || message.from.is_bot) return;
  const text = String(message.text || "").trim();
  const botState = initSiteNotifyBotState(state);
  const chatKey = String(chatId);
  const linked = botState.users[chatKey];

  if (text === "/start" || text === "/help") {
    await siteNotifySendMessage(chatId, siteNotifyHelpText());
    return;
  }
  if (text.startsWith("/login")) {
    await siteNotifyHandleLogin(state, chatId, message.from, text);
    return;
  }
  if (text === "/logout") {
    delete botState.users[chatKey];
    await siteNotifySendMessage(chatId, "Уведомления отключены. Чтобы включить снова, отправьте /login логин пароль.");
    return;
  }
  if (text === "/status") {
    if (linked?.enabled && linked.login) {
      await siteNotifySendMessage(chatId, `Уведомления включены для аккаунта <b>${botHtml(linked.login)}</b>.`);
    } else {
      await siteNotifySendMessage(chatId, "Аккаунт не привязан.\nОтправьте: <code>/login логин пароль</code>");
    }
    return;
  }
  await siteNotifySendMessage(chatId, linked?.enabled ? "Бот активен. Новые сообщения с сайта будут приходить сюда." : siteNotifyHelpText());
}

async function siteNotifyEnsureWebhook() {
  if (!siteNotifyBotToken) return;
  await siteNotifyBotApi("setMyCommands", {
    commands: [
      { command: "login", description: "Войти в аккаунт сайта" },
      { command: "status", description: "Проверить привязку" },
      { command: "logout", description: "Отключить уведомления" },
      { command: "help", description: "Помощь" }
    ]
  }).catch((error) => console.error("Site notify setMyCommands error", error));
  await siteNotifyBotApi("setWebhook", {
    url: siteNotifyWebhookUrl(),
    ...(telegramWebhookSecret ? { secret_token: telegramWebhookSecret } : {})
  }).catch((error) => console.error("Site notify setWebhook error", error));
}

async function siteNotifyDeliverPrivateMessage(message = {}) {
  if (!siteNotifyBotToken || !message?.toLogin) return;
  if (message.fromLogin && sameLogin(message.fromLogin, message.toLogin)) return;
  const state = await loadSettingsState();
  const botState = initSiteNotifyBotState(state);
  const recipients = Object.values(botState.users || {}).filter((item) => (
    item?.enabled &&
    item?.chatId &&
    (sameLogin(item.login, message.toLogin) || sameLogin(item.loginKey, message.toLogin))
  ));
  if (!recipients.length) return;

  const sentKeyBase = String(message.id || `${message.toLogin}:${message.createdAt || Date.now()}`);
  const text = [
    "<b>У вас на сайте есть новое сообщение!</b>",
    message.fromLogin ? `От: <b>${botHtml(message.fromLogin)}</b>` : "",
    "",
    "Откройте сайт, чтобы прочитать и ответить."
  ].filter(Boolean).join("\n");

  let changed = false;
  for (const recipient of recipients) {
    const sentKey = `${recipient.chatId}:${sentKeyBase}`;
    if (botState.sentMessages[sentKey]) continue;
    await siteNotifySendMessage(recipient.chatId, text);
    botState.sentMessages[sentKey] = Date.now();
    changed = true;
  }

  if (changed) {
    const entries = Object.entries(botState.sentMessages).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0, 1000);
    botState.sentMessages = Object.fromEntries(entries);
    await saveSettingsState(state);
  }
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
  const result = await telegramApi("sendMessage", payload, telegramTokenFromState(state));
  const messageId = result?.result?.message_id;
  if (messageId) {
    const botState = initTelegramBotState(state);
    const key = String(chatId);
    botState.sentMessages[key] = botState.sentMessages[key] || [];
    botState.sentMessages[key].push(messageId);
    botState.sentMessages[key] = botState.sentMessages[key].slice(-80);
    if (state.__mirrorId && Array.isArray(state.mirrorBots)) {
      const mirror = state.mirrorBots.find((item) => item.id === state.__mirrorId || item.webhookId === state.__mirrorId);
      if (mirror) {
        mirror.sentMessagesCount = Number(mirror.sentMessagesCount || 0) + 1;
        mirror.lastActivityAt = Date.now();
        mirror.updatedAt = Date.now();
      }
    }
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
    }, telegramTokenFromState(state));
  } catch {
    await botSendMessage(state, chatId, text, replyMarkup);
  }
}

async function botAnswer(callback, text = "", tokenOverride = "") {
  if (!callback?.id) return;
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callback.id,
    text,
    show_alert: false
  }, tokenOverride || callback.__telegramToken || "").catch(() => {});
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
  const orderDisputes = productOrders.filter(orderHasDisputeHistory);
  const exchangeDisputes = exchangeRequests.filter(requestHasDisputeHistory);
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
    await telegramApi("deleteMessage", { chat_id: chatId, message_id: messageId }, telegramTokenFromState(state)).catch(() => {});
  }
  delete botState.sentMessages[key];
  delete botState.users[key];
  await saveSettingsState(state);
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "История очищена. Связка с аккаунтом удалена. Для полного удаления самого бота удалите чат в Telegram.",
    disable_web_page_preview: true
  }, telegramTokenFromState(state)).catch(() => {});
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
  const ownerUsername = message.from?.username || chat.username || "";
  const ownerName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim();
  const ownerLoginKey = chat.loginKey || loginKey(ownerUsername || ownerName || String(chatId));
  const ownerLogin = chat.login || ownerUsername || ownerName || String(chatId);
  const ownerTelegramId = String(message.from?.id || chatId);
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    await botSendMessage(state, chatId, "Отправьте токен зеркала так:\n<code>/mirror 123456:ABCDEF...</code>", botMirrorOnlyKeyboard());
    return true;
  }
  try {
    const info = await telegramTokenApi(token, "getMe");
    const bot = info?.result || {};
    state.mirrorBots = Array.isArray(state.mirrorBots) ? state.mirrorBots : [];
    const existing = state.mirrorBots.find((item) => String(item.token || "") === token || String(item.chatId || "") === String(chatId));
    const mirror = existing || {};
    mirror.id = mirror.id || `mirror-${crypto.createHash("sha1").update(token).digest("hex").slice(0, 12)}`;
    mirror.chatId = String(chatId);
    mirror.ownerChatId = String(chatId);
    mirror.ownerTelegramId = ownerTelegramId;
    mirror.token = token;
    mirror.userId = ownerLoginKey;
    mirror.loginKey = ownerLoginKey;
    mirror.login = ownerLogin;
    mirror.username = ownerUsername;
    mirror.telegramName = ownerName;
    mirror.botUsername = bot.username || "";
    mirror.botName = bot.first_name || bot.username || "";
    mirror.webhookId = mirrorWebhookId(token);
    mirror.webhookUrl = mirrorWebhookUrl(token);
    mirror.verified = true;
    mirror.active = true;
    mirror.blocked = false;
    mirror.status = "active";
    mirror.createdAt = mirror.createdAt || Date.now();
    mirror.updatedAt = Date.now();
    mirror.lastActivityAt = Date.now();
    mirror.lastTelegramError = "";
    await telegramTokenApi(token, "setWebhook", {
      url: mirror.webhookUrl,
      ...(telegramWebhookSecret ? { secret_token: telegramWebhookSecret } : {})
    });
    const webhookInfo = await telegramTokenApi(token, "getWebhookInfo");
    mirror.webhookOk = Boolean(webhookInfo?.result?.url);
    mirror.lastTelegramError = webhookInfo?.result?.last_error_message || "";
    mirror.users = mirror.users && typeof mirror.users === "object" ? mirror.users : {};
    mirror.users[String(chatId)] = {
      chatId: String(chatId),
      telegramId: ownerTelegramId,
      username: ownerUsername,
      firstName: message.from?.first_name || "",
      lastName: message.from?.last_name || "",
      firstSeenAt: mirror.users[String(chatId)]?.firstSeenAt || Date.now(),
      lastSeenAt: Date.now()
    };
    if (!existing) state.mirrorBots.unshift(mirror);
    console.log("[mirror-bot] created", {
      id: mirror.id,
      userId: ownerLoginKey,
      chatId: String(chatId),
      botUsername: mirror.botUsername,
      webhookId: mirror.webhookId,
      webhookOk: mirror.webhookOk
    });
    state.adminLogs = Array.isArray(state.adminLogs) ? state.adminLogs : [];
    state.adminLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: "mirror_bot_created",
      actor: ownerLogin || ownerLoginKey || "telegram",
      details: {
        id: mirror.token ? `mirror-${crypto.createHash("sha1").update(mirror.token).digest("hex").slice(0, 10)}` : String(chatId),
        userId: ownerLoginKey,
        ownerId: ownerLoginKey,
        chatId: String(chatId),
        ownerTelegramId,
        username: mirror.username,
        botUsername: mirror.botUsername,
        webhookId: mirror.webhookId,
        webhookOk: mirror.webhookOk,
        status: "active",
        storage: "app_settings.mirrorBots"
      },
      createdAt: Date.now()
    });
    state.adminLogs = state.adminLogs.slice(0, 500);
    await appendAdminLog("mirror_bot_created", ownerLogin || ownerLoginKey || "telegram", {
      id: mirror.token ? `mirror-${crypto.createHash("sha1").update(mirror.token).digest("hex").slice(0, 10)}` : String(chatId),
      userId: ownerLoginKey,
      ownerId: ownerLoginKey,
      chatId: String(chatId),
      ownerTelegramId,
      username: mirror.username,
      botUsername: mirror.botUsername,
      webhookId: mirror.webhookId,
      webhookOk: mirror.webhookOk,
      status: "active",
      storage: "app_settings.mirrorBots"
    });
    await botSendMessage(state, chatId, `Зеркало сохранено: @${botHtml(mirror.botUsername || mirror.botName || "bot")}\n\nОткройте его в Telegram: там будет полное меню CERBER.`, botMirrorOnlyKeyboard()).catch(() => {});
  } catch (error) {
    console.error("[mirror-bot] create failed", {
      userId: ownerLoginKey || "",
      chatId: String(chatId),
      error: String(error.message || error).slice(0, 300)
    });
    state.adminLogs = Array.isArray(state.adminLogs) ? state.adminLogs : [];
    state.adminLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: "mirror_bot_error",
      actor: ownerLogin || ownerLoginKey || "telegram",
      details: {
        userId: ownerLoginKey || "",
        chatId: String(chatId),
        error: String(error.message || error).slice(0, 300),
        storage: "app_settings.mirrorBots"
      },
      createdAt: Date.now()
    });
    state.adminLogs = state.adminLogs.slice(0, 500);
    await appendAdminLog("mirror_bot_error", ownerLogin || ownerLoginKey || "telegram", {
      userId: ownerLoginKey || "",
      chatId: String(chatId),
      error: String(error.message || error).slice(0, 300),
      storage: "app_settings.mirrorBots"
    }).catch(() => {});
    await botSendMessage(state, chatId, `Не удалось проверить токен зеркала: ${botHtml(error.message || error)}`, botMirrorOnlyKeyboard()).catch(() => {});
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

async function handleTelegramMirrorOnlyCallback(state, callback) {
  const chatId = callback.message?.chat?.id;
  if (!chatId) return;
  const chat = telegramChatState(state, chatId);
  chat.pendingMirrorToken = true;
  chat.username = callback.from?.username || chat.username || "";
  chat.updatedAt = Date.now();
  await botAnswer(callback);
  await botEditOrSend(state, callback, "Отправьте токен вашего Telegram-бота от BotFather.\n\nПример:\n<code>123456:ABCDEF...</code>", botMirrorOnlyKeyboard());
}

async function handleTelegramMirrorOnlyMessage(state, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const text = String(message.text || "").trim();
  const chat = telegramChatState(state, chatId);
  chat.username = message.from?.username || chat.username || "";
  chat.updatedAt = Date.now();
  if (text === "/start") {
    chat.pendingMirrorToken = false;
    await botSendMessage(state, chatId, botMirrorHelpText(), botMirrorOnlyKeyboard());
    return;
  }
  if (/^\/(?:mirror|addmirror)\b/i.test(text) || chat.pendingMirrorToken || /^\d+:[A-Za-z0-9_-]{20,}$/.test(text)) {
    chat.pendingMirrorToken = false;
    await handleBotMirrorCommand(state, chatId, message, /^\/(?:mirror|addmirror)\b/i.test(text) ? text : `/mirror ${text}`);
    return;
  }
  await botSendMessage(state, chatId, botMirrorHelpText(), botMirrorOnlyKeyboard());
}

function findMirrorBotByWebhookId(state, webhookId) {
  const mirrors = Array.isArray(state.mirrorBots) ? state.mirrorBots : [];
  return mirrors.find((mirror) => {
    const token = String(mirror?.token || "");
    return String(mirror?.webhookId || "") === String(webhookId) || (token && mirrorWebhookId(token) === String(webhookId));
  }) || null;
}

app.get("/api/telegram/webhook", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(telegramBotToken),
    webhook: `${publicBaseUrl}/api/telegram/webhook`
  });
});

app.get("/api/site-notify-bot/webhook", async (_req, res) => {
  await siteNotifyEnsureWebhook().catch(() => {});
  res.json({
    ok: true,
    configured: Boolean(siteNotifyBotToken),
    webhook: siteNotifyWebhookUrl()
  });
});

app.post("/api/site-notify-bot/webhook", async (req, res, next) => {
  try {
    requireDb();
    if (!siteNotifyBotToken) return res.status(500).json({ error: "SITE_NOTIFY_BOT_TOKEN is not configured" });
    if (telegramWebhookSecret && req.headers["x-telegram-bot-api-secret-token"] !== telegramWebhookSecret) {
      return res.status(401).json({ error: "Bad Telegram secret" });
    }
    const state = await loadSettingsState();
    if (req.body?.message) await siteNotifyHandleMessage(state, req.body.message);
    await saveSettingsState(state);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/telegram/webhook", async (req, res, next) => {
  try {
    requireDb();
    if (!telegramBotToken) return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN не настроен" });
    if (telegramWebhookSecret && req.headers["x-telegram-bot-api-secret-token"] !== telegramWebhookSecret) {
      return res.status(401).json({ error: "Bad Telegram secret" });
    }
    const state = await loadSettingsState();
    if (req.body.callback_query) await handleTelegramMirrorOnlyCallback(state, req.body.callback_query);
    else if (req.body.message) await handleTelegramMirrorOnlyMessage(state, req.body.message);
    await saveSettingsState(state);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/telegram/mirror/:webhookId", async (req, res, next) => {
  try {
    requireDb();
    if (telegramWebhookSecret && req.headers["x-telegram-bot-api-secret-token"] !== telegramWebhookSecret) {
      return res.status(401).json({ error: "Bad Telegram secret" });
    }
    const state = await loadSettingsState();
    const mirror = findMirrorBotByWebhookId(state, req.params.webhookId);
    if (!mirror?.token || mirror.blocked) return res.status(404).json({ error: "Mirror bot not found" });
    state.__telegramToken = mirror.token;
    state.__mirrorId = mirror.id || mirror.webhookId || req.params.webhookId;
    mirror.users = mirror.users && typeof mirror.users === "object" ? mirror.users : {};
    const incomingUser = req.body.message?.from || req.body.callback_query?.from || {};
    const incomingChatId = req.body.message?.chat?.id || req.body.callback_query?.message?.chat?.id || incomingUser.id;
    if (incomingChatId) {
      const userKey = String(incomingChatId);
      mirror.users[userKey] = {
        ...(mirror.users[userKey] || {}),
        chatId: userKey,
        telegramId: String(incomingUser.id || incomingChatId),
        username: incomingUser.username || mirror.users[userKey]?.username || "",
        firstName: incomingUser.first_name || mirror.users[userKey]?.firstName || "",
        lastName: incomingUser.last_name || mirror.users[userKey]?.lastName || "",
        firstSeenAt: mirror.users[userKey]?.firstSeenAt || Date.now(),
        lastSeenAt: Date.now()
      };
    }
    mirror.lastActivityAt = Date.now();
    mirror.updatedAt = Date.now();
    try {
      if (req.body.callback_query) {
        req.body.callback_query.__telegramToken = mirror.token;
        await handleTelegramCallback(state, req.body.callback_query);
      }
      else if (req.body.message) await handleTelegramMessage(state, req.body.message);
    } catch (error) {
      const errorText = String(error.message || error).slice(0, 300);
      mirror.lastTelegramError = errorText;
      mirror.telegramErrors = Array.isArray(mirror.telegramErrors) ? mirror.telegramErrors : [];
      mirror.telegramErrors.unshift({ error: errorText, createdAt: Date.now(), action: "webhook_update" });
      mirror.telegramErrors = mirror.telegramErrors.slice(0, 50);
      mirror.telegramErrorsCount = Number(mirror.telegramErrorsCount || 0) + 1;
      mirror.webhookOk = false;
    } finally {
      delete state.__telegramToken;
      delete state.__mirrorId;
    }
    await saveSettingsState(state);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:id/complete", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const state = await loadSettingsState();
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const order = orders.find((item) => item.id === req.params.id && item.type === "product");
    if (!order || !sameLogin(order.login, user.login)) return res.status(404).json({ error: "Заказ не найден" });
    if (order.disputeOpen || String(order.status || "").toLowerCase() === "dispute") {
      return res.status(409).json({ error: "Нельзя завершить заказ с открытым диспутом" });
    }
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
      return res.status(400).json({ error: "Заказ ещё не оплачен" });
    }
    order.status = "completed";
    order.paymentStatus = "paid";
    order.completedAt = Date.now();
    order.closedAt = order.completedAt;
    order.closeReason = "Завершено клиентом";
    const store = await loadStoreWithFallback(order.storeId);
    await ensureProductOrderSettlement(state, order, store);
    await notifySiteUser(state, user.login, {
      id: `notice-order-completed-${order.id}-${loginKey(user.login)}`,
      eventType: "order_completed",
      orderId: order.id,
      storeId: order.storeId,
      title: "Заказ завершён",
      body: `Заказ ${order.product || order.id} завершён.`
    });
    await notifySiteUser(state, store?.ownerLogin || "admin", {
      id: `notice-store-order-completed-${order.id}-${loginKey(store?.ownerLogin || "admin")}`,
      eventType: "store_order_completed",
      orderId: order.id,
      storeId: order.storeId,
      title: "Заказ завершён",
      body: `Клиент ${user.login} завершил заказ ${order.product || order.id}.`
    });
    await saveSettingsState({ ...state, orders });
    notifyRealtime("order_completed", { orderId: order.id, storeId: order.storeId });
    res.json({ order, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:id/review", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const state = await loadSettingsState();
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const order = orders.find((item) => item.id === req.params.id && item.type === "product");
    if (!order || !sameLogin(order.login, user.login)) return res.status(404).json({ error: "Заказ не найден" });
    if (!["completed", "closed"].includes(String(order.status || "").toLowerCase())) {
      return res.status(400).json({ error: "Отзыв можно оставить после завершения сделки" });
    }
    if (order.reviewLeft) return res.status(409).json({ error: "Отзыв уже оставлен" });
    const text = String(req.body.text || "").trim();
    const rating = Math.max(1, Math.min(5, Number(req.body.rating || 5)));
    if (!text) return res.status(400).json({ error: "Напишите отзыв" });
    const { data: row } = await supabase.from("stores").select("data").eq("id", order.storeId).maybeSingle();
    const store = row?.data || await loadStoreWithFallback(order.storeId);
    if (!store) return res.status(404).json({ error: "Магазин не найден" });
    const review = {
      id: `review-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      orderId: order.id,
      productId: order.productId || "",
      positionId: order.positionId || "",
      login: user.login,
      serviceDate: new Date().toLocaleDateString("ru-RU"),
      rating,
      product: order.product || "Товар",
      text,
      createdAt: Date.now()
    };
    store.reviewsList = [review, ...(Array.isArray(store.reviewsList) ? store.reviewsList : [])];
    store.reviews = Number(store.reviews || 0) + 1;
    store.rating = ((Number(store.rating || 5) * (store.reviews - 1)) + rating) / store.reviews;
    const product = (Array.isArray(store.products) ? store.products : []).find((item) => String(item.id || "") === String(order.productId || ""));
    if (product) {
      product.reviewsList = [review, ...(Array.isArray(product.reviewsList) ? product.reviewsList : [])];
      product.reviews = Number(product.reviews || 0) + 1;
      product.rating = ((Number(product.rating || 5) * (product.reviews - 1)) + rating) / product.reviews;
    }
    order.reviewLeft = true;
    order.reviewId = review.id;
    await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    await saveOwnerStoreFallback(store);
    await saveSettingsState({ ...state, orders });
    notifyRealtime("order_review_created", { orderId: order.id, storeId: order.storeId });
    res.json({ review, order, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:id/dispute/open", async (req, res, next) => {
  try {
    requireDb();
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Сессия не найдена" });
    const state = await loadSettingsState();
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const order = orders.find((item) => item.id === req.params.id && item.type === "product");
    if (!order || !sameLogin(order.login, user.login)) return res.status(404).json({ error: "Заказ не найден" });
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") return res.status(400).json({ error: "Заказ ещё не оплачен" });
    if (["completed", "closed", "canceled"].includes(String(order.status || "").toLowerCase()) && !order.disputeOpen) {
      return res.status(400).json({ error: "Диспут по этому заказу уже нельзя открыть" });
    }
    const store = await loadStoreWithFallback(order.storeId);
    if (!store) return res.status(404).json({ error: "Магазин не найден" });
    const now = Date.now();
    const threadId = order.disputeThreadId || `dispute-${order.id}-${now}`;
    const publicNumber = ensureDisputeNumber(state, order);
    order.status = "dispute";
    order.disputeOpen = true;
    order.disputeOpenedAt = order.disputeOpenedAt || now;
    order.disputeThreadId = threadId;
    order.disputeChatClosed = false;
    order.disputeUntil = now + 24 * 60 * 60 * 1000;
    await notifySiteUser(state, store.ownerLogin || "admin", {
      id: `notice-store-dispute-opened-${order.id}-${loginKey(store.ownerLogin || "admin")}`,
      eventType: "store_dispute_opened",
      orderId: order.id,
      storeId: order.storeId,
      title: "Открыт диспут",
      body: `Клиент ${user.login} открыл диспут #${publicNumber} по заказу ${order.product || order.id}.`
    });
    await notifySiteUser(state, "admin", {
      id: `notice-admin-dispute-opened-${order.id}`,
      eventType: "admin_dispute_opened",
      orderId: order.id,
      storeId: order.storeId,
      title: "Открыт диспут",
      body: `Диспут #${publicNumber}: ${user.login}, магазин ${store.name || order.storeName || order.storeId}.`
    });
    await saveSettingsState({ ...state, orders });
    const intro = "Напишите ваше обращение скоро мы решим вашу проблемы, отправьте фото с места и видео, напишите номер заказа!";
    await upsertPrivateMessage({
      id: `${threadId}-intro`,
      storeId: order.storeId,
      storeTag: store.name || order.storeName || order.storeId,
      toLogin: store.ownerLogin || "admin",
      fromLogin: user.login,
      subject: `Диспут #${publicNumber} по заказу ${order.id}`,
      body: `${intro}\n\nЗаказ: ${order.id}\nТовар: ${order.product || "-"}\nМагазин: ${store.name || order.storeName || "-"}`,
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      system: "product-dispute",
      orderId: order.id,
      disputeThreadId: threadId
    });
    notifyRealtime("dispute_opened", { orderId: order.id, storeId: order.storeId, threadId });
    res.json({ order, disputePeer: store.ownerLogin || "admin", disputeNumber: publicNumber, ...(await stateFor(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/store-admin/disputes/:id/join", async (req, res, next) => {
  try {
    requireDb();
    const token = verifySellerAdminToken(req);
    if (!token) return res.status(401).json({ error: "Нет доступа" });
    if (!sellerTokenCanAccess(token, "disputes")) return sellerForbidden(res);
    const state = await loadSettingsState();
    const messages = (await supabase.from("messages").select("data").order("created_at", { ascending: false }).limit(1000)).data || [];
    const order = hydrateOrdersDisputeHistory(
      Array.isArray(state.orders) ? state.orders : [],
      messages.map((row) => row.data)
    ).find((item) => item.id === req.params.id && item.type === "product");
    if (!order || String(order.storeId || "") !== String(token.storeId || "")) return res.status(404).json({ error: "Диспут не найден" });
    const store = await loadStoreWithFallback(token.storeId);
    const now = Date.now();
    const threadId = order.disputeThreadId || `dispute-${order.id}-${now}`;
    const publicNumber = ensureDisputeNumber(state, order);
    order.status = order.disputeChatClosed ? (order.status || "completed") : "dispute";
    order.disputeOpen = !order.disputeChatClosed;
    order.disputeThreadId = threadId;
    state.orders = (Array.isArray(state.orders) ? state.orders : []).map((item) => item.id === order.id ? { ...item, ...order } : item);
    await saveSettingsState(state);
    await upsertPrivateMessage({
      id: `${threadId}-shop-join-${now}`,
      storeId: order.storeId,
      storeTag: store?.name || order.storeName || order.storeId,
      toLogin: order.login,
      fromLogin: store?.ownerLogin || store?.id || "store",
      subject: `Диспут #${publicNumber} по заказу ${order.id}`,
      body: `В чат диспута зашёл магазин ${store?.name || order.storeName || order.storeId}.`,
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      system: "product-dispute-join",
      orderId: order.id,
      disputeThreadId: threadId
    });
    notifyRealtime("dispute_joined", { orderId: order.id, storeId: order.storeId });
    res.json({ order, ...(await stateForStoreAdmin(token.storeId, token)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/store-admin/disputes/:id/reply", async (req, res, next) => {
  try {
    requireDb();
    const token = verifySellerAdminToken(req);
    if (!token) return res.status(401).json({ error: "Нет доступа" });
    if (!sellerTokenCanAccess(token, "disputes")) return sellerForbidden(res);
    const state = await loadSettingsState();
    const messages = (await supabase.from("messages").select("data").order("created_at", { ascending: false }).limit(1000)).data || [];
    const order = hydrateOrdersDisputeHistory(
      Array.isArray(state.orders) ? state.orders : [],
      messages.map((row) => row.data)
    ).find((item) => item.id === req.params.id && item.type === "product");
    if (!order || String(order.storeId || "") !== String(token.storeId || "")) return res.status(404).json({ error: "Диспут не найден" });
    if (order.disputeChatClosed || order.disputeOpen === false) return res.status(409).json({ error: "Диспут закрыт" });
    const body = String(req.body.body || "").trim();
    const attachments = normalizeSupportAttachments(req.body.attachments, 4);
    if (!body && !attachments.length) return res.status(400).json({ error: "Введите сообщение или прикрепите файл" });
    const store = await loadStoreWithFallback(token.storeId);
    const now = Date.now();
    await upsertPrivateMessage({
      id: `dispute-reply-${order.id}-${now}-${crypto.randomBytes(3).toString("hex")}`,
      storeId: order.storeId,
      storeTag: store?.name || order.storeName || order.storeId,
      toLogin: order.login,
      fromLogin: store?.ownerLogin || store?.id || "store",
      subject: `Диспут #${disputeNumber(order)} по заказу ${order.id}`,
      body,
      attachments,
      createdAt: now,
      date: new Date(now).toLocaleString("ru-RU"),
      system: "product-dispute-reply",
      orderId: order.id,
      disputeThreadId: order.disputeThreadId || `dispute-${order.id}`
    });
    await notifySiteUser(state, order.login, {
      id: `notice-dispute-reply-${order.id}-${now}-${loginKey(order.login)}`,
      eventType: "dispute_reply",
      orderId: order.id,
      storeId: order.storeId,
      title: "Новое сообщение в диспуте",
      body: `Магазин ответил по диспуту заказа ${order.product || order.id}.`
    });
    await saveSettingsState(state);
    notifyRealtime("dispute_replied", { orderId: order.id, storeId: order.storeId });
    res.json({ order, ...(await stateForStoreAdmin(token.storeId, token)) });
  } catch (error) {
    next(error);
  }
});


const proverkaTimers = new Map();
const proverkaLevels = [
  {
    "level": 1,
    "messages": 10,
    "title": "Чистый Нулевой"
  },
  {
    "level": 2,
    "messages": 50,
    "title": "Мутный Малой"
  },
  {
    "level": 3,
    "messages": 100,
    "title": "Подъездный Призрак"
  },
  {
    "level": 4,
    "messages": 200,
    "title": "Синий Ник"
  },
  {
    "level": 5,
    "messages": 300,
    "title": "Ломанный Тип"
  },
  {
    "level": 6,
    "messages": 450,
    "title": "Тихий Торч"
  },
  {
    "level": 7,
    "messages": 600,
    "title": "Дымный Связной"
  },
  {
    "level": 8,
    "messages": 800,
    "title": "Кривой Курьер"
  },
  {
    "level": 9,
    "messages": 1000,
    "title": "Пакетный Бродяга"
  },
  {
    "level": 10,
    "messages": 1250,
    "title": "Грязный Резидент"
  },
  {
    "level": 11,
    "messages": 1500,
    "title": "Токсичный Игрок"
  },
  {
    "level": 12,
    "messages": 1800,
    "title": "Районный Угар"
  },
  {
    "level": 13,
    "messages": 2100,
    "title": "Подвальный Движ"
  },
  {
    "level": 14,
    "messages": 2500,
    "title": "Мутный Авторитет"
  },
  {
    "level": 15,
    "messages": 3000,
    "title": "Чёрный Приход"
  },
  {
    "level": 16,
    "messages": 3500,
    "title": "Сломанный Барон"
  },
  {
    "level": 17,
    "messages": 4000,
    "title": "Хозяин Дыма"
  },
  {
    "level": 18,
    "messages": 4600,
    "title": "Король Ломки"
  },
  {
    "level": 19,
    "messages": 5200,
    "title": "Легенда Подъезда"
  },
  {
    "level": 20,
    "messages": 6000,
    "title": "Бог Мутного Движа"
  },
  {
    "level": 21,
    "messages": 6800,
    "title": "Туманный Гость"
  },
  {
    "level": 22,
    "messages": 7600,
    "title": "Пыльный Малой"
  },
  {
    "level": 23,
    "messages": 8500,
    "title": "Дворовый Шум"
  },
  {
    "level": 24,
    "messages": 9500,
    "title": "Сбитый Ник"
  },
  {
    "level": 25,
    "messages": 10500,
    "title": "Кривой Сосед"
  },
  {
    "level": 26,
    "messages": 11600,
    "title": "Подвальный Пассажир"
  },
  {
    "level": 27,
    "messages": 12700,
    "title": "Дымный Ходок"
  },
  {
    "level": 28,
    "messages": 13900,
    "title": "Мутный Бегунок"
  },
  {
    "level": 29,
    "messages": 15100,
    "title": "Пакетный След"
  },
  {
    "level": 30,
    "messages": 16500,
    "title": "Грязный Свидетель"
  },
  {
    "level": 31,
    "messages": 17900,
    "title": "Синий Бродяга"
  },
  {
    "level": 32,
    "messages": 19400,
    "title": "Токсичный Наблюдатель"
  },
  {
    "level": 33,
    "messages": 20900,
    "title": "Ломанный Связной"
  },
  {
    "level": 34,
    "messages": 22500,
    "title": "Районный Фантом"
  },
  {
    "level": 35,
    "messages": 24200,
    "title": "Подъездный Смотрящий"
  },
  {
    "level": 36,
    "messages": 25900,
    "title": "Дымный Резидент"
  },
  {
    "level": 37,
    "messages": 27700,
    "title": "Кривой Авторитет"
  },
  {
    "level": 38,
    "messages": 29600,
    "title": "Мутный Делец"
  },
  {
    "level": 39,
    "messages": 31500,
    "title": "Грязный Куратор"
  },
  {
    "level": 40,
    "messages": 33500,
    "title": "Чёрный Сосед"
  },
  {
    "level": 41,
    "messages": 35600,
    "title": "Тихий Угар"
  },
  {
    "level": 42,
    "messages": 37700,
    "title": "Пыльный Связной"
  },
  {
    "level": 43,
    "messages": 39900,
    "title": "Подвальный Волк"
  },
  {
    "level": 44,
    "messages": 42200,
    "title": "Ломанный Фантом"
  },
  {
    "level": 45,
    "messages": 44500,
    "title": "Синий Смотрящий"
  },
  {
    "level": 46,
    "messages": 46900,
    "title": "Дымный Авторитет"
  },
  {
    "level": 47,
    "messages": 49400,
    "title": "Мутный Куратор"
  },
  {
    "level": 48,
    "messages": 51900,
    "title": "Грязный Барон"
  },
  {
    "level": 49,
    "messages": 54500,
    "title": "Районный Барон"
  },
  {
    "level": 50,
    "messages": 57200,
    "title": "Чёрный Барон"
  },
  {
    "level": 51,
    "messages": 60000,
    "title": "Подъездный Барон"
  },
  {
    "level": 52,
    "messages": 62900,
    "title": "Токсичный Барон"
  },
  {
    "level": 53,
    "messages": 65900,
    "title": "Ломанный Барон Двора"
  },
  {
    "level": 54,
    "messages": 69000,
    "title": "Барон Тёмного Угла"
  },
  {
    "level": 55,
    "messages": 72200,
    "title": "Барон Грязного Движа"
  },
  {
    "level": 56,
    "messages": 75500,
    "title": "Хозяин Подъезда"
  },
  {
    "level": 57,
    "messages": 78900,
    "title": "Хозяин Района"
  },
  {
    "level": 58,
    "messages": 82400,
    "title": "Хозяин Подвала"
  },
  {
    "level": 59,
    "messages": 86000,
    "title": "Хозяин Тумана"
  },
  {
    "level": 60,
    "messages": 89700,
    "title": "Хозяин Мутки"
  },
  {
    "level": 61,
    "messages": 93500,
    "title": "Дымный Магистр"
  },
  {
    "level": 62,
    "messages": 97400,
    "title": "Пыльный Магистр"
  },
  {
    "level": 63,
    "messages": 101400,
    "title": "Синий Магистр"
  },
  {
    "level": 64,
    "messages": 105500,
    "title": "Кривой Магистр"
  },
  {
    "level": 65,
    "messages": 109700,
    "title": "Токсичный Магистр"
  },
  {
    "level": 66,
    "messages": 114000,
    "title": "Магистр Подъезда"
  },
  {
    "level": 67,
    "messages": 118400,
    "title": "Магистр Дыма"
  },
  {
    "level": 68,
    "messages": 122900,
    "title": "Магистр Ломки"
  },
  {
    "level": 69,
    "messages": 127500,
    "title": "Магистр Района"
  },
  {
    "level": 70,
    "messages": 132200,
    "title": "Чёрный Магистр"
  },
  {
    "level": 71,
    "messages": 137000,
    "title": "Смотрящий Тумана"
  },
  {
    "level": 72,
    "messages": 141900,
    "title": "Смотрящий Дыма"
  },
  {
    "level": 73,
    "messages": 146900,
    "title": "Смотрящий Подвала"
  },
  {
    "level": 74,
    "messages": 152000,
    "title": "Смотрящий Района"
  },
  {
    "level": 75,
    "messages": 157200,
    "title": "Смотрящий Мутного Движа"
  },
  {
    "level": 76,
    "messages": 162500,
    "title": "Князь Подъезда"
  },
  {
    "level": 77,
    "messages": 167900,
    "title": "Князь Тумана"
  },
  {
    "level": 78,
    "messages": 173400,
    "title": "Князь Дыма"
  },
  {
    "level": 79,
    "messages": 179000,
    "title": "Князь Ломки"
  },
  {
    "level": 80,
    "messages": 184700,
    "title": "Чёрный Князь"
  },
  {
    "level": 81,
    "messages": 190500,
    "title": "Лорд Подвала"
  },
  {
    "level": 82,
    "messages": 196400,
    "title": "Лорд Районного Угара"
  },
  {
    "level": 83,
    "messages": 202400,
    "title": "Лорд Грязного Дыма"
  },
  {
    "level": 84,
    "messages": 208500,
    "title": "Лорд Токсичного Движа"
  },
  {
    "level": 85,
    "messages": 214700,
    "title": "Лорд Мутного Подъезда"
  },
  {
    "level": 86,
    "messages": 221000,
    "title": "Король Подвала"
  },
  {
    "level": 87,
    "messages": 227400,
    "title": "Король Тумана"
  },
  {
    "level": 88,
    "messages": 233900,
    "title": "Король Дыма"
  },
  {
    "level": 89,
    "messages": 240500,
    "title": "Король Района"
  },
  {
    "level": 90,
    "messages": 247200,
    "title": "Чёрный Король Движа"
  },
  {
    "level": 91,
    "messages": 254000,
    "title": "Монарх Подъезда"
  },
  {
    "level": 92,
    "messages": 260900,
    "title": "Монарх Подвала"
  },
  {
    "level": 93,
    "messages": 267900,
    "title": "Монарх Токсичного Тумана"
  },
  {
    "level": 94,
    "messages": 275000,
    "title": "Монарх Грязного Района"
  },
  {
    "level": 95,
    "messages": 282200,
    "title": "Чёрный Монарх"
  },
  {
    "level": 96,
    "messages": 289500,
    "title": "Легенда Дыма"
  },
  {
    "level": 97,
    "messages": 296900,
    "title": "Легенда Ломки"
  },
  {
    "level": 98,
    "messages": 304400,
    "title": "Легенда Грязного Подвала"
  },
  {
    "level": 99,
    "messages": 312000,
    "title": "Абсолют Мутного Движа"
  },
  {
    "level": 100,
    "messages": 320000,
    "title": "Бог Грязного Подъезда"
  }
];
proverkaLevels.forEach((level) => { level.title = `LVL ${level.level}`; });
const proverkaDefaultSettings = {
  reputation_enabled: true,
  levels_enabled: true,
  stats_enabled: true,
  reputation_notifications: true,
  max_stats_users: 30,
  count_commands_as_messages: false,
  count_plus_minus_as_messages: false,
  duplicate_message_window_ms: 10000
};
const proverkaHelpText = [
  "👋 Привет! Я бот для розыгрышей, таймеров, репутации и уровней.",
  "",
  "✅ Меня можно добавлять в группы и чаты. Бот считает активность, выдаёт уровни и показывает топ участников.",
  "",
  "📌 Команды:",
  "/proverka - случайное число от 1 до 999",
  "/krut номер - случайный номер от 1 до указанного числа",
  "/timer минуты - таймер на указанное время",
  "/timeroff - остановить таймер",
  "/timekrut номер минуты - номер + таймер одной командой",
  "/stats - топ-30, уровни, сообщения и репутация",
  "/statusday - кто сколько сообщений написал сегодня",
  "",
  "⭐ Репутация:",
  "Ответь + на чужое сообщение, чтобы дать +1 репутации.",
  "Ответь - на чужое сообщение, чтобы снять 1 репутацию."
].join("\n");

const proverkaCommands = [
  { command: "proverka", description: "Случайное число от 1 до 999" },
  { command: "krut", description: "Случайный номер до указанного числа" },
  { command: "timer", description: "Запустить таймер в минутах" },
  { command: "timeroff", description: "Остановить таймер" },
  { command: "timekrut", description: "Случайный номер и таймер" },
  { command: "stats", description: "Статистика и топ чата" },
  { command: "stat", description: "Статистика и топ чата" },
  { command: "statusday", description: "Сообщения за сегодня" },
  { command: "help", description: "Показать помощь" }
];
let proverkaCommandsSynced = false;
let proverkaCommandsNextSyncAt = 0;
let proverkaStateCache = null;
let proverkaStateLoadPromise = null;
let proverkaStateSaveTimer = null;
let proverkaStateSaveInFlight = false;
let proverkaStateDirty = false;

function proverkaHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '\"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function proverkaCommand(message) {
  const text = String(message?.text || "").trim();
  if (!text.startsWith("/")) return { command: "", args: [] };
  const parts = text.split(/\s+/);
  return {
    command: parts[0].split("@", 1)[0].toLowerCase(),
    args: parts.slice(1)
  };
}

function proverkaPositiveInt(value) {
  if (!/^\d+$/.test(String(value || ""))) return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function proverkaVoteValue(text) {
  const value = String(text || "").trim();
  if (["+", "＋", "➕", "👍", "👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿"].includes(value)) return 1;
  if (["-", "−", "—", "➖", "👎", "👎🏻", "👎🏼", "👎🏽", "👎🏾", "👎🏿"].includes(value)) return -1;
  return 0;
}

function proverkaReplyTarget(message) {
  return message?.reply_to_message?.message_id || message?.message_id || undefined;
}

function proverkaUserName(user) {
  const first = String(user?.first_name || "").trim();
  const last = String(user?.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ") || user?.username || String(user?.id || "user");
}

function proverkaMentionFromStats(user) {
  if (user?.username) return `@${proverkaHtml(user.username)}`;
  return proverkaHtml(user?.display_name || user?.user_id || "user");
}

function proverkaLevelForMessages(totalMessages) {
  let current = { level: 0, messages: 0, title: "LVL 0" };
  for (const level of proverkaLevels) {
    if (Number(totalMessages || 0) >= level.messages) current = level;
    else break;
  }
  return current;
}

function proverkaNextLevel(currentLevel) {
  return proverkaLevels.find((item) => item.level > Number(currentLevel || 0)) || null;
}

function proverkaInitStats(state) {
  state.proverkaBot = state.proverkaBot && typeof state.proverkaBot === "object" ? state.proverkaBot : {};
  state.proverkaBot.users = state.proverkaBot.users && typeof state.proverkaBot.users === "object" ? state.proverkaBot.users : {};
  state.proverkaBot.votes = state.proverkaBot.votes && typeof state.proverkaBot.votes === "object" ? state.proverkaBot.votes : {};
  state.proverkaBot.flood = state.proverkaBot.flood && typeof state.proverkaBot.flood === "object" ? state.proverkaBot.flood : {};
  state.proverkaBot.settings = { ...proverkaDefaultSettings, ...(state.proverkaBot.settings || {}) };
  state.proverkaBot.settings.reputation_notifications = true;
  return state.proverkaBot;
}

async function proverkaLoadState() {
  if (proverkaStateCache) return { proverkaBot: proverkaStateCache };
  if (!proverkaStateLoadPromise) {
    proverkaStateLoadPromise = supabase.from("app_settings").select("data").eq("id", "main").maybeSingle()
      .then(({ data }) => {
        proverkaStateCache = data?.data?.proverkaBot && typeof data.data.proverkaBot === "object"
          ? data.data.proverkaBot
          : {};
        return { proverkaBot: proverkaStateCache };
      })
      .finally(() => {
        proverkaStateLoadPromise = null;
      });
  }
  return proverkaStateLoadPromise;
}

async function proverkaFlushState() {
  if (!proverkaStateCache || proverkaStateSaveInFlight || !proverkaStateDirty) return;
  proverkaStateSaveInFlight = true;
  proverkaStateDirty = false;
  try {
    const { data: currentSettings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const currentData = currentSettings?.data || {};
    await supabase.from("app_settings").upsert({
      id: "main",
      data: { ...currentData, proverkaBot: proverkaStateCache }
    }, { onConflict: "id" });
  } catch (error) {
    proverkaStateDirty = true;
    console.error("Proverka stats save error", error);
  } finally {
    proverkaStateSaveInFlight = false;
    if (proverkaStateDirty) proverkaScheduleSave(10000);
  }
}

function proverkaScheduleSave(delayMs = 2500) {
  proverkaStateDirty = true;
  if (proverkaStateSaveTimer) clearTimeout(proverkaStateSaveTimer);
  proverkaStateSaveTimer = setTimeout(() => {
    proverkaStateSaveTimer = null;
    proverkaFlushState().catch((error) => console.error("Proverka stats flush error", error));
  }, delayMs);
  if (typeof proverkaStateSaveTimer.unref === "function") proverkaStateSaveTimer.unref();
}

function proverkaDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function proverkaEnsureDayStats(stats, chatId, date = new Date()) {
  stats.day = stats.day && typeof stats.day === "object" ? stats.day : {};
  const today = proverkaDayKey(date);
  if (stats.day.date !== today) {
    stats.day = { date: today, chats: {} };
  }
  stats.day.chats = stats.day.chats && typeof stats.day.chats === "object" ? stats.day.chats : {};
  const key = String(chatId);
  stats.day.chats[key] = stats.day.chats[key] && typeof stats.day.chats[key] === "object" ? stats.day.chats[key] : {};
  return stats.day.chats[key];
}

function proverkaUserKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function proverkaVoteKey(chatId, messageId, voterId) {
  return `${chatId}:${messageId}:${voterId}`;
}

function proverkaEnsureUser(stats, chatId, telegramUser) {
  const userId = String(telegramUser?.id || "");
  if (!userId) return null;
  const key = proverkaUserKey(chatId, userId);
  const now = new Date().toISOString();
  const old = stats.users[key] || {};
  const totalMessages = Number(old.total_messages || 0);
  const level = proverkaLevelForMessages(totalMessages);
  const user = {
    user_id: userId,
    username: String(telegramUser?.username || old.username || ""),
    display_name: proverkaUserName(telegramUser) || old.display_name || userId,
    chat_id: String(chatId),
    reputation: Number(old.reputation || 0),
    total_messages: totalMessages,
    current_level: level.level,
    created_at: old.created_at || now,
    updated_at: now
  };
  stats.users[key] = user;
  return user;
}

async function proverkaTelegramApi(method, payload = {}) {
  if (!proverkaBotToken) {
    const error = new Error("PROVERKA_BOT_TOKEN is not configured");
    error.status = 500;
    throw error;
  }
  const response = await fetch(`https://api.telegram.org/bot${proverkaBotToken}/${method}`, {
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

async function proverkaSendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (options.replyToMessageId) {
    payload.reply_to_message_id = options.replyToMessageId;
    payload.allow_sending_without_reply = true;
  }
  return proverkaTelegramApi("sendMessage", payload);
}

async function proverkaEnsureCommands() {
  if (!proverkaBotToken || proverkaCommandsSynced || Date.now() < proverkaCommandsNextSyncAt) return;
  await proverkaTelegramApi("setMyCommands", { commands: proverkaCommands }).then(() => {
    proverkaCommandsSynced = true;
  }).catch((error) => {
    const retryAfter = Number(String(error.message || "").match(/retry after (\d+)/i)?.[1] || 900);
    proverkaCommandsNextSyncAt = Date.now() + retryAfter * 1000;
    console.error("Proverka setMyCommands error", error);
  });
}

function proverkaStartTimer(chatId, minutes, replyToMessageId) {
  const key = String(chatId);
  const oldTimer = proverkaTimers.get(key);
  if (oldTimer) clearTimeout(oldTimer);
  const timer = setTimeout(() => {
    proverkaTimers.delete(key);
    proverkaSendMessage(chatId, "⚠️ Время истекло!", { replyToMessageId }).catch((error) => {
      console.error("Proverka timer send error", error);
    });
  }, minutes * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  proverkaTimers.set(key, timer);
}

async function proverkaStopTimer(chatId) {
  const key = String(chatId);
  const timer = proverkaTimers.get(key);
  if (timer) clearTimeout(timer);
  proverkaTimers.delete(key);
  await proverkaSendMessage(chatId, "⏸️ Таймер приостановлен.");
}

async function proverkaProcessReputation(stats, message) {
  const chatId = message?.chat?.id;
  const voter = message?.from;
  const targetMessage = message?.reply_to_message;
  const value = proverkaVoteValue(message?.text);
  if (!value) return false;
  if (!chatId || !voter?.id || !targetMessage?.message_id || !targetMessage?.from?.id) {
    await proverkaSendMessage(chatId, "ℹ️ Чтобы изменить репутацию, ответь + или - на сообщение другого участника.", { replyToMessageId: message?.message_id });
    return true;
  }
  if (targetMessage.from.is_bot) return true;
  if (String(voter.id) === String(targetMessage.from.id)) {
    await proverkaSendMessage(chatId, "ℹ️ Себе репутацию ставить нельзя.", { replyToMessageId: message?.message_id });
    return true;
  }

  const target = proverkaEnsureUser(stats, chatId, targetMessage.from);
  proverkaEnsureUser(stats, chatId, voter);
  if (!target) return true;

  const key = proverkaVoteKey(chatId, targetMessage.message_id, voter.id);
  const oldVote = stats.votes[key];
  if (oldVote && Number(oldVote.vote_value) === value) return true;
  if (oldVote?.changed_once) return true;

  const delta = value - Number(oldVote?.vote_value || 0);
  target.reputation = Number(target.reputation || 0) + delta;
  target.updated_at = new Date().toISOString();
  stats.votes[key] = {
    chat_id: String(chatId),
    target_message_id: String(targetMessage.message_id),
    target_user_id: String(targetMessage.from.id),
    voter_user_id: String(voter.id),
    vote_value: value,
    changed_once: Boolean(oldVote),
    created_at: oldVote?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (stats.settings.reputation_notifications) {
    const voterStats = proverkaEnsureUser(stats, chatId, voter);
    const sign = value > 0 ? "+1" : "-1";
    await proverkaSendMessage(
      chatId,
      `⭐ ${proverkaMentionFromStats(target)} получил ${sign} к репутации от ${proverkaMentionFromStats(voterStats)}. Текущая репутация: ${target.reputation >= 0 ? "+" : ""}${target.reputation}`,
      { replyToMessageId: targetMessage.message_id }
    );
  }
  return true;
}

function proverkaShouldCountMessage(stats, message) {
  if (!message?.from?.id || message.from.is_bot) return false;
  const text = String(message.text || "").trim();
  if (text.startsWith("/") && !stats.settings.count_commands_as_messages) return false;
  if (proverkaVoteValue(text) && !stats.settings.count_plus_minus_as_messages) return false;
  return true;
}

function proverkaCountDayMessage(stats, message) {
  const user = proverkaEnsureUser(stats, message.chat.id, message.from);
  if (!user) return;
  const chatDay = proverkaEnsureDayStats(stats, message.chat.id);
  const key = String(user.user_id);
  const old = chatDay[key] || {};
  chatDay[key] = {
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name,
    chat_id: String(message.chat.id),
    count: Number(old.count || 0) + 1,
    updated_at: new Date().toISOString()
  };
}

async function proverkaCountMessage(stats, message) {
  const user = proverkaEnsureUser(stats, message.chat.id, message.from);
  if (!user) return;
  const previousMessages = Number(user.total_messages || 0);
  const oldLevel = proverkaLevelForMessages(previousMessages);
  user.total_messages = previousMessages + 1;
  proverkaCountDayMessage(stats, message);
  const newLevel = proverkaLevelForMessages(user.total_messages);
  user.current_level = newLevel.level;
  user.updated_at = new Date().toISOString();

  if (stats.settings.levels_enabled && newLevel.level > oldLevel.level) {
    const who = proverkaMentionFromStats(user);
    await proverkaSendMessage(
      message.chat.id,
      `${who}, новый уровень: <b>${proverkaHtml(newLevel.title)}</b>!`
    );
  }
}

function proverkaDayStatsText(stats, chatId) {
  const chatDay = proverkaEnsureDayStats(stats, chatId);
  const rows = Object.values(chatDay || {})
    .map((item) => ({ ...item, count: Number(item.count || 0) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || String(a.display_name || "").localeCompare(String(b.display_name || "")))
    .slice(0, 30);

  const date = stats.day?.date || proverkaDayKey();
  const lines = ["<b>Статистика за день: топ-30</b>", "<b>Дата:</b> " + proverkaHtml(date), ""];
  if (!rows.length) {
    lines.push("Сегодня сообщений пока нет.");
    return lines.join("\n");
  }

  rows.forEach((user, index) => {
    lines.push((index + 1) + ". " + proverkaMentionFromStats(user) + " — <b>" + user.count + "</b> сообщений");
  });
  return lines.join("\n");
}

function proverkaStatsText(stats, chatId, requester) {
  const users = Object.values(stats.users || {})
    .filter((user) => String(user.chat_id) === String(chatId))
    .sort((a, b) => (
      proverkaLevelForMessages(b.total_messages || 0).level - proverkaLevelForMessages(a.total_messages || 0).level ||
      Number(b.total_messages || 0) - Number(a.total_messages || 0) ||
      Number(b.reputation || 0) - Number(a.reputation || 0)
    ))
    .slice(0, Number(stats.settings.max_stats_users || 30));

  const lines = ["📊 <b>Статистика чата</b>", "", `<b>Топ-${stats.settings.max_stats_users || 30} пользователей:</b>`];
  if (!users.length) lines.push("Пока нет статистики. Напишите несколько обычных сообщений, и бот начнёт считать активность.");
  users.forEach((user, index) => {
    const level = proverkaLevelForMessages(user.total_messages || 0);
    const rep = Number(user.reputation || 0);
    lines.push(`${index + 1}. ${proverkaMentionFromStats(user)} — ${proverkaHtml(level.title)} | сообщений: ${user.total_messages || 0} | репутация: ${rep >= 0 ? "+" : ""}${rep}`);
  });

  const requesterStats = requester?.id ? proverkaEnsureUser(stats, chatId, requester) : null;
  if (requesterStats) {
    const level = proverkaLevelForMessages(requesterStats.total_messages || 0);
    const rep = Number(requesterStats.reputation || 0);
    lines.push("", "<b>Твоя статистика:</b>");
    lines.push(`Уровень: ${proverkaHtml(level.title)}`);
    lines.push(`Сообщений: ${requesterStats.total_messages || 0}`);
    lines.push(`Репутация: ${rep >= 0 ? "+" : ""}${rep}`);
  }
  return lines.join("\n");
}

async function handleProverkaMessage(state, message) {
  const chatId = message?.chat?.id;
  if (!chatId || !message.from || message.from.is_bot) return;
  const stats = proverkaInitStats(state);
  const { command, args } = proverkaCommand(message);

  if (command === "/start" || command === "/help") {
    await proverkaSendMessage(chatId, proverkaHelpText);
    return;
  }

  if (["/stats", "/stat", "/стат", "/стата", "/статистика"].includes(command)) {
    if (!stats.settings.stats_enabled) return;
    await proverkaSendMessage(chatId, proverkaStatsText(stats, chatId, message.from));
    return;
  }

  if (command === "/statusday") {
    await proverkaSendMessage(chatId, proverkaDayStatsText(stats, chatId));
    return;
  }

  if (command === "/proverka") {
    const number = Math.floor(Math.random() * 999) + 1;
    await proverkaSendMessage(chatId, `🎲 Выпало число <b>${number}</b>.`);
    return;
  }

  if (command === "/krut") {
    const limit = args.length === 1 ? proverkaPositiveInt(args[0]) : 0;
    if (!limit) {
      await proverkaSendMessage(chatId, "ℹ️ Напиши так: /krut номер");
      return;
    }
    const number = Math.floor(Math.random() * limit) + 1;
    await proverkaSendMessage(chatId, `🎯 Выпал номер <b>${number}</b>.`);
    return;
  }

  if (command === "/timer") {
    const minutes = args.length === 1 ? proverkaPositiveInt(args[0]) : 0;
    if (!minutes) {
      await proverkaSendMessage(chatId, "ℹ️ Напиши так: /timer время_в_минутах");
      return;
    }
    proverkaStartTimer(chatId, minutes, proverkaReplyTarget(message));
    await proverkaSendMessage(chatId, `⏱️ Таймер запущен на <b>${minutes}</b> минут.`);
    return;
  }

  if (command === "/timeroff") {
    await proverkaStopTimer(chatId);
    return;
  }

  if (command === "/timekrut") {
    const limit = args.length === 2 ? proverkaPositiveInt(args[0]) : 0;
    const minutes = args.length === 2 ? proverkaPositiveInt(args[1]) : 0;
    if (!limit || !minutes) {
      await proverkaSendMessage(chatId, "ℹ️ Напиши так: /timekrut номер время_в_минутах");
      return;
    }
    const number = Math.floor(Math.random() * limit) + 1;
    proverkaStartTimer(chatId, minutes, proverkaReplyTarget(message));
    await proverkaSendMessage(chatId, `🎯 Выпал номер <b>${number}</b>. ⏱️ Таймер запущен на <b>${minutes}</b> минут!`);
    return;
  }

  const text = String(message.text || "").trim();
  if (proverkaVoteValue(text) && stats.settings.reputation_enabled) {
    await proverkaProcessReputation(stats, message);
    return;
  }

  if (proverkaShouldCountMessage(stats, message)) {
    await proverkaCountMessage(stats, message);
  }
}

app.get("/api/proverka-bot/webhook", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(proverkaBotToken),
    webhook: `${publicBaseUrl}/api/proverka-bot/webhook`
  });
});

app.post("/api/proverka-bot/webhook", async (req, res, next) => {
  try {
    requireDb();
    if (!proverkaBotToken) return res.status(500).json({ error: "PROVERKA_BOT_TOKEN is not configured" });
    if (req.body?.message) {
      const message = req.body.message;
      Promise.resolve().then(async () => {
        await proverkaEnsureCommands();
        const state = await proverkaLoadState();
        await handleProverkaMessage(state, message);
        proverkaScheduleSave();
      }).catch((error) => {
        console.error("Proverka background processing error", error);
      });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Proverka webhook error", error);
    res.json({ ok: true });
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
  siteNotifyEnsureWebhook().catch((error) => console.error("Site notify webhook setup error", error));
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

publicRealtimeServer = new WebSocketServer({ server, path: "/api/realtime" });
publicRealtimeServer.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "connected", createdAt: Date.now() }));
});
