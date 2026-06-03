import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

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

async function handleTelegramMessage(state, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const text = String(message.text || "").trim();
  const chat = telegramChatState(state, chatId);
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

app.listen(port, () => {
  console.log(`CERBER server listening on ${port}`);
});
