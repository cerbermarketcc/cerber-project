import crypto from "node:crypto";
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

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for persistent storage.");
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

const defaultStore = {
  id: "skboy",
  tag: "@skboy",
  ownerLogin: "skboy",
  name: "Солёный Мальчик",
  short: "SK BOY это семья",
  description: "",
  ltcWallet: "ltc1qnl73w78t8v39kkjqd5jgr2y8a62g4mh4rhu6lu",
  image: "assets/soleniy-malchik.jpg",
  cover: "assets/soleniy-malchik.jpg",
  orders: 0,
  reviews: 1,
  rating: 5,
  products: [{
    id: "courier-work",
    title: "Подработка",
    category: "Работа / Курьер",
    description: "",
    price: "50$",
    priceUsd: 50,
    image: "assets/soleniy-malchik.jpg",
    images: ["assets/soleniy-malchik.jpg"],
    rating: 5,
    reviews: 1,
    purchases: 0,
    positions: [{
      id: "courier-chisinau",
      title: "Подработка",
      description: "",
      priceUsd: 50,
      country: "moldova",
      city: "chisinau",
      district: "",
      deliveryType: "Курьер",
      stock: 1,
      status: "ready"
    }],
    reviewsList: []
  }],
  reviewsList: []
};

const defaultExchangeCards = [{
  id: "kent-ltc",
  name: "KENT LTC",
  ownerLogin: "skboy",
  description: "По всей Молдове. Выберите обмен или обнал, укажите сумму в долларах или LTC, реквизиты и отправьте заявку оператору.",
  image: "assets/kent-ltc-card.png",
  regions: ["moldova"],
  exchangeRate: 19,
  cashoutRate: 17,
  ltcUsd: 54.2,
  ltcWallet: "ltc1qrj4ca4m2r0njnf97xtsvmtl9472z9zquc5aszh",
  requisites: [
    { method: "Мия", value: "60327998", active: true },
    { method: "RunPay", value: "60327998", active: true },
    { method: "BPay", value: "60327998", active: true }
  ],
  active: true
}];

app.use(express.json({ limit: "25mb" }));
app.use(express.static(__dirname));

function loginKey(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUser(row) {
  return row ? { login: row.login, name: row.name, role: row.role } : null;
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
  const { count } = await supabase.from("profiles").select("login_key", { count: "exact", head: true });
  if (count && count > 0) return;

  const adminHash = await bcrypt.hash("admin", 12);
  const sellerHash = await bcrypt.hash("123", 12);
  await supabase.from("profiles").upsert([
    { login: "admin", login_key: "admin", password_hash: adminHash, name: "Admin", role: "admin" },
    { login: "skboy", login_key: "skboy", password_hash: sellerHash, name: "SK BOY", role: "seller" }
  ], { onConflict: "login_key" });

  await supabase.from("stores").upsert({ id: defaultStore.id, data: defaultStore }, { onConflict: "id" });
  await supabase.from("app_settings").upsert({
    id: "main",
    data: {
      theme: "light",
      lang: "ru",
      orders: [],
      exchangeCards: defaultExchangeCards,
      exchangeRequests: [],
      referrals: [],
      referralPayments: [],
      referralCodes: {},
      balances: {},
      ltcBalances: {},
      paymentSettings: {
        provider: "nowpayments",
        payBaseUrl: "",
        platformCommissionPercent: 0,
        platformLtcWallet: ""
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

  return {
    user: publicUser(user),
    state: {
      currentUser: user?.login || "",
      theme: settings?.data?.theme || "light",
      lang: settings?.data?.lang || "ru",
      users: profiles || [],
      stores: (stores || []).map((row) => row.data),
      messages: (messages || []).map((row) => row.data),
      orders: settings?.data?.orders || [],
      exchangeCards: settings?.data?.exchangeCards || defaultExchangeCards,
      exchangeRequests: settings?.data?.exchangeRequests || [],
      referrals: settings?.data?.referrals || [],
      referralPayments: settings?.data?.referralPayments || [],
      referralCodes: settings?.data?.referralCodes || {},
      balances: settings?.data?.balances || {},
      ltcBalances: settings?.data?.ltcBalances || {},
      paymentSettings: settings?.data?.paymentSettings || {},
      referralPeriod: settings?.data?.referralPeriod || {},
      filters: settings?.data?.filters || {}
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

app.get("/api/config", (_req, res) => {
  res.json({ turnstileSiteKey });
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
    await supabase.from("app_settings").upsert({
      id: "main",
      data: {
        theme: state.theme || "light",
        lang: state.lang || "ru",
        orders: Array.isArray(state.orders) ? state.orders : [],
        exchangeCards: Array.isArray(state.exchangeCards) ? state.exchangeCards : defaultExchangeCards,
        exchangeRequests: Array.isArray(state.exchangeRequests) ? state.exchangeRequests : [],
        referrals: Array.isArray(state.referrals) ? state.referrals : [],
        referralPayments: Array.isArray(state.referralPayments) ? state.referralPayments : [],
        referralCodes: state.referralCodes || {},
        balances: state.balances || {},
        ltcBalances: state.ltcBalances || {},
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
        const position = (product.positions || []).find((item) => item.id === order.positionId);
        if (position) position.stock = Math.max(0, Number(position.stock || 0) - 1);
      }
      await supabase.from("stores").upsert({ id: store.id, data: store }, { onConflict: "id" });
    }
  }
}

app.post("/api/payments/nowpayments/create", async (req, res, next) => {
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
    if (!response.ok) return res.status(502).json({ error: invoice.message || "NOWPayments invoice error" });

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

app.post("/api/payments/nowpayments/ipn", async (req, res, next) => {
  try {
    requireDb();
    if (!verifyNowpaymentsSignature(req)) return res.status(401).json({ error: "Bad NOWPayments signature" });
    const orderId = String(req.body.order_id || req.body.order || req.body.orderId || "");
    const status = String(req.body.payment_status || req.body.status || "").toLowerCase();
    const paid = ["finished", "confirmed", "sending", "partially_paid"].includes(status);
    if (!orderId || !paid) return res.status(400).json({ error: "Unsupported payment callback" });

    const { data: settings } = await supabase.from("app_settings").select("data").eq("id", "main").maybeSingle();
    const state = settings?.data || {};
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const order = orders.find((item) => item.id === orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    await completeProductOrder(order, { ...state, orders }, req.body);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const message = String(error.message || "Server error");
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
