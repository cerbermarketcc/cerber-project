const STORE_KEY = "cerber_demo_state_v1";
const SESSION_KEY = "cerber_current_user_v1";
const AUTH_KEY = "cerber_auth_v1";
const API_TOKEN_KEY = "cerber_api_token_v1";
const STATS_RESET_KEY = "cerber_stats_reset_2026_05_28";
const API_ENABLED = location.protocol !== "file:" && !["127.0.0.1", "localhost"].includes(location.hostname);
let TURNSTILE_SITE_KEY = "";
let turnstileWidgetId = null;

const fallbackImage = "assets/soleniy-malchik.jpg";
const NEW_STORE_STATS = {
  orders: 0,
  reviews: 1,
  rating: 5
};
const exchangeMethods = ["Мия", "RunPay", "BPay"];
const defaultExchangeRequisites = exchangeMethods.map((method) => ({ method, value: "60327998", active: true }));

function city(label, districts = []) {
  const base = ["Центр", "Северная зона", "Южная зона", "Восточная зона", "Западная зона", "Автовокзал", "Промзона"];
  return { label, districts: districts.length ? districts : base };
}

const filterOptions = {
  countries: {
    moldova: {
      label: "Молдова",
      cities: {
        chisinau: city("Кишинёв", ["Центр", "Ботаника", "Буюканы", "Рышкановка", "Чеканы", "Телецентр", "Скулянка", "Малая Малина", "Старая Почта", "Аэропорт"]),
        balti: city("Бельцы", ["Центр", "Дачия", "Слободзея", "БАМ", "Пемза", "Молодово", "Селекция", "Северный вокзал"]),
        bender: city("Бендеры", ["Центр", "Борисовка", "Солнечный", "Шёлковый", "Липканы", "Кавказ", "Хомутяновка"]),
        basarabeasca: city("Бессарабка"),
        biruinta: city("Бируинца"),
        briceni: city("Бричаны"),
        bucovati: city("Быковец"),
        cahul: city("Кагул", ["Центр", "Липованка", "Фрунзе", "Южный", "Промзона"]),
        calarasi: city("Калараш"),
        cantemir: city("Кантемир"),
        causeni: city("Каушаны"),
        ceadir_lunga: city("Чадыр-Лунга"),
        cimishlia: city("Чимишлия"),
        codru: city("Кодру"),
        comrat: city("Комрат", ["Центр", "Туканы", "Заялпужье", "Промзона"]),
        cornesti: city("Корнешты"),
        costesti: city("Костешты"),
        criuleni: city("Криуляны"),
        cupcini: city("Купчинь"),
        donduseni: city("Дондюшаны"),
        drochia: city("Дрокия"),
        durlesti: city("Дурлешты", ["Центр", "Новая Дурлешты", "Старая Дурлешты", "Думбрава"]),
        edinet: city("Единцы"),
        falesti: city("Фалешты"),
        floresti: city("Флорешты"),
        frunza: city("Фрунзе"),
        glodeni: city("Глодяны"),
        hincesti: city("Хынчешты"),
        ialoveni: city("Яловены"),
        leova: city("Леова"),
        lipcani: city("Липканы"),
        nisporeni: city("Ниспорены"),
        ocnita: city("Окница"),
        orhei: city("Оргеев", ["Центр", "Нордик", "Лупоайка", "Слободка", "Промзона"]),
        otaci: city("Отачь"),
        rezina: city("Резина"),
        riscani: city("Рышканы"),
        singera: city("Сынжера", ["Центр", "Добруджа", "Ревака"]),
        singerei: city("Сынжерей"),
        soldanesti: city("Шолданешты"),
        soroca: city("Сороки", ["Центр", "Бужэука", "Сорока Ноуэ", "Застынка"]),
        stefan_voda: city("Штефан-Водэ"),
        straseni: city("Страшены"),
        taraclia: city("Тараклия"),
        telenesti: city("Теленешты"),
        ungheni: city("Унгены", ["Центр", "Дэнуцены", "Берешты", "Молодёжный", "ЖД район"]),
        vadul_lui_voda: city("Вадул-луй-Водэ"),
        vatra: city("Ватра"),
        vulcanesti: city("Вулканешты")
      }
    },
    transnistria: {
      label: "Приднестровье",
      cities: {
        tiraspol: city("Тирасполь", ["Центр", "Балка", "Октябрьский", "Кировский", "Западный", "Терновка", "Ближний Хутор"]),
        bender: city("Бендеры", ["Центр", "Борисовка", "Солнечный", "Шёлковый", "Липканы", "Кавказ", "Хомутяновка"]),
        rybnitsa: city("Рыбница", ["Центр", "Вальченко", "Южный", "Северный", "Промзона"]),
        dubossary: city("Дубоссары", ["Центр", "Большой Фонтан", "Лунга", "Коржево", "Промзона"]),
        slobodzeya: city("Слободзея", ["Центр", "Новая Слободзея", "Парканская зона", "Суклея"]),
        grigoriopol: city("Григориополь"),
        camenca: city("Каменка"),
        dnestrovsk: city("Днестровск"),
        crasnoe: city("Красное"),
        maiac: city("Маяк"),
        pervomaisc: city("Первомайск")
      }
    }
  },
  categories: [
    "Все товары",
    "Электронные товары",
    "SIM-Карты",
    "Аккаунты",
    "Безопасность",
    "Документы",
    "Дизайн/Кодинг",
    "Реклама/Рассылки",
    "Финансы",
    "Доставки/Перевозки",
    "Работа",
    "Разное"
  ]
};

const defaults = {
  currentUser: "",
  theme: "light",
  lang: "ru",
  users: [
    { login: "admin", password: "admin", name: "Admin", role: "admin", createdAt: "2026-05-28" },
    { login: "skboy", password: "123", name: "SK BOY", role: "seller", createdAt: "2026-05-28" }
  ],
  stores: [
    {
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
      products: [
        {
          id: "demo-product",
          title: "Доступная позиция будет добавлена позже",
          category: "Демо / Позиция",
          price: "0 $",
          image: "assets/soleniy-malchik.jpg",
          rating: 5,
          reviews: 281
        }
      ],
      reviewsList: [defaultReview("review-demo-1")]
    }
  ],
  messages: [],
  orders: [],
  exchangeCards: [
    {
      id: "kent-ltc",
      name: "KENT LTC",
      ownerLogin: "skboy",
      description: "По всей Молдове. Обмен и обнал по текущему курсу оператора.",
      image: "assets/market-banner.png",
      regions: ["moldova"],
      exchangeRate: 19,
      cashoutRate: 17,
      ltcUsd: 54.2,
      requisites: defaultExchangeRequisites,
      active: true
    }
  ],
  exchangeRequests: [],
  referrals: [],
  referralPayments: [],
  referralCodes: {},
  balances: {},
  referralPeriod: {},
  filters: {
    country: "moldova",
    city: "chisinau",
    district: "",
    category: "Все товары",
    sort: "relevance"
  }
};

let db = loadDb();
let route = "home";
let activeStoreId = "";
let activeStoreTab = "positions";
let authMode = "login";
let activeOrdersTab = "all";
let activeReferralTab = "referrals";
let activeExchangeId = "kent-ltc";
let activeExchangeTab = "calculator";

const root = document.getElementById("app");

const text = {
  ru: {
    login: "Вход",
    register: "Регистрация",
    username: "Логин",
    name: "Имя",
    password: "Пароль",
    captcha: "Подтвердите, что вы не робот",
    enter: "Войти",
    create: "Зарегистрироваться",
    already: "Такой логин уже есть",
    success: "Успешно зарегистрировались, войдите",
    badLogin: "Неверный логин или пароль",
    needCaptcha: "Подтвердите, что вы не робот",
    storesTop: "Магазины TOP 10 🔥",
    search: "Поиск",
    all: "Все",
    top: "ТОП",
    new: "Новые",
    read: "Читать",
    close: "Закрыть",
    openChat: "Открыть чат",
    positions: "Доступные позиции",
    reviews: "Отзывы",
    orders: "Заказы",
    rating: "Рейтинг",
    messages: "Сообщения",
    newMessage: "Новое сообщение",
    recipient: "Получатель",
    subject: "Тема",
    message: "Сообщение",
    send: "Отправить",
    sent: "Сообщение сохранено",
    admin: "Админ панель",
    seller: "Панель продавца",
    addStore: "Добавить магазин",
    save: "Сохранить",
    logout: "Выйти",
    themeLight: "Светлая тема",
    themeDark: "Темная тема",
    language: "Сменить язык:",
    adminHint: "Войдите в аккаунт или зарегистрируйтесь, чтобы открыть CERBER.",
    ownerLogin: "Логин владельца",
    tag: "Тэг магазина",
    short: "Короткое описание",
    full: "Полное описание",
    upload: "Фото / видео",
    products: "Товары",
    addProduct: "Добавить товар",
    noMessages: "Сообщений пока нет",
    noReviews: "Отзывов пока нет",
    serviceDate: "Сервис дата",
    boughtProduct: "Товар",
    reviewText: "Отзыв"
  },
  md: {
    login: "Intrare",
    register: "Inregistrare",
    username: "Login",
    name: "Nume",
    password: "Parola",
    captcha: "Confirmati ca nu sunteti robot",
    enter: "Intra",
    create: "Inregistreaza",
    already: "Acest login exista deja",
    success: "Inregistrare reusita, intrati",
    badLogin: "Login sau parola gresita",
    needCaptcha: "Confirmati ca nu sunteti robot",
    storesTop: "Magazine TOP 10 🔥",
    search: "Cautare",
    all: "Toate",
    top: "TOP",
    new: "Noi",
    read: "Citeste",
    close: "Inchide",
    openChat: "Deschide chat",
    positions: "Pozitii disponibile",
    reviews: "Recenzii",
    orders: "Comenzi",
    rating: "Rating",
    messages: "Mesaje",
    newMessage: "Mesaj nou",
    recipient: "Destinatar",
    subject: "Subiect",
    message: "Mesaj",
    send: "Trimite",
    sent: "Mesaj salvat",
    admin: "Panou admin",
    seller: "Panou vanzator",
    addStore: "Adauga magazin",
    save: "Salveaza",
    logout: "Iesire",
    themeLight: "Tema luminoasa",
    themeDark: "Tema intunecata",
    language: "Schimba limba:",
    adminHint: "Intrati in cont sau inregistrati-va pentru a deschide CERBER.",
    ownerLogin: "Login proprietar",
    tag: "Tag magazin",
    short: "Descriere scurta",
    full: "Descriere completa",
    upload: "Foto / video",
    products: "Produse",
    addProduct: "Adauga produs",
    noMessages: "Nu exista mesaje",
    noReviews: "Nu exista recenzii",
    serviceDate: "Data serviciului",
    boughtProduct: "Produs",
    reviewText: "Recenzie"
  },
  en: {
    login: "Login",
    register: "Register",
    username: "Username",
    name: "Name",
    password: "Password",
    captcha: "Confirm you are not a robot",
    enter: "Sign in",
    create: "Create account",
    already: "This username already exists",
    success: "Registered successfully, please sign in",
    badLogin: "Wrong username or password",
    needCaptcha: "Confirm you are not a robot",
    storesTop: "Stores TOP 10 🔥",
    search: "Search",
    all: "All",
    top: "TOP",
    new: "New",
    read: "Read",
    close: "Close",
    openChat: "Open chat",
    positions: "Available positions",
    reviews: "Reviews",
    orders: "Orders",
    rating: "Rating",
    messages: "Messages",
    newMessage: "New message",
    recipient: "Recipient",
    subject: "Subject",
    message: "Message",
    send: "Send",
    sent: "Message saved",
    admin: "Admin panel",
    seller: "Seller panel",
    addStore: "Add store",
    save: "Save",
    logout: "Log out",
    themeLight: "Light theme",
    themeDark: "Dark theme",
    language: "Change language:",
    adminHint: "Sign in or create an account to open CERBER.",
    ownerLogin: "Owner login",
    tag: "Store tag",
    short: "Short description",
    full: "Full description",
    upload: "Photo / video",
    products: "Products",
    addProduct: "Add product",
    noMessages: "No messages yet",
    noReviews: "No reviews yet",
    serviceDate: "Service date",
    boughtProduct: "Product",
    reviewText: "Review"
  }
};

function tr(key) {
  return (text[db.lang] || text.ru)[key] || text.ru[key] || key;
}

function defaultReview(id = `review-${Date.now()}`) {
  return {
    id,
    serviceDate: "28.05.2026",
    rating: 5,
    product: "шоколад 1 грамм",
    text: "касаний 5 из 5 звезд"
  };
}

function loginKey(value) {
  return String(value || "").trim().toLowerCase();
}

function sameLogin(a, b) {
  return loginKey(a) === loginKey(b);
}

function loadDb() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    const next = saved ? merge(defaults, saved) : structuredClone(defaults);
    restoreAuth(next);
    const rememberedLogin = localStorage.getItem(SESSION_KEY);
    const rememberedUser = rememberedLogin ? next.users.find((user) => sameLogin(user.login, rememberedLogin)) : null;
    if (rememberedUser) {
      next.currentUser = rememberedUser.login;
    }
    normalizeDb(next);
    if (localStorage.getItem(STATS_RESET_KEY) !== "done") {
      resetStoreStats(next);
      localStorage.setItem(STATS_RESET_KEY, "done");
    }
    const current = next.currentUser ? next.users.find((user) => sameLogin(user.login, next.currentUser)) : null;
    if (current) {
      next.currentUser = current.login;
    } else if (next.currentUser) {
      next.currentUser = "";
    }
    return next;
  } catch {
    const next = structuredClone(defaults);
    restoreAuth(next);
    return next;
  }
}

function merge(base, saved) {
  return { ...structuredClone(base), ...saved };
}

function normalizeDb(next) {
  if (!Array.isArray(next.orders)) next.orders = [];
  if (!Array.isArray(next.exchangeCards)) next.exchangeCards = structuredClone(defaults.exchangeCards);
  if (!Array.isArray(next.exchangeRequests)) next.exchangeRequests = [];
  if (!Array.isArray(next.referrals)) next.referrals = [];
  if (!Array.isArray(next.referralPayments)) next.referralPayments = [];
  if (!next.referralCodes) next.referralCodes = {};
  if (!next.balances) next.balances = {};
  if (!next.referralPeriod) next.referralPeriod = {};
  if (!next.filters) next.filters = structuredClone(defaults.filters);
  (next.users || []).forEach((user) => {
    if (!user.createdAt) user.createdAt = "2026-05-28";
    if (!next.balances[user.login]) next.balances[user.login] = 0;
  });
  normalizeOrders(next);
  next.stores = (next.stores || []).map((store) => {
    const seed = defaults.stores.find((item) => item.id === store.id);
    return {
      ...store,
      orders: Number.isFinite(Number(store.orders)) ? Number(store.orders) : NEW_STORE_STATS.orders,
      reviews: Number.isFinite(Number(store.reviews)) ? Number(store.reviews) : NEW_STORE_STATS.reviews,
      rating: Number.isFinite(Number(store.rating)) ? Number(store.rating) : NEW_STORE_STATS.rating,
      products: Array.isArray(store.products) ? store.products : [],
      reviewsList: Array.isArray(store.reviewsList) ? store.reviewsList : (seed?.reviewsList || [])
    };
  });
  next.exchangeCards = next.exchangeCards.map(normalizeExchangeCard);
  if (!next.exchangeCards.length) next.exchangeCards = structuredClone(defaults.exchangeCards).map(normalizeExchangeCard);
}

function normalizeExchangeCard(card) {
  const seed = defaults.exchangeCards.find((item) => item.id === card.id) || defaults.exchangeCards[0];
  const requisites = Array.isArray(card.requisites) && card.requisites.length ? card.requisites : seed.requisites;
  return {
    ...seed,
    ...card,
    regions: Array.isArray(card.regions) && card.regions.length ? card.regions : seed.regions,
    exchangeRate: Number.isFinite(Number(card.exchangeRate)) ? Number(card.exchangeRate) : seed.exchangeRate,
    cashoutRate: Number.isFinite(Number(card.cashoutRate)) ? Number(card.cashoutRate) : seed.cashoutRate,
    ltcUsd: Number.isFinite(Number(card.ltcUsd)) ? Number(card.ltcUsd) : seed.ltcUsd,
    requisites: requisites.map((item) => ({
      method: item.method,
      value: String(item.value || "").trim(),
      active: item.active !== false
    })).filter((item) => item.method),
    active: card.active !== false
  };
}

function normalizeOrders(next) {
  const now = Date.now();
  next.orders = (next.orders || []).map((order) => {
    const createdAt = order.createdAt || now;
    const age = now - Number(createdAt);
    if (order.status === "active" && !order.disputeOpen && age >= 12 * 60 * 60 * 1000) {
      return { ...order, status: "closed", closedAt: now, closeReason: "Автоматически закрыт как успешный" };
    }
    return { ...order, createdAt };
  });
}

function restoreAuth(next) {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (!auth) return;
    if (Array.isArray(auth.users)) {
      auth.users.forEach((savedUser) => {
        if (!next.users.some((user) => sameLogin(user.login, savedUser.login))) {
          next.users.push(savedUser);
        }
      });
    }
    if (auth.currentUser) {
      const user = next.users.find((item) => sameLogin(item.login, auth.currentUser));
      if (user) next.currentUser = user.login;
    }
  } catch {
    // Auth fallback is optional; the main local database can still load without it.
  }
}

function saveAuth() {
  try {
    const auth = {
      currentUser: db.currentUser,
      users: db.users
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    if (db.currentUser) localStorage.setItem(SESSION_KEY, db.currentUser);
  } catch {
    // Keep the visible app working even if storage is temporarily unavailable.
  }
}

function resetStoreStats(next) {
  next.stores = (next.stores || []).map((store) => ({
    ...store,
    ...NEW_STORE_STATS,
    reviewsList: [defaultReview(`${store.id || "store"}-review-1`)]
  }));
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = localStorage.getItem(API_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "API error");
  return payload;
}

function applyRemoteState(payload) {
  if (!payload) return;
  db = merge(db, payload.state || {});
  if (payload.user) db.currentUser = payload.user.login;
  normalizeDb(db);
  saveAuth();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {}
}

async function loadRemoteSession() {
  if (!API_ENABLED) return false;
  const token = localStorage.getItem(API_TOKEN_KEY);
  if (!token) return false;
  try {
    const payload = await apiFetch("/api/session");
    applyRemoteState(payload);
    return Boolean(payload.user);
  } catch {
    localStorage.removeItem(API_TOKEN_KEY);
    return false;
  }
}

async function loadRemoteConfig() {
  if (!API_ENABLED) return;
  try {
    const config = await apiFetch("/api/config");
    TURNSTILE_SITE_KEY = config.turnstileSiteKey || "";
  } catch {
    TURNSTILE_SITE_KEY = "";
  }
}

async function persistRemoteState() {
  if (!API_ENABLED || !localStorage.getItem(API_TOKEN_KEY)) return;
  try {
    await apiFetch("/api/state", {
      method: "PUT",
      body: JSON.stringify({
        state: {
          theme: db.theme,
          lang: db.lang,
          stores: db.stores,
          messages: db.messages,
          orders: db.orders,
          exchangeCards: db.exchangeCards,
          exchangeRequests: db.exchangeRequests,
          referrals: db.referrals,
          referralPayments: db.referralPayments,
          referralCodes: db.referralCodes,
          balances: db.balances,
          referralPeriod: db.referralPeriod,
          filters: db.filters
        }
      })
    });
  } catch {
    showToast("База временно недоступна");
  }
}

function saveDb() {
  normalizeOrders(db);
  saveAuth();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    showToast("LocalStorage недоступен");
  }
  persistRemoteState();
}

function clearSession() {
  db.currentUser = "";
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(API_TOKEN_KEY);
    saveAuth();
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    saveDb();
  }
}

function currentUser() {
  return db.users.find((user) => sameLogin(user.login, db.currentUser)) || null;
}

function isAdmin() {
  return currentUser()?.role === "admin";
}

function sellerStores() {
  return db.stores.filter((store) => sameLogin(store.ownerLogin, db.currentUser));
}

function operatorExchangeCards() {
  return db.exchangeCards.filter((card) => sameLogin(card.ownerLogin, db.currentUser));
}

function exchangeCardById(id = activeExchangeId) {
  return db.exchangeCards.find((card) => card.id === id) || db.exchangeCards[0];
}

function userBalance(login = db.currentUser) {
  return Number(db.balances?.[login] || 0);
}

function referralCodeFor(login = db.currentUser) {
  const key = loginKey(login);
  if (!key) return "";
  if (!db.referralCodes) db.referralCodes = {};
  if (!db.referralCodes[key]) {
    const seed = `${key}${Date.now()}CERBER`.toUpperCase().replace(/[^A-Z0-9]/g, "");
    db.referralCodes[key] = seed.slice(0, 4) + Math.random().toString(36).slice(2, 10).toUpperCase();
    saveDb();
  }
  return db.referralCodes[key];
}

function referralLinkFor(login = db.currentUser) {
  const origin = location.protocol === "file:" ? "https://cerber.vip" : location.origin;
  return `${origin}/?ref=${encodeURIComponent(referralCodeFor(login))}`;
}

function pendingReferralCode() {
  const fromUrl = new URLSearchParams(location.search).get("ref");
  if (fromUrl) {
    localStorage.setItem("cerber_pending_ref_v1", fromUrl);
    return fromUrl;
  }
  return localStorage.getItem("cerber_pending_ref_v1") || "";
}

function registerReferral(newLogin) {
  const code = pendingReferralCode();
  if (!code) return;
  const ownerEntry = Object.entries(db.referralCodes || {}).find(([, value]) => value === code);
  if (!ownerEntry) return;
  const referrerLogin = ownerEntry[0];
  if (sameLogin(referrerLogin, newLogin)) return;
  if (db.referrals.some((item) => sameLogin(item.login, newLogin))) return;
  db.referrals.push({
    id: `ref-${Date.now()}`,
    referrerLogin,
    login: newLogin,
    registeredAt: new Date().toLocaleString(),
    deposits: 0,
    earned: 0
  });
  localStorage.removeItem("cerber_pending_ref_v1");
}

function addReferralDeposit(referralLogin, amount) {
  const referral = db.referrals.find((item) => sameLogin(item.login, referralLogin));
  if (!referral) return;
  const value = Number(amount) || 0;
  const reward = Math.round(value * 0.03 * 100) / 100;
  referral.deposits = Number(referral.deposits || 0) + value;
  referral.earned = Number(referral.earned || 0) + reward;
  db.balances[referral.referrerLogin] = userBalance(referral.referrerLogin) + reward;
  db.referralPayments.unshift({
    id: `pay-${Date.now()}`,
    referrerLogin: referral.referrerLogin,
    referralLogin,
    amount: value,
    reward,
    date: new Date().toLocaleString()
  });
  saveDb();
}

function isoDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return isoDate(new Date());
  return value.toISOString().slice(0, 10);
}

function parseAnyDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return new Date(text.slice(0, 10));
  const match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function userCreatedDate() {
  const user = currentUser();
  const userDate = parseAnyDate(user?.createdAt);
  if (userDate) return userDate;
  const dates = [
    ...db.referrals.filter((item) => sameLogin(item.referrerLogin, db.currentUser)).map((item) => parseAnyDate(item.registeredAt)),
    ...db.referralPayments.filter((item) => sameLogin(item.referrerLogin, db.currentUser)).map((item) => parseAnyDate(item.date))
  ].filter(Boolean).sort((a, b) => a - b);
  return dates[0] || new Date();
}

function currentReferralPeriod() {
  if (!db.referralPeriod) db.referralPeriod = {};
  const min = isoDate(userCreatedDate());
  const today = isoDate(new Date());
  const start = db.referralPeriod.start && db.referralPeriod.start >= min ? db.referralPeriod.start : min;
  const end = db.referralPeriod.end && db.referralPeriod.end <= today ? db.referralPeriod.end : today;
  return { min, today, start, end: end < start ? start : end };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function navIcon(name) {
  const icons = {
    home: `<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V21h5v-6h4v6h5V10.5"/></svg>`,
    wallet: `<svg viewBox="0 0 24 24"><path d="M4 7h16v12H4z"/><path d="M4 9h16"/><path d="M16 14h2"/></svg>`,
    stores: `<svg viewBox="0 0 24 24"><path d="M4 10h16l-1-5H5l-1 5Z"/><path d="M5 10v10h14V10"/><path d="M8 14h8"/></svg>`,
    orders: `<svg viewBox="0 0 24 24"><path d="M7 8V6a5 5 0 0 1 10 0v2"/><path d="M5 8h14l1 13H4L5 8Z"/></svg>`,
    messages: `<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>`,
    filters: `<svg viewBox="0 0 24 24"><path d="M4 6h10"/><path d="M18 6h2"/><path d="M4 12h3"/><path d="M11 12h9"/><path d="M4 18h12"/><path d="M19 18h1"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>`,
    referrals: `<svg viewBox="0 0 24 24"><path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M16 12a3 3 0 1 0 0-6"/><path d="M2 21a6 6 0 0 1 12 0"/><path d="M14 18a5 5 0 0 1 8 3"/></svg>`,
    exchange: `<svg viewBox="0 0 24 24"><path d="M4 7h12"/><path d="m13 4 3 3-3 3"/><path d="M20 17H8"/><path d="m11 14-3 3 3 3"/></svg>`,
    support: `<svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v4a2 2 0 0 0 2 2h2v-8H6a2 2 0 0 0-2 2Z"/><path d="M20 13v4a2 2 0 0 1-2 2h-2v-8h2a2 2 0 0 1 2 2Z"/></svg>`,
    rules: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.4 2.1c-1.1.8-1.9 1.3-1.9 2.9"/><path d="M12 17h.01"/></svg>`,
    logout: `<svg viewBox="0 0 24 24"><path d="M14 4h-8v16h8"/><path d="M10 12h10"/><path d="m17 9 3 3-3 3"/></svg>`,
    attach: `<svg viewBox="0 0 24 24"><path d="m21 11.5-8.7 8.7a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.7-8.7"/></svg>`,
    qr: `<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4z"/><path d="M14 4h6v6h-6z"/><path d="M4 14h6v6H4z"/><path d="M14 14h2v2h-2z"/><path d="M18 14h2v6h-4v-2h2z"/><path d="M14 18h2v2h-2z"/></svg>`,
    share: `<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4"/><path d="m8.7 13.3 6.6 4.4"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="m6 6 12 12"/><path d="M18 6 6 18"/></svg>`
  };
  return icons[name] || "";
}

function navButton(name, label, attrs = "") {
  const active = route === name || (name === "stores" && route === "catalog");
  return `<button class="nav-icon ${active ? "active" : ""}" aria-label="${label}" title="${label}" ${attrs}>${navIcon(name)}</button>`;
}

function accountMenuButton(icon, label, attrs = "", extra = "") {
  return `<button class="account-row" ${attrs}>${navIcon(icon)}<span>${label}</span>${extra}</button>`;
}

function openRulesModal() {
  document.querySelector("[data-account-pop]")?.classList.remove("open");
  showModal(`${rulesText}<button class="primary" data-close-modal>${tr("close")}</button>`, "rules-modal");
}

const rulesText = `
  <h2>Правила CERBER</h2>
  <h3>1. Общие правила площадки</h3>
  <p>1.1. Администрация площадки оставляет за собой право отказать в открытии магазина без объяснения причины.</p>
  <p>1.2. Администрация является независимой стороной при разборе спорных ситуаций. Подключение модератора зависит от нагрузки и происходит в порядке очереди.</p>
  <p>1.3. Решения администрации по спорам являются окончательными и обязательными к исполнению.</p>
  <p>1.4. Если одна из сторон не отвечает по спору в течение 24 часов, решение может быть принято в пользу другой стороны.</p>
  <p>1.5. Пользователь несёт ответственность за сохранность своего аккаунта, пароля и доступа к почте.</p>
  <p>1.6. Все пользователи CERBER обязаны знать и соблюдать эти правила.</p>
  <p>1.7. Правила магазина не могут противоречить правилам CERBER.</p>
  <p>1.8. Запрещены оскорбления, угрозы, спам, массовые рассылки и политическая пропаганда.</p>
  <h3>2. Правила для магазинов</h3>
  <p>2.1. Магазин может работать только после заполнения профиля: название, краткое и полное описание, правила, товары или услуги.</p>
  <p>2.2. Продавец несёт ответственность за информацию в своём магазине, сотрудников и качество обслуживания.</p>
  <p>2.3. Запрещены продажа и аренда аккаунта магазина.</p>
  <p>2.4. Все сделки, сообщения и споры должны проходить внутри функционала площадки.</p>
  <p>2.5. Запрещено вводить покупателей в заблуждение названием, описанием, ценой, категорией или статусом товара.</p>
  <p>2.6. Запрещена накрутка отзывов, рейтинга, заказов и любая манипуляция статистикой.</p>
  <p>2.7. Запрещены товары и услуги, нарушающие закон, права третьих лиц или правила площадки.</p>
  <h3>3. Правила для покупателей</h3>
  <p>3.1. Покупатель, совершая заказ, соглашается с правилами площадки и магазина.</p>
  <p>3.2. Диспут по заказу может быть открыт в течение 24 часов после получения результата заказа.</p>
  <p>3.3. Покупатель обязан описывать проблему по заказу честно и прикладывать подтверждения, если они есть.</p>
  <p>3.4. Запрещены оскорбления, угрозы, спам и публикация сторонних контактов в сообщениях и отзывах.</p>
  <p>3.5. Запрещена передача аккаунта третьим лицам.</p>
  <h3>4. Запрещено</h3>
  <p>4.1. Запрещено размещать незаконные товары, услуги, инструкции, ссылки или контакты для обхода правил площадки.</p>
  <p>4.2. Запрещены мошенничество, деанонимизация, шантаж, вредоносные действия и попытки обхода системы безопасности.</p>
  <p>4.3. Нарушение правил может привести к ограничению функций, блокировке аккаунта или закрытию магазина.</p>
  <h3>5. Примечания</h3>
  <p>5.1. Если магазин отказывается выполнять решение модератора, модератор подключается в чат с магазином. У магазина есть 24 часа на решение проблемы, после чего администрация может ограничить вывод средств, применить блокировку или штраф.</p>
  <p>5.2. Подменой товара считается любое расхождение между описанием на витрине и фактически переданным покупателю товаром или услугой.</p>
  <p>5.3. Купоны, выданные по результатам решения диспута, не могут быть отменены магазином в одностороннем порядке. Исключение составляют добровольные купоны, не относящиеся к обязательству по диспуту.</p>
  <p>5.4. Вознаграждение покупателю за сообщение о нарушении выплачивается только в случае, если нарушение подтверждено и магазин выплачивает штраф.</p>
`;

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

function layout(content) {
  document.body.dataset.theme = db.theme;
  root.innerHTML = `
    <main class="app">
      <header class="topbar">
        <button class="logo-button" data-route="home"><img class="logo" src="assets/logo1-white.png" alt="CERBER"></button>
        <button class="balance" data-account>
          <strong>0 LTC</strong>
          <span>${userBalance().toFixed(2)} $</span>
          <img class="avatar" src="assets/user-avatar.png" alt="">
        </button>
      </header>
      ${content}
    </main>
    <button class="menu" data-menu aria-label="Меню"><span></span><span></span><span></span></button>
    <section class="dock">
      <button class="theme-toggle" data-theme-toggle>
        <span>${db.theme === "dark" ? tr("themeDark") : tr("themeLight")}</span>
        <span class="switch ${db.theme === "dark" ? "dark" : ""}"><i>${db.theme === "dark" ? "☾" : "☀"}</i></span>
      </button>
      <div class="language">
        <span>${tr("language")}</span>
        <div>
          ${["ru", "md", "en"].map((lang) => `<button class="${db.lang === lang ? "active" : ""}" data-lang="${lang}">${lang === "en" ? "ENG" : lang.toUpperCase()}</button>`).join("")}
        </div>
      </div>
    </section>
    <div class="nav-pop" data-nav-pop>
      <div class="nav-card">
        ${navButton("home", "Главная", `data-route="home"`)}
        ${navButton("stores", "Магазины", `data-route="catalog"`)}
        ${navButton("orders", "Заказы", `data-route="orders"`)}
        <button class="nav-icon ${route === "messages" ? "active" : ""}" aria-label="${tr("messages")}" title="${tr("messages")}" data-route="messages">${navIcon("messages")}<i></i></button>
        ${navButton("filters", "Фильтры", `data-filters`)}
        <button class="nav-close" data-close-nav aria-label="Закрыть">${navIcon("close")}</button>
      </div>
    </div>
    <div class="account-pop" data-account-pop>
      <div class="account-card">
        <div class="account-row"><img class="avatar" src="assets/user-avatar.png" alt=""><strong>${esc(currentUser()?.name || currentUser()?.login)}</strong></div>
        <div class="divider"></div>
        ${accountMenuButton("wallet", "Кошелек", `data-route="wallet"`)}
        ${accountMenuButton("filters", "Каталог", `data-filters`)}
        ${accountMenuButton("stores", "Магазины", `data-route="catalog"`)}
        ${accountMenuButton("orders", "Заказы", `data-route="orders"`)}
        ${accountMenuButton("messages", tr("messages"), `data-route="messages"`)}
        ${accountMenuButton("referrals", "Реферальная программа", `data-route="referrals"`, `<b>NEW</b>`)}
        ${accountMenuButton("exchange", "Заявки на обмен", `data-route="exchange"`)}
        <div class="divider"></div>
        ${accountMenuButton("support", "Поддержка", `data-route="support"`)}
        ${accountMenuButton("rules", "Правила", `data-rules`)}
        ${isAdmin() ? `<button class="account-row" data-route="admin">⚙ <span>${tr("admin")}</span></button>` : ""}
        ${sellerStores().length ? `<button class="account-row" data-route="seller">▤ <span>${tr("seller")}</span></button>` : ""}
        ${(operatorExchangeCards().length || isAdmin()) ? accountMenuButton("exchange", "Панель обменника", `data-route="exchange-admin"`) : ""}
        ${accountMenuButton("logout", tr("logout"), `data-logout`)}
      </div>
    </div>
    <div class="modal-backdrop" data-modal></div>
    <div class="toast"></div>
  `;
  bindGlobal();
}

function renderAuth(message = "") {
  turnstileWidgetId = null;
  document.body.dataset.theme = db.theme;
  root.innerHTML = `
    <main class="auth-wrap">
      <section class="auth-card">
        <img src="assets/logo1-white.png" alt="CERBER">
        <h1>${authMode === "login" ? tr("login") : tr("register")}</h1>
        ${message ? `<p class="${message.includes("успеш") || message.includes("success") ? "" : "notice"}">${esc(message)}</p>` : `<p>${tr("adminHint")}</p>`}
        <form class="form" data-auth-form>
          ${authMode === "register" ? `<label class="field">${tr("name")}<input name="name" required></label>` : ""}
          <label class="field">${tr("username")}<input name="login" required autocomplete="username"></label>
          <label class="field">${tr("password")}<input name="password" type="password" required autocomplete="current-password"></label>
          ${API_ENABLED ? `
            <div class="captcha-box">
              ${TURNSTILE_SITE_KEY ? `<div id="turnstile-widget"></div>` : `<p class="notice">Captcha is not configured</p>`}
            </div>
          ` : `<label><input name="captcha" type="checkbox"> ${tr("captcha")}</label>`}
          <button class="primary" type="submit">${authMode === "login" ? tr("enter") : tr("create")}</button>
        </form>
        <p><button class="link-button" data-auth-switch>${authMode === "login" ? tr("register") : tr("login")}</button></p>
      </section>
    </main>
  `;
  document.querySelector("[data-auth-switch]").onclick = () => {
    authMode = authMode === "login" ? "register" : "login";
    renderAuth();
  };
  document.querySelector("[data-auth-form]").onsubmit = handleAuth;
  mountTurnstile();
}

function mountTurnstile() {
  if (!API_ENABLED || !TURNSTILE_SITE_KEY || !document.getElementById("turnstile-widget")) return;
  if (!window.turnstile) {
    setTimeout(mountTurnstile, 250);
    return;
  }
  turnstileWidgetId = window.turnstile.render("#turnstile-widget", {
    sitekey: TURNSTILE_SITE_KEY,
    theme: db.theme === "dark" ? "dark" : "light"
  });
}

function captchaToken() {
  if (!API_ENABLED) return "";
  if (!window.turnstile || turnstileWidgetId === null) return "";
  return window.turnstile.getResponse(turnstileWidgetId);
}

function resetCaptcha() {
  if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
}

async function handleAuth(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const login = data.get("login").trim();
  const password = data.get("password");
  const captcha = API_ENABLED ? captchaToken() : data.get("captcha");
  if (!captcha) return renderAuth(tr("needCaptcha"));

  if (authMode === "register") {
    if (API_ENABLED) {
      try {
        const payload = await apiFetch("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ login, password, name: data.get("name").trim() || login, captchaToken: captcha })
        });
        localStorage.setItem(API_TOKEN_KEY, payload.token);
        applyRemoteState(payload);
        registerReferral(payload.user?.login || login);
        saveDb();
        authMode = "login";
        return renderHome();
      } catch (error) {
        resetCaptcha();
        return renderAuth(error.message);
      }
    }
    if (db.users.some((user) => sameLogin(user.login, login))) return renderAuth(tr("already"));
    db.users.push({ login, password, name: data.get("name").trim() || login, role: "user", createdAt: isoDate(new Date()) });
    db.currentUser = login;
    registerReferral(login);
    saveDb();
    authMode = "login";
    return renderHome();
  }

  if (API_ENABLED) {
    try {
      const payload = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password, captchaToken: captcha })
      });
      localStorage.setItem(API_TOKEN_KEY, payload.token);
      applyRemoteState(payload);
      return renderHome();
    } catch (error) {
      resetCaptcha();
      return renderAuth(error.message);
    }
  }

  const user = db.users.find((item) => sameLogin(item.login, login) && item.password === password);
  if (!user) return renderAuth(tr("badLogin"));
  db.currentUser = user.login;
  saveDb();
  renderHome();
}

function renderHome() {
  route = "home";
  const cards = db.stores.map((store) => storeCard(store)).join("");
  layout(`
    <section class="hero">
      <h1>${tr("storesTop")}</h1>
      <label class="search"><b>⌕</b><input data-search placeholder="${tr("search")}"></label>
      <div class="tabs">
        <button class="tab active">${tr("all")}</button>
        <button class="tab">${tr("top")}</button>
        <button class="tab">${tr("new")}</button>
      </div>
    </section>
    <section class="feed" data-feed>${cards}</section>
  `);
  document.querySelector("[data-search]").oninput = (event) => {
    const q = event.target.value.toLowerCase();
    document.querySelector("[data-feed]").innerHTML = db.stores
      .filter((store) => `${store.name} ${store.short} ${store.tag}`.toLowerCase().includes(q))
      .map((store) => storeCard(store)).join("");
    bindStoreCards();
  };
}

function renderCatalog() {
  route = "catalog";
  const cards = db.stores.map((store) => storeCard(store)).join("");
  layout(`
    <section class="hero">
      <h1>Магазины</h1>
      <label class="search"><b>⌕</b><input data-search placeholder="${tr("search")}"></label>
    </section>
    <section class="feed" data-feed>${cards}</section>
  `);
  document.querySelector("[data-search]").oninput = (event) => {
    const q = event.target.value.toLowerCase();
    document.querySelector("[data-feed]").innerHTML = db.stores
      .filter((store) => `${store.name} ${store.short} ${store.tag}`.toLowerCase().includes(q))
      .map((store) => storeCard(store)).join("");
    bindStoreCards();
  };
}

function userOrders() {
  const user = currentUser();
  normalizeOrders(db);
  return (db.orders || []).filter((order) => sameLogin(order.login, user?.login));
}

function renderOrders(tab = activeOrdersTab) {
  route = "orders";
  activeOrdersTab = tab;
  const orders = userOrders();
  const active = orders.filter((order) => order.status === "active" && !order.disputeOpen);
  const disputes = orders.filter((order) => order.disputeOpen || order.status === "dispute");
  const list = tab === "active" ? active : tab === "disputes" ? disputes : orders;
  layout(`
    <section class="screen orders-screen">
      <h1 class="big-title">Заказы</h1>
      <div class="order-tabs">
        <button class="${tab === "all" ? "active" : ""}" data-order-tab="all">Все <span>${orders.length}</span></button>
        <button class="${tab === "active" ? "active" : ""}" data-order-tab="active">Активные <span>${active.length}</span></button>
        <button class="${tab === "disputes" ? "active" : ""}" data-order-tab="disputes">Споры <span>${disputes.length}</span></button>
      </div>
      ${list.length ? list.map(orderCard).join("") : `
        <article class="empty-orders">
          <h2>Нет заказов</h2>
          <p>Вы еще не купили ни одного товара</p>
          <button data-route="catalog">Купить</button>
        </article>
      `}
    </section>
  `);
  document.querySelectorAll("[data-order-tab]").forEach((button) => {
    button.onclick = () => renderOrders(button.dataset.orderTab);
  });
}

function orderCard(order) {
  const status = order.disputeOpen ? "Спор" : order.status === "closed" ? "Закрыт" : "Активный";
  return `
    <article class="order-card">
      <div>
        <h3>${esc(order.product || "Заказ")}</h3>
        <p>${esc(order.storeName || "")}</p>
      </div>
      <span>${status}</span>
    </article>
  `;
}

function renderFilters() {
  const filters = db.filters || structuredClone(defaults.filters);
  const country = filterOptions.countries[filters.country] || filterOptions.countries.moldova;
  const city = country.cities[filters.city] || Object.values(country.cities)[0];
  showModal(`
    <div class="filter-head">
      <button data-clear-filters>Очистить</button>
      <h2>Фильтры</h2>
      <button data-close-modal>${navIcon("close")}</button>
    </div>
    <form class="filter-form" data-filter-form>
      <label class="field">Страна
        <select name="country">
          ${Object.entries(filterOptions.countries).map(([key, item]) => `<option value="${key}" ${filters.country === key ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
      </label>
      <label class="field">Город
        <select name="city">
          ${Object.entries(country.cities).map(([key, item]) => `<option value="${key}" ${filters.city === key ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
      </label>
      <label class="field">Район
        <select name="district">
          <option value="">Все районы</option>
          ${city.districts.map((district) => `<option value="${esc(district)}" ${filters.district === district ? "selected" : ""}>${esc(district)}</option>`).join("")}
        </select>
      </label>
      <label class="field">Категория товара
        <select name="category">
          ${filterOptions.categories.map((category) => `<option value="${esc(category)}" ${filters.category === category ? "selected" : ""}>${esc(category)}</option>`).join("")}
        </select>
      </label>
      <div class="sort-pills">
        <label><input type="radio" name="sort" value="relevance" ${filters.sort !== "priceAsc" && filters.sort !== "priceDesc" ? "checked" : ""}> Релевантности</label>
        <label><input type="radio" name="sort" value="priceAsc" ${filters.sort === "priceAsc" ? "checked" : ""}> Возрастанию цены</label>
        <label><input type="radio" name="sort" value="priceDesc" ${filters.sort === "priceDesc" ? "checked" : ""}> Убыванию цены</label>
      </div>
      <button class="primary">Применить</button>
    </form>
  `, "filter-panel");
  document.querySelector("[name='country']").onchange = (event) => {
    db.filters = { ...filters, country: event.target.value, city: Object.keys(filterOptions.countries[event.target.value].cities)[0], district: "" };
    document.querySelector("[data-modal]").classList.remove("open");
    renderFilters();
  };
  document.querySelector("[name='city']").onchange = (event) => {
    db.filters = { ...filters, city: event.target.value, district: "" };
    document.querySelector("[data-modal]").classList.remove("open");
    renderFilters();
  };
  document.querySelector("[data-clear-filters]").onclick = () => {
    db.filters = structuredClone(defaults.filters);
    saveDb();
    document.querySelector("[data-modal]").classList.remove("open");
    renderCurrent();
  };
  document.querySelector("[data-filter-form]").onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    db.filters = {
      country: data.get("country"),
      city: data.get("city"),
      district: data.get("district"),
      category: data.get("category"),
      sort: data.get("sort")
    };
    saveDb();
    document.querySelector("[data-modal]").classList.remove("open");
    renderCurrent();
  };
}

function storeCard(store) {
  return `
    <article class="shop-card">
      <button class="shop-click" data-store="${esc(store.id)}">
        <div class="shop-inner">
          <div class="shop-head">
            <div>
              <div class="shop-title"><h2>${esc(store.name)}</h2><span class="verify">✓</span></div>
              <p class="desc">${esc(store.short)}</p>
            </div>
            <span>✉</span>
          </div>
          <img class="shop-image" src="${esc(store.image || fallbackImage)}" alt="${esc(store.name)}">
          <p>${Number(store.rating).toFixed(2)} / ${esc(store.reviews)} ${tr("reviews")}</p>
        </div>
      </button>
    </article>
  `;
}

function renderStore(storeId, tab = activeStoreTab || "positions") {
  route = "store";
  activeStoreId = storeId;
  activeStoreTab = tab;
  const store = db.stores.find((item) => item.id === storeId) || db.stores[0];
  const reviewsList = store.reviewsList || [];
  const content = activeStoreTab === "reviews"
    ? (reviewsList.length ? reviewsList.map((review) => reviewCard(review)).join("") : `<article class="panel empty-state"><p>${tr("noReviews")}</p></article>`)
    : (store.products.length ? store.products.map((product) => productCard(product, store)).join("") : `<article class="panel empty-state"><p>${tr("positions")} появятся позже</p></article>`);
  layout(`
    <section class="screen">
      <article class="panel">
        <img class="profile-cover" src="${esc(store.image || store.cover || fallbackImage)}" alt="">
        <div class="profile-body">
          <p class="breadcrumbs">${tr("storesTop").split(" ")[0]} > ${esc(store.name)}</p>
          <div class="shop-title"><h1 class="profile-title">${esc(store.name)}</h1><span class="verify">✓</span></div>
          <p>${esc(store.short)}</p>
          <p class="desc">${esc(store.description).slice(0, 130)}...</p>
          <button class="read-button" data-read="${esc(store.id)}">${tr("read")}</button>
          <div class="stats">
            <div class="stat"><strong>${esc(store.orders)}</strong><span>${tr("orders")}</span></div>
            <div class="stat"><strong>${esc(store.reviews)}</strong><span>${tr("reviews")}</span></div>
          </div>
          <div class="rating"><strong>${Number(store.rating).toFixed(2)}</strong><div class="stars">★★★★★</div><span>${tr("rating")}</span></div>
          <button class="primary" data-chat="${esc(store.id)}">${tr("openChat")} <span class="green-dot"></span></button>
          <p class="store-age">На /// CERBER</p>
          <div class="pill-tabs">
            <button class="${activeStoreTab === "positions" ? "" : "muted"}" data-store-tab="positions" data-store-id="${esc(store.id)}">${tr("positions")}</button>
            <button class="${activeStoreTab === "reviews" ? "" : "muted"}" data-store-tab="reviews" data-store-id="${esc(store.id)}">${tr("reviews")} ${esc(store.reviews)}</button>
          </div>
        </div>
      </article>
      ${content}
    </section>
  `);
}

function productCard(product, store) {
  return `
    <article class="product-card">
      <img class="product-image" src="${esc(product.image || store.image || fallbackImage)}" alt="">
      <div class="product-body">
        <h3>${esc(product.title)}</h3>
        <p>${esc(product.category)}</p>
        <p><strong>${esc(store.name)}</strong> <span class="verify">✓</span></p>
        <p class="price">${esc(product.price)}</p>
        <p>${Number(product.rating || 5).toFixed(2)} / ${esc(product.reviews || 0)}</p>
      </div>
    </article>
  `;
}

function reviewCard(review) {
  return `
    <article class="review-card">
      <div class="review-head">
        <strong>${esc(review.serviceDate)}</strong>
        <div class="review-stars" aria-label="${Number(review.rating || 5)} из 5">${stars(review.rating || 5)}</div>
      </div>
      <div class="review-body">
        <h3>${esc(review.product)}</h3>
        <p>${esc(review.text)}</p>
      </div>
    </article>
  `;
}

function stars(value) {
  const count = Math.max(1, Math.min(5, Number(value) || 5));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

function renderChat(storeId) {
  route = "chat";
  activeStoreId = storeId;
  const store = db.stores.find((item) => item.id === storeId) || db.stores[0];
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>${tr("newMessage")}</h2>
        <form class="form" data-chat-form>
          <label class="field">${tr("recipient")}<input name="to" value="${esc(store.tag)}" readonly></label>
          <label class="field">${tr("subject")}<input name="subject"></label>
          <label class="field">${tr("message")}<textarea name="body" required></textarea></label>
          <button class="primary">${tr("send")}</button>
        </form>
      </article>
    </section>
  `);
  document.querySelector("[data-chat-form]").onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    db.messages.unshift({
      id: Date.now().toString(),
      storeId,
      storeTag: store.tag,
      toLogin: store.ownerLogin,
      fromLogin: db.currentUser,
      subject: data.get("subject") || store.name,
      body: data.get("body"),
      date: new Date().toLocaleString()
    });
    saveDb();
    showToast(tr("sent"));
    renderMessages();
  };
}

function renderMessages() {
  route = "messages";
  const user = currentUser();
  const messages = db.messages.filter((msg) => isAdmin() || sameLogin(msg.fromLogin, user.login) || sameLogin(msg.toLogin, user.login));
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>${tr("messages")}</h2>
        ${messages.length ? messages.map((msg) => `
          <article class="product-card product-body">
            <h3>${esc(msg.subject)}</h3>
            <p>${esc(msg.body)}</p>
            <p>${esc(msg.fromLogin)} → ${esc(msg.storeTag)} · ${esc(msg.date)}</p>
          </article>
        `).join("") : `<p>${tr("noMessages")}</p>`}
      </article>
    </section>
  `);
}

function renderSupport() {
  route = "support";
  layout(`
    <section class="screen support-screen">
      <article class="support-card">
        <h1>Новый тикет в поддержку</h1>
        <form class="form" data-support-form>
          <label class="field">Тема
            <select name="subject" required>
              <option value="" disabled selected>Выберите тему</option>
              ${supportTopics.map((topic) => `<option value="${esc(topic)}">${esc(topic)}</option>`).join("")}
            </select>
          </label>
          <label class="field">Сообщение
            <textarea name="body" required></textarea>
          </label>
          <div class="support-actions">
            <button class="attach-button" type="button" aria-label="Прикрепить файл">${navIcon("attach") || "⌘"}</button>
            <button class="primary" type="submit">Отправить</button>
          </div>
        </form>
      </article>
    </section>
  `);
  document.querySelector("[data-support-form]").onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = data.get("subject");
    const body = data.get("body");
    db.messages.unshift({
      id: `support-${Date.now()}`,
      storeId: "support",
      storeTag: "supportcerber",
      toLogin: "support",
      fromLogin: db.currentUser,
      subject,
      body,
      date: new Date().toLocaleString(),
      system: "support"
    });
    saveDb();
    showToast("Тикет отправлен в поддержку");
    renderMessages();
  };
}

function renderReferrals(tab = activeReferralTab) {
  route = "referrals";
  activeReferralTab = tab;
  const code = referralCodeFor();
  const link = referralLinkFor();
  const refs = db.referrals.filter((item) => sameLogin(item.referrerLogin, db.currentUser));
  const payments = db.referralPayments.filter((item) => sameLogin(item.referrerLogin, db.currentUser));
  const totalDeposits = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalEarned = payments.reduce((sum, item) => sum + Number(item.reward || 0), 0);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(link)}`;
  const shortLink = link.length > 31 ? `${link.slice(0, 28)}...` : link;
  layout(`
    <section class="screen referral-screen">
      <h1>Реферальная программа</h1>
      <div class="pill-tabs referral-tabs">
        <button class="${tab === "referrals" ? "" : "muted"}" data-ref-tab="referrals">Рефералы</button>
        <button class="${tab === "analytics" ? "" : "muted"}" data-ref-tab="analytics">Аналитика</button>
      </div>
      ${tab === "analytics" ? referralAnalytics(payments, totalDeposits, totalEarned) : `
        <article class="ref-card">
          <div class="ref-card-head">
            <h2>${code ? "Ваша реферальная ссылка" : "Создать реферальную ссылку"}</h2>
            ${code ? `<span>Активна</span>` : ""}
          </div>
          <p>Делитесь Вашей ссылкой и зарабатывайте 3% от пополнений приглашенных пользователей.</p>
          ${code ? `
            <div class="ref-link-row">
              <button data-copy-ref>${esc(shortLink)}</button>
              <button data-copy-ref aria-label="Скопировать">⧉</button>
              <button class="qr-button" data-show-qr aria-label="QR">${navIcon("qr")}</button>
            </div>
          ` : `<button class="primary" data-create-ref>Создать ссылку</button>`}
        </article>
        <article class="ref-terms"><strong>Все условия</strong><button data-ref-terms>Подробнее</button></article>
        <div class="ref-section-head">
          <h2>Рефералы</h2>
          <label class="search"><b>⌕</b><input data-ref-search placeholder="Поиск реферала по ID"></label>
        </div>
        <section data-ref-list>
          ${refs.length ? refs.map(referralCard).join("") : `<article class="empty-ref"><h3>Рефералов пока нет</h3><p>Здесь будет отображаться список ваших рефералов</p></article>`}
        </section>
      `}
    </section>
  `);
  document.querySelectorAll("[data-ref-tab]").forEach((button) => {
    button.onclick = () => renderReferrals(button.dataset.refTab);
  });
  document.querySelector("[data-apply-period]")?.addEventListener("click", () => {
    const start = document.querySelector("[data-period-start]").value;
    const end = document.querySelector("[data-period-end]").value;
    db.referralPeriod = {
      start: start <= end ? start : end,
      end: end >= start ? end : start
    };
    saveDb();
    renderReferrals("analytics");
  });
  document.querySelector("[data-create-ref]")?.addEventListener("click", () => {
    referralCodeFor();
    saveDb();
    renderReferrals("referrals");
  });
  document.querySelectorAll("[data-copy-ref]").forEach((button) => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        showToast("Ссылка скопирована");
      } catch {
        showToast(link);
      }
    };
  });
  document.querySelector("[data-show-qr]")?.addEventListener("click", () => showReferralQr(qrUrl, code, link));
  document.querySelector("[data-ref-terms]")?.addEventListener("click", () => {
    showModal(`<h2>Условия реферальной программы</h2><p>За каждого пользователя, зарегистрированного по вашей ссылке, вы будете видеть регистрацию в списке рефералов.</p><p>С каждого будущего пополнения реферала начисляется 3% на ваш личный баланс CERBER.</p><p>Начисленные средства можно будет использовать для покупок внутри площадки после подключения платежей.</p><button class="primary" data-close-modal>${tr("close")}</button>`);
  });
  document.querySelector("[data-ref-search]")?.addEventListener("input", (event) => {
    const q = event.target.value.toLowerCase();
    document.querySelector("[data-ref-list]").innerHTML = refs
      .filter((item) => item.login.toLowerCase().includes(q))
      .map(referralCard).join("") || `<article class="empty-ref"><h3>Ничего не найдено</h3></article>`;
  });
}

function referralCard(item) {
  return `
    <article class="ref-item">
      <div>
        <h3>${esc(item.login)}</h3>
        <p>${esc(item.registeredAt)}</p>
      </div>
      <div>
        <strong>${Number(item.deposits || 0).toFixed(2)} $</strong>
        <span>+${Number(item.earned || 0).toFixed(2)} $</span>
      </div>
    </article>
  `;
}

function referralAnalytics(payments, totalDeposits, totalEarned) {
  const period = currentReferralPeriod();
  const startTime = new Date(period.start).getTime();
  const endTime = new Date(period.end).getTime() + 24 * 60 * 60 * 1000 - 1;
  const visiblePayments = payments.filter((item) => {
    const date = parseAnyDate(item.date);
    const time = date ? date.getTime() : 0;
    return time >= startTime && time <= endTime;
  });
  const periodDeposits = visiblePayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const periodEarned = visiblePayments.reduce((sum, item) => sum + Number(item.reward || 0), 0);
  const days = Math.max(1, Math.round((new Date(period.end) - new Date(period.start)) / (24 * 60 * 60 * 1000)) + 1);
  const points = Array.from({ length: Math.min(31, days) }, (_, index) => index);
  return `
    <div class="period-picker">
      <label>С <input type="date" data-period-start min="${period.min}" max="${period.today}" value="${period.start}"></label>
      <label>До <input type="date" data-period-end min="${period.min}" max="${period.today}" value="${period.end}"></label>
      <button data-apply-period>Применить</button>
    </div>
    <article class="analytics-card">
      <div class="chart">
        ${Array.from({ length: 11 }, (_, i) => `<span style="bottom:${i * 10}%"></span>`).join("")}
        <svg viewBox="0 0 320 210" preserveAspectRatio="none">
          <polyline points="${points.map((_, i) => `${10 + i * 10},198`).join(" ")}"></polyline>
          ${points.map((_, i) => `<circle cx="${10 + i * 10}" cy="198" r="4"></circle>`).join("")}
        </svg>
      </div>
      <div class="analytics-summary">
        <div><strong>${periodDeposits.toFixed(2)} $</strong><span>Пополнения</span></div>
        <div><strong>${periodEarned.toFixed(2)} $</strong><span>Ваши 3%</span></div>
      </div>
    </article>
    <h2 class="details-title">Детализация</h2>
    ${visiblePayments.length ? visiblePayments.map((item) => `
      <article class="ref-item">
        <div><h3>${esc(item.referralLogin)}</h3><p>${esc(item.date)}</p></div>
        <div><strong>${Number(item.amount).toFixed(2)} $</strong><span>+${Number(item.reward).toFixed(2)} $</span></div>
      </article>
    `).join("") : `<article class="empty-ref"><h3>Платежей пока нет</h3><p>Здесь будет отображаться список ваших платежей</p></article>`}
  `;
}

function showReferralQr(qrUrl, code, link) {
  showModal(`
    <button class="qr-close" data-close-modal>${navIcon("close")}</button>
    <img class="qr-image" src="${qrUrl}" alt="QR">
    <div class="divider"></div>
    <p class="qr-code">${esc(code)} <button data-copy-code>⧉</button></p>
    <button class="primary" data-share-ref>Поделиться ${navIcon("share")}</button>
  `, "qr-modal");
  document.querySelector("[data-copy-code]").onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast("Код скопирован");
    } catch {
      showToast(code);
    }
  };
  document.querySelector("[data-share-ref]").onclick = async () => {
    if (navigator.share) {
      await navigator.share({ title: "CERBER", text: "Моя реферальная ссылка", url: link }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(link);
        showToast("Ссылка скопирована");
      } catch {
        showToast(link);
      }
    }
  };
}

function renderExchangeCatalog() {
  route = "exchange";
  const cards = db.exchangeCards.filter((card) => card.active !== false);
  layout(`
    <section class="screen exchange-screen">
      <h1>Заявки на обмен</h1>
      <label class="search"><b>⌕</b><input data-exchange-search placeholder="${tr("search")}"></label>
      <section class="exchange-grid" data-exchange-list>
        ${cards.map(exchangeCardView).join("") || `<article class="panel empty-state"><p>Обменники появятся позже</p></article>`}
      </section>
    </section>
  `);
  document.querySelectorAll("[data-exchange-card]").forEach((button) => {
    button.onclick = () => renderExchangeProfile(button.dataset.exchangeCard, "calculator");
  });
  document.querySelector("[data-exchange-search]")?.addEventListener("input", (event) => {
    const q = event.target.value.toLowerCase();
    document.querySelector("[data-exchange-list]").innerHTML = cards
      .filter((card) => `${card.name} ${card.description}`.toLowerCase().includes(q))
      .map(exchangeCardView).join("") || `<article class="panel empty-state"><p>Ничего не найдено</p></article>`;
    document.querySelectorAll("[data-exchange-card]").forEach((button) => {
      button.onclick = () => renderExchangeProfile(button.dataset.exchangeCard, "calculator");
    });
  });
}

function exchangeCardView(card) {
  const regions = regionText(card.regions);
  return `
    <article class="shop-card exchange-card">
      <button class="shop-click" data-exchange-card="${esc(card.id)}">
        <div class="shop-inner">
          <div class="shop-head">
            <div>
              <div class="shop-title"><h2>${esc(card.name)}</h2><span class="verify">✓</span></div>
              <p class="desc">${esc(card.description)}</p>
            </div>
            <span>${navIcon("exchange")}</span>
          </div>
          <img class="shop-image" src="${esc(card.image || fallbackImage)}" alt="${esc(card.name)}">
          <div class="rate-row">
            <span>${esc(regions)}</span>
            <strong>Обмен ${Number(card.exchangeRate).toFixed(2)} MDL / $</strong>
          </div>
          <div class="rate-row">
            <span>Обнал</span>
            <strong>${Number(card.cashoutRate).toFixed(2)} MDL / $</strong>
          </div>
        </div>
      </button>
    </article>
  `;
}

function regionText(regions = []) {
  if (regions.includes("both")) return "Молдова и Приднестровье";
  const labels = [];
  if (regions.includes("moldova")) labels.push("Молдова");
  if (regions.includes("transnistria")) labels.push("Приднестровье");
  return labels.join(", ") || "Регион не указан";
}

function renderExchangeProfile(cardId = activeExchangeId, tab = activeExchangeTab) {
  route = "exchange-profile";
  activeExchangeId = cardId;
  activeExchangeTab = tab;
  const card = exchangeCardById(cardId);
  if (!card) return renderExchangeCatalog();
  const body = tab === "exchange" ? exchangeRequestForm(card, "exchange")
    : tab === "cashout" ? exchangeRequestForm(card, "cashout")
    : exchangeCalculator(card);
  layout(`
    <section class="screen exchange-profile">
      <article class="panel">
        <img class="profile-cover" src="${esc(card.image || fallbackImage)}" alt="">
        <div class="profile-body">
          <p class="breadcrumbs">Обменники > ${esc(card.name)}</p>
          <div class="shop-title"><h1 class="profile-title">${esc(card.name)}</h1><span class="verify">✓</span></div>
          <p>${esc(regionText(card.regions))}</p>
          <p class="desc">${esc(card.description)}</p>
          <div class="stats exchange-stats">
            <div class="stat"><strong>${Number(card.exchangeRate).toFixed(2)}</strong><span>MDL за 1$ обмен</span></div>
            <div class="stat"><strong>${Number(card.cashoutRate).toFixed(2)}</strong><span>MDL за 1$ обнал</span></div>
          </div>
          <button class="primary" data-exchange-chat="${esc(card.id)}">Написать обменнику <span class="green-dot"></span></button>
          <div class="pill-tabs">
            <button class="${tab === "calculator" ? "" : "muted"}" data-exchange-tab="calculator">Калькулятор</button>
            <button class="${tab === "exchange" ? "" : "muted"}" data-exchange-tab="exchange">Обмен</button>
            <button class="${tab === "cashout" ? "" : "muted"}" data-exchange-tab="cashout">Обнал</button>
          </div>
        </div>
      </article>
      ${body}
    </section>
  `);
  bindExchangeProfile(card);
}

function exchangeCalculator(card) {
  return `
    <article class="panel exchange-tool">
      <h2>Калькулятор</h2>
      <div class="row">
        <label class="field">Сумма в $<input data-calc-usd type="number" min="0" step="0.01" value="100"></label>
        <label class="field">Тип
          <select data-calc-type>
            <option value="exchange">Обмен</option>
            <option value="cashout">Обнал</option>
          </select>
        </label>
      </div>
      <div class="calc-result">
        <span>Итого по курсу</span>
        <strong data-calc-result>0 MDL</strong>
      </div>
      <div class="exchange-actions">
        <button class="primary" data-exchange-tab="exchange">Поменять автоматически</button>
        <button class="ghost-button" data-exchange-chat="${esc(card.id)}">Написать обменнику</button>
      </div>
      <div class="requisites-list">
        ${card.requisites.filter((item) => item.active !== false).map((item) => `<p><strong>${esc(item.method)}</strong><span>${esc(item.value)}</span></p>`).join("")}
      </div>
    </article>
  `;
}

function exchangeRequestForm(card, type) {
  const isExchange = type === "exchange";
  const title = isExchange ? "Новая заявка на обмен" : "Новая заявка на обнал";
  const rate = isExchange ? card.exchangeRate : card.cashoutRate;
  return `
    <article class="panel exchange-tool">
      <h2>${title}</h2>
      <form class="form" data-exchange-request="${esc(type)}">
        ${isExchange ? `
          <label class="field">Способ оплаты
            <select name="method" required>
              ${card.requisites.filter((item) => item.active !== false).map((item) => `<option value="${esc(item.method)}">${esc(item.method)} - ${esc(item.value)}</option>`).join("")}
            </select>
          </label>
        ` : `
          <label class="field">Карта / кошелек для получения<input name="payout" placeholder="Номер или реквизит" required></label>
        `}
        <label class="field">Сумма в $<input name="amount" type="number" min="1" step="0.01" value="100" required></label>
        <label class="field">Комментарий<textarea name="comment" placeholder="Можно оставить пустым"></textarea></label>
        <div class="calc-result">
          <span>Курс ${Number(rate).toFixed(2)} MDL за 1$</span>
          <strong data-form-result>${(100 * rate).toFixed(2)} MDL</strong>
        </div>
        <div class="exchange-actions">
          <button class="primary" type="submit">Отправить заявку</button>
          <button class="ghost-button" type="button" data-exchange-chat="${esc(card.id)}">Написать обменнику</button>
        </div>
      </form>
    </article>
  `;
}

function bindExchangeProfile(card) {
  document.querySelectorAll("[data-exchange-tab]").forEach((button) => {
    button.onclick = () => renderExchangeProfile(card.id, button.dataset.exchangeTab);
  });
  document.querySelectorAll("[data-exchange-chat]").forEach((button) => {
    button.onclick = () => renderExchangeChat(button.dataset.exchangeChat);
  });
  const calcUsd = document.querySelector("[data-calc-usd]");
  const calcType = document.querySelector("[data-calc-type]");
  const calcResult = document.querySelector("[data-calc-result]");
  const updateCalc = () => {
    if (!calcResult) return;
    const amount = Number(calcUsd?.value || 0);
    const rate = calcType?.value === "cashout" ? card.cashoutRate : card.exchangeRate;
    calcResult.textContent = `${(amount * rate).toFixed(2)} MDL`;
  };
  calcUsd?.addEventListener("input", updateCalc);
  calcType?.addEventListener("change", updateCalc);
  updateCalc();
  document.querySelectorAll("[data-exchange-request]").forEach((form) => {
    const amountInput = form.querySelector("input[name='amount']");
    const result = form.querySelector("[data-form-result]");
    const type = form.dataset.exchangeRequest;
    const rate = type === "cashout" ? card.cashoutRate : card.exchangeRate;
    amountInput?.addEventListener("input", () => {
      result.textContent = `${(Number(amountInput.value || 0) * rate).toFixed(2)} MDL`;
    });
    form.onsubmit = (event) => handleExchangeRequest(event, card, type);
  });
}

function handleExchangeRequest(event, card, type) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const amount = Number(data.get("amount") || 0);
  const rate = type === "cashout" ? card.cashoutRate : card.exchangeRate;
  const request = {
    id: `exchange-${Date.now()}`,
    cardId: card.id,
    cardName: card.name,
    type,
    fromLogin: db.currentUser,
    toLogin: card.ownerLogin,
    method: data.get("method") || data.get("payout") || "",
    amountUsd: amount,
    totalMdl: amount * rate,
    comment: data.get("comment") || "",
    status: "new",
    date: new Date().toLocaleString()
  };
  db.exchangeRequests.unshift(request);
  db.messages.unshift({
    id: `msg-${request.id}`,
    storeId: card.id,
    storeTag: card.name,
    toLogin: card.ownerLogin,
    fromLogin: db.currentUser,
    subject: type === "cashout" ? `Заявка на обнал ${card.name}` : `Заявка на обмен ${card.name}`,
    body: `Сумма: ${amount.toFixed(2)} $. К оплате/получению: ${request.totalMdl.toFixed(2)} MDL. Способ: ${request.method || "не указан"}. ${request.comment}`,
    date: request.date,
    system: "exchange"
  });
  saveDb();
  showToast("Заявка отправлена обменнику");
  renderMessages();
}

function renderExchangeChat(cardId) {
  route = "exchange-chat";
  activeExchangeId = cardId;
  const card = exchangeCardById(cardId);
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>${tr("newMessage")}</h2>
        <form class="form" data-exchange-chat-form>
          <label class="field">${tr("recipient")}<input name="to" value="${esc(card.name)}" readonly></label>
          <label class="field">${tr("subject")}<input name="subject" value="Вопрос по обмену"></label>
          <label class="field">${tr("message")}<textarea name="body" required></textarea></label>
          <button class="primary">${tr("send")}</button>
        </form>
      </article>
    </section>
  `);
  document.querySelector("[data-exchange-chat-form]").onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    db.messages.unshift({
      id: `exchange-chat-${Date.now()}`,
      storeId: card.id,
      storeTag: card.name,
      toLogin: card.ownerLogin,
      fromLogin: db.currentUser,
      subject: data.get("subject") || card.name,
      body: data.get("body"),
      date: new Date().toLocaleString(),
      system: "exchange"
    });
    saveDb();
    showToast(tr("sent"));
    renderMessages();
  };
}

function renderSimplePage(kind) {
  const titles = {
    wallet: "Кошелек",
    referrals: "Реферальная программа",
    exchange: "Заявки на обмен",
    rules: "Правила"
  };
  const bodies = {
    wallet: "Баланс, пополнение и история операций будут здесь.",
    referrals: "Реферальные ссылки, начисления и приглашенные пользователи будут здесь.",
    exchange: "Заявки на обмен валют и статусы операций будут здесь.",
    rules: "Нажмите кнопку Правила в меню аккаунта, чтобы открыть полное окно правил."
  };
  layout(`
    <section class="screen">
      <article class="panel simple-page">
        <h2>${titles[kind] || "Раздел"}</h2>
        <p>${bodies[kind] || "Раздел будет настроен позже."}</p>
      </article>
    </section>
  `);
}

function renderAdmin() {
  if (!isAdmin()) return renderHome();
  route = "admin";
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>${tr("admin")}</h2>
        <form class="form" data-store-form>
          <div class="row">
            <label class="field">ID<input name="id" required placeholder="new-store"></label>
            <label class="field">${tr("tag")}<input name="tag" required placeholder="@tag"></label>
          </div>
          <label class="field">${tr("ownerLogin")}<input name="ownerLogin" required placeholder="seller login"></label>
          <label class="field">${tr("name")}<input name="name" required></label>
          <label class="field">${tr("short")}<input name="short" required></label>
          <label class="field">${tr("full")}<textarea name="description" required></textarea></label>
          <label class="field">${tr("upload")}<input name="image" type="file" accept="image/*,video/*"></label>
          <button class="primary">${tr("addStore")}</button>
        </form>
      </article>
      <article class="panel">
        <h2>Добавить обменник</h2>
        <form class="form" data-exchange-admin-form>
          <div class="row">
            <label class="field">ID<input name="id" required placeholder="kent-ltc"></label>
            <label class="field">${tr("ownerLogin")}<input name="ownerLogin" required placeholder="operator login"></label>
          </div>
          <label class="field">${tr("name")}<input name="name" required placeholder="KENT LTC"></label>
          <label class="field">${tr("full")}<textarea name="description" required></textarea></label>
          <div class="row">
            <label class="field">Курс обмена MDL/$<input name="exchangeRate" type="number" step="0.01" value="19" required></label>
            <label class="field">Курс обнала MDL/$<input name="cashoutRate" type="number" step="0.01" value="17" required></label>
          </div>
          <label class="field">Регион
            <select name="regions">
              <option value="moldova">Молдова</option>
              <option value="transnistria">Приднестровье</option>
              <option value="both">Молдова и Приднестровье</option>
            </select>
          </label>
          <div class="row">
            ${exchangeMethods.map((method) => `<label class="field">${method}<input name="req_${method}" value="60327998"></label>`).join("")}
          </div>
          <label class="field">${tr("upload")}<input name="image" type="file" accept="image/*"></label>
          <button class="primary">Добавить обменник</button>
        </form>
      </article>
      ${db.stores.map((store) => `<article class="panel"><h2>${esc(store.name)}</h2><p>${esc(store.tag)} · ${esc(store.ownerLogin)}</p><p>${esc(store.orders)} ${tr("orders")} · ${esc(store.reviews)} ${tr("reviews")} · ${Number(store.rating).toFixed(2)} ${tr("rating")}</p></article>`).join("")}
    </section>
  `);
  document.querySelector("[data-store-form]").onsubmit = handleStoreCreate;
  document.querySelector("[data-exchange-admin-form]").onsubmit = handleExchangeCardCreate;
}

async function handleStoreCreate(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const file = data.get("image");
  const image = file && file.size ? await fileToDataUrl(file) : fallbackImage;
  const ownerLogin = data.get("ownerLogin").trim();
  const existingOwner = db.users.find((user) => sameLogin(user.login, ownerLogin));
  const finalOwnerLogin = existingOwner?.login || ownerLogin;
  if (!existingOwner) {
    db.users.push({ login: ownerLogin, password: "123", name: ownerLogin, role: "seller" });
  }
  db.stores.push({
    id: data.get("id").trim(),
    tag: data.get("tag").trim(),
    ownerLogin: finalOwnerLogin,
    name: data.get("name").trim(),
    short: data.get("short").trim(),
    description: data.get("description").trim(),
    image,
    cover: image,
    ...NEW_STORE_STATS,
    products: [],
    reviewsList: [defaultReview(`${data.get("id").trim()}-review-1`)]
  });
  saveDb();
  renderAdmin();
}

async function handleExchangeCardCreate(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = data.get("id").trim();
  if (db.exchangeCards.some((card) => card.id === id)) {
    showToast("Такой обменник уже есть");
    return;
  }
  const ownerLogin = data.get("ownerLogin").trim();
  const existingOwner = db.users.find((user) => sameLogin(user.login, ownerLogin));
  const finalOwnerLogin = existingOwner?.login || ownerLogin;
  if (!existingOwner) {
    db.users.push({ login: ownerLogin, password: "123", name: ownerLogin, role: "seller", createdAt: isoDate(new Date()) });
  }
  const file = data.get("image");
  const image = file && file.size ? await fileToDataUrl(file) : "assets/market-banner.png";
  db.exchangeCards.push(normalizeExchangeCard({
    id,
    name: data.get("name").trim(),
    ownerLogin: finalOwnerLogin,
    description: data.get("description").trim(),
    image,
    regions: [data.get("regions")],
    exchangeRate: Number(data.get("exchangeRate")),
    cashoutRate: Number(data.get("cashoutRate")),
    ltcUsd: 54.2,
    requisites: exchangeMethods.map((method) => ({ method, value: data.get(`req_${method}`), active: true })),
    active: true
  }));
  saveDb();
  renderAdmin();
}

function renderSeller() {
  const stores = sellerStores();
  if (!stores.length) return renderHome();
  route = "seller";
  const store = stores[0];
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>${tr("seller")}: ${esc(store.name)}</h2>
        <form class="form" data-product-form>
          <label class="field">${tr("name")}<input name="title" required></label>
          <label class="field">${tr("short")}<input name="category" required></label>
          <label class="field">Цена<input name="price" required></label>
          <label class="field">${tr("upload")}<input name="image" type="file" accept="image/*"></label>
          <button class="primary">${tr("addProduct")}</button>
        </form>
      </article>
      ${store.products.map((product) => productCard(product, store)).join("")}
    </section>
  `);
  document.querySelector("[data-product-form]").onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("image");
    const image = file && file.size ? await fileToDataUrl(file) : store.image;
    store.products.unshift({
      id: Date.now().toString(),
      title: data.get("title"),
      category: data.get("category"),
      price: data.get("price"),
      image,
      rating: 5,
      reviews: 0
    });
    saveDb();
    renderSeller();
  };
}

function renderExchangeOperator() {
  const cards = isAdmin() ? db.exchangeCards : operatorExchangeCards();
  if (!cards.length) return renderHome();
  route = "exchange-admin";
  const card = cards[0];
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>Панель обменника: ${esc(card.name)}</h2>
        <form class="form" data-exchange-operator-form>
          <label class="field">${tr("name")}<input name="name" value="${esc(card.name)}" required></label>
          <label class="field">${tr("full")}<textarea name="description" required>${esc(card.description)}</textarea></label>
          <div class="row">
            <label class="field">Курс обмена MDL/$<input name="exchangeRate" type="number" step="0.01" value="${esc(card.exchangeRate)}" required></label>
            <label class="field">Курс обнала MDL/$<input name="cashoutRate" type="number" step="0.01" value="${esc(card.cashoutRate)}" required></label>
          </div>
          <label class="field">Регион
            <select name="regions">
              <option value="moldova" ${card.regions.includes("moldova") ? "selected" : ""}>Молдова</option>
              <option value="transnistria" ${card.regions.includes("transnistria") ? "selected" : ""}>Приднестровье</option>
              <option value="both" ${card.regions.includes("both") ? "selected" : ""}>Молдова и Приднестровье</option>
            </select>
          </label>
          <div class="row">
            ${exchangeMethods.map((method) => {
              const req = card.requisites.find((item) => item.method === method);
              return `<label class="field">${method}<input name="req_${method}" value="${esc(req?.value || "")}"></label>`;
            }).join("")}
          </div>
          <label class="field">${tr("upload")}<input name="image" type="file" accept="image/*"></label>
          <button class="primary">${tr("save")}</button>
        </form>
      </article>
      <article class="panel">
        <h2>Заявки</h2>
        ${(db.exchangeRequests || []).filter((item) => item.cardId === card.id).map((request) => `
          <article class="ref-item">
            <div><h3>${esc(request.fromLogin)}</h3><p>${esc(request.date)} · ${esc(request.type)}</p></div>
            <div><strong>${Number(request.amountUsd || 0).toFixed(2)} $</strong><span>${Number(request.totalMdl || 0).toFixed(2)} MDL</span></div>
          </article>
        `).join("") || `<p>Заявок пока нет</p>`}
      </article>
    </section>
  `);
  document.querySelector("[data-exchange-operator-form]").onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("image");
    card.name = data.get("name").trim();
    card.description = data.get("description").trim();
    card.exchangeRate = Number(data.get("exchangeRate"));
    card.cashoutRate = Number(data.get("cashoutRate"));
    card.regions = [data.get("regions")];
    card.requisites = exchangeMethods.map((method) => ({ method, value: data.get(`req_${method}`), active: Boolean(data.get(`req_${method}`)) }));
    if (file && file.size) card.image = await fileToDataUrl(file);
    saveDb();
    renderExchangeOperator();
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function showModal(html, className = "") {
  document.querySelector("[data-modal]").innerHTML = `<div class="modal ${className}">${html}</div>`;
  document.querySelector("[data-modal]").classList.add("open");
}

function bindGlobal() {
  bindStoreCards();
  document.querySelectorAll("[data-chat]").forEach((button) => button.onclick = () => renderChat(button.dataset.chat));
  document.querySelectorAll("[data-read]").forEach((button) => {
    button.onclick = () => {
      const store = db.stores.find((item) => item.id === button.dataset.read);
      showModal(`<h2>${esc(store.name)}</h2><p>${esc(store.description)}</p><button class="primary" data-close-modal>${tr("close")}</button>`);
    };
  });
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.onclick = () => routeTo(button.dataset.route);
  });
  document.querySelectorAll("[data-filters]").forEach((button) => {
    button.onclick = () => {
      document.querySelector("[data-nav-pop]").classList.remove("open");
      document.querySelector("[data-account-pop]")?.classList.remove("open");
      renderFilters();
    };
  });
  document.querySelectorAll("[data-rules]").forEach((button) => {
    button.onclick = openRulesModal;
  });
  document.querySelectorAll("[data-store-tab]").forEach((button) => {
    button.onclick = () => renderStore(button.dataset.storeId, button.dataset.storeTab);
  });
  document.querySelector("[data-menu]").onclick = () => document.querySelector("[data-nav-pop]").classList.add("open");
  document.querySelector("[data-account]").onclick = () => document.querySelector("[data-account-pop]").classList.add("open");
  document.querySelectorAll("[data-nav-pop], [data-account-pop], [data-modal]").forEach((overlay) => {
    overlay.onclick = (event) => {
      if (event.target === overlay || event.target.closest("[data-close-modal]") || event.target.closest("[data-close-nav]")) overlay.classList.remove("open");
    };
  });
  document.querySelector("[data-theme-toggle]").onclick = (event) => {
    event.stopPropagation();
    event.currentTarget.blur();
    db.theme = db.theme === "dark" ? "light" : "dark";
    saveDb();
    renderCurrent();
  };
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      event.currentTarget.blur();
      db.lang = button.dataset.lang;
      saveDb();
      renderCurrent();
    };
  });
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.onclick = () => {
      clearSession();
      renderAuth();
    };
  });
}

function bindStoreCards() {
  document.querySelectorAll("[data-store]").forEach((button) => button.onclick = () => renderStore(button.dataset.store, "positions"));
}

function routeTo(next) {
  if (next === "filters") return renderFilters();
  if (next === "rules") return openRulesModal();
  route = next;
  renderCurrent();
}

function renderCurrent() {
  if (!db.currentUser || !currentUser()) return renderAuth();
  if (route === "home") return renderHome();
  if (route === "catalog") return renderCatalog();
  if (route === "orders") return renderOrders(activeOrdersTab);
  if (route === "messages") return renderMessages();
  if (route === "support") return renderSupport();
  if (route === "referrals") return renderReferrals(activeReferralTab);
  if (route === "exchange") return renderExchangeCatalog();
  if (route === "exchange-profile") return renderExchangeProfile(activeExchangeId, activeExchangeTab);
  if (route === "exchange-chat") return renderExchangeChat(activeExchangeId);
  if (route === "exchange-admin") return renderExchangeOperator();
  if (["wallet"].includes(route)) return renderSimplePage(route);
  if (route === "admin") return renderAdmin();
  if (route === "seller") return renderSeller();
  if (route === "store") return renderStore(activeStoreId || db.stores[0].id, activeStoreTab);
  if (route === "chat") return renderChat(activeStoreId || db.stores[0].id);
  renderHome();
}

async function initApp() {
  await loadRemoteConfig();
  await loadRemoteSession();
  renderCurrent();
}

initApp();
