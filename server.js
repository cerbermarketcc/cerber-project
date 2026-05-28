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
  description: "Мы работаем как локальная демо-витрина. Здесь будет полное описание магазина, правила, новости и важная информация для клиентов.",
  image: "assets/soleniy-malchik.jpg",
  cover: "assets/soleniy-malchik.jpg",
  orders: 0,
  reviews: 1,
  rating: 5,
  products: [{
    id: "demo-product",
    title: "Доступная позиция будет добавлена позже",
    category: "Демо / Позиция",
    price: "0 $",
    image: "assets/soleniy-malchik.jpg",
    rating: 5,
    reviews: 0
  }],
  reviewsList: [{
    id: "review-demo-1",
    serviceDate: "28.05.2026",
    rating: 5,
    product: "шоколад 1 грамм",
    text: "касаний 5 из 5 звезд"
  }]
};

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
      referrals: [],
      referralPayments: [],
      referralCodes: {},
      balances: {},
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
      referrals: settings?.data?.referrals || [],
      referralPayments: settings?.data?.referralPayments || [],
      referralCodes: settings?.data?.referralCodes || {},
      balances: settings?.data?.balances || {},
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
        referrals: Array.isArray(state.referrals) ? state.referrals : [],
        referralPayments: Array.isArray(state.referralPayments) ? state.referralPayments : [],
        referralCodes: state.referralCodes || {},
        balances: state.balances || {},
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
