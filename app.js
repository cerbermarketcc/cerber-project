const STORE_KEY = "cerber_state_v1";
const LEGACY_STORE_KEY = "cerber_demo_state_v1";
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
const KENT_IMAGE = "assets/kent-ltc-card.png";
let ltcUsdCache = 54.2;

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
      description: "",
      ltcWallet: "ltc1qnl73w78t8v39kkjqd5jgr2y8a62g4mh4rhu6lu",
      image: "assets/soleniy-malchik.jpg",
      cover: "assets/soleniy-malchik.jpg",
      orders: 0,
      reviews: 1,
      rating: 5,
      products: [
        {
          id: "courier-work",
          title: "Подработка",
          category: "Работа / Курьер",
          description: "",
          price: "50$",
          priceUsd: 50,
          image: "assets/soleniy-malchik.jpg",
          images: ["assets/soleniy-malchik.jpg"],
          sellerManaged: true,
          deliveryItems: [],
          rating: 5,
          reviews: 1,
          purchases: 0,
          positions: [
            {
              id: "courier-checany",
              title: "Подработка",
              description: "",
              priceUsd: 50,
              country: "moldova",
              city: "chisinau",
              district: "",
              deliveryType: "Курьер",
              stock: 1,
              status: "ready"
            }
          ],
          reviewsList: []
        }
      ],
      reviewsList: []
    }
  ],
  messages: [],
  orders: [],
  exchangeCards: [
    {
      id: "kent-ltc",
      name: "KENT LTC",
      ownerLogin: "skboy",
      description: "По всей Молдове. Выберите обмен или обнал, укажите сумму в долларах или LTC, реквизиты и отправьте заявку оператору.",
      image: KENT_IMAGE,
      regions: ["moldova"],
      exchangeRate: 19,
      cashoutRate: 17,
      ltcUsd: 54.2,
      ltcWallet: "ltc1qrj4ca4m2r0njnf97xtsvmtl9472z9zquc5aszh",
      requisites: defaultExchangeRequisites,
      active: true
    }
  ],
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
};

let db = loadDb();
let route = "home";
let activeStoreId = "";
let activeStoreTab = "positions";
let activeProductId = "";
let activePositionId = "";
let authMode = "login";
let activeOrdersTab = "all";
let activeReferralTab = "referrals";
let activeExchangeId = "kent-ltc";
let activeExchangeTab = "calculator";
let activeExchangeOrderId = "";

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
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY));
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
  if (!next.ltcBalances) next.ltcBalances = {};
  if (!next.paymentSettings) next.paymentSettings = structuredClone(defaults.paymentSettings);
  const previousPaymentProvider = next.paymentSettings.provider;
  next.paymentSettings.provider = "nowpayments";
  if (previousPaymentProvider !== "nowpayments") next.paymentSettings.platformCommissionPercent = 0;
  next.paymentSettings.platformCommissionPercent = Number(next.paymentSettings.platformCommissionPercent || 0);
  if (!next.referralPeriod) next.referralPeriod = {};
  if (!next.filters) next.filters = structuredClone(defaults.filters);
  (next.users || []).forEach((user) => {
    if (!user.createdAt) user.createdAt = "2026-05-28";
    if (!next.balances[user.login]) next.balances[user.login] = 0;
    if (!next.ltcBalances[user.login]) next.ltcBalances[user.login] = 0;
  });
  normalizeOrders(next);
  next.stores = (next.stores || []).map((store) => {
    const seed = defaults.stores.find((item) => item.id === store.id);
    if (store.id === "skboy" && /демо|demo/i.test(String(store.description || ""))) store.description = "";
    if (store.id === "skboy" && (!store.ltcWallet || store.ltcWallet === "ltc1q-store-wallet")) {
      store.ltcWallet = "ltc1qnl73w78t8v39kkjqd5jgr2y8a62g4mh4rhu6lu";
    }
    return {
      ...store,
      orders: Number.isFinite(Number(store.orders)) ? Number(store.orders) : NEW_STORE_STATS.orders,
      reviews: Number.isFinite(Number(store.reviews)) ? Number(store.reviews) : NEW_STORE_STATS.reviews,
      rating: Number.isFinite(Number(store.rating)) ? Number(store.rating) : NEW_STORE_STATS.rating,
      ltcWallet: store.ltcWallet || seed?.ltcWallet || "",
      products: Array.isArray(store.products) ? store.products.map((product) => normalizeProduct(product, store)) : [],
      reviewsList: Array.isArray(store.reviewsList) ? store.reviewsList : (seed?.reviewsList || [])
    };
  });
  next.exchangeCards = next.exchangeCards.map(normalizeExchangeCard);
  if (!next.exchangeCards.length) next.exchangeCards = structuredClone(defaults.exchangeCards).map(normalizeExchangeCard);
}

function normalizeProduct(product, store = {}) {
  let priceUsd = Number(product.priceUsd || String(product.price || "").replace(/[^0-9.]/g, "")) || 0;
  if ((product.id === "courier-work" || /courier/i.test(String(product.id || ""))) && !product.sellerManaged) {
    product = {
      ...product,
      title: "Подработка",
      category: "Работа / Курьер",
      description: "",
      price: "50$",
      priceUsd: 50,
      image: product.image || "assets/soleniy-malchik.jpg",
      images: Array.isArray(product.images) && product.images.length ? product.images.slice(0, 5) : ["assets/soleniy-malchik.jpg"],
      reviewsList: [],
      positions: [
        {
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
        }
      ]
    };
    priceUsd = 50;
  }
  const deliveryItems = Array.isArray(product.deliveryItems)
    ? product.deliveryItems.map((item) => String(item || "").trim()).filter(Boolean)
    : String(product.deliveryItemsText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return {
    ...product,
    id: product.id || `product-${Date.now()}`,
    title: product.title || "Товар",
    category: product.category || "Разное",
    description: product.description || "",
    priceUsd,
    price: product.price || (priceUsd ? `от ${priceUsd}$` : "0 $"),
    image: product.image || store.image || fallbackImage,
    images: Array.isArray(product.images) && product.images.length ? product.images.slice(0, 5) : [product.image || store.image || fallbackImage],
    rating: Number(product.rating || 5),
    reviews: Number(product.reviews || 0),
    purchases: Number(product.purchases || 0),
    sellerManaged: Boolean(product.sellerManaged),
    deliveryItems,
    positions: Array.isArray(product.positions) ? product.positions.map((position) => ({
      id: position.id || `position-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: position.title || position.district || "Позиция",
      description: position.description || "",
      priceUsd: Number(position.priceUsd || priceUsd || 0),
      country: position.country || "moldova",
      city: position.city || "chisinau",
      district: position.district || "",
      deliveryType: position.deliveryType || "Курьер",
      stock: deliveryItems.length || Number(position.stock || 0),
      status: position.status || "ready"
    })) : [],
    reviewsList: Array.isArray(product.reviewsList) ? product.reviewsList : []
  };
}

function normalizeExchangeCard(card) {
  const seed = defaults.exchangeCards.find((item) => item.id === card.id) || defaults.exchangeCards[0];
  const requisites = Array.isArray(card.requisites) && card.requisites.length ? card.requisites : seed.requisites;
  const image = card.id === "kent-ltc" && (!card.image || card.image === "assets/market-banner.png") ? KENT_IMAGE : (card.image || seed.image);
  return {
    ...seed,
    ...card,
    image,
    regions: Array.isArray(card.regions) && card.regions.length ? card.regions : seed.regions,
    exchangeRate: Number.isFinite(Number(card.exchangeRate)) ? Number(card.exchangeRate) : seed.exchangeRate,
    cashoutRate: Number.isFinite(Number(card.cashoutRate)) ? Number(card.cashoutRate) : seed.cashoutRate,
    ltcUsd: Number.isFinite(Number(card.ltcUsd)) ? Number(card.ltcUsd) : seed.ltcUsd,
    ltcWallet: String(card.ltcWallet || seed.ltcWallet || "").trim(),
    requisites: requisites.map((item) => ({
      method: item.method,
      value: String(item.value || "").trim(),
      active: item.active !== false
    })).filter((item) => item.method),
    active: card.active !== false
  };
}

function restoreReservedProductItem(order, next = db) {
  if ((!order?.reservedDescription && !order?.reservedStock) || order.reservationRestored) return;
  const store = (next.stores || []).find((item) => item.id === order.storeId);
  const product = (store?.products || []).find((item) => item.id === order.productId);
  const position = (product?.positions || []).find((item) => item.id === order.positionId);
  if (product && order.reservedDescription) {
    product.deliveryItems = [order.reservedDescription, ...(product.deliveryItems || [])];
  }
  if (position) position.stock = Number(position.stock || 0) + 1;
  order.reservationRestored = true;
}

function normalizeOrders(next) {
  const now = Date.now();
  next.orders = (next.orders || []).map((order) => {
    const createdAt = order.createdAt || now;
    const age = now - Number(createdAt);
    if (order.type === "product") {
      if (order.status === "pending_payment" && order.paymentExpiresAt && now >= Number(order.paymentExpiresAt)) {
        restoreReservedProductItem(order, next);
        return { ...order, status: "canceled", paymentStatus: "expired", canceledAt: now, cancelReason: "Бронь 40 минут истекла" };
      }
      if (order.disputeOpen && order.disputeUntil && now >= Number(order.disputeUntil)) {
        return { ...order, status: "completed", disputeOpen: false, closedAt: now, closeReason: "Спор автоматически закрыт по истечении 12 часов" };
      }
      return {
        ...order,
        createdAt,
        paymentStatus: order.paymentStatus || (order.status === "completed" ? "paid" : "waiting"),
        paymentExpiresAt: order.paymentExpiresAt || (order.status === "pending_payment" ? Number(createdAt) + 40 * 60 * 1000 : null)
      };
    }
    if (order.disputeOpen && order.disputeUntil && now >= Number(order.disputeUntil)) {
      return { ...order, status: "closed", disputeOpen: false, closedAt: now, closeReason: "Спор автоматически закрыт по истечении 12 часов" };
    }
    if (order.status === "active" && !order.disputeOpen && age >= 12 * 60 * 60 * 1000) {
      return { ...order, status: "closed", closedAt: now, closeReason: "Автоматически закрыт как успешный" };
    }
    return { ...order, createdAt };
  });
  next.exchangeRequests = (next.exchangeRequests || []).map((request) => {
    if (request.disputeOpen && request.disputeUntil && now >= Number(request.disputeUntil)) {
      return { ...request, status: "closed", disputeOpen: false, closedAt: now };
    }
    return request;
  });
}

function exchangeStatusLabel(status) {
  const labels = {
    new: "Новая",
    active: "Ожидает оператора",
    processing: "В работе",
    dispute: "Спор",
    closed: "Закрыта",
    canceled: "Отменена"
  };
  return labels[status] || "Активная";
}

function exchangeTypeLabel(type) {
  return type === "cashout" ? "Сдать LTC" : "Купить LTC";
}

function exchangeOrderById(id) {
  return db.orders.find((order) => order.id === id || order.exchangeRequestId === id);
}

function syncExchangeOrder(request) {
  const order = exchangeOrderById(request.id);
  if (!order) return;
  order.status = request.status === "dispute" ? "dispute" : request.status === "closed" ? "closed" : "active";
  order.disputeOpen = request.disputeOpen || request.status === "dispute";
  order.disputeUntil = request.disputeUntil;
  order.closedAt = request.closedAt;
}

function calculateExchangeQuote(card, type, amount, currency) {
  const ltcUsd = Number(card.ltcUsd || ltcUsdCache || 0);
  const amountValue = Math.max(0, Number(amount) || 0);
  const amountUsd = currency === "ltc" ? amountValue * ltcUsd : amountValue;
  const ltcAmount = ltcUsd > 0 ? amountUsd / ltcUsd : 0;
  const rate = type === "cashout" ? Number(card.cashoutRate) : Number(card.exchangeRate);
  return {
    amountUsd,
    ltcAmount,
    totalMdl: amountUsd * rate,
    rate,
    ltcUsd
  };
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
          ltcBalances: db.ltcBalances,
          paymentSettings: db.paymentSettings,
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
  if (isAdmin()) return db.stores;
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

function userLtcBalance(login = db.currentUser) {
  return Number(db.ltcBalances?.[login] || 0);
}

function userLtcUsdBalance(login = db.currentUser) {
  return userLtcBalance(login) * Number(ltcUsdCache || 0);
}

function storeById(id = activeStoreId) {
  return db.stores.find((store) => store.id === id) || db.stores[0];
}

function productById(store, id = activeProductId) {
  return (store?.products || []).find((product) => product.id === id) || store?.products?.[0] || null;
}

function positionById(product, id = activePositionId) {
  return (product?.positions || []).find((position) => position.id === id) || product?.positions?.[0] || null;
}

function usdToLtc(amountUsd) {
  const rate = Number(ltcUsdCache || 0);
  return rate > 0 ? Number(amountUsd || 0) / rate : 0;
}

function locationLabel(position = {}) {
  const city = filterOptions.countries[position.country]?.cities?.[position.city]?.label || position.city || "";
  return [city, position.district].filter(Boolean).join(", ");
}

function orderCanDispute(order) {
  if (!order || order.type !== "product" || order.status !== "completed") return false;
  const paidAt = Number(order.paidAt || order.completedAt || 0);
  return paidAt > 0 && Date.now() - paidAt <= 12 * 60 * 60 * 1000;
}

function productPaymentUrl(order) {
  return order.paymentUrl || "";
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

async function fetchLitecoinUsdRate() {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd", { cache: "no-store" });
    const data = await response.json();
    const value = Number(data?.litecoin?.usd);
    if (value > 0) {
      ltcUsdCache = value;
      db.exchangeCards.forEach((card) => {
        if (card.id === "kent-ltc" || Number(card.ltcUsd || 0) <= 0) card.ltcUsd = value;
      });
      return value;
    }
  } catch {
    // Public rate API can be unavailable; each card keeps its saved fallback rate.
  }
  return ltcUsdCache;
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
  const ltcBalance = userLtcBalance();
  const ltcUsd = userLtcUsdBalance();
  root.innerHTML = `
    <main class="app">
      <header class="topbar">
        <button class="logo-button" data-route="home"><img class="logo" src="assets/logo1-white.png" alt="CERBER"></button>
        <button class="balance" data-account>
          <strong>${ltcBalance.toFixed(6)} LTC</strong>
          <span>${ltcUsd.toFixed(2)} $</span>
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
  const active = orders.filter((order) => ["active", "pending_payment"].includes(order.status) && !order.disputeOpen);
  const completed = orders.filter((order) => ["completed", "closed"].includes(order.status) && !order.disputeOpen);
  const disputes = orders.filter((order) => order.disputeOpen || order.status === "dispute");
  const list = tab === "active" ? active : tab === "completed" ? completed : tab === "disputes" ? disputes : orders;
  layout(`
    <section class="screen orders-screen">
      <h1 class="big-title">Заказы</h1>
      <div class="order-tabs">
        <button class="${tab === "all" ? "active" : ""}" data-order-tab="all">Все <span>${orders.length}</span></button>
        <button class="${tab === "active" ? "active" : ""}" data-order-tab="active">Активные <span>${active.length}</span></button>
        <button class="${tab === "completed" ? "active" : ""}" data-order-tab="completed">Завершённые <span>${completed.length}</span></button>
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
  document.querySelectorAll("[data-order-open]").forEach((button) => {
    button.onclick = () => {
      const order = db.orders.find((item) => item.id === button.dataset.orderOpen);
      if (order?.type === "product") return showProductOrder(order.id);
      renderExchangeOrderDetail(button.dataset.orderOpen);
    };
  });
  document.querySelectorAll("[data-order-dispute]").forEach((button) => {
    button.onclick = () => openProductDispute(button.dataset.orderDispute);
  });
  document.querySelectorAll("[data-order-close]").forEach((button) => {
    button.onclick = () => closeExchangeOrder(button.dataset.orderClose, "closed");
  });
  document.querySelectorAll("[data-order-pay]").forEach((button) => {
    button.onclick = () => renderProductPaymentOrder(button.dataset.orderPay);
  });
  document.querySelectorAll("[data-order-cancel]").forEach((button) => {
    button.onclick = () => cancelProductOrder(button.dataset.orderCancel);
  });
}

function orderCard(order) {
  const request = order.exchangeRequestId ? exchangeRequestById(order.exchangeRequestId) : null;
  const status = request ? exchangeStatusLabel(request.status) : productOrderStatus(order);
  return `
    <article class="order-card">
      <div>
        <h3>${esc(order.product || "Заявка")}</h3>
        <p>${esc(order.storeName || "")}</p>
        <p>${Number(order.amountUsd || 0).toFixed(2)} $${order.location ? ` · ${esc(order.location)}` : ""}</p>
        ${order.status === "pending_payment" ? `<p>Бронь до ${new Date(Number(order.paymentExpiresAt || 0)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>` : ""}
        ${order.status === "completed" ? `<p>Оплачено. ${esc(order.productDescription || "Описание будет доступно в деталях заказа.")}</p>` : ""}
        ${order.totalMdl ? `<p>${Number(order.amountUsd || 0).toFixed(2)} $ · ${Number(order.ltcAmount || request?.ltcAmount || 0).toFixed(6)} LTC · ${Number(order.totalMdl || 0).toFixed(2)} MDL</p>` : ""}
      </div>
      <div class="order-side">
        <span>${status}</span>
        <button data-order-open="${esc(order.exchangeRequestId || order.id)}">Детали</button>
        ${order.status === "pending_payment" ? `<button data-order-pay="${esc(order.id)}">Оплатить</button><button data-order-cancel="${esc(order.id)}">Отменить</button>` : ""}
        ${orderCanDispute(order) ? `<button data-order-dispute="${esc(order.id)}">Открыть спор</button>` : ""}
      </div>
    </article>
  `;
}

function productOrderStatus(order) {
  if (order.disputeOpen || order.status === "dispute") return "Спор";
  if (order.status === "pending_payment") return "Ожидает оплату";
  if (order.status === "completed") return "Завершён";
  if (order.status === "canceled") return "Отменён";
  if (order.status === "closed") return "Закрыт";
  return "Активный";
}

function showProductOrder(orderId) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) return;
  showModal(`
    <h2>${esc(order.product)}</h2>
    <p>${esc(order.storeName || "")}</p>
    <p>${esc(order.location || "")}</p>
    <p>Цена: ${Number(order.amountUsd || 0).toFixed(2)} $</p>
    <p>Статус: ${productOrderStatus(order)}</p>
    ${order.status === "completed" ? `<p><strong>Успешно оплачено.</strong></p><p>${esc(order.reservedDescription || order.productDescription || "")}</p>` : ""}
    ${order.status === "pending_payment" ? `<p>Бронь активна до ${new Date(Number(order.paymentExpiresAt || 0)).toLocaleString()}</p><button class="primary" data-order-pay="${esc(order.id)}">Оплатить</button>` : ""}
    ${orderCanDispute(order) ? `<button class="ghost-button" data-order-dispute="${esc(order.id)}">Открыть спор</button>` : ""}
    <button class="primary" data-close-modal>${tr("close")}</button>
  `);
  document.querySelector("[data-order-pay]")?.addEventListener("click", (event) => renderProductPaymentOrder(event.currentTarget.dataset.orderPay));
  document.querySelector("[data-order-dispute]")?.addEventListener("click", (event) => openProductDispute(event.currentTarget.dataset.orderDispute));
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
    : (store.products.length ? store.products.map((product) => productCardView(product, store)).join("") : `<article class="panel empty-state"><p>${tr("positions")} появятся позже</p></article>`);
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
      <button class="product-click" data-product-store="${esc(store.id)}" data-product="${esc(product.id)}">
        <img class="product-image" src="${esc(product.image || store.image || fallbackImage)}" alt="">
      <div class="product-body">
        <h3>${esc(product.title)}</h3>
        <p>${esc(product.category)}</p>
        <p><strong>${esc(store.name)}</strong> <span class="verify">✓</span></p>
        <p class="price">${esc(product.price || `от ${Number(product.priceUsd || 0).toFixed(0)}$`)}</p>
        <p>${Number(product.rating || 5).toFixed(2)} / ${esc(product.reviews || 0)} · ${esc(product.purchases || 0)} покупок</p>
        </div>
      </button>
    </article>
  `;
}

function productCardView(product, store) {
  const minPrice = Number(product.priceUsd || 0);
  return `
    <article class="product-card mega-product-card">
      <button class="product-click" data-product-store="${esc(store.id)}" data-product="${esc(product.id)}">
        <img class="product-image" src="${esc(product.image || store.image || fallbackImage)}" alt="">
        <div class="product-body mega-product-body">
          <div class="product-icon-row">
            <span>▦</span><span>⌂</span><span>●</span><span>◌</span><span>⌁</span>
            <i></i><span>☻</span><span>❄</span><span>◎</span>
          </div>
          <h3>${esc(product.title)}</h3>
          <p class="desc">${esc(product.category)}</p>
          <p><strong>${esc(store.name)}</strong> <span class="verify">✓</span></p>
          <p class="price">${minPrice.toFixed(0)}$</p>
          <p class="rating-line"><span class="ok-dot">✓</span><span class="time-dot">◔</span><span class="star-dot">★</span>${Number(product.rating || 5).toFixed(2)} / ${esc(product.reviews || 0)}</p>
        </div>
      </button>
    </article>
  `;
}

function productPositions(product) {
  const filters = db.filters || {};
  return (product.positions || []).filter((position) => {
    if (filters.country && position.country && filters.country !== position.country) return false;
    if (filters.city && position.city && filters.city !== position.city) return false;
    if (filters.district && position.district && filters.district !== position.district) return false;
    return true;
  });
}

function currentLocationFilterLabel() {
  const filters = db.filters || {};
  const country = filterOptions.countries[filters.country] || filterOptions.countries.moldova;
  const city = country.cities?.[filters.city];
  return filters.district || city?.label || "Любой город";
}

function renderProductView(storeId, productId) {
  route = "product";
  activeStoreId = storeId;
  activeProductId = productId;
  const store = storeById(storeId);
  const product = productById(store, productId);
  if (!product) return renderStore(store.id, "positions");
  const positions = productPositions(product);
  const images = (product.images || [product.image || store.image]).slice(0, 5);
  layout(`
    <section class="screen product-screen mega-product-screen">
      <p class="breadcrumbs">Магазины &gt; ${esc(store.name)} &gt; ${esc(product.title)}</p>
      <h1 class="product-page-title">${esc(product.title)}</h1>
      <p class="product-page-category">${esc(product.category)}</p>
      <div class="mega-gallery">
        <img class="mega-gallery-main" src="${esc(images[0] || store.image || fallbackImage)}" alt="${esc(product.title)}">
        <div class="mega-gallery-side">
          ${images.slice(1).map((image) => `<img src="${esc(image)}" alt="">`).join("")}
        </div>
      </div>
      <article class="product-copy">
        ${product.description ? `<p>${esc(product.description)}</p><button class="read-button" data-read-product="${esc(product.id)}">Показать больше</button>` : ""}
        <p class="shop-line"><span>Магазин:</span> <strong>${esc(store.name)}</strong> <span class="verify">✓</span></p>
        <p class="price">${Number(product.priceUsd || 0).toFixed(0)}$</p>
        <p class="rating-line big-stars"><span class="star-text">${stars(Math.round(product.rating || 5))}</span> ${Number(product.rating || 5).toFixed(2)} / ${esc(product.reviews || 0)}</p>
      </article>
      <button class="location-select" data-filters>${esc(currentLocationFilterLabel())}<span>⌄</span></button>
      <div class="pill-tabs">
        <button>Доступные позиции <span>${positions.length}</span></button>
        <button class="muted">Отзывы <span>${esc(product.reviews || 0)}</span></button>
      </div>
      <div class="product-mode-tabs"><button class="active">Любой</button><button>Готовый</button><button>Предзаказ</button></div>
      ${positions.length ? positions.map((position) => positionCardView(position, product, store)).join("") : `
        <article class="panel empty-state">
          <p>По выбранным фильтрам товаров нет.</p>
          <button class="primary" data-filters>Открыть фильтры</button>
        </article>
      `}
    </section>
  `);
  document.querySelector("[data-read-product]")?.addEventListener("click", () => {
    showModal(`<h2>${esc(product.title)}</h2><p>${esc(product.description || "")}</p><button class="primary" data-close-modal>${tr("close")}</button>`);
  });
}

function positionCardView(position, product, store) {
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  return `
    <article class="position-card mega-position-card">
      <div class="position-grid mega-position-grid">
        <p><span>Кол-во</span><strong>${esc(position.stock || 0)} шт</strong></p>
        <p><span>Тип</span><strong>${esc(position.deliveryType || "Курьер")}</strong></p>
        <p><span>Цена</span><strong>${priceUsd.toFixed(0)} $</strong></p>
        <p><span>Оплата</span><strong>позже</strong></p>
        <p class="wide"><span>Локация</span><strong>${esc(locationLabel(position))}</strong></p>
      </div>
      ${position.description ? `<p class="desc">${esc(position.description)}</p>` : ""}
      <button class="primary buy-button" data-buy-position="${esc(position.id)}" data-product-store="${esc(store.id)}" data-product="${esc(product.id)}" ${Number(position.stock || 0) <= 0 ? "disabled" : ""}>Купить</button>
    </article>
  `;
}

function renderProduct(storeId, productId) {
  route = "product";
  activeStoreId = storeId;
  activeProductId = productId;
  const store = storeById(storeId);
  const product = productById(store, productId);
  if (!product) return renderStore(store.id, "positions");
  const positions = productPositions(product);
  const ltc = usdToLtc(product.priceUsd || 0);
  layout(`
    <section class="screen product-screen">
      <p class="breadcrumbs">Магазины > ${esc(store.name)} > ${esc(product.title)}</p>
      <article class="panel product-detail">
        <div class="product-gallery">
          ${(product.images || [product.image]).slice(0, 5).map((image) => `<img src="${esc(image || store.image || fallbackImage)}" alt="${esc(product.title)}">`).join("")}
        </div>
        <div class="product-detail-body">
          <h1>${esc(product.title)}</h1>
          <p class="desc">${esc(product.category)}</p>
          <p>${esc(product.description || "")}</p>
          <p><strong>Магазин:</strong> ${esc(store.name)} <span class="verify">вњ“</span></p>
          <div class="product-stats">
            <span>${esc(product.purchases || 0)} покупок</span>
            <span>${esc(product.reviews || 0)} отзывов</span>
            <span>${Number(product.rating || 5).toFixed(2)} ★</span>
          </div>
          <p class="price">от ${Number(product.priceUsd || 0).toFixed(2)} $ · ${ltc.toFixed(6)} LTC</p>
        </div>
      </article>
      <div class="pill-tabs">
        <button>Доступные позиции <span>${positions.length}</span></button>
        <button class="muted">Отзывы <span>${esc(product.reviews || 0)}</span></button>
      </div>
      ${positions.length ? positions.map((position) => positionCard(position, product, store)).join("") : `
        <article class="panel empty-state">
          <p>По выбранным фильтрам позиций нет. Измените город или район в фильтрах.</p>
          <button class="primary" data-filters>Открыть фильтры</button>
        </article>
      `}
    </section>
  `);
  fetchLitecoinUsdRate().then(() => {
    if (route === "product" && activeProductId === productId) {
      document.querySelectorAll("[data-ltc-price]").forEach((node) => {
        node.textContent = `${usdToLtc(Number(node.dataset.usd || 0)).toFixed(6)} LTC`;
      });
    }
  });
}

function positionCard(position, product, store) {
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  return `
    <article class="panel position-card">
      <div>
        <h3>${esc(position.title || product.title)}</h3>
        <p>${esc(position.description || product.description || "")}</p>
      </div>
      <div class="position-grid">
        <p><span>Кол-во</span><strong>${esc(position.stock || 0)} шт</strong></p>
        <p><span>Тип</span><strong>${esc(position.deliveryType || "Курьер")}</strong></p>
        <p><span>Цена</span><strong>${priceUsd.toFixed(2)} $</strong></p>
        <p><span>LTC</span><strong data-ltc-price data-usd="${priceUsd}">${usdToLtc(priceUsd).toFixed(6)} LTC</strong></p>
        <p><span>Локация</span><strong>${esc(locationLabel(position))}</strong></p>
      </div>
      <button class="primary" data-buy-position="${esc(position.id)}" data-product-store="${esc(store.id)}" data-product="${esc(product.id)}" ${Number(position.stock || 0) <= 0 ? "disabled" : ""}>Купить</button>
    </article>
  `;
}

function renderProductPayment(storeId, productId, positionId) {
  route = "product-payment";
  activeStoreId = storeId;
  activeProductId = productId;
  activePositionId = positionId;
  const store = storeById(storeId);
  const product = productById(store, productId);
  const position = positionById(product, positionId);
  if (!product || !position) return renderStore(store.id, "positions");
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  const ltcAmount = usdToLtc(priceUsd);
  const balance = userLtcBalance();
  const enough = balance >= ltcAmount && ltcAmount > 0;
  layout(`
    <section class="screen product-payment-screen">
      <h1>Оплата</h1>
      <article class="panel payment-product">
        <img src="${esc(product.image || store.image || fallbackImage)}" alt="">
        <div>
          <h2>${esc(product.title)}</h2>
          <p>${esc(position.title)} · ${esc(locationLabel(position))}</p>
          <p>${esc(product.category)}</p>
        </div>
      </article>
      <article class="panel payment-wallet">
        <h3>Внутренний кошелек LTC</h3>
        <p>Баланс: ${balance.toFixed(6)} LTC</p>
        <p>${userLtcUsdBalance().toFixed(2)} $ по текущему курсу</p>
      </article>
      <article class="panel payment-summary">
        <p><span>Стоимость</span><strong>${priceUsd.toFixed(2)} $</strong></p>
        <p><span>Курс LTC</span><strong>1 LTC ≈ ${Number(ltcUsdCache || 0).toFixed(2)} $</strong></p>
        <p><span>Сумма к оплате</span><strong>${ltcAmount.toFixed(6)} LTC</strong></p>
      </article>
      ${enough ? "" : `<article class="alert">Недостаточно средств на LTC балансе для оплаты этим способом</article>`}
      <button class="primary" data-confirm-product-pay ${enough ? "" : "disabled"}>Оплатить</button>
      <p class="desc center">Нажимая на кнопку оплаты, вы соглашаетесь с правилами площадки.</p>
    </section>
  `);
  fetchLitecoinUsdRate();
  document.querySelector("[data-confirm-product-pay]")?.addEventListener("click", () => handleProductPurchase(store.id, product.id, position.id));
}

function renderProductPaymentView(storeId, productId, positionId) {
  route = "product-payment";
  activeStoreId = storeId;
  activeProductId = productId;
  activePositionId = positionId;
  const store = storeById(storeId);
  const product = productById(store, productId);
  const position = positionById(product, positionId);
  if (!product || !position) return renderStore(store.id, "positions");
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  const ltcAmount = usdToLtc(priceUsd);
  const balance = userLtcBalance();
  const enough = balance >= ltcAmount && ltcAmount > 0;
  layout(`
    <section class="screen product-payment-screen mega-payment-screen">
      <p class="breadcrumbs">Магазины &gt; ${esc(store.name)} &gt; Оплата</p>
      <article class="payment-summary-card">
        <div>
          <h2>${esc(product.title)}</h2>
          <p>Готовая позиция (${esc(position.stock || 0)} шт)</p>
          <p>${esc(product.category)}</p>
          <p><span>Магазин:</span> <strong>${esc(store.name)}</strong> <span class="verify">✓</span></p>
          <p><span>Локация:</span> ${esc(locationLabel(position))}</p>
          <p><span>Стоимость:</span> ${priceUsd.toFixed(0)} $</p>
        </div>
        <img src="${esc(product.image || store.image || fallbackImage)}" alt="">
      </article>
      <div class="payment-head-row">
        <h1>Оплата</h1>
        <button class="ghost-button" data-route="wallet">Изменить способ оплаты</button>
      </div>
      <article class="wallet-card-ltc">
        <div>
          <h3>Внутренний кошелек LTC</h3>
          <p>Баланс: ${balance.toFixed(6)} LTC</p>
          <strong>${ltcAmount.toFixed(6)} LTC</strong>
        </div>
        <div class="ltc-coin">Ł</div>
      </article>
      <article class="payment-lines">
        <p><span>Товары</span><strong>1</strong></p>
        <p><span>Стоимость товара</span><strong>${priceUsd.toFixed(0)} $</strong></p>
        <p><span>Курс LTC</span><strong>1 LTC ≈ ${Number(ltcUsdCache || 0).toFixed(2)} $</strong></p>
        <p><span>Сумма к оплате</span><strong>${ltcAmount.toFixed(6)} LTC</strong></p>
      </article>
      ${enough ? "" : `<article class="alert">Недостаточно средств на балансе для оплаты данным способом</article>`}
      <button class="primary pay-submit" data-confirm-product-pay ${enough ? "" : "disabled"}>Оплатить</button>
      <p class="desc center">Нажимая на кнопку оплатить, вы соглашаетесь с <button class="inline-link" data-rules>Правилами площадки</button></p>
    </section>
  `);
  fetchLitecoinUsdRate();
  document.querySelector("[data-confirm-product-pay]")?.addEventListener("click", () => handleProductPurchase(store.id, product.id, position.id));
}

function handleProductPurchase(storeId, productId, positionId) {
  const store = storeById(storeId);
  const product = productById(store, productId);
  const position = positionById(product, positionId);
  if (!product || !position) return;
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  const ltcAmount = usdToLtc(priceUsd);
  if (userLtcBalance() < ltcAmount) return;
  db.ltcBalances[db.currentUser] = userLtcBalance() - ltcAmount;
  db.orders.unshift({
    id: `order-${Date.now()}`,
    type: "product",
    login: db.currentUser,
    storeId,
    productId,
    positionId,
    product: product.title,
    storeName: store.name,
    status: "active",
    createdAt: Date.now(),
    amountUsd: priceUsd,
    ltcAmount,
    location: locationLabel(position)
  });
  saveDb();
  renderOrders("active");
}

function handleProductReservation(storeId, productId, positionId) {
  const store = storeById(storeId);
  const product = productById(store, productId);
  const position = positionById(product, positionId);
  if (!product || !position) return;
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  if (Number(position.stock || 0) <= 0) return showToast("Товара сейчас нет");
  const requiresIssuedDescription = Array.isArray(product.deliveryItems) && product.deliveryItems.length > 0;
  const reservedDescription = (product.deliveryItems || []).shift() || "";
  if (!reservedDescription && requiresIssuedDescription) return showToast("Нет доступных описаний для выдачи");
  position.stock = Math.max(0, Number(position.stock || 0) - 1);
  const commissionPercent = Number(db.paymentSettings?.platformCommissionPercent || 0);
  const commissionUsd = priceUsd * commissionPercent / 100;
  const order = {
    id: `order-${Date.now()}`,
    type: "product",
    login: db.currentUser,
    storeId,
    productId,
    positionId,
    product: product.title,
    storeName: store.name,
    status: "pending_payment",
    paymentStatus: "waiting",
    createdAt: Date.now(),
    paymentExpiresAt: Date.now() + 40 * 60 * 1000,
    amountUsd: priceUsd,
    location: locationLabel(position),
    productDescription: product.description || "",
    reservedDescription,
    reservedStock: true,
    sellerLtcWallet: store.ltcWallet || "",
    platformLtcWallet: db.paymentSettings?.platformLtcWallet || "",
    platformCommissionPercent: commissionPercent,
    platformCommissionUsd: commissionUsd,
    sellerAmountUsd: priceUsd - commissionUsd,
    paymentProvider: "nowpayments"
  };
  db.orders.unshift(order);
  saveDb();
  renderProductPaymentOrder(order.id);
}

function renderProductPaymentOrder(orderId) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) return renderOrders("active");
  route = "orders";
  const payUrl = productPaymentUrl(order);
  layout(`
    <section class="screen product-payment-screen mega-payment-screen">
      <p class="breadcrumbs">Заказы &gt; ${esc(order.product)} &gt; Оплата</p>
      <article class="payment-summary-card">
        <div>
          <h2>${esc(order.product)}</h2>
          <p>${esc(order.storeName || "")}</p>
          <p><span>Город:</span> ${esc(order.location || "")}</p>
          <p><span>Стоимость:</span> ${Number(order.amountUsd || 0).toFixed(2)} $</p>
          <p><span>Бронь:</span> до ${new Date(Number(order.paymentExpiresAt || 0)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <img src="${esc(storeById(order.storeId)?.image || fallbackImage)}" alt="">
      </article>
      <article class="panel">
        <h2>Оплата через NOWPayments</h2>
        <p>Оплата принимается в LTC. Средства идут на LTC-счёт магазина.</p>
        <p>Комиссия площадки: ${Number(order.platformCommissionPercent || 0).toFixed(2)}%.</p>
        <p class="desc">После подтверждения NOWPayments заказ автоматически станет завершённым, а описание из строки выдачи появится в деталях заказа.</p>
        ${payUrl ? `<a class="primary link-button" href="${esc(payUrl)}" target="_blank" rel="noopener">Открыть оплату</a>` : `<button class="primary" data-create-now-payment="${esc(order.id)}">Создать ссылку оплаты</button>`}
        <button class="ghost-button" data-order-cancel="${esc(order.id)}">Отменить заказ</button>
      </article>
    </section>
  `);
  document.querySelector("[data-create-now-payment]")?.addEventListener("click", (event) => createNowPaymentsInvoice(event.currentTarget.dataset.createNowPayment));
  document.querySelector("[data-order-cancel]")?.addEventListener("click", (event) => cancelProductOrder(event.currentTarget.dataset.orderCancel));
}

async function createNowPaymentsInvoice(orderId) {
  try {
    const payload = await apiFetch("/api/payments/nowpayments/create", {
      method: "POST",
      body: JSON.stringify({ orderId })
    });
    applyRemoteState(payload);
    const order = db.orders.find((item) => item.id === orderId);
    if (payload.paymentUrl && order) order.paymentUrl = payload.paymentUrl;
    saveDb();
    renderProductPaymentOrder(orderId);
  } catch (error) {
    showToast(error.message || "Не удалось создать оплату");
  }
}

function markProductOrderPaid(orderId) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order || order.status !== "pending_payment") return;
  const store = storeById(order.storeId);
  const product = productById(store, order.productId);
  const position = positionById(product, order.positionId);
  order.status = "completed";
  order.paymentStatus = "paid";
  order.paidAt = Date.now();
  order.completedAt = Date.now();
  if (product) product.purchases = Number(product.purchases || 0) + 1;
  if (store) store.orders = Number(store.orders || 0) + 1;
  saveDb();
  showModal(`
    <h2>Оплата успешна</h2>
    <p>Вы оплатили заказ: ${esc(order.product)}</p>
    <p>Цена: ${Number(order.amountUsd || 0).toFixed(2)} $</p>
    <p>Город: ${esc(order.location || "")}</p>
    <p>${esc(order.reservedDescription || order.productDescription || "")}</p>
    <button class="primary" data-close-modal>${tr("close")}</button>
  `);
}

function cancelProductOrder(orderId) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order || order.paymentStatus === "paid") return;
  restoreReservedProductItem(order, db);
  order.status = "canceled";
  order.paymentStatus = "canceled";
  order.canceledAt = Date.now();
  saveDb();
  renderOrders("active");
}

function openProductDispute(orderId) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) return;
  if (!orderCanDispute(order)) {
    showToast("Спор можно открыть только в течение 12 часов после оплаты");
    return;
  }
  order.status = "dispute";
  order.disputeOpen = true;
  order.disputeUntil = Date.now() + 12 * 60 * 60 * 1000;
  saveDb();
  showToast("Спор открыт на 12 часов");
  renderOrders("disputes");
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
          <article class="product-card product-body message-card">
            <h3>${esc(msg.subject)}</h3>
            <p>${esc(msg.body).replace(/\n/g, "<br>")}</p>
            <p>${esc(msg.fromLogin)} → ${esc(msg.storeTag)} · ${esc(msg.date)}</p>
            ${messageActions(msg)}
          </article>
        `).join("") : `<p>${tr("noMessages")}</p>`}
      </article>
    </section>
  `);
  document.querySelectorAll("[data-close-exchange]").forEach((button) => {
    button.onclick = () => closeExchangeOrder(button.dataset.closeExchange, "closed");
  });
  document.querySelectorAll("[data-dispute-exchange]").forEach((button) => {
    button.onclick = () => openExchangeDispute(button.dataset.disputeExchange);
  });
}

function messageActions(msg) {
  if (!msg.exchangeRequestId) return "";
  const request = exchangeRequestById(msg.exchangeRequestId);
  if (!request || request.status === "closed") return "";
  const canManage = isAdmin() || sameLogin(request.toLogin, db.currentUser) || sameLogin(request.fromLogin, db.currentUser);
  if (!canManage) return "";
  return `
    <div class="message-actions">
      <button data-close-exchange="${esc(request.id)}">Закрыть заказ</button>
      <button data-dispute-exchange="${esc(request.id)}">${request.disputeOpen ? "Закрыть/обновить спор" : "Открыть спор"}</button>
    </div>
  `;
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
        <label class="field">Сумма<input data-calc-amount type="number" min="0" step="0.01" value="100"></label>
        <label class="field">Валюта
          <select data-calc-currency>
            <option value="usd">$</option>
            <option value="ltc">LTC</option>
          </select>
        </label>
        <label class="field">Тип
          <select data-calc-type>
            <option value="exchange">Обмен</option>
            <option value="cashout">Обнал</option>
          </select>
        </label>
      </div>
      <div class="calc-result">
        <span data-calc-rate>Курс LTC загружается...</span>
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
  const title = isExchange ? "Купить LTC" : "Сдать LTC";
  const rate = isExchange ? card.exchangeRate : card.cashoutRate;
  return `
    <article class="panel exchange-tool">
      <h2>${title}</h2>
      <p class="exchange-note">${isExchange ? "Вы переводите MDL на выбранный способ оплаты, оператор отправляет LTC на ваш кошелек." : "Вы отправляете LTC на кошелек обменника, оператор переводит MDL на ваши реквизиты."}</p>
      <form class="form" data-exchange-request="${esc(type)}">
        ${isExchange ? `
          <label class="field">Способ оплаты
            <select name="method" required>
              ${card.requisites.filter((item) => item.active !== false).map((item) => `<option value="${esc(item.method)}">${esc(item.method)} - ${esc(item.value)}</option>`).join("")}
            </select>
          </label>
        ` : `
          <label class="field">Карта / кошелек для получения<input name="payout" placeholder="Номер или реквизит" required></label>
          <label class="field">Кошелек обменника LTC<input value="${esc(card.ltcWallet || "Будет выдан оператором")}" readonly></label>
        `}
        <div class="row">
          <label class="field">Сумма<input name="amount" type="number" min="0.0001" step="0.0001" value="100" required></label>
          <label class="field">Валюта
            <select name="currency">
              <option value="usd">$</option>
              <option value="ltc">LTC</option>
            </select>
          </label>
        </div>
        ${isExchange ? `<label class="field">Ваш LTC счет<input name="ltcAddress" placeholder="ltc1..." required></label>` : ""}
        ${isExchange ? `<label class="field">Фото оплаты<input name="proof" type="file" accept="image/*"></label>` : ""}
        <label class="field">Комментарий<textarea name="comment" placeholder="Можно оставить пустым"></textarea></label>
        <div class="calc-result">
          <span data-form-rate>Курс ${Number(rate).toFixed(2)} MDL за 1$</span>
          <strong data-form-result>${(100 * rate).toFixed(2)} MDL</strong>
        </div>
        <div class="quote-breakdown" data-form-breakdown></div>
        <div class="exchange-actions">
          <button class="primary" type="submit">Создать заявку</button>
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
  const calcAmount = document.querySelector("[data-calc-amount]");
  const calcCurrency = document.querySelector("[data-calc-currency]");
  const calcType = document.querySelector("[data-calc-type]");
  const calcResult = document.querySelector("[data-calc-result]");
  const calcRate = document.querySelector("[data-calc-rate]");
  const updateCalc = () => {
    if (!calcResult) return;
    const amount = Number(calcAmount?.value || 0);
    const type = calcType?.value || "exchange";
    const quote = calculateExchangeQuote(card, type, amount, calcCurrency?.value || "usd");
    calcResult.textContent = `${quote.totalMdl.toFixed(2)} MDL`;
    if (calcRate) calcRate.textContent = `1 LTC ≈ ${quote.ltcUsd.toFixed(2)} $, ${quote.ltcAmount.toFixed(6)} LTC, курс ${quote.rate.toFixed(2)} MDL за 1$`;
  };
  calcAmount?.addEventListener("input", updateCalc);
  calcCurrency?.addEventListener("change", updateCalc);
  calcType?.addEventListener("change", updateCalc);
  updateCalc();
  fetchLitecoinUsdRate().then((value) => {
    card.ltcUsd = value;
    updateCalc();
  });
  document.querySelectorAll("[data-exchange-request]").forEach((form) => {
    const amountInput = form.querySelector("input[name='amount']");
    const currencyInput = form.querySelector("select[name='currency']");
    const result = form.querySelector("[data-form-result]");
    const rateLabel = form.querySelector("[data-form-rate]");
    const breakdown = form.querySelector("[data-form-breakdown]");
    const type = form.dataset.exchangeRequest;
    const updateFormCalc = () => {
      const quote = calculateExchangeQuote(card, type, Number(amountInput.value || 0), currencyInput?.value || "usd");
      result.textContent = `${quote.totalMdl.toFixed(2)} MDL`;
      if (rateLabel) rateLabel.textContent = `1 LTC ≈ ${quote.ltcUsd.toFixed(2)} $, курс ${quote.rate.toFixed(2)} MDL за 1$`;
      if (breakdown) {
        breakdown.innerHTML = `
          <p><span>В долларах</span><strong>${quote.amountUsd.toFixed(2)} $</strong></p>
          <p><span>LTC</span><strong>${quote.ltcAmount.toFixed(6)}</strong></p>
          <p><span>${type === "cashout" ? "К получению" : "К оплате"}</span><strong>${quote.totalMdl.toFixed(2)} MDL</strong></p>
        `;
      }
    };
    amountInput?.addEventListener("input", updateFormCalc);
    currencyInput?.addEventListener("change", updateFormCalc);
    updateFormCalc();
    form.onsubmit = (event) => handleExchangeRequest(event, card, type);
  });
}

async function handleExchangeRequest(event, card, type) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const amount = Number(data.get("amount") || 0);
  const currency = data.get("currency") || "usd";
  const quote = calculateExchangeQuote(card, type, amount, currency);
  if (!quote.amountUsd || !quote.totalMdl) {
    showToast("Введите корректную сумму");
    return;
  }
  const confirmText = type === "cashout"
    ? `Вы создаете заявку на сдачу ${quote.ltcAmount.toFixed(6)} LTC. К получению: ${quote.totalMdl.toFixed(2)} MDL. Проверьте реквизиты перед подтверждением.`
    : `Вы создаете заявку на покупку ${quote.ltcAmount.toFixed(6)} LTC. К оплате: ${quote.totalMdl.toFixed(2)} MDL. Проверьте LTC счет перед подтверждением.`;
  const ok = await confirmExchangePayment(confirmText);
  if (!ok) return;
  const proofFile = data.get("proof");
  const proof = proofFile && proofFile.size ? await fileToDataUrl(proofFile) : "";
  const request = {
    id: `exchange-${Date.now()}`,
    cardId: card.id,
    cardName: card.name,
    type,
    fromLogin: db.currentUser,
    toLogin: card.ownerLogin,
    method: data.get("method") || data.get("payout") || "",
    amount,
    currency,
    amountUsd: quote.amountUsd,
    ltcAmount: quote.ltcAmount,
    ltcUsd: quote.ltcUsd,
    rate: quote.rate,
    totalMdl: quote.totalMdl,
    ltcAddress: data.get("ltcAddress") || "",
    proof,
    proofName: proofFile?.name || "",
    comment: data.get("comment") || "",
    status: "active",
    history: [{ at: new Date().toLocaleString(), by: db.currentUser, text: "Заявка создана клиентом" }],
    createdAt: Date.now(),
    date: new Date().toLocaleString()
  };
  const order = {
    id: request.id,
    login: db.currentUser,
    storeName: card.name,
    product: type === "cashout" ? "Заявка на обнал" : "Заявка на обмен",
    status: "active",
    createdAt: request.createdAt,
    exchangeRequestId: request.id,
    amountUsd: request.amountUsd,
    ltcAmount: request.ltcAmount,
    totalMdl: request.totalMdl,
    method: request.method
  };
  db.exchangeRequests.unshift(request);
  db.orders.unshift(order);
  db.messages.unshift({
    id: `msg-${request.id}`,
    storeId: card.id,
    storeTag: card.name,
    toLogin: card.ownerLogin,
    fromLogin: db.currentUser,
    subject: type === "cashout" ? `Новая оплата: обнал ${card.name}` : `Новая оплата: обмен ${card.name}`,
    body: exchangeRequestMessage(request),
    date: request.date,
    system: "exchange",
    exchangeRequestId: request.id
  });
  saveDb();
  showToast("Заявка активна и отправлена обменнику");
  renderOrders("active");
}

function exchangeRequestMessage(request) {
  return [
    `Тип: ${exchangeTypeLabel(request.type)}`,
    `Статус: ${exchangeStatusLabel(request.status)}`,
    `Сумма клиента: ${Number(request.amount || 0).toFixed(4)} ${String(request.currency || "usd").toUpperCase()}`,
    `В долларах: ${Number(request.amountUsd || 0).toFixed(2)} $`,
    `LTC: ${Number(request.ltcAmount || 0).toFixed(6)}`,
    `Курс LTC: ${Number(request.ltcUsd || 0).toFixed(2)} $`,
    `MDL: ${Number(request.totalMdl || 0).toFixed(2)}`,
    `Способ/реквизит: ${request.method || "не указан"}`,
    request.ltcAddress ? `LTC счет клиента: ${request.ltcAddress}` : "",
    request.proofName ? `Фото оплаты: ${request.proofName}` : "Фото оплаты: не прикреплено",
    request.comment ? `Описание клиента: ${request.comment}` : ""
  ].filter(Boolean).join("\n");
}

function confirmExchangePayment(text) {
  return new Promise((resolve) => {
    showModal(`
      <h2>Подтвердите оплату</h2>
      <p>${esc(text)}</p>
      <div class="exchange-actions">
        <button class="primary" data-confirm-pay>Подтвердить</button>
        <button class="ghost-button" data-cancel-pay>Отменить</button>
      </div>
    `);
    document.querySelector("[data-confirm-pay]").onclick = () => {
      document.querySelector("[data-modal]").classList.remove("open");
      resolve(true);
    };
    document.querySelector("[data-cancel-pay]").onclick = () => {
      document.querySelector("[data-modal]").classList.remove("open");
      resolve(false);
    };
  });
}

function exchangeRequestById(id) {
  return db.exchangeRequests.find((request) => request.id === id);
}

function addExchangeHistory(request, text) {
  if (!request) return;
  if (!Array.isArray(request.history)) request.history = [];
  request.history.unshift({ at: new Date().toLocaleString(), by: db.currentUser || "system", text });
}

function notifyExchange(request, subject, body, toLogin = request?.toLogin) {
  if (!request) return;
  db.messages.unshift({
    id: `exchange-note-${Date.now()}`,
    storeId: request.cardId,
    storeTag: request.cardName,
    toLogin,
    fromLogin: db.currentUser || "system",
    subject,
    body,
    date: new Date().toLocaleString(),
    system: "exchange",
    exchangeRequestId: request.id
  });
}

function closeExchangeOrder(id, status = "closed") {
  const order = db.orders.find((item) => item.id === id || item.exchangeRequestId === id);
  const request = exchangeRequestById(order?.exchangeRequestId || id);
  const previousRoute = route;
  if (order) {
    order.status = "closed";
    order.closedAt = Date.now();
    order.disputeOpen = false;
  }
  if (request) {
    request.status = status;
    request.closedAt = Date.now();
    request.disputeOpen = false;
    addExchangeHistory(request, "Заявка закрыта");
    notifyExchange(request, "Заявка закрыта", `Заявка ${request.cardName} закрыта. Итог: ${Number(request.totalMdl || 0).toFixed(2)} MDL / ${Number(request.ltcAmount || 0).toFixed(6)} LTC.`, request.fromLogin);
  }
  saveDb();
  showToast("Заявка закрыта");
  if (previousRoute === "exchange-order") renderExchangeOrderDetail(request?.id || id);
  else renderCurrent();
}

function openExchangeDispute(id) {
  const order = db.orders.find((item) => item.id === id || item.exchangeRequestId === id);
  const request = exchangeRequestById(order?.exchangeRequestId || id);
  const previousRoute = route;
  const disputeUntil = Date.now() + 12 * 60 * 60 * 1000;
  if (order) {
    order.status = "dispute";
    order.disputeOpen = true;
    order.disputeUntil = disputeUntil;
  }
  if (!request) {
    saveDb();
    showToast("Спор открыт на 12 часов");
    return renderOrders("disputes");
  }
  if (request) {
    request.status = "dispute";
    request.disputeOpen = true;
    request.disputeUntil = disputeUntil;
    addExchangeHistory(request, "Открыт спор на 12 часов");
  }
  notifyExchange(request, "Открыт спор по заявке", "По заявке открыт спор. У клиента и обменника есть 12 часов на решение вопроса в личных сообщениях сайта.", request?.toLogin || "admin");
  saveDb();
  showToast("Спор открыт на 12 часов");
  if (previousRoute === "exchange-order") renderExchangeOrderDetail(request?.id || id);
  else renderMessages();
}

function acceptExchangeOrder(id) {
  const request = exchangeRequestById(id);
  const order = exchangeOrderById(id);
  if (!request) return;
  request.status = "processing";
  request.disputeOpen = false;
  addExchangeHistory(request, "Оператор принял заявку в работу");
  if (order) {
    order.status = "active";
    order.disputeOpen = false;
  }
  notifyExchange(request, "Заявка принята в работу", `Оператор ${request.cardName} принял заявку в работу.`, request.fromLogin);
  saveDb();
  renderExchangeOrderDetail(id);
}

function cancelExchangeOrder(id) {
  const request = exchangeRequestById(id);
  const order = exchangeOrderById(id);
  if (!request) return;
  request.status = "canceled";
  addExchangeHistory(request, "Заявка отменена");
  if (order) order.status = "closed";
  notifyExchange(request, "Заявка отменена", `Заявка ${request.cardName} отменена.`, request.fromLogin);
  saveDb();
  renderExchangeOrderDetail(id);
}

function renderExchangeOrderDetail(id = activeExchangeOrderId) {
  route = "exchange-order";
  activeExchangeOrderId = id;
  const request = exchangeRequestById(id);
  if (!request) return renderOrders(activeOrdersTab);
  const card = exchangeCardById(request.cardId);
  const isOwner = sameLogin(request.toLogin, db.currentUser) || isAdmin();
  const isClient = sameLogin(request.fromLogin, db.currentUser);
  const canAct = isOwner || isClient || isAdmin();
  const status = exchangeStatusLabel(request.status);
  layout(`
    <section class="screen exchange-profile">
      <article class="panel exchange-detail">
        <div class="detail-head">
          <img src="${esc(card?.image || KENT_IMAGE)}" alt="">
          <div>
            <p class="breadcrumbs">Заявка > ${esc(request.cardName)}</p>
            <h1>${exchangeTypeLabel(request.type)}</h1>
            <span class="status-pill">${status}</span>
          </div>
        </div>
        <div class="quote-breakdown detail-grid">
          <p><span>Сумма</span><strong>${Number(request.amount || 0).toFixed(4)} ${String(request.currency || "usd").toUpperCase()}</strong></p>
          <p><span>В долларах</span><strong>${Number(request.amountUsd || 0).toFixed(2)} $</strong></p>
          <p><span>LTC</span><strong>${Number(request.ltcAmount || 0).toFixed(6)}</strong></p>
          <p><span>MDL</span><strong>${Number(request.totalMdl || 0).toFixed(2)}</strong></p>
          <p><span>Реквизит</span><strong>${esc(request.method || "не указан")}</strong></p>
          <p><span>LTC счет</span><strong>${esc(request.ltcAddress || card?.ltcWallet || "не указан")}</strong></p>
        </div>
        ${request.comment ? `<p class="desc">${esc(request.comment)}</p>` : ""}
        ${request.proof ? `<a class="proof-link" href="${esc(request.proof)}" target="_blank" rel="noreferrer">Открыть фото оплаты</a>` : ""}
        <div class="exchange-actions">
          <button class="ghost-button" data-exchange-chat="${esc(request.cardId)}">Написать</button>
          ${canAct && request.status !== "closed" && request.status !== "canceled" ? `
            ${isOwner && request.status === "active" ? `<button class="primary" data-accept-exchange="${esc(request.id)}">Принять в работу</button>` : ""}
            ${isOwner && request.status !== "closed" ? `<button class="primary" data-close-exchange="${esc(request.id)}">Завершить</button>` : ""}
            ${isClient && request.status !== "dispute" ? `<button class="ghost-button" data-dispute-exchange="${esc(request.id)}">Открыть спор</button>` : ""}
            ${isClient && request.status === "active" ? `<button class="ghost-button" data-cancel-exchange="${esc(request.id)}">Отменить</button>` : ""}
          ` : ""}
        </div>
      </article>
      <article class="panel">
        <h2>История</h2>
        ${(request.history || []).map((item) => `<article class="ref-item"><div><h3>${esc(item.text)}</h3><p>${esc(item.by)} · ${esc(item.at)}</p></div></article>`).join("") || `<p>Истории пока нет</p>`}
      </article>
    </section>
  `);
  document.querySelectorAll("[data-exchange-chat]").forEach((button) => {
    button.onclick = () => renderExchangeChat(button.dataset.exchangeChat);
  });
  document.querySelector("[data-accept-exchange]")?.addEventListener("click", (event) => acceptExchangeOrder(event.currentTarget.dataset.acceptExchange));
  document.querySelector("[data-close-exchange]")?.addEventListener("click", (event) => closeExchangeOrder(event.currentTarget.dataset.closeExchange));
  document.querySelector("[data-dispute-exchange]")?.addEventListener("click", (event) => openExchangeDispute(event.currentTarget.dataset.disputeExchange));
  document.querySelector("[data-cancel-exchange]")?.addEventListener("click", (event) => cancelExchangeOrder(event.currentTarget.dataset.cancelExchange));
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
          <label class="field">LTC кошелек обменника<input name="ltcWallet" placeholder="ltc1..."></label>
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
          <button class="primary">Добавить обменник</button>
        </form>
      </article>
      <article class="panel">
        <h2>Настройки оплат</h2>
        <form class="form" data-payment-settings-form>
          <label class="field">Провайдер<input value="NOWPayments" readonly></label>
          <div class="row">
            <label class="field">Комиссия площадки, %<input name="platformCommissionPercent" type="number" step="0.01" value="${esc(db.paymentSettings?.platformCommissionPercent ?? 0)}"></label>
            <label class="field">LTC счет площадки<input name="platformLtcWallet" value="${esc(db.paymentSettings?.platformLtcWallet || "")}"></label>
          </div>
          <button class="primary">Сохранить оплаты</button>
        </form>
      </article>
      ${db.stores.map(adminStoreEditor).join("")}
    </section>
  `);
  document.querySelector("[data-store-form]").onsubmit = handleStoreCreate;
  document.querySelector("[data-exchange-admin-form]").onsubmit = handleExchangeCardCreate;
  document.querySelector("[data-payment-settings-form]").onsubmit = handlePaymentSettingsSave;
  bindAdminProductForms();
}

function adminStoreEditor(store) {
  const product = store.products?.[0] || {};
  const position = product.positions?.[0] || {};
  return `
    <article class="panel">
      <h2>${esc(store.name)}</h2>
      <p>${esc(store.tag)} · ${esc(store.ownerLogin)}</p>
      <form class="form" data-admin-product-form data-store-id="${esc(store.id)}" data-product-id="${esc(product.id || "")}" data-position-id="${esc(position.id || "")}">
        <label class="field">LTC счет магазина<input name="ltcWallet" value="${esc(store.ltcWallet || "")}" placeholder="ltc1..."></label>
        <label class="field">Название товара<input name="title" value="${esc(product.title || "Подработка")}" required></label>
        <label class="field">Описание товара<textarea name="description">${esc(product.description || "")}</textarea></label>
        <label class="field">Описания для выдачи клиенту<textarea name="deliveryItems" placeholder="Каждая новая строка = один доступный заказ">${esc((product.deliveryItems || []).join("\n"))}</textarea></label>
        <div class="row">
          <label class="field">Категория<input name="category" value="${esc(product.category || "Работа / Курьер")}"></label>
          <label class="field">Цена, $<input name="priceUsd" type="number" min="0" step="0.01" value="${esc(product.priceUsd || position.priceUsd || 50)}"></label>
        </div>
        <div class="row">
          <label class="field">Город<input name="city" value="${esc(position.city || "chisinau")}"></label>
          <label class="field">Район<input name="district" value="${esc(position.district || "")}"></label>
          <label class="field">Тип<input name="deliveryType" value="${esc(position.deliveryType || "Курьер")}"></label>
          <label class="field">Кол-во<input name="stock" type="number" min="0" value="${esc(position.stock || 1)}"></label>
        </div>
        <label class="field">Главное фото товара<input name="mainImage" type="file" accept="image/*"></label>
        <label class="field">Другие фото товара до 5<input name="images" type="file" accept="image/*" multiple></label>
        <button class="primary">Сохранить товар</button>
      </form>
    </article>
  `;
}

function handlePaymentSettingsSave(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  db.paymentSettings = {
    provider: "nowpayments",
    payBaseUrl: "",
    platformCommissionPercent: Number(data.get("platformCommissionPercent") || 0),
    platformLtcWallet: data.get("platformLtcWallet").trim()
  };
  saveDb();
  showToast("Настройки оплат сохранены");
  renderAdmin();
}

function bindAdminProductForms() {
  document.querySelectorAll("[data-admin-product-form]").forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const store = storeById(form.dataset.storeId);
      let product = productById(store, form.dataset.productId);
      if (!product) {
        product = normalizeProduct({ id: `product-${Date.now()}`, positions: [] }, store);
        store.products.unshift(product);
      }
      let position = positionById(product, form.dataset.positionId);
      if (!position) {
        position = { id: `position-${Date.now()}` };
        product.positions = [position];
      }
      const priceUsd = Number(data.get("priceUsd") || 0);
      store.ltcWallet = data.get("ltcWallet").trim();
      product.title = data.get("title").trim();
      product.category = data.get("category").trim();
      product.description = data.get("description").trim();
      product.sellerManaged = true;
      product.deliveryItems = String(data.get("deliveryItems") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      const mainFile = data.get("mainImage");
      const galleryFiles = Array.from(data.getAll("images")).filter((file) => file && file.size).slice(0, 5);
      const gallery = galleryFiles.length ? await Promise.all(galleryFiles.map(fileToDataUrl)) : [];
      if (mainFile && mainFile.size) {
        product.image = await fileToDataUrl(mainFile);
      }
      if (gallery.length) {
        product.images = [product.image || gallery[0], ...gallery.filter((image) => image !== product.image)].slice(0, 5);
      } else if (!Array.isArray(product.images) || !product.images.length) {
        product.images = [product.image || store.image || fallbackImage];
      }
      product.priceUsd = priceUsd;
      product.price = `${priceUsd}$`;
      position.title = product.title;
      position.description = product.description;
      position.priceUsd = priceUsd;
      position.city = data.get("city").trim() || "chisinau";
      position.district = data.get("district").trim();
      position.deliveryType = data.get("deliveryType").trim() || "Курьер";
      position.stock = product.deliveryItems.length || Number(data.get("stock") || 0);
      saveDb();
      showToast("Товар сохранён");
      renderAdmin();
    };
  });
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
  const image = file && file.size ? await fileToDataUrl(file) : KENT_IMAGE;
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
    ltcWallet: data.get("ltcWallet"),
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
        <form class="form" data-seller-profile-form>
          <label class="field">Имя магазина<input name="name" value="${esc(store.name || "")}" required></label>
          <label class="field">Короткое описание<input name="short" value="${esc(store.short || "")}"></label>
          <label class="field">Описание страницы<textarea name="description">${esc(store.description || "")}</textarea></label>
          <label class="field">Фото страницы<input name="image" type="file" accept="image/*"></label>
          <button class="primary">Сохранить страницу</button>
        </form>
      </article>
      <article class="panel">
        <h2>Добавить товар</h2>
        <form class="form" data-product-form>
          <label class="field">${tr("name")}<input name="title" required></label>
          <label class="field">${tr("short")}<input name="category" required></label>
          <label class="field">Описание<textarea name="description"></textarea></label>
          <div class="row">
            <label class="field">Цена, $<input name="priceUsd" type="number" min="0" step="0.01" value="50" required></label>
            <label class="field">Кол-во<input name="stock" type="number" min="0" step="1" value="1" required></label>
          </div>
          <label class="field">Тип<input name="deliveryType" value="Курьер"></label>
          <div class="row">
            <label class="field">Страна<select name="country"><option value="moldova">Молдова</option><option value="transnistria">Приднестровье</option></select></label>
            <label class="field">Город<input name="city" value="chisinau"></label>
            <label class="field">Район<input name="district" placeholder="Чеканы"></label>
          </div>
          <label class="field">Описания для выдачи клиенту<textarea name="deliveryItems" placeholder="Каждая новая строка = один доступный заказ"></textarea></label>
          <label class="field">Главное фото<input name="mainImage" type="file" accept="image/*"></label>
          <label class="field">${tr("upload")}<input name="images" type="file" accept="image/*" multiple></label>
          <button class="primary">${tr("addProduct")}</button>
        </form>
      </article>
      ${adminStoreEditor(store)}
      ${store.products.map((product) => productCardView(product, store)).join("")}
    </section>
  `);
  document.querySelector("[data-seller-profile-form]").onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("image");
    store.name = data.get("name").trim();
    store.short = data.get("short").trim();
    store.description = data.get("description").trim();
    if (file && file.size) {
      const image = await fileToDataUrl(file);
      store.image = image;
      store.cover = image;
    }
    saveDb();
    showToast("Страница магазина сохранена");
    renderSeller();
  };
  document.querySelector("[data-product-form]").onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const mainFile = data.get("mainImage");
    const galleryFiles = Array.from(data.getAll("images")).filter((file) => file && file.size).slice(0, 5);
    const gallery = galleryFiles.length ? await Promise.all(galleryFiles.map(fileToDataUrl)) : [];
    const mainImage = mainFile && mainFile.size ? await fileToDataUrl(mainFile) : (gallery[0] || store.image);
    const images = [mainImage, ...gallery.filter((image) => image !== mainImage)].slice(0, 5);
    const priceUsd = Number(data.get("priceUsd") || 0);
    const productId = `product-${Date.now()}`;
    const deliveryItems = String(data.get("deliveryItems") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    store.products.unshift({
      id: productId,
      title: data.get("title").trim(),
      category: data.get("category").trim(),
      description: data.get("description").trim(),
      price: `от ${priceUsd}$`,
      priceUsd,
      image: images[0],
      images,
      sellerManaged: true,
      deliveryItems,
      rating: 5,
      reviews: 0,
      purchases: 0,
      positions: [{
        id: `${productId}-position`,
        title: data.get("title").trim(),
        description: data.get("description").trim(),
        priceUsd,
        country: data.get("country"),
        city: data.get("city").trim(),
        district: data.get("district").trim(),
        deliveryType: data.get("deliveryType").trim() || "Курьер",
        stock: deliveryItems.length || Number(data.get("stock") || 0),
        status: "ready"
      }],
      reviewsList: []
    });
    saveDb();
    renderSeller();
  };
  bindAdminProductForms();
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
          <label class="field">LTC кошелек обменника<input name="ltcWallet" value="${esc(card.ltcWallet || "")}" placeholder="ltc1..."></label>
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
            <div><h3>${esc(request.fromLogin)}</h3><p>${esc(request.date)} · ${exchangeTypeLabel(request.type)} · ${exchangeStatusLabel(request.status)}</p></div>
            <div><strong>${Number(request.amountUsd || 0).toFixed(2)} $</strong><span>${Number(request.totalMdl || 0).toFixed(2)} MDL</span></div>
            <button class="ghost-button" data-exchange-order="${esc(request.id)}">Детали</button>
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
    card.ltcWallet = data.get("ltcWallet");
    card.regions = [data.get("regions")];
    card.requisites = exchangeMethods.map((method) => ({ method, value: data.get(`req_${method}`), active: Boolean(data.get(`req_${method}`)) }));
    if (file && file.size) card.image = await fileToDataUrl(file);
    saveDb();
    renderExchangeOperator();
  };
  document.querySelectorAll("[data-exchange-order]").forEach((button) => {
    button.onclick = () => renderExchangeOrderDetail(button.dataset.exchangeOrder);
  });
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
  document.querySelectorAll("[data-product]").forEach((button) => {
    if (button.dataset.buyPosition) return;
    button.onclick = () => renderProductView(button.dataset.productStore, button.dataset.product);
  });
  document.querySelectorAll("[data-buy-position]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      handleProductReservation(button.dataset.productStore, button.dataset.product, button.dataset.buyPosition);
    };
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
  if (route === "exchange-order") return renderExchangeOrderDetail(activeExchangeOrderId);
  if (route === "exchange-admin") return renderExchangeOperator();
  if (["wallet"].includes(route)) return renderSimplePage(route);
  if (route === "admin") return renderAdmin();
  if (route === "seller") return renderSeller();
  if (route === "product") return renderProductView(activeStoreId || db.stores[0].id, activeProductId);
  if (route === "store") return renderStore(activeStoreId || db.stores[0].id, activeStoreTab);
  if (route === "chat") return renderChat(activeStoreId || db.stores[0].id);
  renderHome();
}

async function initApp() {
  await loadRemoteConfig();
  await loadRemoteSession();
  await fetchLitecoinUsdRate();
  renderCurrent();
}

initApp();
