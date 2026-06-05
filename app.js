const STORE_KEY = "cerber_state_v1";
const LEGACY_STORE_KEY = "cerber_legacy_state_v1";
const SESSION_KEY = "cerber_current_user_v1";
const AUTH_KEY = "cerber_auth_v1";
const API_TOKEN_KEY = "cerber_api_token_v1";
const SELLER_ADMIN_KEY = "cerber_seller_admin_v1";
const SELLER_ADMIN_API_TOKEN_KEY = "cerber_seller_admin_token_v1";
const ADMIN_ACCESS_KEY = "cerber_admin_access_v1";
const OWNER_ACCESS_PASSWORD_KEY = "cerber_owner_access_password_v1";
const STATS_RESET_KEY = "cerber_stats_reset_2026_05_28";
const SHOP_PANEL_SESSION_KEY = "cerber_shop_panel_session_v1";
const LOCAL_API_HOSTS = ["127.0.0.1", "localhost"];
const PRIMARY_API_ORIGIN = "https://cerber.vip";
const API_ORIGIN = location.protocol === "file:"
  ? PRIMARY_API_ORIGIN
  : (LOCAL_API_HOSTS.includes(location.hostname) || location.hostname === "cerber.vip" ? location.origin : PRIMARY_API_ORIGIN);
const API_ENABLED = location.protocol !== "file:";
let TURNSTILE_SITE_KEY = "";
let turnstileWidgetId = null;

const fallbackImage = "assets/cerber-emblem.png";
const MAIN_LTC_WALLET = "ltc1qnl73w78t8v39kkjqd5jgr2y8a62g4mh4rhu6lu";
const ADMIN_PANEL_PASSWORD = "admincerbercc1212";
let cmsTextOverrides = {};
let cmsVisualTextOverrides = {};
let cmsApplyingVisualText = false;
let cmsVisualObserver = null;
const cmsVisualEditorActive = new URLSearchParams(location.search).has("cms-visual");
const WALLET_COINS = [
  { id: "ltc", payCurrency: "ltc", symbol: "LTC", name: "Litecoin", network: "LTC", accent: "#345d9d", base: true },
  { id: "usdt_trc20", payCurrency: "usdttrc20", symbol: "USDT", name: "USDT TRC-20", network: "TRC-20", accent: "#26a17b" },
  { id: "usdt_erc20", payCurrency: "usdterc20", symbol: "USDT", name: "USDT ERC-20", network: "ERC-20", accent: "#26a17b" },
  { id: "usdt_sol", payCurrency: "usdtsol", symbol: "USDT", name: "USDT Solana", network: "SOL", accent: "#26a17b" },
  { id: "trx", payCurrency: "trx", symbol: "TRX", name: "Tron", network: "TRX", accent: "#ef0027" },
  { id: "eth", payCurrency: "eth", symbol: "ETH", name: "Ethereum", network: "ERC-20", accent: "#627eea" },
  { id: "sol", payCurrency: "sol", symbol: "SOL", name: "Solana", network: "SOL", accent: "#14f195" }
];
const officialOnionMirrors = [
  "u725c5lilm6dipuwdesddow7bnzppeqcoqxlcs3xa5yur2lmt7zl5eqd.onion",
  "ptxutaluz75azssnxnfp5l4ygy7f67svtnkqdn6eolmykgx3ft5pp3ad.onion",
  "ncfou7zv7qv2zscufcc6q2wgb3r22gq3a4wkdq2jbkw3tmdbah4wwuyd.onion"
];
const officialClearDomains = ["cerber.to", "cerber.love", "cerber.vip"];
const TELEGRAM_EMOJIS = ["👍", "❤️", "🔥", "😁", "👏", "🎉", "🤝", "💯", "😎", "🙏", "💸", "✅"];
const scheduledRollTimers = new Set();
const WALLET_DEPOSIT_TTL_MS = 40 * 60 * 1000;
let groupVoiceRecorder = null;
let groupVoiceChunks = [];
let groupVoiceDraft = null;
let groupChatRefreshTimer = null;
let groupPresenceSavedAt = 0;
let groupWidgetOpen = false;
let groupWidgetVoiceRecorder = null;
let groupWidgetVoiceChunks = [];
let groupWidgetVoiceDraft = null;
let adminCreationNotice = "";
let activeHomeTab = "all";
const NEW_STORE_STATS = {
  orders: 0,
  reviews: 0,
  rating: 5
};
const exchangeMethods = ["Мия", "RunPay", "BPay"];
const defaultExchangeRequisites = exchangeMethods.map((method) => ({ method, value: "60327998", active: true }));
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
    "Шишки",
    "Гашиш",
    "Масло/житкость для вейпа",
    "Альфа (A-PVP)",
    "Амфетамин",
    "Мефедрон",
    "Метамфетамин",
    "Кокаин",
    "MDPV",
    "MDMA",
    "Экстази",
    "ЛСД",
    "Грибы",
    "Антидепрессанты",
    "Subutex",
    "Героин",
    "Метадон",
    "Трамадол",
    "Обмен/Обнал",
    "Банковские карты/кошельки",
    "Курьер/Кладмен",
    "Депрессанты"
  ]
};

const defaults = {
  currentUser: "",
  theme: "light",
  lang: "ru",
  users: [],
  stores: [],
  messages: [],
  groupMessages: [],
  groupSettings: {
    title: "Общий чат",
    pinnedMessageId: "",
    mutedUntil: {}
  },
  orders: [],
  exchangeCards: [],
  exchangeRequests: [],
  referrals: [],
  referralPayments: [],
  referralCodes: {},
  balances: {},
  ltcBalances: {},
  walletTransactions: [],
  walletDeposits: [],
  siteNotifications: [],
  broadcasts: [],
  userFilters: [],
  storeApplications: [],
  ownerSettings: {
    defaultAutoReleaseHours: 24,
    platformCommissionPercent: 0,
    swapCommissionPercent: 0,
    walletServiceFeePercent: 0,
    walletCoinFees: Object.fromEntries(WALLET_COINS.map((coin) => [coin.id, { percent: 0, fixed: 0, enabled: true }])),
    disputeArbiters: [],
    exchangeOperators: [],
    riskRules: {
      highDisputePercent: 20,
      highCancelPercent: 30
    }
  },
  paymentSettings: {
    provider: "gateway",
    payBaseUrl: "",
    platformCommissionPercent: 0,
    platformLtcWallet: MAIN_LTC_WALLET
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

function marketologSeedStore() {
  const chisinauDistricts = filterOptions.countries.moldova.cities.chisinau.districts;
  return {
    id: "marketolog",
    tag: "@marketolog",
    ownerLogin: "marketolog",
    adminPassword: "marketolog",
    isTop: true,
    countries: ["moldova"],
    cities: ["chisinau"],
    districts: chisinauDistricts,
    name: "Marketolog",
    short: "Маркетолог это семья ❤️",
    description: "Тестовое описание для подготовки проекта святая троица.",
    image: "assets/marketolog-avatar.svg",
    cover: "assets/marketolog-banner.svg",
    banner: "assets/marketolog-banner.svg",
    ...NEW_STORE_STATS,
    products: [
      {
        id: "marketolog-service",
        title: "Тестовый товар",
        category: "Услуги",
        description: "Тестовая позиция для проверки оплаты и выдачи.",
        price: "10$",
        priceUsd: 10,
        image: "assets/marketolog-avatar.svg",
        images: ["assets/marketolog-avatar.svg"],
        sellerManaged: true,
        reviews: 0,
        rating: 5,
        purchases: 0,
        deliveryItems: [],
        positions: chisinauDistricts.map((district) => ({
          id: `marketolog-${district.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-")}`,
          title: "Тестовый товар",
          description: "Тестовая позиция для проверки оплаты и выдачи.",
          priceUsd: 10,
          country: "moldova",
          city: "chisinau",
          district,
          deliveryType: "Услуга",
          weight: "",
          stock: 10,
          status: "ready"
        }))
      }
    ],
    reviewsList: []
  };
}

function testSellerSeedStore() {
  return {
    id: "test",
    tag: "@test",
    ownerLogin: "test",
    adminPassword: "test1",
    isTop: false,
    isFeatured: false,
    isNew: true,
    visibleInCatalog: false,
    countries: ["moldova"],
    cities: ["chisinau"],
    districts: ["Центр", "Ботаника", "Рышкановка"],
    name: "Test Shop",
    short: "Тестовая витрина для админ-панели магазина",
    description: "Демо-магазин для проверки новой панели: статистика, склад, клиенты, заказы и связь.",
    image: "assets/cerber-emblem.png",
    cover: "assets/market-banner.png",
    status: "active",
    salesBlocked: false,
    autoReleaseHours: 24,
    ...NEW_STORE_STATS,
    products: [
      {
        id: "test-product",
        title: "Демо товар",
        category: "Каталог",
        description: "Товар-заглушка для проверки склада и заказов.",
        price: "25$",
        priceUsd: 25,
        image: "assets/cerber-emblem.png",
        images: ["assets/cerber-emblem.png"],
        sellerManaged: true,
        reviews: 0,
        rating: 5,
        purchases: 0,
        deliveryItems: ["Демо выдача #1", "Демо выдача #2"],
        positions: [
          {
            id: "test-position-center",
            title: "Демо товар",
            description: "Товар-заглушка для проверки склада и заказов.",
            deliveryItems: ["Демо выдача #1", "Демо выдача #2"],
            priceUsd: 25,
            country: "moldova",
            city: "chisinau",
            district: "Центр",
            deliveryType: "Склад",
            stock: 2,
            status: "ready"
          }
        ],
        reviewsList: []
      }
    ],
    reviewsList: []
  };
}

let db = loadDb();
let route = "home";
let activeStoreId = "";
let activeStoreTab = "positions";
let activeProductId = "";
let activePositionId = "";
let authMode = "login";
let activeOrdersTab = "all";
let activeReferralTab = "referrals";
let activeExchangeId = "";
let activeExchangeTab = "calculator";
let activeExchangeOrderId = "";
let sellerAdminStoreId = "";
let activePrivateLogin = "";
let privateVoiceRecorder = null;
let privateVoiceChunks = [];
let privateVoiceDraft = null;
let privateRefreshTimer = null;

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

function applyCmsTextOverrides(overrides) {
  cmsTextOverrides = overrides && typeof overrides === "object" ? overrides : {};
  cmsVisualTextOverrides = cmsTextOverrides.__visual && typeof cmsTextOverrides.__visual === "object" ? cmsTextOverrides.__visual : {};
  Object.entries(cmsTextOverrides).forEach(([lang, values]) => {
    if (!text[lang] || !values || typeof values !== "object") return;
    Object.entries(values).forEach(([key, value]) => {
      if (typeof value === "string") text[lang][key] = value;
    });
  });
  if (typeof cmsTextOverrides.title === "string" && cmsTextOverrides.title.trim()) {
    document.title = cmsTextOverrides.title.trim();
  }
}

function cmsNormalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cmsElementPath(element) {
  const parts = [];
  let current = element;
  while (current && current !== root && current !== document.body && parts.length < 8) {
    const parent = current.parentElement;
    const tag = current.tagName.toLowerCase();
    const sameTagIndex = parent ? Array.from(parent.children).filter((child) => child.tagName === current.tagName).indexOf(current) + 1 : 1;
    const classes = Array.from(current.classList || []).filter((item) => !/^(active|open|dark|light|selected|hidden)$/i.test(item)).slice(0, 3).join(".");
    parts.unshift(`${tag}${classes ? `.${classes}` : ""}:nth-${sameTagIndex}`);
    current = parent;
  }
  return parts.join(">");
}

function cmsVisualKey(element) {
  const original = element.dataset.cmsOriginalText || cmsNormalizeText(element.textContent);
  return `${db.lang || "ru"}|${cmsElementPath(element)}|${original}`;
}

function cmsEditableTextElement(element) {
  if (!element || element.nodeType !== 1) return false;
  if (element.closest("[data-cms-visual-toolbar]")) return false;
  if (/^(script|style|input|textarea|select|option|svg|path|img)$/i.test(element.tagName)) return false;
  if (element.children.length) return false;
  const value = cmsNormalizeText(element.textContent);
  return value.length > 0 && value.length <= 500;
}

function applyCmsVisualTextOverrides() {
  if (cmsApplyingVisualText || !Object.keys(cmsVisualTextOverrides).length) return;
  cmsApplyingVisualText = true;
  document.querySelectorAll("body *").forEach((element) => {
    if (!cmsEditableTextElement(element)) return;
    const original = element.dataset.cmsOriginalText || cmsNormalizeText(element.textContent);
    const key = cmsVisualKey(element);
    if (typeof cmsVisualTextOverrides[key] === "string" && cmsVisualTextOverrides[key] !== cmsNormalizeText(element.textContent)) {
      element.dataset.cmsOriginalText = original;
      element.textContent = cmsVisualTextOverrides[key];
    }
  });
  cmsApplyingVisualText = false;
}

function watchCmsVisualTextOverrides() {
  if (cmsVisualObserver) return;
  cmsVisualObserver = new MutationObserver(() => {
    if (cmsApplyingVisualText) return;
    clearTimeout(watchCmsVisualTextOverrides.timer);
    watchCmsVisualTextOverrides.timer = setTimeout(applyCmsVisualTextOverrides, 30);
  });
  cmsVisualObserver.observe(document.body, { childList: true, subtree: true });
}

function mountCmsVisualEditor() {
  if (!cmsVisualEditorActive || document.querySelector("[data-cms-visual-toolbar]")) return;
  document.body.classList.add("cms-visual-editing");
  const toolbar = document.createElement("div");
  toolbar.className = "cms-visual-toolbar";
  toolbar.dataset.cmsVisualToolbar = "true";
  toolbar.innerHTML = `
    <strong>Textolite mode</strong>
    <input type="password" placeholder="Пароль админки" data-cms-password>
    <button type="button" data-cms-save>Сохранить</button>
    <a href="/">Выйти</a>
    <span data-cms-status>Кликни по тексту на сайте</span>
  `;
  document.body.appendChild(toolbar);

  const status = toolbar.querySelector("[data-cms-status]");
  const password = toolbar.querySelector("[data-cms-password]");
  password.value = sessionStorage.getItem("cerber_text_admin_password") || "";
  const setStatus = (message) => status.textContent = message;

  document.addEventListener("click", (event) => {
    if (!cmsVisualEditorActive || event.target.closest("[data-cms-visual-toolbar]")) return;
    const target = event.target.closest("*");
    if (!cmsEditableTextElement(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const original = target.dataset.cmsOriginalText || cmsNormalizeText(target.textContent);
    target.dataset.cmsOriginalText = original;
    target.dataset.cmsEditing = "true";
    target.contentEditable = "true";
    target.focus();
    document.execCommand?.("selectAll", false, null);
    setStatus("Измени текст и нажми Сохранить");
  }, true);

  toolbar.querySelector("[data-cms-save]").onclick = async () => {
    const adminPassword = password.value.trim();
    sessionStorage.setItem("cerber_text_admin_password", adminPassword);
    document.querySelectorAll("[data-cms-original-text]").forEach((element) => {
      const next = cmsNormalizeText(element.textContent);
      const original = element.dataset.cmsOriginalText;
      const key = cmsVisualKey(element);
      if (next && next !== original) cmsVisualTextOverrides[key] = next;
      element.contentEditable = "false";
      element.removeAttribute("data-cms-editing");
    });
    cmsTextOverrides.__visual = cmsVisualTextOverrides;
    setStatus("Сохраняю...");
    try {
      const response = await fetch(apiUrl("/api/cms-texts"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword
        },
        body: JSON.stringify({ texts: cmsTextOverrides })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить");
      applyCmsTextOverrides(payload.texts || cmsTextOverrides);
      setStatus("Сохранено");
    } catch (error) {
      setStatus(error.message || "Ошибка сохранения");
    }
  };
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
  if (!Array.isArray(next.groupMessages)) next.groupMessages = [];
  if (!next.groupSettings) next.groupSettings = structuredClone(defaults.groupSettings);
  if (!next.groupSettings.mutedUntil) next.groupSettings.mutedUntil = {};
  if (!Array.isArray(next.groupSettings.rollTimers)) next.groupSettings.rollTimers = [];
  if (!Array.isArray(next.exchangeCards)) next.exchangeCards = structuredClone(defaults.exchangeCards);
  if (!Array.isArray(next.exchangeRequests)) next.exchangeRequests = [];
  if (!Array.isArray(next.referrals)) next.referrals = [];
  if (!Array.isArray(next.referralPayments)) next.referralPayments = [];
  if (!next.referralCodes) next.referralCodes = {};
  if (!next.balances) next.balances = {};
  if (!next.ltcBalances) next.ltcBalances = {};
  if (!Array.isArray(next.walletTransactions)) next.walletTransactions = [];
  if (!Array.isArray(next.walletDeposits)) next.walletDeposits = [];
  if (!Array.isArray(next.siteNotifications)) next.siteNotifications = [];
  if (!Array.isArray(next.broadcasts)) next.broadcasts = [];
  if (!Array.isArray(next.userFilters)) next.userFilters = [];
  if (!Array.isArray(next.storeApplications)) next.storeApplications = [];
  if (!next.ownerSettings) next.ownerSettings = structuredClone(defaults.ownerSettings);
  next.ownerSettings = {
    ...structuredClone(defaults.ownerSettings),
    ...next.ownerSettings,
    riskRules: {
      ...structuredClone(defaults.ownerSettings.riskRules),
      ...(next.ownerSettings.riskRules || {})
    }
  };
  next.ownerSettings.defaultAutoReleaseHours = Math.max(1, Number(next.ownerSettings.defaultAutoReleaseHours || 24));
  next.ownerSettings.platformCommissionPercent = Number(next.ownerSettings.platformCommissionPercent || 0);
  next.ownerSettings.swapCommissionPercent = Number(next.ownerSettings.swapCommissionPercent || 0);
  next.ownerSettings.walletServiceFeePercent = Number(next.ownerSettings.walletServiceFeePercent || 0);
  next.ownerSettings.walletCoinFees = next.ownerSettings.walletCoinFees || {};
  WALLET_COINS.forEach((coin) => {
    const current = next.ownerSettings.walletCoinFees[coin.id] || {};
    next.ownerSettings.walletCoinFees[coin.id] = {
      enabled: current.enabled !== false,
      percent: Number(current.percent || 0),
      fixed: Number(current.fixed || 0)
    };
  });
  next.ownerSettings.disputeArbiters = Array.isArray(next.ownerSettings.disputeArbiters) ? next.ownerSettings.disputeArbiters : [];
  next.ownerSettings.exchangeOperators = Array.isArray(next.ownerSettings.exchangeOperators) ? next.ownerSettings.exchangeOperators : [];
  if (!next.paymentSettings) next.paymentSettings = structuredClone(defaults.paymentSettings);
  if (!next.paymentSettings.platformLtcWallet) next.paymentSettings.platformLtcWallet = MAIN_LTC_WALLET;
  const previousPaymentProvider = next.paymentSettings.provider;
  next.paymentSettings.provider = "gateway";
  if (previousPaymentProvider !== "gateway") next.paymentSettings.platformCommissionPercent = 0;
  next.paymentSettings.platformCommissionPercent = Number(next.paymentSettings.platformCommissionPercent || 0);
  if (!next.referralPeriod) next.referralPeriod = {};
  if (!next.filters) next.filters = structuredClone(defaults.filters);
  (next.users || []).forEach((user) => {
    if (!user.createdAt) user.createdAt = "2026-05-28";
    if (!next.balances[user.login]) next.balances[user.login] = 0;
    if (!next.ltcBalances[user.login]) next.ltcBalances[user.login] = 0;
  });
  normalizeOrders(next);
  next.orders = (next.orders || []).filter((order) => order.id !== "order-cerber-paid-preview" && order.storeId !== "skboy");
  next.stores = (next.stores || []).filter((store) => store.id !== "skboy" && !/сол[её]ный мальчик/i.test(String(store.name || ""))).map((store) => {
    const seed = defaults.stores.find((item) => item.id === store.id);
    return {
      ...store,
      isTop: Boolean(store.isTop),
      isFeatured: Boolean(store.isFeatured || store.featured),
      isNew: Boolean(store.isNew || store.newStore),
      visibleInCatalog: store.visibleInCatalog !== false,
      countries: Array.isArray(store.countries) ? store.countries : [],
      cities: Array.isArray(store.cities) ? store.cities : [],
      districts: Array.isArray(store.districts) ? store.districts : [],
      orders: Number.isFinite(Number(store.orders)) ? Number(store.orders) : NEW_STORE_STATS.orders,
      reviews: Number.isFinite(Number(store.reviews)) ? Number(store.reviews) : NEW_STORE_STATS.reviews,
      rating: Number.isFinite(Number(store.rating)) ? Number(store.rating) : NEW_STORE_STATS.rating,
      ltcWallet: store.ltcWallet || seed?.ltcWallet || "",
      adminPassword: store.adminPassword || seed?.adminPassword || "",
      status: store.status || "active",
      salesBlocked: Boolean(store.salesBlocked),
      autoReleaseHours: Math.max(1, Number(store.autoReleaseHours || next.ownerSettings.defaultAutoReleaseHours || 24)),
      gallery: Array.isArray(store.gallery) ? store.gallery.slice(0, 5) : [],
      products: Array.isArray(store.products) ? store.products.map((product) => normalizeProduct(product, store)) : [],
      reviewsList: Array.isArray(store.reviewsList) ? store.reviewsList : (seed?.reviewsList || [])
    };
  });
  next.storeApplications = next.storeApplications.map((application) => ({
    id: application.id || `store-app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: application.status || "pending",
    createdAt: application.createdAt || Date.now(),
    applicantLogin: application.applicantLogin || application.ownerLogin || "",
    ownerLogin: application.ownerLogin || application.applicantLogin || "",
    name: application.name || "",
    tag: application.tag || "",
    short: application.short || "",
    description: application.description || "",
    country: application.country || "moldova",
    cities: Array.isArray(application.cities) ? application.cities : String(application.cities || "").split(",").map((item) => item.trim()).filter(Boolean),
    adminPassword: application.adminPassword || "",
    ltcWallet: application.ltcWallet || "",
    decisionAt: application.decisionAt || null,
    decisionBy: application.decisionBy || ""
  }));
  if (!next.stores.some((store) => store.id === "marketolog")) {
    next.stores.unshift(marketologSeedStore());
  } else {
    const marketolog = next.stores.find((store) => store.id === "marketolog");
    const product = marketolog?.products?.find((item) => item.id === "marketolog-service");
    if (product && (!Number(product.priceUsd) || product.title === "Подготовка проекта")) {
      product.title = "Тестовый товар";
      product.category = product.category || "Услуги";
      product.description = product.description || "Тестовая позиция для проверки оплаты и выдачи.";
      product.price = "10$";
      product.priceUsd = 10;
      product.positions = (product.positions || []).map((position) => ({
        ...position,
        title: "Тестовый товар",
        description: position.description || "Тестовая позиция для проверки оплаты и выдачи.",
        priceUsd: 10,
        stock: Number(position.stock || 0) > 0 ? Number(position.stock || 0) : 10
      }));
    }
  }
  if (!next.stores.some((store) => store.id === "test")) {
    next.stores.unshift(testSellerSeedStore());
  } else {
    const testStore = next.stores.find((store) => store.id === "test");
    testStore.ownerLogin = testStore.ownerLogin || "test";
    testStore.adminPassword = testStore.adminPassword || "test1";
    testStore.visibleInCatalog = false;
  }
  next.exchangeCards = next.exchangeCards.filter((card) => card.id !== "kent-ltc" && !/kent\s*ltc/i.test(String(card.name || ""))).map(normalizeExchangeCard);
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
      image: product.image || fallbackImage,
      images: Array.isArray(product.images) && product.images.length ? product.images.slice(0, 5) : [fallbackImage],
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
    positions: Array.isArray(product.positions) ? product.positions.map((position) => {
      const positionItems = Array.isArray(position.deliveryItems)
        ? position.deliveryItems.map((item) => String(item || "").trim()).filter(Boolean)
        : String(position.deliveryItemsText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      return {
        id: position.id || `position-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: position.title || position.district || "Позиция",
        description: position.description || "",
        deliveryItems: positionItems,
        priceUsd: Number(position.priceUsd || priceUsd || 0),
        country: position.country || "moldova",
        city: position.city || "chisinau",
        district: position.district || "",
        deliveryType: position.deliveryType || "Курьер",
        stock: positionItems.length || deliveryItems.length || Number(position.stock || 0),
        status: position.status || "ready"
      };
    }) : [],
    reviewsList: Array.isArray(product.reviewsList) ? product.reviewsList : []
  };
}

function normalizeExchangeCard(card) {
  const seed = defaults.exchangeCards.find((item) => item.id === card.id) || {
    image: fallbackImage,
    regions: ["moldova"],
    exchangeRate: 0,
    cashoutRate: 0,
    ltcUsd: ltcUsdCache,
    ltcWallet: "",
    adminPassword: "",
    countries: ["moldova"],
    cities: [],
    districts: [],
    requisites: defaultExchangeRequisites
  };
  const requisites = Array.isArray(card.requisites) && card.requisites.length ? card.requisites : seed.requisites;
  const image = card.image || seed.image || fallbackImage;
  return {
    ...seed,
    ...card,
    image,
    regions: Array.isArray(card.regions) && card.regions.length ? card.regions : seed.regions,
    exchangeRate: Number.isFinite(Number(card.exchangeRate)) ? Number(card.exchangeRate) : seed.exchangeRate,
    cashoutRate: Number.isFinite(Number(card.cashoutRate)) ? Number(card.cashoutRate) : seed.cashoutRate,
    ltcUsd: Number.isFinite(Number(card.ltcUsd)) ? Number(card.ltcUsd) : seed.ltcUsd,
    ltcWallet: String(card.ltcWallet || seed.ltcWallet || "").trim(),
    adminPassword: String(card.adminPassword || seed.adminPassword || "").trim(),
    countries: Array.isArray(card.countries) && card.countries.length ? card.countries : (Array.isArray(seed.countries) ? seed.countries : ["moldova"]),
    cities: Array.isArray(card.cities) ? card.cities : [],
    districts: Array.isArray(card.districts) ? card.districts : [],
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
  if (position && order.reservedDescription && order.reservedFromPosition) {
    position.deliveryItems = [order.reservedDescription, ...(position.deliveryItems || [])];
  } else if (product && order.reservedDescription) {
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
      const store = (next.stores || []).find((item) => item.id === order.storeId);
      const autoReleaseHours = Math.min(72, Math.max(0, Number(store?.autoReleaseHours ?? next.ownerSettings?.defaultAutoReleaseHours ?? 24)));
      if (order.status === "active" && order.paymentStatus === "paid" && !order.disputeOpen && age >= autoReleaseHours * 60 * 60 * 1000) {
        return { ...order, status: "completed", closedAt: now, closeReason: "\u0410\u0432\u0442\u043e\u0437\u0430\u043a\u0440\u044b\u0442\u0438\u0435 \u0441\u0434\u0435\u043b\u043a\u0438" };
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
    const store = (next.stores || []).find((item) => item.id === order.storeId);
    const autoReleaseHours = Math.min(72, Math.max(0, Number(store?.autoReleaseHours ?? next.ownerSettings?.defaultAutoReleaseHours ?? 12)));
    if (order.status === "active" && !order.disputeOpen && age >= autoReleaseHours * 60 * 60 * 1000) {
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

function apiUrl(path) {
  if (/^https?:\/\//i.test(String(path || ""))) return path;
  return `${API_ORIGIN}${path}`;
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = localStorage.getItem(API_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const response = await fetch(apiUrl(path), { ...options, headers, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "API error");
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Сервер оплаты долго не отвечает. Попробуйте ещё раз.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

async function loadRemoteState() {
  if (!API_ENABLED) return false;
  try {
    const payload = await apiFetch("/api/state");
    applyRemoteState(payload);
    return true;
  } catch {
    return false;
  }
}

async function loadRemoteConfig() {
  if (!API_ENABLED) return;
  try {
    const config = await apiFetch("/api/config");
    TURNSTILE_SITE_KEY = config.turnstileSiteKey || "";
    applyCmsTextOverrides(config.cmsTexts || {});
  } catch {
    TURNSTILE_SITE_KEY = "";
  }
}

async function loadCmsTextOverrides() {
  if (location.protocol === "file:" || API_ENABLED) return;
  try {
    const response = await fetch(apiUrl("/api/cms-texts"));
    const payload = await response.json().catch(() => ({}));
    if (response.ok) applyCmsTextOverrides(payload.texts || {});
  } catch {}
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
          groupMessages: db.groupMessages,
          groupSettings: db.groupSettings,
          orders: db.orders,
          exchangeCards: db.exchangeCards,
          exchangeRequests: db.exchangeRequests,
          referrals: db.referrals,
          referralPayments: db.referralPayments,
          referralCodes: db.referralCodes,
          balances: db.balances,
          ltcBalances: db.ltcBalances,
          walletTransactions: db.walletTransactions,
          walletDeposits: db.walletDeposits,
          siteNotifications: db.siteNotifications,
          broadcasts: db.broadcasts,
          userFilters: db.userFilters,
          storeApplications: db.storeApplications,
          ownerSettings: db.ownerSettings,
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

async function persistSellerAdminStore() {
  if (!API_ENABLED) return;
  const token = localStorage.getItem(SELLER_ADMIN_API_TOKEN_KEY);
  const store = sellerAdminStore();
  if (!token || !store) return;
  try {
    const response = await fetch(apiUrl("/api/store-admin/store"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ store })
    });
    if (!response.ok) throw new Error("Store admin save failed");
  } catch {
    showToast("Админка магазина временно не сохранила изменения в базе");
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
  persistSellerAdminStore();
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
  try {
    return currentUser()?.role === "admin" || localStorage.getItem(ADMIN_ACCESS_KEY) === "ok";
  } catch {
    return currentUser()?.role === "admin";
  }
}

function sellerAdminHashId() {
  const match = decodeURIComponent(location.hash || "").match(/^#(?:seller|shop-admin)-([a-z0-9_-]+)$/i);
  return match?.[1] || "";
}

function hashRoute() {
  const hash = decodeURIComponent(location.hash || "").replace(/^#/, "").trim().toLowerCase();
  const routes = new Set(["admin", "owner", "seller", "wallet", "catalog", "orders", "messages", "group-chat", "support", "referrals", "exchange"]);
  return routes.has(hash) ? hash : "";
}

function isShopPanelHash() {
  const hash = decodeURIComponent(location.hash || "").replace(/^#/, "").trim().toLowerCase();
  return hash === "shop-panel" || hash === "shop-admin" || /^shop-panel-[a-z0-9_-]+$/i.test(hash);
}

function shopPanelHashId() {
  const match = decodeURIComponent(location.hash || "").match(/^#shop-panel-([a-z0-9_-]+)$/i);
  return match?.[1] || "";
}

function sellerAdminSessionId() {
  try {
    return localStorage.getItem(SELLER_ADMIN_KEY) || "";
  } catch {
    return "";
  }
}

function sellerAdminStore() {
  const id = sellerAdminStoreId || sellerAdminHashId() || sellerAdminSessionId();
  return db.stores.find((store) => store.id === id) || null;
}

function storeIsActive(store = {}) {
  return ["active", "ACTIVE"].includes(String(store.status || "active"));
}

function storeAdminPassword(store) {
  return store?.adminPassword || "";
}

function sellerAdminLink(store) {
  const base = location.protocol === "http:" || location.protocol === "https:" ? location.origin : "https://cerber.vip";
  return `${base}/#seller-${store.id}`;
}

function shopPanelLink(store) {
  const base = location.protocol === "http:" || location.protocol === "https:" ? location.origin : "https://cerber.vip";
  return `${base}/#shop-panel-${store.id}`;
}

function sellerStores() {
  const standaloneStore = sellerAdminStore();
  if (standaloneStore) return [standaloneStore];
  if (isAdmin()) return db.stores;
  return db.stores.filter((store) => sameLogin(store.ownerLogin, db.currentUser));
}

function operatorExchangeCards() {
  return db.exchangeCards.filter((card) => sameLogin(card.ownerLogin, db.currentUser));
}

function exchangeCardById(id = activeExchangeId) {
  return db.exchangeCards.find((card) => card.id === id) || db.exchangeCards[0];
}

function filteredStores() {
  const filters = db.filters || {};
  return (db.stores || []).filter((store) => {
    if (!storeIsActive(store) && !isAdmin()) return false;
    const products = store.products || [];
    const positions = products.flatMap((product) => product.positions || []);
    const hasCountryScope = (store.countries || []).length || positions.some((position) => position.country);
    const hasCityScope = (store.cities || []).length || positions.some((position) => position.city);
    const hasDistrictScope = (store.districts || []).length || positions.some((position) => position.district);
    const countryMatch = !filters.country || !hasCountryScope || (store.countries || []).includes(filters.country) || positions.some((position) => position.country === filters.country);
    const cityMatch = !filters.city || !hasCityScope || (store.cities || []).includes(filters.city) || positions.some((position) => position.city === filters.city);
    const districtMatch = !filters.district || !hasDistrictScope || (store.districts || []).includes(filters.district) || positions.some((position) => position.district === filters.district);
    const categoryMatch = !filters.category || filters.category === "Все товары" || !products.length || products.some((product) => String(product.category || "").includes(filters.category));
    return countryMatch && cityMatch && districtMatch && categoryMatch;
  }).sort((a, b) => Number(b.isTop || 0) - Number(a.isTop || 0));
}

function storeInPlacement(store, placement) {
  const placements = Array.isArray(store.placements) && store.placements.length ? store.placements : [store.placement || ""];
  if (placement === "TOP 10") return placements.includes("TOP 10") || store.isTop === true;
  if (placement === "TOP") return placements.includes("TOP") || store.isFeatured === true;
  if (placement === "NEW") return placements.includes("NEW") || store.isNew === true;
  if (placement === "stores") return placements.includes("stores") || (store.visibleInCatalog !== false && placements.length === 1 && !placements[0]);
  return false;
}

function sortStoresByPosition(stores) {
  return stores.slice().sort((a, b) => Number(a.position || a.homepagePosition || 9999) - Number(b.position || b.homepagePosition || 9999));
}

function visibleStores(topOnly = false) {
  return sortStoresByPosition(filteredStores().filter((store) => {
    if (topOnly) return storeInPlacement(store, "TOP 10");
    return storeInPlacement(store, "stores");
  }));
}

function homeStores(tab = "all") {
  const stores = filteredStores();
  if (tab === "top") return sortStoresByPosition(stores.filter((store) => storeInPlacement(store, "TOP")));
  if (tab === "new") return sortStoresByPosition(stores.filter((store) => storeInPlacement(store, "NEW")));
  return sortStoresByPosition(stores.filter((store) => storeInPlacement(store, "TOP 10"))).slice(0, 10);
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

function walletTransactions(login = db.currentUser) {
  return (db.walletTransactions || []).filter((item) => sameLogin(item.login, login)).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function addWalletTransaction(tx) {
  db.walletTransactions = db.walletTransactions || [];
  db.walletTransactions.unshift({
    id: tx.id || `tx-${Date.now()}`,
    login: tx.login || db.currentUser,
    type: tx.type || "info",
    title: tx.title || "Операция",
    amountLtc: Number(tx.amountLtc || 0),
    amountUsd: Number(tx.amountUsd || 0),
    createdAt: tx.createdAt || Date.now(),
    date: tx.date || new Date().toLocaleString(),
    status: tx.status || "completed",
    expiresAt: tx.expiresAt || null,
    paymentId: tx.paymentId || ""
  });
}

function storeById(id = activeStoreId) {
  return db.stores.find((store) => store.id === id) || db.stores[0];
}

function sortedStoreProducts(store, includeDisabled = false) {
  return [...(store?.products || [])]
    .filter((product) => includeDisabled || product.status !== "disabled")
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
}

function productById(store, id = activeProductId) {
  return (store?.products || []).find((product) => product.id === id) || sortedStoreProducts(store)[0] || store?.products?.[0] || null;
}

function positionById(product, id = activePositionId) {
  return (product?.positions || []).find((position) => position.id === id) || product?.positions?.[0] || null;
}

function usdToLtc(amountUsd) {
  const rate = Number(ltcUsdCache || 0);
  return rate > 0 ? Number(amountUsd || 0) / rate : 0;
}

function walletCoinById(id) {
  return WALLET_COINS.find((coin) => coin.id === id || coin.payCurrency === id) || WALLET_COINS[0];
}

function walletCoinLabel(id) {
  const coin = walletCoinById(id);
  return `${coin.symbol}${coin.network && coin.network !== coin.symbol ? ` ${coin.network}` : ""}`;
}

function walletDepositPayCurrency(deposit) {
  return String(deposit.payCurrency || deposit.coinId || "ltc").toLowerCase();
}

function walletDepositCoin(deposit) {
  return walletCoinById(deposit.coinId || walletDepositPayCurrency(deposit));
}

function walletDepositPayAmount(deposit) {
  return Number(deposit.payAmount || deposit.amountPay || 0);
}

function locationLabel(position = {}) {
  const city = filterOptions.countries[position.country]?.cities?.[position.city]?.label || position.city || "";
  return [city, position.district].filter(Boolean).join(", ");
}

function countrySelectOptions(selected = "moldova") {
  return Object.entries(filterOptions.countries).map(([key, item]) => (
    `<option value="${esc(key)}" ${key === selected ? "selected" : ""}>${esc(item.label)}</option>`
  )).join("");
}

function scopedCountrySelectOptions(countries = ["moldova"], selected = "moldova") {
  const allowed = countries.length ? countries : Object.keys(filterOptions.countries);
  return Object.entries(filterOptions.countries)
    .filter(([key]) => allowed.includes(key))
    .map(([key, item]) => `<option value="${esc(key)}" ${key === selected ? "selected" : ""}>${esc(item.label)}</option>`)
    .join("");
}

function citySelectOptions(country = "moldova", selected = "chisinau") {
  const cities = filterOptions.countries[country]?.cities || filterOptions.countries.moldova.cities;
  const fallbackCity = Object.keys(cities)[0] || "";
  const value = cities[selected] ? selected : fallbackCity;
  return Object.entries(cities).map(([key, item]) => (
    `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(item.label || key)}</option>`
  )).join("");
}

function districtSelectOptions(country = "moldova", city = "chisinau", selected = "") {
  const cityInfo = filterOptions.countries[country]?.cities?.[city]
    || filterOptions.countries.moldova.cities.chisinau;
  const districts = cityInfo?.districts || [];
  return [
    `<option value="">Любой район</option>`,
    ...districts.map((district) => (
      `<option value="${esc(district)}" ${district === selected ? "selected" : ""}>${esc(district)}</option>`
    ))
  ].join("");
}

function scopedCitySelectOptions(store, country = "moldova", selected = "") {
  const cities = filterOptions.countries[country]?.cities || filterOptions.countries.moldova.cities;
  const allowed = Array.isArray(store.cities) && store.cities.length ? store.cities : Object.keys(cities);
  const fallbackCity = allowed.find((city) => cities[city]) || Object.keys(cities)[0] || "";
  const value = allowed.includes(selected) && cities[selected] ? selected : fallbackCity;
  return Object.entries(cities)
    .filter(([key]) => allowed.includes(key))
    .map(([key, item]) => `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(item.label || key)}</option>`)
    .join("");
}

function scopedDistrictSelectOptions(store, country = "moldova", city = "chisinau", selected = "") {
  const cityInfo = filterOptions.countries[country]?.cities?.[city] || filterOptions.countries.moldova.cities.chisinau;
  const allowed = Array.isArray(store.districts) && store.districts.length ? store.districts : (cityInfo?.districts || []);
  return [
    `<option value="">Любой район</option>`,
    ...allowed.map((district) => `<option value="${esc(district)}" ${district === selected ? "selected" : ""}>${esc(district)}</option>`)
  ].join("");
}

function selectedCheckboxValues(container) {
  return Array.from(container?.querySelectorAll("input[type='checkbox']:checked") || []).map((input) => input.value).filter(Boolean);
}

function storeFilterCheckboxOptions(name, items, selected = []) {
  const selectedSet = new Set(selected);
  return items.map(([key, label]) => (
    `<label class="store-filter-option"><span>${esc(label)}</span><input type="checkbox" name="${esc(name)}" value="${esc(key)}" ${selectedSet.has(key) ? "checked" : ""}></label>`
  )).join("");
}

function storeFilterCountryOptions(selected = [], name = "countries") {
  return storeFilterCheckboxOptions(
    name,
    Object.entries(filterOptions.countries).map(([key, item]) => [key, item.label]),
    selected
  );
}

function storeFilterCityOptions(countries = [], selected = [], name = "cities") {
  const selectedCountries = countries.length ? countries : Object.keys(filterOptions.countries);
  const seen = new Set();
  const items = selectedCountries.flatMap((countryKey) => {
    const country = filterOptions.countries[countryKey];
    if (!country) return [];
    return Object.entries(country.cities).map(([cityKey, item]) => {
      if (seen.has(cityKey)) return "";
      seen.add(cityKey);
      return [cityKey, item.label];
    });
  }).filter(Boolean);
  return storeFilterCheckboxOptions(name, items, selected);
}

function storeFilterDistrictOptions(countries = [], cities = [], selected = [], name = "districts") {
  const selectedCountries = countries.length ? countries : Object.keys(filterOptions.countries);
  const seen = new Set();
  const items = [];
  selectedCountries.forEach((countryKey) => {
    const country = filterOptions.countries[countryKey];
    if (!country) return;
    Object.entries(country.cities).forEach(([cityKey, item]) => {
      if (cities.length && !cities.includes(cityKey)) return;
      (item.districts || []).forEach((district) => {
        if (seen.has(district)) return;
        seen.add(district);
        items.push([district, district]);
      });
    });
  });
  return storeFilterCheckboxOptions(name, items, selected);
}

function storeFilterPicker(label, target, content) {
  return `
    <div class="store-filter-picker">
      <div class="store-filter-picker-head">
        <strong>${label}</strong>
        <button class="ghost-button mini-filter-toggle" type="button" data-store-filter-toggle="${target}">Выбрать</button>
      </div>
      <div class="store-filter-list" data-store-filter-${target}>${content}</div>
    </div>
  `;
}

function updateStoreFilterToggleLabels(group) {
  ["countries", "cities", "districts"].forEach((target) => {
    const list = group.querySelector(`[data-store-filter-${target}]`);
    const button = group.querySelector(`[data-store-filter-toggle="${target}"]`);
    if (!list || !button) return;
    const boxes = Array.from(list.querySelectorAll("input[type='checkbox']"));
    const allChecked = boxes.length > 0 && boxes.every((box) => box.checked);
    button.textContent = allChecked ? "Снять" : "Выбрать";
  });
}

function bindStoreFilterSelects(root = document) {
  root.querySelectorAll("[data-store-filter-group]").forEach((group) => {
    const countries = group.querySelector("[data-store-filter-countries]");
    const cities = group.querySelector("[data-store-filter-cities]");
    const districts = group.querySelector("[data-store-filter-districts]");
    if (!countries || !cities) return;
    const countryName = group.dataset.countryName || "countries";
    const cityName = group.dataset.cityName || "cities";
    const districtName = group.dataset.districtName || "districts";

    const refreshDistricts = () => {
      if (!districts) return;
      const selectedDistricts = selectedCheckboxValues(districts);
      districts.innerHTML = storeFilterDistrictOptions(selectedCheckboxValues(countries), selectedCheckboxValues(cities), selectedDistricts, districtName);
      updateStoreFilterToggleLabels(group);
    };

    const refreshCities = () => {
      const selectedCities = selectedCheckboxValues(cities);
      cities.innerHTML = storeFilterCityOptions(selectedCheckboxValues(countries), selectedCities, cityName);
      refreshDistricts();
    };

    group.addEventListener("change", (event) => {
      if (event.target.name === countryName) refreshCities();
      if (event.target.name === cityName) refreshDistricts();
      updateStoreFilterToggleLabels(group);
    });
    group.querySelectorAll("[data-store-filter-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.storeFilterToggle;
        const list = group.querySelector(`[data-store-filter-${target}]`);
        const boxes = Array.from(list?.querySelectorAll("input[type='checkbox']") || []);
        const shouldCheck = boxes.some((box) => !box.checked);
        boxes.forEach((box) => { box.checked = shouldCheck; });
        if (target === "countries") refreshCities();
        if (target === "cities") refreshDistricts();
        updateStoreFilterToggleLabels(group);
      });
    });
    refreshCities();
  });
}

function bindLocationSelects(root = document) {
  root.querySelectorAll("[data-location-group]").forEach((group) => {
    const countrySelect = group.querySelector("[data-location-country]");
    const citySelect = group.querySelector("[data-location-city]");
    const districtSelect = group.querySelector("[data-location-district]");
    if (!countrySelect || !citySelect || !districtSelect) return;

    const refreshDistricts = () => {
      const currentDistrict = districtSelect.value;
      districtSelect.innerHTML = districtSelectOptions(countrySelect.value, citySelect.value, currentDistrict);
    };

    const refreshCities = () => {
      const currentCity = citySelect.value;
      citySelect.innerHTML = citySelectOptions(countrySelect.value, currentCity);
      refreshDistricts();
    };

    countrySelect.addEventListener("change", refreshCities);
    citySelect.addEventListener("change", refreshDistricts);
    refreshCities();
  });
}

function bindShopLocationSelects(store, root = document) {
  root.querySelectorAll("[data-location-group]").forEach((group) => {
    const country = group.querySelector("input[name='country']")?.value || shopDefaultCountry(store);
    const citySelect = group.querySelector("[data-shop-location-city]");
    const districtSelect = group.querySelector("[data-shop-location-district]");
    if (!citySelect || !districtSelect) return;
    const refreshDistricts = () => {
      districtSelect.innerHTML = scopedDistrictSelectOptions(store, country, citySelect.value, districtSelect.value);
    };
    citySelect.addEventListener("change", refreshDistricts);
    refreshDistricts();
  });
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
        if (Number(card.ltcUsd || 0) <= 0) card.ltcUsd = value;
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

function setButtonLoading(button, loading, label = "Загрузка") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = `<span class="button-spinner"></span><span>${esc(label)}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  }
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
        <button class="logo-button" data-route="home"><img class="logo" src="assets/logo1-transparent.png" alt="CERBER"></button>
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
        <div class="account-row account-head">
          <img class="avatar" src="assets/user-avatar.png" alt="">
          <strong>${esc(currentUser()?.name || currentUser()?.login)}</strong>
          <button class="account-deposit" type="button" data-menu-deposit>Пополнить</button>
        </div>
        <div class="divider"></div>
        ${accountMenuButton("wallet", "Кошелек", `data-route="wallet"`)}
        ${accountMenuButton("filters", "Каталог", `data-filters`)}
        ${accountMenuButton("stores", "Магазины", `data-route="catalog"`)}
        ${accountMenuButton("orders", "Заказы", `data-route="orders"`)}
        ${accountMenuButton("messages", tr("messages"), `data-route="messages"`)}
        ${accountMenuButton("messages", "Общий чат", `data-route="group-chat"`)}
        ${accountMenuButton("referrals", "Реферальная программа", `data-route="referrals"`, `<b>NEW</b>`)}
        ${accountMenuButton("exchange", "Заявки на обмен", `data-route="exchange"`)}
        <div class="divider"></div>
        ${accountMenuButton("support", "Поддержка", `data-route="support"`)}
        ${accountMenuButton("rules", "Правила", `data-rules`)}
        ${accountMenuButton("logout", tr("logout"), `data-logout`)}
      </div>
    </div>
    ${renderGroupFloatingWidget()}
    <div class="modal-backdrop" data-modal></div>
    <div class="toast"></div>
  `;
  bindGlobal();
  applyCmsVisualTextOverrides();
  mountCmsVisualEditor();
}

function renderAuth(message = "") {
  turnstileWidgetId = null;
  document.body.dataset.theme = db.theme;
  root.innerHTML = `
    <main class="auth-wrap">
      <section class="auth-card">
        <img src="assets/logo1-transparent.png" alt="CERBER">
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
  applyCmsVisualTextOverrides();
  mountCmsVisualEditor();
}

function renderSellerAdminLogin(storeId = "", message = "") {
  const store = db.stores.find((item) => item.id === storeId) || db.stores[0];
  if (!store) return renderAuth("Магазин ещё не создан. Добавьте его в общей админке.");
  sellerAdminStoreId = store?.id || storeId;
  document.body.dataset.theme = db.theme;
  root.innerHTML = `
    <main class="auth-wrap">
      <section class="auth-card">
        <img src="assets/logo1-transparent.png" alt="CERBER">
        <h1>Админка магазина</h1>
        <p>${esc(store?.name || "Магазин")}</p>
        ${message ? `<p class="notice">${esc(message)}</p>` : ""}
        <form class="form" data-seller-admin-login>
          <label class="field">Пароль<input name="password" type="password" required autocomplete="current-password"></label>
          <button class="primary" type="submit">Войти</button>
        </form>
      </section>
    </main>
    <div class="toast"></div>
  `;
  document.querySelector("[data-seller-admin-login]").onsubmit = async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    if (API_ENABLED) {
      try {
        const response = await fetch(apiUrl("/api/store-admin/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: store.id, password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Неверный пароль");
        localStorage.setItem(SELLER_ADMIN_API_TOKEN_KEY, payload.token);
        applyRemoteState(payload);
      } catch (error) {
        renderSellerAdminLogin(store.id, error.message || "Неверный пароль");
        return;
      }
    }
    if (password !== storeAdminPassword(store)) {
      renderSellerAdminLogin(store.id, "Неверный пароль");
      return;
    }
    try {
      localStorage.setItem(SELLER_ADMIN_KEY, store.id);
    } catch {}
    sellerAdminStoreId = store.id;
    route = "seller";
    location.hash = `seller-${store.id}`;
    renderSeller();
  };
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
        return renderCurrent();
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
      return renderCurrent();
    } catch (error) {
      resetCaptcha();
      return renderAuth(error.message);
    }
  }

  const user = db.users.find((item) => sameLogin(item.login, login) && item.password === password);
  if (!user) return renderAuth(tr("badLogin"));
  db.currentUser = user.login;
  saveDb();
  renderCurrent();
}

function renderHome() {
  route = "home";
  const stores = homeStores(activeHomeTab);
  const cards = stores.map((store) => storeCard(store)).join("") || `<article class="panel empty-state"><p>Магазины появятся после добавления в админке.</p></article>`;
  layout(`
    <section class="hero">
      <h1>${topTitleView()}</h1>
      <label class="search"><b>⌕</b><input data-search placeholder="${tr("search")}"></label>
      <div class="tabs">
        <button class="tab ${activeHomeTab === "all" ? "active" : ""}" data-home-tab="all">${tr("all")}</button>
        <button class="tab ${activeHomeTab === "top" ? "active" : ""}" data-home-tab="top">${tr("top")}</button>
        <button class="tab ${activeHomeTab === "new" ? "active" : ""}" data-home-tab="new">${tr("new")}</button>
      </div>
    </section>
    <section class="feed">
      ${officialMirrorsView()}
      <div class="store-feed" data-feed>${cards}</div>
    </section>
  `);
  bindCopyButtons();
  document.querySelectorAll("[data-home-tab]").forEach((button) => {
    button.onclick = () => {
      activeHomeTab = button.dataset.homeTab || "all";
      renderHome();
    };
  });
  document.querySelector("[data-search]").oninput = (event) => {
    const q = event.target.value.toLowerCase();
    document.querySelector("[data-feed]").innerHTML = homeStores(activeHomeTab)
      .filter((store) => `${store.name} ${store.short} ${store.tag}`.toLowerCase().includes(q))
      .map((store) => storeCard(store)).join("") || `<article class="panel empty-state"><p>Ничего не найдено</p></article>`;
    bindStoreCards();
  };
}

function topTitleView() {
  return esc(tr("storesTop")).replace("🔥", `<span class="top-fire-sticker" aria-hidden="true">🔥<i></i><i></i><i></i></span>`);
}

function mirrorRow(url) {
  return `
    <div class="mirror-row">
      <span>${esc(url)}</span>
      <button class="mirror-copy" data-copy="${esc(url)}" aria-label="Скопировать ${esc(url)}">⧉</button>
    </div>
  `;
}

function officialMirrorsView() {
  return `
    <details class="official-mirrors">
      <summary>
        <span>Официальные зеркала</span>
        <small>${esc(officialOnionMirrors[0])}</small>
        <b>Ещё</b>
      </summary>
      <div class="mirror-list">
        <h3>TOR</h3>
        ${officialOnionMirrors.map(mirrorRow).join("")}
        <h3>Clear domains</h3>
        ${officialClearDomains.map(mirrorRow).join("")}
      </div>
    </details>
  `;
}

function renderCatalog() {
  route = "catalog";
  const cards = visibleStores(false).map((store) => storeCard(store)).join("") || `<article class="panel empty-state"><p>Магазины появятся после добавления в админке.</p></article>`;
  layout(`
    <section class="hero">
      <h1>Магазины</h1>
      <label class="search"><b>⌕</b><input data-search placeholder="${tr("search")}"></label>
    </section>
    <section class="feed" data-feed>${cards}</section>
  `);
  document.querySelector("[data-search]").oninput = (event) => {
    const q = event.target.value.toLowerCase();
    document.querySelector("[data-feed]").innerHTML = visibleStores(false)
      .filter((store) => `${store.name} ${store.short} ${store.tag}`.toLowerCase().includes(q))
      .map((store) => storeCard(store)).join("") || `<article class="panel empty-state"><p>Ничего не найдено</p></article>`;
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
  const canceled = orders.filter((order) => order.status === "canceled");
  const disputes = orders.filter((order) => order.disputeOpen || order.status === "dispute");
  const list = tab === "active" ? active : tab === "completed" ? completed : tab === "canceled" ? canceled : tab === "disputes" ? disputes : orders;
  layout(`
    <section class="screen orders-screen">
      <h1 class="big-title">Заказы</h1>
      <div class="order-tabs">
        <button class="${tab === "all" ? "active" : ""}" data-order-tab="all">Все <span>${orders.length}</span></button>
        <button class="${tab === "active" ? "active" : ""}" data-order-tab="active">Активные <span>${active.length}</span></button>
        <button class="${tab === "completed" ? "active" : ""}" data-order-tab="completed">Завершённые <span>${completed.length}</span></button>
        <button class="${tab === "canceled" ? "active" : ""}" data-order-tab="canceled">Отменённые <span>${canceled.length}</span></button>
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
        <p>${Number(order.amountUsd || 0).toFixed(2)} $ · ${Number(order.ltcAmount || usdToLtc(order.amountUsd || 0)).toFixed(6)} LTC${order.location ? ` · ${esc(order.location)}` : ""}</p>
        ${order.status === "pending_payment" ? `<p>Бронь до ${new Date(Number(order.paymentExpiresAt || 0)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>` : ""}
        ${order.status === "pending_payment" && order.sellerLtcWallet ? `<p class="mono-line">${esc(order.sellerLtcWallet)}</p>` : ""}
        ${order.status === "completed" ? `<p>Оплачено. ${esc(order.reservedDescription || order.productDescription || "Описание заказа сохранено в карточке.")}</p>` : ""}
        ${order.totalMdl ? `<p>${Number(order.amountUsd || 0).toFixed(2)} $ · ${Number(order.ltcAmount || request?.ltcAmount || 0).toFixed(6)} LTC · ${Number(order.totalMdl || 0).toFixed(2)} MDL</p>` : ""}
      </div>
      <div class="order-side">
        <span>${status}</span>
        <button data-order-open="${esc(order.exchangeRequestId || order.id)}">Детали</button>
        ${order.status === "pending_payment" ? `<button data-order-cancel="${esc(order.id)}">Отменить</button>` : ""}
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
  const ltcAmount = Number(order.ltcAmount || usdToLtc(order.amountUsd || 0));
  const linkedDeposit = order.walletDepositId ? (db.walletDeposits || []).find((item) => item.id === order.walletDepositId) : null;
  const orderDepositAddress = linkedDeposit?.payAddress || order.walletDepositAddress || (order.status === "pending_payment" ? MAIN_LTC_WALLET : "");
  const orderDepositLtc = Number(linkedDeposit?.payAmount || order.walletDepositAmountLtc || ltcAmount || 0);
  const orderDepositUsd = Number(linkedDeposit?.amountUsd || order.walletDepositAmountUsd || order.amountUsd || 0);
  const orderPaymentUrl = linkedDeposit?.paymentUrl || order.walletDepositPaymentUrl || order.paymentUrl || "";
  showModal(`
    <h2>${esc(order.product)}</h2>
    <p>${esc(order.storeName || "")}</p>
    <p>${esc(order.location || "")}</p>
    <p>Цена: ${Number(order.amountUsd || 0).toFixed(2)} $ · ${ltcAmount.toFixed(6)} LTC</p>
    <p>Статус: ${productOrderStatus(order)}</p>
    ${order.status === "completed" ? `<p><strong>Успешно оплачено.</strong></p><p>${esc(order.reservedDescription || order.productDescription || "")}</p>` : ""}
    ${order.status === "completed" && !order.reviewLeft ? `
      <form class="form" data-review-form="${esc(order.id)}">
        <label class="field">Оценка
          <select name="rating">
            <option value="5">5 звезд</option>
            <option value="4">4 звезды</option>
            <option value="3">3 звезды</option>
            <option value="2">2 звезды</option>
            <option value="1">1 звезда</option>
          </select>
        </label>
        <label class="field">Отзыв<textarea name="text" required placeholder="Напишите отзыв о покупке"></textarea></label>
        <button class="primary">Оставить отзыв</button>
      </form>
    ` : ""}
    ${order.status === "pending_payment" ? `
      <div class="payment-instructions">
        <h3>Оплата LTC</h3>
        <p>Бронь активна до ${new Date(Number(order.paymentExpiresAt || 0)).toLocaleString()}</p>
        <p>Истекает через ${Math.max(0, Math.ceil((Number(order.paymentExpiresAt || 0) - Date.now()) / 60000))} минут</p>
        <p><span>Сумма:</span><strong>${ltcAmount.toFixed(6)} LTC</strong></p>
        ${orderDepositAddress ? `
          <p><span>Счет пополнения:</span><strong>${orderDepositUsd.toFixed(2)} $ · ${orderDepositLtc.toFixed(8)} LTC</strong></p>
          <p><span>Куда оплатить:</span><strong class="mono-line">${esc(orderDepositAddress)}</strong></p>
          <button class="ghost-button" data-copy="${esc(walletDepositCopyText(linkedDeposit || {
            amountUsd: orderDepositUsd,
            payAmount: orderDepositLtc,
            payAddress: orderDepositAddress
          }))}">Скопировать счет пополнения</button>
        ` : ""}
        ${orderPaymentUrl ? `<a class="primary link-button" href="${esc(orderPaymentUrl)}" target="_blank" rel="noopener">Открыть основную ссылку оплаты</a>` : ""}
        ${userLtcBalance() >= ltcAmount ? `<button class="primary" data-pay-from-balance="${esc(order.id)}">Оплатить с баланса CERBER</button>` : `<p class="notice">На балансе недостаточно средств для оплаты с кошелька CERBER.</p>`}
        ${order.sellerLtcWallet ? `<p><span>Кошелек магазина:</span><strong class="mono-line">${esc(order.sellerLtcWallet)}</strong></p>` : ""}
        <div class="row">
          <button class="ghost-button" data-copy="${esc(`Адрес LTC: ${order.sellerLtcWallet || ""}\nСумма: ${ltcAmount.toFixed(6)} LTC`)}">Скопировать всё</button>
          <button class="ghost-button" data-copy="${esc(order.sellerLtcWallet || "")}">Скопировать кошелек</button>
          <button class="ghost-button" data-copy="${ltcAmount.toFixed(6)}">Скопировать сумму</button>
        </div>
        ${order.sellerLtcWallet ? `<a class="primary link-button" href="litecoin:${esc(order.sellerLtcWallet)}?amount=${ltcAmount.toFixed(6)}">Открыть LTC-ссылку</a>` : ""}
        <p class="desc">После подтверждения оплаты заказ станет завершенным, и здесь появится описание товара.</p>
        <button class="ghost-button" data-order-cancel="${esc(order.id)}">Отменить заказ</button>
      </div>
    ` : ""}
    ${orderCanDispute(order) ? `<button class="ghost-button" data-order-dispute="${esc(order.id)}">Открыть спор</button>` : ""}
    <button class="primary" data-close-modal>${tr("close")}</button>
  `);
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy || "");
        showToast("Скопировано");
      } catch {
        showToast("Не удалось скопировать");
      }
    };
  });
  document.querySelector("[data-order-cancel]")?.addEventListener("click", (event) => cancelProductOrder(event.currentTarget.dataset.orderCancel));
  document.querySelector("[data-pay-from-balance]")?.addEventListener("click", (event) => payProductOrderFromBalance(event.currentTarget.dataset.payFromBalance));
  document.querySelector("[data-order-dispute]")?.addEventListener("click", (event) => openProductDispute(event.currentTarget.dataset.orderDispute));
  document.querySelector("[data-review-form]")?.addEventListener("submit", handleProductReview);
}

function handleProductReview(event) {
  event.preventDefault();
  const orderId = event.currentTarget.dataset.reviewForm;
  const order = db.orders.find((item) => item.id === orderId);
  if (!order || order.status !== "completed" || order.reviewLeft) return;
  const store = storeById(order.storeId);
  
  const product = productById(store, order.productId);
  if (!store) return;
  const data = new FormData(event.currentTarget);
  const review = {
    id: `review-${Date.now()}`,
    serviceDate: new Date().toLocaleDateString("ru-RU"),
    rating: Number(data.get("rating") || 5),
    product: order.product,
    text: data.get("text").trim()
  };
  if (!review.text) return;
  store.reviewsList = [review, ...(store.reviewsList || [])];
  store.reviews = Number(store.reviews || 0) + 1;
  store.rating = ((Number(store.rating || 5) * (store.reviews - 1)) + review.rating) / store.reviews;
  if (product) {
    product.reviewsList = [review, ...(product.reviewsList || [])];
    product.reviews = Number(product.reviews || 0) + 1;
    product.rating = ((Number(product.rating || 5) * (product.reviews - 1)) + review.rating) / product.reviews;
  }
  order.reviewLeft = true;
  saveDb();
  showToast("Отзыв добавлен");
  showProductOrder(order.id);
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
  if (!store) return renderCatalog();
  const coverImage = store.cover || store.banner || store.image || fallbackImage;
  const avatarImage = store.image || fallbackImage;
  const reviewsList = store.reviewsList || [];
  const publicProducts = sortedStoreProducts(store);
  const content = activeStoreTab === "reviews"
    ? (reviewsList.length ? reviewsList.map((review) => reviewCard(review)).join("") : `<article class="panel empty-state"><p>${tr("noReviews")}</p></article>`)
    : (publicProducts.length ? publicProducts.map((product) => productCardView(product, store)).join("") : `<article class="panel empty-state"><p>Позиции пока не добавлены</p></article>`);
  layout(`
    <section class="screen">
      <article class="panel">
        <img class="profile-cover" src="${esc(coverImage)}" alt="">
        <div class="profile-body">
          <img class="profile-avatar" src="${esc(avatarImage)}" alt="${esc(store.name)}">
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
  const ltcAmount = usdToLtc(minPrice);
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
          <p class="price">${minPrice.toFixed(0)}$ · <span data-ltc-price data-usd="${minPrice}">${ltcAmount.toFixed(6)} LTC</span></p>
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
  fetchLitecoinUsdRate().then(() => {
    if (route === "product" && activeProductId === productId) {
      document.querySelectorAll("[data-ltc-price]").forEach((node) => {
        node.textContent = `${usdToLtc(Number(node.dataset.usd || 0)).toFixed(6)} LTC`;
      });
    }
  });
}

function positionCardView(position, product, store) {
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  const ltcAmount = usdToLtc(priceUsd);
  return `
    <article class="position-card mega-position-card">
      <div class="position-grid mega-position-grid">
        <p><span>Кол-во</span><strong>${esc(position.stock || 0)} шт</strong></p>
        <p><span>Название</span><strong>${esc(position.title || product.title)}</strong></p>
        <p><span>Тип</span><strong>${esc(position.deliveryType || "Товар")}</strong></p>
        <p><span>Вес</span><strong>${esc(position.weight || "-")}</strong></p>
        <p><span>Цена</span><strong>${priceUsd.toFixed(0)} $</strong></p>
        <p><span>LTC</span><strong data-ltc-price data-usd="${priceUsd}">${ltcAmount.toFixed(6)} LTC</strong></p>
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
  if (!storeIsActive(store) || store.salesBlocked) return showToast("\u041c\u0430\u0433\u0430\u0437\u0438\u043d \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d");
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  const ltcAmount = usdToLtc(priceUsd);
  if (userLtcBalance() < ltcAmount) {
    showToast("У вас недостаточно средств");
    return;
  }
  if (Number(position.stock || 0) <= 0) return showToast("Товара сейчас нет");
  const positionItems = Array.isArray(position.deliveryItems) ? position.deliveryItems : [];
  const productItems = Array.isArray(product.deliveryItems) ? product.deliveryItems : [];
  const issueFromPosition = positionItems.length > 0;
  const issuedItems = issueFromPosition ? positionItems : productItems;
  const requiresIssuedDescription = issuedItems.length > 0;
  const reservedDescription = issuedItems.shift() || "";
  if (!reservedDescription && requiresIssuedDescription) return showToast("Нет доступных описаний для выдачи");
  position.stock = Math.max(0, Number(position.stock || 0) - 1);
  db.ltcBalances[db.currentUser] = userLtcBalance() - ltcAmount;
  const order = {
    id: `order-${Date.now()}`,
    type: "product",
    login: db.currentUser,
    storeId,
    productId,
    positionId,
    product: product.title,
    storeName: store.name,
    status: "completed",
    paymentStatus: "paid",
    createdAt: Date.now(),
    paidAt: Date.now(),
    completedAt: Date.now(),
    amountUsd: priceUsd,
    ltcAmount,
    location: locationLabel(position),
    productDescription: product.description || "",
    reservedDescription,
    reservedFromPosition: issueFromPosition,
    reservedStock: true
  };
  db.orders.unshift(order);
  addWalletTransaction({
    type: "purchase",
    title: `Покупка: ${product.title}`,
    amountLtc: -ltcAmount,
    amountUsd: -priceUsd
  });
  saveDb();
  renderOrders("completed");
}

function payProductOrderFromBalance(orderId) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order || order.status !== "pending_payment") return;
  const ltcAmount = Number(order.ltcAmount || usdToLtc(order.amountUsd || 0));
  if (userLtcBalance() < ltcAmount) {
    showToast("У вас недостаточно средств");
    return;
  }
  db.ltcBalances[db.currentUser] = userLtcBalance() - ltcAmount;
  markProductOrderPaid(order.id);
  addWalletTransaction({
    type: "purchase",
    title: `Покупка: ${order.product}`,
    amountLtc: -ltcAmount,
    amountUsd: -Number(order.amountUsd || 0)
  });
  saveDb();
  renderOrders("completed");
}

function handleProductReservation(storeId, productId, positionId, options = {}) {
  const store = storeById(storeId);
  const product = productById(store, productId);
  const position = positionById(product, positionId);
  if (!product || !position) return;
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  if (Number(position.stock || 0) <= 0) return showToast("Товара сейчас нет");
  const positionItems = Array.isArray(position.deliveryItems) ? position.deliveryItems : [];
  const productItems = Array.isArray(product.deliveryItems) ? product.deliveryItems : [];
  const issueFromPosition = positionItems.length > 0;
  const issuedItems = issueFromPosition ? positionItems : productItems;
  const requiresIssuedDescription = issuedItems.length > 0;
  const reservedDescription = issuedItems.shift() || "";
  if (!reservedDescription && requiresIssuedDescription) return showToast("Нет доступных описаний для выдачи");
  position.stock = Math.max(0, Number(position.stock || 0) - 1);
  const commissionPercent = Number(db.paymentSettings?.platformCommissionPercent || 0);
  const commissionUsd = priceUsd * commissionPercent / 100;
  const ltcAmount = usdToLtc(priceUsd);
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
    autoReleaseHours: Math.max(1, Number(store.autoReleaseHours || db.ownerSettings?.defaultAutoReleaseHours || 24)),
    autoReleaseAt: null,
    amountUsd: priceUsd,
    ltcAmount,
    location: locationLabel(position),
    productDescription: product.description || "",
    reservedDescription,
    reservedFromPosition: issueFromPosition,
    reservedStock: true,
    sellerLtcWallet: store.ltcWallet || "",
    platformLtcWallet: db.paymentSettings?.platformLtcWallet || "",
    platformCommissionPercent: commissionPercent,
    platformCommissionUsd: commissionUsd,
    sellerAmountUsd: priceUsd - commissionUsd,
    paymentProvider: "gateway"
  };
  db.orders.unshift(order);
  saveDb();
  if (options.silent) return order;
  showToast("Бронь создана. Заказ в разделе Активные.");
  renderOrders("active");
  return order;
}

function openProductCheckoutModal(storeId, productId, positionId) {
  const store = storeById(storeId);
  const product = productById(store, productId);
  const position = positionById(product, positionId);
  if (!product || !position) return;
  if (!storeIsActive(store) || store.salesBlocked) {
    showToast("\u041c\u0430\u0433\u0430\u0437\u0438\u043d \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d");
    return;
  }
  const priceUsd = Number(position.priceUsd || product.priceUsd || 0);
  const ltcAmount = usdToLtc(priceUsd);
  const enough = userLtcBalance() >= ltcAmount && ltcAmount > 0;
  showModal(`
    <h2>Покупка товара</h2>
    <article class="checkout-mini">
      <strong>${esc(product.title)}</strong>
      <span>${esc(store.name)} · ${esc(locationLabel(position))}</span>
      <b>${priceUsd.toFixed(2)} $ · ${ltcAmount.toFixed(6)} LTC</b>
    </article>
    <div class="checkout-actions">
      <button class="primary" data-checkout-balance ${enough ? "" : "disabled"}>Оплатить с баланса</button>
      <button class="primary" data-checkout-deposit>Пополнить и оплатить</button>
    </div>
    ${enough ? `<p class="desc">На балансе достаточно средств. После оплаты описание товара появится в деталях заказа.</p>` : `<p class="notice">На балансе недостаточно средств. Пополните LTC на нужную сумму, заказ будет в обработке 40 минут.</p>`}
    <button class="ghost-button" data-close-modal>${tr("close")}</button>
  `);
  document.querySelector("[data-checkout-balance]")?.addEventListener("click", (event) => {
    setButtonLoading(event.currentTarget, true);
    const order = handleProductReservation(storeId, productId, positionId, { silent: true });
    if (!order) return;
    payProductOrderFromBalance(order.id);
    document.querySelector("[data-modal]")?.classList.remove("open");
  });
  document.querySelector("[data-checkout-deposit]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setButtonLoading(button, true, "Создаём счет");
    const order = handleProductReservation(storeId, productId, positionId, { silent: true });
    if (!order) {
      setButtonLoading(button, false);
      return;
    }
    try {
      const deposit = await createWalletDepositRequest(priceUsd, `Пополнение для заказа: ${product.title}`);
      order.walletDepositId = deposit.id;
      order.walletDepositAmountUsd = priceUsd;
      order.walletDepositAmountLtc = deposit.payAmount || usdToLtc(priceUsd);
      order.walletDepositAddress = deposit.payAddress || "";
      order.walletDepositPaymentUrl = deposit.paymentUrl || "";
      order.paymentUrl = deposit.paymentUrl || order.paymentUrl || "";
      saveDb();
      showProductOrder(order.id);
    } catch (error) {
      cancelProductOrder(order.id, { silent: true });
      showToast(error.message || "Не удалось создать счет LTC");
      setButtonLoading(button, false);
    }
  });
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
        <h2>Оплата через платежный шлюз</h2>
        <p>Оплата принимается в LTC. Средства идут на LTC-счёт магазина.</p>
        <p>Комиссия площадки: ${Number(order.platformCommissionPercent || 0).toFixed(2)}%.</p>
        <p class="desc">После подтверждения платежа заказ автоматически станет завершённым, а описание из строки выдачи появится в деталях заказа.</p>
        ${payUrl ? `<a class="primary link-button" href="${esc(payUrl)}" target="_blank" rel="noopener">Открыть оплату</a>` : `<button class="primary" data-create-gateway-payment="${esc(order.id)}">Создать ссылку оплаты</button>`}
        <button class="ghost-button" data-order-cancel="${esc(order.id)}">Отменить заказ</button>
      </article>
    </section>
  `);
  document.querySelector("[data-create-gateway-payment]")?.addEventListener("click", (event) => createGatewayInvoice(event.currentTarget.dataset.createGatewayPayment, event.currentTarget));
  document.querySelector("[data-order-cancel]")?.addEventListener("click", (event) => cancelProductOrder(event.currentTarget.dataset.orderCancel));
}

async function createGatewayInvoice(orderId, button = null) {
  setButtonLoading(button, true, "Создаём оплату");
  try {
    const payload = await apiFetch("/api/payments/gateway/create", {
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

function cancelProductOrder(orderId, options = {}) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order || order.paymentStatus === "paid") return;
  restoreReservedProductItem(order, db);
  order.status = "canceled";
  order.paymentStatus = "canceled";
  order.canceledAt = Date.now();
  saveDb();
  if (options.silent) return;
  renderOrders("canceled");
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
  const store = storeById(order.storeId);
  if (store?.ownerLogin) {
    db.messages.unshift({
      id: `dispute-product-${Date.now()}`,
      storeId: order.storeId,
      storeTag: store.tag || store.name,
      toLogin: store.ownerLogin,
      fromLogin: order.login || db.currentUser,
      subject: `Диспут: ${order.product || order.id}`,
      body: `Клиент открыл диспут по заказу ${order.id}.`,
      createdAt: Date.now(),
      date: new Date().toLocaleString(),
      system: "product-dispute"
    });
  }
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
  const visibleMessages = privateVisibleMessages(user.login);
  const conversations = privateConversations(visibleMessages, user.login);
  const activeMessages = activePrivateLogin ? privateConversationMessages(activePrivateLogin, visibleMessages, user.login) : [];
  startPrivateMessagesRefresh();
  layout(`
    <section class="screen private-messages-screen">
      <article class="panel private-search-panel">
        <div>
          <h2>${tr("messages")}</h2>
          <p>Введите логин пользователя, чтобы сразу открыть личный диалог.</p>
        </div>
        <form class="private-search" data-private-search-form>
          <input name="login" placeholder="Логин пользователя" autocomplete="off" required>
          <button class="primary">Найти</button>
        </form>
      </article>
      <div class="private-layout ${activePrivateLogin ? "has-active" : "is-list-only"}">
        <aside class="private-list">
          <h3>Мои диалоги</h3>
          ${conversations.length ? conversations.map((chat) => `
            <button class="${sameLogin(chat.login, activePrivateLogin) ? "active" : ""}" data-private-open="${esc(chat.login)}">
              <span>${esc(chat.login)}</span>
              <small>${esc(chat.preview || "")}</small>
            </button>
          `).join("") : `<p>${tr("noMessages")}</p>`}
        </aside>
        ${activePrivateLogin ? `
          <article class="panel private-chat">
            <header class="private-chat-head">
              <button class="group-avatar">${esc(activePrivateLogin.slice(0, 1).toUpperCase())}</button>
              <div>
                <h3>${esc(activePrivateLogin)}</h3>
                <p>Личный диалог</p>
              </div>
              <button class="private-close-chat" type="button" data-private-close title="Закрыть диалог">×</button>
            </header>
            <div class="private-chat-list" data-private-chat-list>
              ${activeMessages.length ? activeMessages.map(privateMessageView).join("") : `<p class="empty-chat">Сообщений пока нет</p>`}
            </div>
            <form class="group-form private-form" data-private-chat-form>
              <button type="button" class="group-round-button group-attach-button" data-private-attach title="Фото, видео или стикер">📎</button>
              <div class="group-input-wrap">
                <textarea name="body" rows="1" placeholder="Сообщение"></textarea>
                <button type="button" class="group-emoji-toggle" data-private-emoji-toggle title="Смайлики">◔</button>
                <div class="group-sticker-row" data-private-sticker-row hidden>
                  ${TELEGRAM_EMOJIS.map((emoji) => `<button type="button" data-private-emoji="${esc(emoji)}">${esc(emoji)}</button>`).join("")}
                </div>
              </div>
              <input hidden name="attachment" type="file" accept="image/*,video/*,audio/*,.webp,.gif" data-private-attachment>
              <button type="button" class="group-round-button group-voice-button" data-private-voice title="Голосовое">🎙</button>
              <button class="group-round-button group-send-button" title="${tr("send")}">➤</button>
              <div class="group-file-name" data-private-file-name></div>
            </form>
          </article>
        ` : ""}
      </div>
    </section>
  `);
  requestAnimationFrame(() => {
    const list = document.querySelector("[data-private-chat-list]");
    if (list) list.scrollTop = list.scrollHeight;
  });
  document.querySelector("[data-private-search-form]")?.addEventListener("submit", handlePrivateSearch);
  document.querySelectorAll("[data-private-open]").forEach((button) => {
    button.onclick = () => {
      activePrivateLogin = button.dataset.privateOpen;
      renderMessages();
    };
  });
  document.querySelector("[data-private-close]")?.addEventListener("click", () => {
    activePrivateLogin = "";
    privateVoiceDraft = null;
    renderMessages();
  });
  document.querySelector("[data-private-chat-form]")?.addEventListener("submit", handlePrivateMessageSend);
  document.querySelector("[data-private-attach]")?.addEventListener("click", () => document.querySelector("[data-private-attachment]")?.click());
  document.querySelector("[data-private-voice]")?.addEventListener("click", togglePrivateVoiceRecord);
  const syncPrivateComposer = () => {
    const form = document.querySelector("[data-private-chat-form]");
    if (!form) return;
    const text = form.querySelector("textarea")?.value.trim() || "";
    const file = form.querySelector("[data-private-attachment]")?.files?.[0];
    form.classList.toggle("has-content", Boolean(text || file || privateVoiceDraft));
  };
  document.querySelector("[data-private-chat-form] textarea")?.addEventListener("input", syncPrivateComposer);
  document.querySelector("[data-private-emoji-toggle]")?.addEventListener("click", () => {
    const row = document.querySelector("[data-private-sticker-row]");
    if (!row) return;
    row.hidden = !row.hidden;
    document.querySelector("[data-private-emoji-toggle]")?.classList.toggle("active", !row.hidden);
  });
  document.querySelector("[data-private-attachment]")?.addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0];
    document.querySelector("[data-private-file-name]").textContent = file ? file.name : "";
    syncPrivateComposer();
  });
  document.querySelectorAll("[data-private-emoji]").forEach((button) => {
    button.onclick = () => {
      const textarea = document.querySelector("[data-private-chat-form] textarea");
      textarea.value = `${textarea.value}${button.dataset.privateEmoji}`;
      textarea.focus();
      syncPrivateComposer();
    };
  });
  syncPrivateComposer();
  document.querySelectorAll("[data-private-message]").forEach((message) => {
    message.ondblclick = () => togglePrivateLike(message.dataset.privateMessage);
  });
  document.querySelectorAll("[data-close-exchange]").forEach((button) => {
    button.onclick = () => closeExchangeOrder(button.dataset.closeExchange, "closed");
  });
  document.querySelectorAll("[data-dispute-exchange]").forEach((button) => {
    button.onclick = () => openExchangeDispute(button.dataset.disputeExchange);
  });
}

function startPrivateMessagesRefresh() {
  if (privateRefreshTimer) clearInterval(privateRefreshTimer);
  privateRefreshTimer = setInterval(async () => {
    if (route !== "messages") return;
    const form = document.querySelector("[data-private-chat-form]");
    const text = form?.querySelector("textarea")?.value || "";
    if (text.trim() || privateVoiceRecorder?.state === "recording" || privateVoiceDraft) return;
    const before = JSON.stringify((db.messages || []).map((msg) => [msg.id, msg.createdAt, msg.fromLogin, msg.toLogin, msg.body]).slice(-60));
    const ok = await loadRemoteSession();
    if (!ok || route !== "messages") return;
    const after = JSON.stringify((db.messages || []).map((msg) => [msg.id, msg.createdAt, msg.fromLogin, msg.toLogin, msg.body]).slice(-60));
    if (before !== after) renderMessages();
  }, 6000);
}

function privateVisibleMessages(login = db.currentUser) {
  return (db.messages || []).filter((msg) => isAdmin() || sameLogin(msg.fromLogin, login) || sameLogin(msg.toLogin, login));
}

function privatePeer(msg, login = db.currentUser) {
  if (sameLogin(msg.fromLogin, login)) return msg.toLogin || msg.storeTag || msg.storeId || "system";
  return msg.fromLogin || msg.storeTag || "system";
}

function privateConversations(messages, login = db.currentUser) {
  const map = new Map();
  messages.forEach((msg) => {
    const peer = privatePeer(msg, login);
    if (!peer || sameLogin(peer, login)) return;
    const current = map.get(loginKey(peer));
    if (!current || Number(msg.createdAt || 0) > Number(current.createdAt || 0)) {
      map.set(loginKey(peer), {
        login: peer,
        preview: msg.body || msg.subject || "Вложение",
        createdAt: msg.createdAt || 0
      });
    }
  });
  return [...map.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function privateConversationMessages(peer, messages = privateVisibleMessages(), login = db.currentUser) {
  return messages.filter((msg) => sameLogin(privatePeer(msg, login), peer)).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function privateMessageView(msg) {
  const own = sameLogin(msg.fromLogin, db.currentUser);
  const likes = Array.isArray(msg.likes) ? msg.likes : [];
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  return `
    <article class="group-message private-message ${own ? "own" : ""}" data-private-message="${esc(msg.id)}">
      <button class="group-avatar">${esc(String(msg.fromLogin || "?").slice(0, 1).toUpperCase())}</button>
      <div>
        <div class="group-meta">
          <span>${esc(msg.fromLogin)}</span>
          <span>${esc(msg.date)}</span>
        </div>
        ${msg.subject ? `<strong>${esc(msg.subject)}</strong>` : ""}
        <p>${esc(msg.body || "").replace(/\n/g, "<br>")}</p>
        ${attachments.length ? `<div class="group-attachments">${attachments.map(groupAttachmentView).join("")}</div>` : ""}
        ${likes.length ? `<button class="group-like-badge" data-private-like="${esc(msg.id)}">❤️ ${likes.length}</button>` : ""}
        ${messageActions(msg)}
      </div>
    </article>
  `;
}

function handlePrivateSearch(event) {
  event.preventDefault();
  const login = String(new FormData(event.currentTarget).get("login") || "").trim();
  if (!login || sameLogin(login, db.currentUser)) return;
  const user = (db.users || []).find((item) => sameLogin(item.login, login));
  if (!user) {
    showToast("Пользователь не найден");
    return;
  }
  activePrivateLogin = user.login;
  renderMessages();
}

async function togglePrivateVoiceRecord(event) {
  const button = event.currentTarget;
  if (privateVoiceRecorder && privateVoiceRecorder.state === "recording") {
    privateVoiceRecorder.stop();
    button.classList.remove("recording");
    button.textContent = "🎙";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("Запись голоса недоступна в этом браузере");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    privateVoiceChunks = [];
    privateVoiceRecorder = new MediaRecorder(stream);
    privateVoiceRecorder.ondataavailable = (recordEvent) => {
      if (recordEvent.data.size) privateVoiceChunks.push(recordEvent.data);
    };
    privateVoiceRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(privateVoiceChunks, { type: privateVoiceRecorder.mimeType || "audio/webm" });
      privateVoiceDraft = {
        name: `voice-${Date.now()}.webm`,
        type: blob.type,
        url: await blobToDataUrl(blob)
      };
      document.querySelector("[data-private-file-name]").textContent = "Голосовое сообщение готово";
      document.querySelector("[data-private-chat-form]")?.classList.add("has-content");
    };
    privateVoiceRecorder.start();
    button.classList.add("recording");
    button.textContent = "■";
    document.querySelector("[data-private-file-name]").textContent = "Идёт запись голоса...";
  } catch {
    showToast("Не удалось включить микрофон");
  }
}

async function handlePrivateMessageSend(event) {
  event.preventDefault();
  if (!activePrivateLogin) return;
  const data = new FormData(event.currentTarget);
  const body = String(data.get("body") || "").trim();
  const file = data.get("attachment");
  if (!body && (!file || !file.size) && !privateVoiceDraft) return;
  const attachments = file && file.size ? [{
    name: file.name,
    type: file.type,
    url: await fileToDataUrl(file)
  }] : (privateVoiceDraft ? [privateVoiceDraft] : []);
  db.messages.unshift({
    id: `private-${Date.now()}`,
    storeId: "",
    storeTag: activePrivateLogin,
    toLogin: activePrivateLogin,
    fromLogin: db.currentUser,
    subject: "",
    body,
    attachments,
    likes: [],
    createdAt: Date.now(),
    date: new Date().toLocaleString()
  });
  privateVoiceDraft = null;
  saveDb();
  renderMessages();
}

function togglePrivateLike(messageId) {
  const msg = db.messages.find((item) => item.id === messageId);
  if (!msg) return;
  msg.likes = Array.isArray(msg.likes) ? msg.likes : [];
  const index = msg.likes.findIndex((login) => sameLogin(login, db.currentUser));
  if (index >= 0) msg.likes.splice(index, 1);
  else msg.likes.push(db.currentUser);
  saveDb();
  renderMessages();
}

function isGroupModerator(login = db.currentUser) {
  return isAdmin() || ["cerber", "cerberm"].some((item) => sameLogin(item, login));
}

function groupMuteUntil(login = db.currentUser) {
  return Number(db.groupSettings?.mutedUntil?.[login] || 0);
}

function groupMessageAuthor(login) {
  return login === "cerber-market" ? "CERBER MARKET" : login;
}

function ensureGroupSettings() {
  db.groupSettings = db.groupSettings || structuredClone(defaults.groupSettings);
  db.groupSettings.mutedUntil = db.groupSettings.mutedUntil || {};
  db.groupSettings.rollTimers = Array.isArray(db.groupSettings.rollTimers) ? db.groupSettings.rollTimers : [];
  db.groupSettings.members = Array.isArray(db.groupSettings.members) ? db.groupSettings.members : [];
  db.groupSettings.presence = db.groupSettings.presence || {};
  db.groupSettings.widgetSeenAt = db.groupSettings.widgetSeenAt || {};
}

function groupMemberLogins() {
  ensureGroupSettings();
  return db.groupSettings.members.filter(Boolean);
}

function isGroupMember(login = db.currentUser) {
  return groupMemberLogins().some((item) => sameLogin(item, login));
}

function markGroupPresence(login = db.currentUser) {
  ensureGroupSettings();
  if (!login || !isGroupMember(login)) return;
  db.groupSettings.presence[login] = Date.now();
  const cutoff = Date.now() - 5 * 60 * 1000;
  Object.entries(db.groupSettings.presence).forEach(([key, value]) => {
    if (Number(value || 0) < cutoff) delete db.groupSettings.presence[key];
  });
}

function saveGroupPresenceSoon() {
  const now = Date.now();
  if (now - groupPresenceSavedAt < 15000) return;
  groupPresenceSavedAt = now;
  saveDb();
}

function groupOnlineCount() {
  ensureGroupSettings();
  const cutoff = Date.now() - 60 * 1000;
  return Object.values(db.groupSettings.presence || {}).filter((seenAt) => Number(seenAt || 0) >= cutoff).length;
}

function joinGroupChat() {
  const user = currentUser();
  if (!user) return renderAuth();
  ensureGroupSettings();
  if (!isGroupMember(user.login)) db.groupSettings.members.push(user.login);
  markGroupPresence(user.login);
  pushGroupSystemMessage(`${user.login} вступил в общий чат.`);
  saveDb();
  renderGroupChat();
}

function visibleGroupMessages() {
  return (db.groupMessages || []).filter((msg) => !msg.deleted).slice().sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function groupWidgetUnreadCount() {
  if (route === "group-chat") return 0;
  const lastSeen = Number(db.groupSettings?.widgetSeenAt?.[db.currentUser] || 0);
  return visibleGroupMessages().filter((msg) => Number(msg.createdAt || 0) > lastSeen && !sameLogin(msg.fromLogin, db.currentUser)).length;
}

function formatGroupWidgetBadge(count) {
  if (count <= 0) return "";
  return count > 99 ? "+99" : String(count);
}

function renderGroupFloatingWidget() {
  if (!db.currentUser || ["group-chat", "messages"].includes(route)) return "";
  ensureGroupSettings();
  const unread = groupWidgetUnreadCount();
  const messages = visibleGroupMessages().slice(-8);
  return `
    <section class="group-widget ${groupWidgetOpen ? "open" : ""}" data-group-widget>
      <button class="group-widget-button" data-group-widget-toggle aria-label="Общий чат">
        💬
        ${unread ? `<span>${formatGroupWidgetBadge(unread)}</span>` : ""}
      </button>
      ${groupWidgetOpen ? `
        <article class="group-widget-panel">
          <header>
            <strong>Cerber Чат</strong>
            <button type="button" data-group-widget-toggle>×</button>
          </header>
          <div class="group-widget-list" data-group-widget-list>
            ${messages.length ? messages.map(groupWidgetMessageView).join("") : `<p class="empty-chat">Сообщений пока нет</p>`}
          </div>
          <form class="group-widget-form" data-group-widget-form>
            <button type="button" data-group-widget-attach title="Фото или видео">📎</button>
            <textarea name="body" rows="1" placeholder="Сообщение"></textarea>
            <input hidden name="attachment" type="file" accept="image/*,video/*,audio/*,.webp,.gif" data-group-widget-file>
            <button type="button" data-group-widget-voice title="Голосовое">🎙</button>
            <button class="group-widget-send" title="Отправить">➤</button>
            <div data-group-widget-file-name></div>
          </form>
        </article>
      ` : ""}
    </section>
  `;
}

function groupWidgetMessageView(msg) {
  const system = msg.fromLogin === "cerber-market";
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  return `
    <div class="group-widget-message ${sameLogin(msg.fromLogin, db.currentUser) ? "own" : ""} ${system ? "system" : ""}">
      <span>${esc(system ? "CERBER" : groupMessageAuthor(msg.fromLogin))}</span>
      <p>${esc(msg.body || (attachments.length ? "[медиа]" : "")).replace(/\n/g, "<br>")}</p>
    </div>
  `;
}

function markGroupWidgetSeen() {
  ensureGroupSettings();
  db.groupSettings.widgetSeenAt = db.groupSettings.widgetSeenAt || {};
  db.groupSettings.widgetSeenAt[db.currentUser] = Date.now();
  saveDb();
}

function pushGroupSystemMessage(body) {
  ensureGroupSettings();
  db.groupMessages.push({
    id: `group-system-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fromLogin: "cerber-market",
    body,
    createdAt: Date.now(),
    date: new Date().toLocaleString()
  });
}

function scheduleRollTimer(timer) {
  if (!timer?.id || scheduledRollTimers.has(timer.id)) return;
  const delay = Number(timer.expiresAt || 0) - Date.now();
  if (delay <= 0) {
    finishRollTimer(timer.id);
    return;
  }
  scheduledRollTimers.add(timer.id);
  setTimeout(() => finishRollTimer(timer.id), delay);
}

function scheduleOpenRollTimers() {
  ensureGroupSettings();
  db.groupSettings.rollTimers.filter((timer) => !timer.done).forEach(scheduleRollTimer);
}

function finishRollTimer(timerId) {
  ensureGroupSettings();
  const timer = db.groupSettings.rollTimers.find((item) => item.id === timerId);
  if (!timer || timer.done) return;
  timer.done = true;
  pushGroupSystemMessage("Время истекло!");
  saveDb();
  if (route === "group-chat") renderGroupChat();
}

function startGroupChatRefresh() {
  if (groupChatRefreshTimer) clearInterval(groupChatRefreshTimer);
  groupChatRefreshTimer = setInterval(async () => {
    if (route !== "group-chat") return;
    const form = document.querySelector("[data-group-form]");
    const text = form?.querySelector("textarea")?.value || "";
    if (text.trim() || groupVoiceRecorder?.state === "recording" || groupVoiceDraft) return;
    const before = JSON.stringify({
      messages: (db.groupMessages || []).map((msg) => [msg.id, msg.createdAt, msg.deleted, msg.body]).slice(-40),
      settings: db.groupSettings
    });
    const ok = await loadRemoteSession();
    if (!ok || route !== "group-chat") return;
    const after = JSON.stringify({
      messages: (db.groupMessages || []).map((msg) => [msg.id, msg.createdAt, msg.deleted, msg.body]).slice(-40),
      settings: db.groupSettings
    });
    if (before !== after) renderGroupChat();
  }, 6000);
}

function renderGroupChat() {
  route = "group-chat";
  ensureGroupSettings();
  scheduleOpenRollTimers();
  startGroupChatRefresh();
  const user = currentUser();
  if (!user) return renderAuth();
  if (!isGroupMember(user.login)) {
    const membersCount = groupMemberLogins().length + 1;
    layout(`
      <section class="group-chat-screen">
        <article class="group-join-card">
          <span class="group-live-dot"></span>
          <h1>Cerber Чат</h1>
          <p>Вступите в общий чат, чтобы видеть сообщения, отправлять сообщения и играть в рулетках на призы.</p>
          <div class="group-join-stats">
            <strong>${membersCount}</strong>
            <span>участников будет в чате после вашего входа</span>
          </div>
          <button class="group-join-button" data-group-join>Вступить в общий чат</button>
        </article>
      </section>
    `);
    document.querySelector("[data-group-join]")?.addEventListener("click", joinGroupChat);
    return;
  }
  markGroupPresence(user.login);
  saveGroupPresenceSoon();
  const settings = db.groupSettings || structuredClone(defaults.groupSettings);
  const moderator = isGroupModerator();
  const muteUntil = groupMuteUntil(user?.login);
  const membersCount = groupMemberLogins().length;
  const onlineCount = groupOnlineCount();
  const pinned = (db.groupMessages || []).find((msg) => msg.id === settings.pinnedMessageId && !msg.deleted);
  const messages = (db.groupMessages || []).filter((msg) => !msg.deleted).slice().sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  const lastRoll = (settings.rollTimers || []).filter((timer) => !timer.done).sort((a, b) => Number(b.expiresAt || 0) - Number(a.expiresAt || 0))[0];
  const rollLeft = lastRoll ? Math.max(0, Math.ceil((Number(lastRoll.expiresAt || 0) - Date.now()) / 1000)) : 0;
  layout(`
    <section class="group-chat-screen">
      <article class="group-chat-shell">
        <header class="group-chat-head">
          <div class="group-chat-title">
            <span class="group-live-dot"></span>
            <div>
              <h2>${esc(settings.title || "Общий чат")}</h2>
              <p>${membersCount} участников · ${onlineCount} онлайн</p>
            </div>
          </div>
          ${moderator ? `
            <form class="group-title-form" data-group-title-form>
              <input name="title" value="${esc(settings.title || "Общий чат")}" aria-label="Название чата">
              <button>Сохранить</button>
            </form>
          ` : ""}
        </header>

        ${pinned ? `
          <section class="group-pinned">
            <span>Закреплено</span>
            <p><button class="link-button" data-group-user="${esc(pinned.fromLogin)}">${esc(groupMessageAuthor(pinned.fromLogin))}</button>: ${esc(pinned.body || "[медиа]")}</p>
          </section>
        ` : ""}

        ${lastRoll ? `
          <section class="group-roll-banner">
            <strong>Roll активен</strong>
            <span>Осталось ${Math.floor(rollLeft / 60)}:${String(rollLeft % 60).padStart(2, "0")}</span>
          </section>
        ` : ""}

        <section class="group-chat-list" data-group-chat-list>
          ${messages.length ? messages.map(groupMessageView).join("") : `<p class="empty-chat">Сообщений пока нет</p>`}
        </section>

        <footer class="group-compose">
          ${muteUntil > Date.now() ? `
            <p class="notice">Вы замучены до ${new Date(muteUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
          ` : `
            <form class="group-form" data-group-form>
              <button type="button" class="group-round-button group-attach-button" data-group-attach title="Фото, видео или стикер">📎</button>
              <div class="group-input-wrap">
                <textarea name="body" rows="1" placeholder="Сообщение"></textarea>
                <button type="button" class="group-emoji-toggle" data-group-emoji-toggle title="Смайлики">◔</button>
                <div class="group-sticker-row" data-group-sticker-row hidden>
                  ${TELEGRAM_EMOJIS.map((emoji) => `<button type="button" data-group-emoji="${esc(emoji)}">${esc(emoji)}</button>`).join("")}
                </div>
              </div>
              <input hidden name="attachment" type="file" accept="image/*,video/*,audio/*,.webp,.gif" data-group-attachment>
              <button type="button" class="group-round-button group-voice-button" data-group-voice title="Голосовое">🎙</button>
              <button class="group-round-button group-send-button" title="${tr("send")}">➤</button>
              <div class="group-file-name" data-group-file-name></div>
            </form>
          `}
        </footer>
      </article>
    </section>
  `);
  requestAnimationFrame(() => {
    const list = document.querySelector("[data-group-chat-list]");
    if (list) list.scrollTop = list.scrollHeight;
  });
  document.querySelector("[data-group-form]")?.addEventListener("submit", handleGroupMessageSend);
  document.querySelector("[data-group-attach]")?.addEventListener("click", () => document.querySelector("[data-group-attachment]")?.click());
  document.querySelector("[data-group-voice]")?.addEventListener("click", toggleGroupVoiceRecord);
  const syncGroupComposer = () => {
    const form = document.querySelector("[data-group-form]");
    if (!form) return;
    const text = form.querySelector("textarea")?.value.trim() || "";
    const file = form.querySelector("[data-group-attachment]")?.files?.[0];
    form.classList.toggle("has-content", Boolean(text || file || groupVoiceDraft));
  };
  document.querySelector("[data-group-form] textarea")?.addEventListener("input", syncGroupComposer);
  document.querySelector("[data-group-emoji-toggle]")?.addEventListener("click", () => {
    const row = document.querySelector("[data-group-sticker-row]");
    if (!row) return;
    row.hidden = !row.hidden;
    document.querySelector("[data-group-emoji-toggle]")?.classList.toggle("active", !row.hidden);
  });
  document.querySelector("[data-group-attachment]")?.addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0];
    document.querySelector("[data-group-file-name]").textContent = file ? file.name : "";
    syncGroupComposer();
  });
  document.querySelectorAll("[data-group-emoji]").forEach((button) => {
    button.onclick = () => {
      const textarea = document.querySelector("[data-group-form] textarea");
      textarea.value = `${textarea.value}${button.dataset.groupEmoji}`;
      textarea.focus();
      syncGroupComposer();
    };
  });
  syncGroupComposer();
  document.querySelector("[data-group-title-form]")?.addEventListener("submit", handleGroupTitleSave);
  document.querySelectorAll("[data-group-user]").forEach((button) => {
    button.onclick = () => openPrivateMessageModal(button.dataset.groupUser);
  });
  document.querySelectorAll("[data-group-pin]").forEach((button) => {
    button.onclick = () => {
      if (!isGroupModerator()) return;
      db.groupSettings.pinnedMessageId = button.dataset.groupPin;
      saveDb();
      renderGroupChat();
    };
  });
  document.querySelectorAll("[data-group-delete]").forEach((button) => {
    button.onclick = () => {
      if (!isGroupModerator()) return;
      const msg = db.groupMessages.find((item) => item.id === button.dataset.groupDelete);
      if (msg) msg.deleted = true;
      saveDb();
      renderGroupChat();
    };
  });
  document.querySelectorAll("[data-group-message]").forEach((message) => {
    message.ondblclick = () => toggleGroupLike(message.dataset.groupMessage);
  });
}

async function toggleGroupVoiceRecord(event) {
  const button = event.currentTarget;
  if (groupVoiceRecorder && groupVoiceRecorder.state === "recording") {
    groupVoiceRecorder.stop();
    button.classList.remove("recording");
    button.textContent = "🎙";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("Запись голоса недоступна в этом браузере");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    groupVoiceChunks = [];
    groupVoiceRecorder = new MediaRecorder(stream);
    groupVoiceRecorder.ondataavailable = (recordEvent) => {
      if (recordEvent.data.size) groupVoiceChunks.push(recordEvent.data);
    };
    groupVoiceRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(groupVoiceChunks, { type: groupVoiceRecorder.mimeType || "audio/webm" });
      groupVoiceDraft = {
        name: `voice-${Date.now()}.webm`,
        type: blob.type,
        url: await blobToDataUrl(blob)
      };
      document.querySelector("[data-group-file-name]").textContent = "Голосовое сообщение готово";
      document.querySelector("[data-group-form]")?.classList.add("has-content");
    };
    groupVoiceRecorder.start();
    button.classList.add("recording");
    button.textContent = "■";
    document.querySelector("[data-group-file-name]").textContent = "Идёт запись голоса...";
  } catch {
    showToast("Не удалось включить микрофон");
  }
}

function groupMessageView(msg) {
  const moderator = isGroupModerator();
  const own = sameLogin(msg.fromLogin, db.currentUser);
  const system = msg.fromLogin === "cerber-market";
  const likes = Array.isArray(msg.likes) ? msg.likes : [];
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  if (system) {
    return `
      <article class="group-system-message" data-group-message="${esc(msg.id)}">
        <span>⚡</span>
        <p>${esc(msg.body).replace(/\n/g, "<br>")}</p>
      </article>
    `;
  }
  return `
    <article class="group-message ${own ? "own" : ""} ${system ? "system" : ""}" data-group-message="${esc(msg.id)}">
      <button class="group-avatar" data-group-user="${esc(msg.fromLogin)}">${esc(String(msg.fromLogin || "?").slice(0, 1).toUpperCase())}</button>
      <div>
        <div class="group-meta">
          <button class="link-button" data-group-user="${esc(msg.fromLogin)}">${esc(groupMessageAuthor(msg.fromLogin))}</button>
          <span>${esc(msg.date)}</span>
        </div>
        <p>${esc(msg.body).replace(/\n/g, "<br>")}</p>
        ${attachments.length ? `<div class="group-attachments">${attachments.map(groupAttachmentView).join("")}</div>` : ""}
        ${likes.length ? `<button class="group-like-badge" data-group-like="${esc(msg.id)}">❤️ ${likes.length}</button>` : ""}
        ${moderator ? `
          <div class="group-actions">
            <button data-group-pin="${esc(msg.id)}">Закрепить</button>
            <button data-group-user="${esc(msg.fromLogin)}">ЛС</button>
            <button data-group-delete="${esc(msg.id)}">Удалить у всех</button>
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function groupAttachmentView(file) {
  if (!file?.url) return "";
  if (String(file.type || "").startsWith("image/")) return `<img class="group-attachment" src="${esc(file.url)}" alt="${esc(file.name || "")}">`;
  if (String(file.type || "").startsWith("video/")) return `<video class="group-attachment" src="${esc(file.url)}" controls></video>`;
  if (String(file.type || "").startsWith("audio/")) return `<audio class="group-audio" src="${esc(file.url)}" controls></audio>`;
  return `<a class="proof-link" href="${esc(file.url)}" download="${esc(file.name || "file")}">${esc(file.name || "Файл")}</a>`;
}

function toggleGroupLike(messageId) {
  const msg = db.groupMessages.find((item) => item.id === messageId);
  if (!msg) return;
  msg.likes = Array.isArray(msg.likes) ? msg.likes : [];
  const index = msg.likes.findIndex((login) => sameLogin(login, db.currentUser));
  if (index >= 0) msg.likes.splice(index, 1);
  else msg.likes.push(db.currentUser);
  saveDb();
  renderGroupChat();
}

function handleGroupTitleSave(event) {
  event.preventDefault();
  if (!isGroupModerator()) return;
  const title = new FormData(event.currentTarget).get("title").trim();
  if (!title) return;
  db.groupSettings.title = title;
  saveDb();
  renderGroupChat();
}

async function handleGroupMessageSend(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user) return renderAuth();
  const muted = groupMuteUntil(user.login);
  if (muted > Date.now()) {
    showToast("Вы временно замучены");
    return;
  }
  const data = new FormData(event.currentTarget);
  const body = String(data.get("body") || "").trim();
  const file = data.get("attachment");
  if (!body && (!file || !file.size) && !groupVoiceDraft) return;
  if (body && handleGroupCommand(body)) {
    event.currentTarget.reset();
    renderGroupChat();
    return;
  }
  const attachments = file && file.size ? [{
    name: file.name,
    type: file.type,
    url: await fileToDataUrl(file)
  }] : (groupVoiceDraft ? [groupVoiceDraft] : []);
  db.groupMessages.push({
    id: `group-${Date.now()}`,
    fromLogin: user.login,
    body,
    attachments,
    likes: [],
    createdAt: Date.now(),
    date: new Date().toLocaleString()
  });
  groupVoiceDraft = null;
  saveDb();
  renderGroupChat();
}

function handleGroupCommand(body) {
  const roll = body.match(/^\/roll\s+(\d+)/i);
  if (roll) {
    const max = Math.max(0, Math.min(999, Number(roll[1] || 999)));
    const number = Math.floor(Math.random() * (max + 1));
    const timer = {
      id: `roll-${Date.now()}`,
      expiresAt: Date.now() + 2 * 60 * 1000,
      done: false
    };
    ensureGroupSettings();
    db.groupSettings.rollTimers.push(timer);
    pushGroupSystemMessage(`Выпал номер ${number} из 0-${max}. Таймер запущен на 2 минуты.`);
    scheduleRollTimer(timer);
    saveDb();
    return true;
  }
  if (!isGroupModerator()) return false;
  const pin = body.match(/^\/pin(?:\s+(.+))?/i);
  if (pin) {
    const query = String(pin[1] || "").trim();
    const messages = (db.groupMessages || []).filter((msg) => !msg.deleted && msg.fromLogin !== "cerber-market");
    const target = query
      ? messages.slice().reverse().find((msg) => msg.id === query || String(msg.body || "").includes(query))
      : messages[messages.length - 1];
    if (target) {
      db.groupSettings.pinnedMessageId = target.id;
      pushGroupSystemMessage(`Сообщение от ${groupMessageAuthor(target.fromLogin)} закреплено.`);
      saveDb();
    }
    return true;
  }
  const mute = body.match(/^\/mute\s+(\S+)\s+(\d+)/i);
  if (mute) {
    const login = mute[1];
    const minutes = Math.max(1, Number(mute[2] || 15));
    db.groupSettings.mutedUntil[login] = Date.now() + minutes * 60 * 1000;
    pushGroupSystemMessage(`${login} замучен на ${minutes} минут.`);
    saveDb();
    return true;
  }
  const title = body.match(/^\/title\s+(.+)/i);
  if (title) {
    db.groupSettings.title = title[1].trim();
    saveDb();
    return true;
  }
  return false;
}

function openPrivateMessageModal(login) {
  if (!login || login === "cerber-market" || sameLogin(login, db.currentUser)) return;
  activePrivateLogin = login;
  renderMessages();
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
    showModal(`<h2>Условия реферальной программы</h2><p>За каждого пользователя, зарегистрированного по вашей ссылке, вы будете видеть регистрацию в списке рефералов.</p><p>С каждого будущего пополнения реферала начисляется 3% на ваш личный баланс CERBER.</p><p>Начисленные средства можно использовать для покупок внутри площадки.</p><button class="primary" data-close-modal>${tr("close")}</button>`);
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
        ${cards.map(exchangeCardView).join("") || `<article class="panel empty-state"><p>Обменники пока не добавлены</p></article>`}
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
          <img src="${esc(card?.image || fallbackImage)}" alt="">
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

function renderWallet() {
  route = "wallet";
  const ltc = userLtcBalance();
  const usd = userLtcUsdBalance();
  const txs = walletTransactions();
  layout(`
    <section class="screen wallet-screen">
      <article class="wallet-hero">
        <h1>Баланс</h1>
        <p>Все платежи поступают на ваш кошелек CERBER MARKET.<br>На платформе доступна монета LiteCoin - LTC.</p>
        <div class="coin-tabs">
          <button class="active"><span class="ltc-badge">Ł</span> LTC</button>
        </div>
      </article>
      ${walletCoinSecondaryTabs()}
      <article class="wallet-balance-card">
        <p>Личный</p>
        <div class="wallet-balance-row">
          <strong>${ltc.toFixed(6)} LTC</strong>
          <strong>${usd.toFixed(2)} USD</strong>
        </div>
        <div class="wallet-actions">
          <button class="ghost-button" data-wallet-deposit-open>Пополнить +</button>
          <button class="ghost-button" data-route="exchange">Купить LTC ↙</button>
        </div>
      </article>
      <article class="wallet-convert-card">
        <p><span>${ltc.toFixed(6)}</span><strong>LTC</strong></p>
        <p><span>${usd.toFixed(2)}</span><strong>USD</strong></p>
      </article>
      <article class="wallet-transactions">
        <h2>Транзакции</h2>
        ${txs.length ? txs.map(walletTransactionView).join("") : `
          <div class="empty-orders">
            <h2>Транзакций нет</h2>
            <p>Здесь будет отображаться список транзакций</p>
          </div>
        `}
      </article>
    </section>
  `);
  document.querySelector("[data-wallet-deposit-open]")?.addEventListener("click", openWalletDepositModal);
  document.querySelectorAll(".wallet-tx[data-wallet-deposit]").forEach((row) => {
    row.addEventListener("click", () => showWalletDepositDetails(row.dataset.walletDeposit));
  });
  document.querySelectorAll(".wallet-tx-details[data-wallet-deposit]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showWalletDepositDetails(button.dataset.walletDeposit);
    });
  });
}

function walletCoinSecondaryTabs() {
  return `
    <article class="wallet-coin-panel">
      <button class="wallet-coin-main active" type="button"><span class="ltc-badge">Ł</span><strong>LTC</strong><small>Litecoin</small></button>
      <div class="wallet-coin-list">
        ${WALLET_COINS.filter((coin) => !coin.base).map((coin) => `
          <button class="wallet-coin-small" type="button" disabled style="--coin-accent:${esc(coin.accent)}">
            <span>${esc(coin.symbol)}</span>
            <small>${esc(coin.network)}</small>
          </button>
        `).join("")}
      </div>
    </article>
  `;
}

function walletTransactionView(tx) {
  const sign = Number(tx.amountLtc || 0) >= 0 ? "+" : "";
  const status = walletTransactionStatus(tx);
  const deposit = walletDepositForTransaction(tx);
  const canOpenDeposit = Boolean(deposit && status.key !== "cancelled");
  const depositCoin = deposit ? walletDepositCoin(deposit) : null;
  const depositAmount = deposit ? walletDepositPayAmount(deposit) : 0;
  const title = depositCoin ? `Пополнение ${walletCoinLabel(depositCoin.id)}` : tx.title;
  return `
    <article class="wallet-tx ${status.key}" ${canOpenDeposit ? `data-wallet-deposit="${esc(deposit.id)}"` : ""}>
      <div class="wallet-tx-main">
        <h3>${esc(title)}</h3>
        <p>${esc(tx.date)} · ${status.label}${status.timer ? ` · ${status.timer}` : ""}</p>
        ${deposit ? `<small>К оплате: ${depositAmount.toFixed(8)} ${esc(walletCoinLabel(depositCoin.id))}</small>` : ""}
      </div>
      <strong class="${Number(tx.amountLtc || 0) >= 0 ? "plus" : "minus"}">${sign}${Number(tx.amountLtc || 0).toFixed(6)} LTC</strong>
      ${canOpenDeposit ? `<button class="ghost-button wallet-tx-details" data-wallet-deposit="${esc(deposit.id)}">Детали</button>` : ""}
    </article>
  `;
}

function walletTransactionStatus(tx) {
  const raw = String(tx.status || "completed").toLowerCase();
  const expiresAt = Number(tx.expiresAt || 0);
  if (["waiting", "pending", "processing"].includes(raw)) {
    if (expiresAt && expiresAt <= Date.now()) return { key: "cancelled", label: "Отменено" };
    const left = expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
    const minutes = left ? Math.ceil(left / 60000) : 0;
    return { key: "processing", label: "В обработке", timer: minutes ? `истекает через ${minutes} мин` : "" };
  }
  if (["failed", "expired", "cancelled", "canceled"].includes(raw)) return { key: "cancelled", label: "Отменено" };
  return { key: "completed", label: "Завершено" };
}

function walletDepositForTransaction(tx) {
  if (tx.type !== "deposit") return null;
  const id = String(tx.id || "").replace(/^tx-/, "");
  return (db.walletDeposits || []).find((deposit) => deposit.id === id || deposit.paymentId === tx.paymentId) || null;
}

function walletDepositStatusText(deposit) {
  const status = walletTransactionStatus({
    status: deposit.status === "waiting" ? "processing" : deposit.status,
    expiresAt: deposit.expiresAt
  });
  return `${status.label}${status.timer ? ` · ${status.timer}` : ""}`;
}

function walletDepositCopyText(deposit) {
  const coin = walletDepositCoin(deposit);
  return `Сеть: ${walletCoinLabel(coin.id)}\nАдрес: ${deposit.payAddress || ""}\nСумма: ${walletDepositPayAmount(deposit).toFixed(8)} ${walletCoinLabel(coin.id)}`;
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();
      await navigator.clipboard.writeText(button.dataset.copy || "");
      showToast("Скопировано");
    };
  });
}

function showWalletDepositDetails(depositId) {
  const deposit = (db.walletDeposits || []).find((item) => item.id === depositId);
  if (!deposit) return;
  const coin = walletDepositCoin(deposit);
  const coinLabel = walletCoinLabel(coin.id);
  showModal(`
    <h2>Пополнение ${esc(coinLabel)}</h2>
    <p>${esc(walletDepositStatusText(deposit))}</p>
    <p class="desc">После подтверждения платеж будет зачислен на внутренний баланс сайта в LTC-эквиваленте.</p>
    <div class="deposit-address">
      <strong>${esc(deposit.payAddress || "Адрес создается")}</strong>
      <button class="ghost-button" data-copy="${esc(deposit.payAddress || "")}">Скопировать</button>
    </div>
    <div class="deposit-address">
      <strong>${walletDepositPayAmount(deposit).toFixed(8)} ${esc(coinLabel)}</strong>
      <button class="ghost-button" data-copy="${walletDepositPayAmount(deposit).toFixed(8)}">Скопировать сумму</button>
    </div>
    <button class="primary" data-copy="${esc(walletDepositCopyText(deposit))}">Скопировать всё вместе</button>
    <button class="ghost-button" data-close-modal>${tr("close")}</button>
  `);
  bindCopyButtons();
}

function openWalletDepositModal() {
  showModal(`
    <h2>Пополнить баланс</h2>
    <p>Выберите монету и сумму. После подтверждения платеж будет зачислен на внутренний баланс сайта в LTC-эквиваленте.</p>
    <form class="form" data-wallet-deposit-form>
      <label class="field">Сумма в USD<input name="amountUsd" type="number" min="1" step="0.01" value="10" required></label>
      <label class="field">Монета и сеть<select name="coinId" required>
        ${WALLET_COINS.map((coin) => `<option value="${esc(coin.id)}">${esc(walletCoinLabel(coin.id))}</option>`).join("")}
      </select></label>
      <button class="primary">Создать счет</button>
    </form>
    <button class="ghost-button" data-close-modal>${tr("close")}</button>
  `);
  document.querySelector("[data-wallet-deposit-form]").onsubmit = createWalletDeposit;
}

async function createWalletDepositRequest(amountUsd, coinId = "ltc", title = "Пополнение баланса") {
  const coin = walletCoinById(coinId);
  if (!API_ENABLED) {
    const amountLtc = usdToLtc(amountUsd);
    const deposit = {
      id: `deposit-${Date.now()}`,
      login: db.currentUser,
      amountUsd,
      amountLtc,
      payAmount: coin.id === "ltc" ? amountLtc : amountUsd,
      coinId: coin.id,
      payCurrency: coin.payCurrency,
      payAddress: MAIN_LTC_WALLET,
      status: "processing",
      expiresAt: Date.now() + WALLET_DEPOSIT_TTL_MS,
      createdAt: Date.now()
    };
    db.walletDeposits.unshift(deposit);
    addWalletTransaction({
      id: `tx-${deposit.id}`,
      type: "deposit",
      title,
      amountLtc,
      amountUsd,
      coinId: coin.id,
      payCurrency: coin.payCurrency,
      status: "processing",
      expiresAt: deposit.expiresAt
    });
    saveDb();
    return deposit;
  }
  const payload = await apiFetch("/api/wallet/deposits/create", {
    method: "POST",
    body: JSON.stringify({ amountUsd, coinId: coin.id, payCurrency: coin.payCurrency, amountLtcEstimate: usdToLtc(amountUsd) })
  });
  applyRemoteState(payload);
  const deposit = payload.deposit || {};
  const tx = (db.walletTransactions || []).find((item) => item.id === `tx-${deposit.id}` || item.paymentId === deposit.paymentId);
  if (tx && title) tx.title = title;
  saveDb();
  return deposit;
}

async function createWalletDeposit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const amountUsd = Number(data.get("amountUsd") || 0);
  const coin = walletCoinById(data.get("coinId") || "ltc");
  if (amountUsd <= 0) return;
  const submit = event.currentTarget.querySelector("button");
  setButtonLoading(submit, true, "Создаём счет");
  try {
    const deposit = await createWalletDepositRequest(amountUsd, coin.id);
    const finalCoin = walletDepositCoin(deposit);
    const coinLabel = walletCoinLabel(finalCoin.id);
    renderWallet();
    showModal(`
      <h2>Счет на пополнение</h2>
      <p>Скопируйте адрес и сумму ниже. Оплата истекает через 40 минут, транзакция уже добавлена в обработку.</p>
      <p class="desc">После подтверждения платеж будет зачислен на внутренний баланс сайта в LTC-эквиваленте.</p>
      <div class="deposit-address">
        <strong>${esc(deposit.payAddress || "Адрес создается")}</strong>
        <button class="ghost-button" data-copy="${esc(deposit.payAddress || "")}">Скопировать</button>
      </div>
      <div class="deposit-address">
        <strong>${walletDepositPayAmount(deposit).toFixed(8)} ${esc(coinLabel)}</strong>
        <button class="ghost-button" data-copy="${walletDepositPayAmount(deposit).toFixed(8)}">Скопировать сумму</button>
      </div>
      <button class="primary" data-copy="${esc(walletDepositCopyText(deposit))}">Скопировать всё вместе</button>
      ${deposit.paymentUrl ? `<a class="primary link-button" href="${esc(deposit.paymentUrl)}" target="_blank" rel="noopener">Открыть оплату</a>` : ""}
      <button class="ghost-button" data-close-modal>${tr("close")}</button>
    `);
    bindCopyButtons();
  } catch (error) {
    showToast(error.message || "Не удалось создать пополнение");
    setButtonLoading(submit, false);
  }
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
        <p>${bodies[kind] || "Раздел сейчас пуст."}</p>
      </article>
    </section>
  `);
}

function storeStatusLabel(store) {
  if (store.salesBlocked) return "Продажи остановлены";
  if (store.status === "pending") return "На проверке";
  if (store.status === "blocked") return "Заблокирован";
  return "Активен";
}

function storeApplicationsForCurrentUser() {
  return (db.storeApplications || []).filter((item) => sameLogin(item.applicantLogin, db.currentUser) || sameLogin(item.ownerLogin, db.currentUser));
}

function storeSalesUsd(storeId) {
  return paidStoreOrders(storeId)
    .reduce((sum, order) => sum + Number(order.amountUsd || 0), 0);
}

function paidStoreOrders(storeId) {
  return (db.orders || []).filter((order) => {
    if (order.type !== "product" || order.storeId !== storeId) return false;
    if (order.disputeOpen || ["pending_payment", "canceled", "dispute"].includes(order.status)) return false;
    return ["active", "completed", "closed"].includes(order.status) || order.paymentStatus === "paid";
  });
}

function storeBalanceUsd(storeId) {
  return paidStoreOrders(storeId).reduce((sum, order) => sum + Number(order.amountUsd || 0), 0);
}

function storeTodaySalesUsd(storeId) {
  const today = new Date().toDateString();
  return paidStoreOrders(storeId)
    .filter((order) => new Date(Number(order.paidAt || order.completedAt || order.closedAt || order.createdAt || 0)).toDateString() === today)
    .reduce((sum, order) => sum + Number(order.amountUsd || 0), 0);
}

function marketStats() {
  const orders = db.orders || [];
  const productOrders = orders.filter((order) => order.type === "product");
  const disputes = productOrders.filter((order) => order.disputeOpen || order.status === "dispute");
  const completed = productOrders.filter((order) => ["completed", "closed"].includes(order.status));
  return {
    stores: db.stores.length,
    activeStores: db.stores.filter((store) => store.status === "active" && !store.salesBlocked).length,
    pendingApplications: (db.storeApplications || []).filter((item) => item.status === "pending").length,
    orders: productOrders.length,
    completed: completed.length,
    disputes: disputes.length,
    salesUsd: completed.reduce((sum, order) => sum + Number(order.amountUsd || 0), 0),
    users: db.users.length
  };
}

function storeDisputes(storeId) {
  return (db.orders || []).filter((order) => order.type === "product" && order.storeId === storeId && (order.disputeOpen || order.status === "dispute"));
}

function storeRisk(store) {
  const orders = (db.orders || []).filter((order) => order.type === "product" && order.storeId === store.id);
  const total = orders.length || 1;
  const disputes = orders.filter((order) => order.disputeOpen || order.status === "dispute").length;
  const canceled = orders.filter((order) => order.status === "canceled").length;
  const disputePercent = disputes / total * 100;
  const cancelPercent = canceled / total * 100;
  const flags = [];
  if (disputePercent >= Number(db.ownerSettings?.riskRules?.highDisputePercent || 20)) flags.push(`споры ${disputePercent.toFixed(0)}%`);
  if (cancelPercent >= Number(db.ownerSettings?.riskRules?.highCancelPercent || 30)) flags.push(`отмены ${cancelPercent.toFixed(0)}%`);
  if (store.salesBlocked || store.status === "blocked") flags.push("продажи остановлены");
  return { orders: orders.length, disputes, canceled, flags };
}

function renderOwnerAccess() {
  route = "owner";
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>Панель владельца</h2>
        <p>Введите общий пароль владельца, чтобы открыть управление маркетом.</p>
        <form class="form" data-owner-access-form>
          <label class="field">Пароль<input name="password" type="password" required autocomplete="current-password"></label>
          <button class="primary">Войти</button>
        </form>
      </article>
    </section>
  `);
  document.querySelector("[data-owner-access-form]").onsubmit = (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    if (password !== ADMIN_PANEL_PASSWORD) return showToast("Неверный пароль");
    try {
      localStorage.setItem(ADMIN_ACCESS_KEY, "ok");
      localStorage.setItem(OWNER_ACCESS_PASSWORD_KEY, password);
    } catch {}
    renderOwnerPanel();
  };
}

function ownerStatCard(label, value) {
  return `<div class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function renderOwnerPanel() {
  if (!isAdmin()) return renderOwnerAccess();
  route = "owner";
  const stats = marketStats();
  const settings = db.ownerSettings || structuredClone(defaults.ownerSettings);
  const disputes = (db.orders || []).filter((order) => order.type === "product" && (order.disputeOpen || order.status === "dispute"));
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>Панель владельца</h2>
        <div class="stats">
          ${ownerStatCard("магазинов", stats.stores)}
          ${ownerStatCard("активных", stats.activeStores)}
          ${ownerStatCard("заявок", stats.pendingApplications)}
          ${ownerStatCard("заказов", stats.orders)}
          ${ownerStatCard("диспутов", stats.disputes)}
          ${ownerStatCard("оборот, $", stats.salesUsd.toFixed(2))}
        </div>
      </article>
      <article class="panel owner-market-settings-panel">
        <h2>Настройки маркета</h2>
        <form class="form" data-owner-settings-form>
          <div class="row">
            <label class="field">Автозавершение сделки, часов<input name="defaultAutoReleaseHours" type="number" min="1" max="168" value="${esc(settings.defaultAutoReleaseHours)}"></label>
            <label class="field">Комиссия площадки, %<input name="platformCommissionPercent" type="number" min="0" step="0.01" value="${esc(settings.platformCommissionPercent)}"></label>
          </div>
          <div class="row">
            <label class="field">Комиссия обмена, %<input name="swapCommissionPercent" type="number" min="0" step="0.01" value="${esc(settings.swapCommissionPercent)}"></label>
            <label class="field">Сервисная комиссия кошелька, %<input name="walletServiceFeePercent" type="number" min="0" step="0.01" value="${esc(settings.walletServiceFeePercent)}"></label>
          </div>
          <label class="field">Арбитры диспутов, логины через запятую<input name="disputeArbiters" value="${esc((settings.disputeArbiters || []).join(", "))}"></label>
          <label class="field">Операторы обмена, логины через запятую<input name="exchangeOperators" value="${esc((settings.exchangeOperators || []).join(", "))}"></label>
          <button class="primary">Сохранить настройки</button>
        </form>
      </article>
      ${ownerStoreBuilderPanel()}
      ${adminCreationNoticeView()}
      <article class="panel owner-store-control-panel">
        <h2>Магазины</h2>
        ${db.stores.map((store) => {
          const risk = storeRisk(store);
          return `
            <article class="ref-item">
              <div>
                <h3>${esc(store.name)}</h3>
                <p>${esc(store.tag || "")} · ${esc(store.ownerLogin || "")} · ${storeStatusLabel(store)}</p>
                <p>Заказы: ${risk.orders} · Споры: ${risk.disputes} · Отмены: ${risk.canceled} · Продажи: ${storeSalesUsd(store.id).toFixed(2)} $</p>
                ${risk.flags.length ? `<p class="notice">Риск: ${esc(risk.flags.join(", "))}</p>` : ""}
              </div>
              <div>
                <label class="field">Автозавершение, ч<input data-store-auto-release="${esc(store.id)}" type="number" min="1" max="168" value="${esc(store.autoReleaseHours || settings.defaultAutoReleaseHours)}"></label>
                <button class="ghost-button" data-owner-toggle-top="${esc(store.id)}">${store.isTop ? "Убрать из TOP 10" : "Добавить в TOP 10"}</button>
                <button class="ghost-button" data-owner-toggle-catalog="${esc(store.id)}">${store.visibleInCatalog === false ? "Показать в магазинах" : "Скрыть из магазинов"}</button>
                <button class="ghost-button" data-owner-toggle-sales="${esc(store.id)}">${store.salesBlocked ? "Включить продажи" : "Остановить продажи"}</button>
                <button class="ghost-button" data-owner-open-store="${esc(store.id)}">Открыть витрину</button>
              </div>
            </article>
          `;
        }).join("") || `<p>Магазинов нет.</p>`}
      </article>
      <article class="panel">
        <h2>Диспуты</h2>
        ${disputes.map((order) => `
          <article class="ref-item">
            <div>
              <h3>${esc(order.product || order.id)}</h3>
              <p>${esc(order.login)} · ${esc(order.storeName || order.storeId)} · ${Number(order.amountUsd || 0).toFixed(2)} $</p>
              <p>${order.disputeUntil ? `Срок: ${new Date(Number(order.disputeUntil)).toLocaleString()}` : "Срок не задан"}</p>
            </div>
            <div>
              <button class="primary" data-owner-resolve-client="${esc(order.id)}">В пользу клиента</button>
              <button class="ghost-button" data-owner-resolve-store="${esc(order.id)}">В пользу магазина</button>
              <button class="ghost-button" data-owner-dispute-chat="${esc(order.login)}">Ответить клиенту</button>
            </div>
          </article>
        `).join("") || `<p>Открытых диспутов нет.</p>`}
      </article>
    </section>
  `);
  bindOwnerPanel();
}

function bindOwnerPanel() {
  bindLocationSelects();
  bindStoreFilterSelects();
  document.querySelector("[data-owner-settings-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    db.ownerSettings = {
      ...db.ownerSettings,
      defaultAutoReleaseHours: Math.max(1, Number(data.get("defaultAutoReleaseHours") || 24)),
      platformCommissionPercent: Number(data.get("platformCommissionPercent") || 0),
      swapCommissionPercent: Number(data.get("swapCommissionPercent") || 0),
      walletServiceFeePercent: Number(data.get("walletServiceFeePercent") || 0),
      disputeArbiters: String(data.get("disputeArbiters") || "").split(",").map((item) => item.trim()).filter(Boolean),
      exchangeOperators: String(data.get("exchangeOperators") || "").split(",").map((item) => item.trim()).filter(Boolean)
    };
    db.paymentSettings.platformCommissionPercent = db.ownerSettings.platformCommissionPercent;
    saveDb();
    showToast("Настройки сохранены");
    renderOwnerPanel();
  });
  document.querySelectorAll("[data-owner-approve]").forEach((button) => button.onclick = () => approveStoreApplication(button.dataset.ownerApprove));
  document.querySelectorAll("[data-owner-reject]").forEach((button) => button.onclick = () => rejectStoreApplication(button.dataset.ownerReject));
  document.querySelectorAll("[data-store-auto-release]").forEach((input) => {
    input.onchange = () => {
      const store = storeById(input.dataset.storeAutoRelease);
      if (!store) return;
      store.autoReleaseHours = Math.max(1, Number(input.value || db.ownerSettings.defaultAutoReleaseHours || 24));
      saveDb();
      showToast("Срок магазина сохранен");
    };
  });
  document.querySelectorAll("[data-owner-toggle-sales]").forEach((button) => {
    button.onclick = () => {
      const store = storeById(button.dataset.ownerToggleSales);
      if (!store) return;
      store.salesBlocked = !store.salesBlocked;
      store.status = store.salesBlocked ? "blocked" : "active";
      saveDb();
      renderOwnerPanel();
    };
  });
  document.querySelectorAll("[data-owner-toggle-top]").forEach((button) => {
    button.onclick = () => {
      const store = storeById(button.dataset.ownerToggleTop);
      if (!store) return;
      store.isTop = !store.isTop;
      saveDb();
      renderOwnerPanel();
    };
  });
  document.querySelectorAll("[data-owner-toggle-catalog]").forEach((button) => {
    button.onclick = () => {
      const store = storeById(button.dataset.ownerToggleCatalog);
      if (!store) return;
      store.visibleInCatalog = store.visibleInCatalog === false;
      saveDb();
      renderOwnerPanel();
    };
  });
  document.querySelectorAll("[data-owner-open-store]").forEach((button) => button.onclick = () => renderStore(button.dataset.ownerOpenStore, "positions"));
  document.querySelectorAll("[data-owner-resolve-client]").forEach((button) => button.onclick = () => resolveOwnerDispute(button.dataset.ownerResolveClient, "client"));
  document.querySelectorAll("[data-owner-resolve-store]").forEach((button) => button.onclick = () => resolveOwnerDispute(button.dataset.ownerResolveStore, "store"));
  document.querySelectorAll("[data-owner-dispute-chat]").forEach((button) => {
    button.onclick = () => {
      activePrivateLogin = button.dataset.ownerDisputeChat;
      renderMessages();
    };
  });
  document.querySelector("[data-owner-create-store]")?.addEventListener("submit", handleOwnerCreateStore);
  document.querySelectorAll("[data-owner-profile-form]").forEach((form) => form.addEventListener("submit", handleOwnerProfileSave));
  document.querySelectorAll("[data-owner-store-filter-form]").forEach((form) => form.addEventListener("submit", handleOwnerStoreFilterSave));
  document.querySelectorAll("[data-owner-add-product]").forEach((form) => form.addEventListener("submit", handleOwnerAddProduct));
  document.querySelectorAll("[data-owner-add-position]").forEach((form) => form.addEventListener("submit", handleOwnerAddPosition));
  document.querySelectorAll("[data-owner-delete-product]").forEach((button) => button.onclick = () => ownerDeleteProduct(button.dataset.ownerDeleteProduct, button.dataset.storeId));
  document.querySelectorAll("[data-owner-delete-position]").forEach((button) => button.onclick = () => ownerDeletePosition(button.dataset.ownerDeletePosition, button.dataset.productId, button.dataset.storeId));
}

function ownerStoreBuilderPanel() {
  const hasStores = (db.stores || []).length > 0;
  return `
    <article class="panel owner-builder">
      <h2>${hasStores ? "Карточки магазинов" : "Конструктор карточек магазинов"}</h2>
      ${hasStores ? `<p class="desc">Карточки ниже редактируются и сохраняют уже созданные магазины. Новую карточку можно добавить здесь.</p>` : ""}
      <form class="form" data-owner-create-store>
        <div class="row">
          <label class="field">Название<input name="name" required placeholder="Market name"></label>
          <label class="field">Тег<input name="tag" placeholder="@market"></label>
        </div>
        <div class="row">
          <label class="field">Логин владельца<input name="ownerLogin" required placeholder="seller login"></label>
          <label class="field">Пароль панели магазина<input name="adminPassword" type="password" required placeholder="пароль"></label>
        </div>
        <label class="field">Описание карточки<input name="short" placeholder="Короткое описание"></label>
        <label class="field">Фото магазина файлом<input name="image" type="file" accept="image/*"></label>
        <button class="primary">Создать карточку</button>
      </form>
    </article>
    ${db.stores.map(ownerStoreManager).join("")}
  `;
}

function ownerStoreManager(store) {
  return `
    <article class="panel owner-store-manager">
      <h2>${esc(store.name)} · управление</h2>
      <form class="form" data-owner-profile-form data-store-id="${esc(store.id)}">
        <div class="row">
          <label class="field">Название<input name="name" value="${esc(store.name || "")}" required></label>
          <label class="field">Тег<input name="tag" value="${esc(store.tag || "")}"></label>
        </div>
        <label class="field">Описание карточки<input name="short" value="${esc(store.short || "")}"></label>
        <label class="field">Описание профиля<textarea name="description">${esc(store.description || "")}</textarea></label>
        <div class="row">
          <label class="field">LTC кошелек<input name="ltcWallet" value="${esc(store.ltcWallet || "")}"></label>
          <label class="field">Пароль админки магазина<input name="adminPassword" value="${esc(store.adminPassword || "")}"></label>
        </div>
        <label class="field">Аватарка<input name="image" type="file" accept="image/*"></label>
        <label class="field">Баннер<input name="cover" type="file" accept="image/*"></label>
        <button class="primary">Сохранить профиль</button>
      </form>
      <form class="form store-filter-form" data-owner-store-filter-form data-store-id="${esc(store.id)}">
        <h3>Фильтр карточки</h3>
        <div class="row store-filter-selects" data-store-filter-group>
          ${storeFilterPicker("Страны фильтра", "countries", storeFilterCountryOptions(store.countries || []))}
          ${storeFilterPicker("Города фильтра", "cities", storeFilterCityOptions(store.countries || [], store.cities || []))}
          ${storeFilterPicker("Районы фильтра", "districts", storeFilterDistrictOptions(store.countries || [], store.cities || [], store.districts || []))}
        </div>
        <button class="primary">Сохранить фильтр</button>
      </form>
      <div class="owner-products">
        <h3>Блоки товаров</h3>
        <form class="form" data-owner-add-product data-store-id="${esc(store.id)}">
          <div class="row">
            <label class="field">Название товара<input name="title" required></label>
            <label class="field">Цена, $<input name="priceUsd" type="number" min="0" step="0.01" value="10" required></label>
          </div>
          <label class="field">Описание<textarea name="description"></textarea></label>
          <label class="field">Фото товара до 5 фото<input name="images" type="file" accept="image/*" multiple></label>
          <button class="primary">Добавить товар</button>
        </form>
        ${(store.products || []).map((product) => ownerProductManager(store, product)).join("") || `<p>Товаров пока нет.</p>`}
      </div>
    </article>
  `;
}

function ownerProductManager(store, product) {
  return `
    <article class="owner-product-box">
      <div class="ref-item">
        <img class="owner-thumb" src="${esc(product.image || store.image || fallbackImage)}" alt="">
        <div>
          <h3>${esc(product.title)}</h3>
          <p>${esc(product.description || product.category || "")}</p>
          <p>${Number(product.priceUsd || 0).toFixed(2)} $ · ${usdToLtc(Number(product.priceUsd || 0)).toFixed(6)} LTC</p>
        </div>
        <button class="ghost-button" data-owner-delete-product="${esc(product.id)}" data-store-id="${esc(store.id)}">Удалить товар</button>
      </div>
      <form class="form" data-owner-add-position data-store-id="${esc(store.id)}" data-product-id="${esc(product.id)}">
        <div class="row">
          <label class="field">Название позиции<input name="title" value="${esc(product.title || "")}" required></label>
          <label class="field">Цена, $<input name="priceUsd" type="number" min="0" step="0.01" value="${esc(product.priceUsd || 10)}" required></label>
        </div>
        <div class="row">
          <label class="field">Тип<input name="deliveryType" placeholder="Прикоп / Курьер / Готовый"></label>
          <label class="field">Вес<input name="weight" placeholder="-"></label>
        </div>
        <div class="row" data-location-group>
          <label class="field">Страна<select name="country" data-location-country>${countrySelectOptions((store.countries || [])[0] || "moldova")}</select></label>
          <label class="field">Город<select name="city" data-location-city>${citySelectOptions((store.countries || [])[0] || "moldova", (store.cities || [])[0] || "chisinau")}</select></label>
          <label class="field">Район<select name="district" data-location-district>${districtSelectOptions((store.countries || [])[0] || "moldova", (store.cities || [])[0] || "chisinau")}</select></label>
        </div>
        <label class="field">Описание позиции<textarea name="description"></textarea></label>
        <label class="field">Описания для выдачи клиенту<textarea name="deliveryItems" placeholder="Каждая новая строка = один доступный товар"></textarea></label>
        <button class="primary">Добавить позицию</button>
      </form>
      <div class="owner-position-list">
        ${(product.positions || []).map((position) => `
          <article class="position-card mega-position-card">
            <div class="position-grid mega-position-grid">
              <p><span>Кол-во</span><strong>${esc(position.stock || 0)} шт</strong></p>
              <p><span>Название</span><strong>${esc(position.title || product.title)}</strong></p>
              <p><span>Тип</span><strong>${esc(position.deliveryType || "Товар")}</strong></p>
              <p><span>Вес</span><strong>${esc(position.weight || "-")}</strong></p>
              <p><span>Цена</span><strong>${Number(position.priceUsd || product.priceUsd || 0).toFixed(2)} $</strong></p>
              <p><span>LTC</span><strong>${usdToLtc(Number(position.priceUsd || product.priceUsd || 0)).toFixed(6)} LTC</strong></p>
              <p class="wide"><span>Локация</span><strong>${esc(locationLabel(position))}</strong></p>
            </div>
            ${position.description ? `<p class="desc">${esc(position.description)}</p>` : ""}
            <button class="ghost-button" data-owner-delete-position="${esc(position.id)}" data-product-id="${esc(product.id)}" data-store-id="${esc(store.id)}">Удалить позицию</button>
          </article>
        `).join("") || `<p>Позиций внутри товара пока нет.</p>`}
      </div>
    </article>
  `;
}

function approveStoreApplication(id) {
  const application = (db.storeApplications || []).find((item) => item.id === id);
  if (!application || application.status !== "pending") return;
  const ownerLogin = application.ownerLogin || application.applicantLogin;
  const existingOwner = db.users.find((user) => sameLogin(user.login, ownerLogin));
  if (existingOwner) existingOwner.role = existingOwner.role === "admin" ? "admin" : "seller";
  if (!existingOwner && ownerLogin) db.users.push({ login: ownerLogin, password: application.adminPassword || "123", name: ownerLogin, role: "seller", createdAt: isoDate(new Date()) });
  const baseId = String(application.name || application.tag || `store-${Date.now()}`).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || `store-${Date.now()}`;
  let finalId = baseId;
  let counter = 2;
  while (db.stores.some((store) => store.id === finalId)) finalId = `${baseId}-${counter++}`;
  db.stores.push({
    id: finalId,
    tag: application.tag || `@${finalId}`,
    ownerLogin,
    adminPassword: application.adminPassword || "123",
    isTop: false,
    visibleInCatalog: true,
    countries: [application.country || "moldova"],
    cities: application.cities || [],
    districts: application.districts || [],
    name: application.name || finalId,
    short: application.short || "",
    description: application.description || "",
    image: fallbackImage,
    cover: fallbackImage,
    status: "active",
    salesBlocked: false,
    autoReleaseHours: Math.max(1, Number(db.ownerSettings?.defaultAutoReleaseHours || 24)),
    ltcWallet: application.ltcWallet || "",
    ...NEW_STORE_STATS,
    products: [],
    reviewsList: []
  });
  application.status = "approved";
  application.decisionAt = Date.now();
  application.decisionBy = db.currentUser;
  saveDb();
  renderOwnerPanel();
}

function rejectStoreApplication(id) {
  const application = (db.storeApplications || []).find((item) => item.id === id);
  if (!application) return;
  application.status = "rejected";
  application.decisionAt = Date.now();
  application.decisionBy = db.currentUser;
  saveDb();
  renderOwnerPanel();
}

function resolveOwnerDispute(orderId, winner) {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) return;
  order.disputeOpen = false;
  order.resolvedAt = Date.now();
  order.resolvedBy = db.currentUser;
  order.resolution = winner === "client" ? "client_refund" : "store_release";
  order.status = winner === "client" ? "canceled" : "completed";
  order.paymentStatus = winner === "client" ? "refunded" : "paid";
  saveDb();
  renderOwnerPanel();
}

function listFromInput(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function listFromForm(data, name) {
  const selected = data.getAll(name).map((item) => String(item || "").trim()).filter(Boolean);
  return selected.length ? selected : listFromInput(data.get(name));
}

function uniqueStoreId(name) {
  const base = String(name || `store-${Date.now()}`).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || `store-${Date.now()}`;
  let finalId = base;
  let counter = 2;
  while (db.stores.some((store) => store.id === finalId)) finalId = `${base}-${counter++}`;
  return finalId;
}

function uniqueExchangeId(name) {
  const base = String(name || `exchange-${Date.now()}`).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || `exchange-${Date.now()}`;
  let finalId = base;
  let counter = 2;
  while (db.exchangeCards.some((card) => card.id === finalId)) finalId = `${base}-${counter++}`;
  return finalId;
}

function exchangeAdminLink() {
  const base = location.protocol === "http:" || location.protocol === "https:" ? location.origin : "https://cerber.vip";
  return `${base}/#exchange-admin`;
}

function adminCreationNoticeView() {
  return adminCreationNotice ? `<article class="panel admin-create-result">${adminCreationNotice}</article>` : "";
}

async function handleOwnerCreateStore(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  const imageFile = data.get("image");
  const image = imageFile && imageFile.size ? await fileToDataUrl(imageFile) : fallbackImage;
  const ownerLogin = String(data.get("ownerLogin") || db.currentUser || "").trim();
  const adminPassword = String(data.get("adminPassword") || "").trim();
  if (!ownerLogin || !adminPassword) return showToast("Укажите логин владельца и пароль панели магазина");
  const id = uniqueStoreId(name);
  const placements = ["TOP 10", "stores"];
  const store = {
    id,
    tag: String(data.get("tag") || `@${id}`).trim(),
    ownerLogin,
    adminPassword,
    isTop: true,
    isFeatured: false,
    isNew: false,
    visibleInCatalog: true,
    placement: placements[0],
    placements,
    position: 1,
    homepagePosition: 1,
    countries: [],
    cities: [],
    districts: [],
    name,
    short: String(data.get("short") || "").trim(),
    description: "",
    image,
    cover: image,
    gallery: [],
    status: "active",
    salesBlocked: false,
    autoReleaseHours: Math.max(1, Number(db.ownerSettings?.defaultAutoReleaseHours || 24)),
    ltcWallet: "",
    ...NEW_STORE_STATS,
    products: [],
    reviewsList: []
  };
  if (API_ENABLED) {
    try {
      const payload = await apiFetch("/api/owner/stores", {
        method: "POST",
        headers: { "x-owner-password": localStorage.getItem(OWNER_ACCESS_PASSWORD_KEY) || ADMIN_PANEL_PASSWORD },
        body: JSON.stringify(store)
      });
      const savedStore = payload.store || store;
      db.stores = db.stores.filter((item) => item.id !== savedStore.id);
      db.stores.unshift(savedStore);
      adminCreationNotice = `<p>Магазин создан: <strong>${esc(savedStore.name)}</strong><br>Панель: <a href="${esc(payload.panel?.shopPanelUrl || `#shop-panel-${savedStore.id}`)}">${esc(payload.panel?.shopPanelUrl || `#shop-panel-${savedStore.id}`)}</a><br>Логин: <strong>${esc(payload.panel?.login || savedStore.ownerLogin)}</strong> · Пароль: <strong>${esc(payload.panel?.password || savedStore.adminPassword)}</strong></p>`;
    } catch (error) {
      showToast(error.message || "Магазин не создался");
      return;
    }
  } else {
    db.stores.unshift(store);
  }
  saveDb();
  event.currentTarget.reset();
  showToast("Магазин создан");
  renderOwnerPanel();
}

async function handleOwnerProfileSave(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const store = storeById(form.dataset.storeId);
  if (!store) return;
  const data = new FormData(form);
  store.name = String(data.get("name") || store.name).trim();
  store.tag = String(data.get("tag") || store.tag || "").trim();
  store.short = String(data.get("short") || "").trim();
  store.description = String(data.get("description") || "").trim();
  store.ltcWallet = String(data.get("ltcWallet") || "").trim();
  store.adminPassword = String(data.get("adminPassword") || "").trim();
  const imageFile = data.get("image");
  const coverFile = data.get("cover");
  if (imageFile && imageFile.size) store.image = await fileToDataUrl(imageFile);
  if (coverFile && coverFile.size) store.cover = await fileToDataUrl(coverFile);
  saveDb();
  showToast("Профиль магазина сохранен");
  renderOwnerPanel();
}

function handleOwnerStoreFilterSave(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const store = storeById(form.dataset.storeId);
  if (!store) return;
  const data = new FormData(form);
  store.countries = listFromForm(data, "countries");
  store.cities = listFromForm(data, "cities");
  store.districts = listFromForm(data, "districts");
  saveDb();
  showToast("Фильтр карточки сохранён");
  renderOwnerPanel();
}

async function handleOwnerAddProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const store = storeById(form.dataset.storeId);
  if (!store) return;
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  if (!title) return;
  const imageFiles = Array.from(data.getAll("images")).filter((file) => file && file.size).slice(0, 5);
  const images = imageFiles.length ? await Promise.all(imageFiles.map(fileToDataUrl)) : [store.image || fallbackImage];
  const image = images[0];
  const priceUsd = Number(data.get("priceUsd") || 0);
  store.products = store.products || [];
  store.products.unshift(normalizeProduct({
    id: `product-${Date.now()}`,
    title,
    category: "Товар",
    description: String(data.get("description") || "").trim(),
    price: `${priceUsd}$`,
    priceUsd,
    image,
    images,
    sellerManaged: true,
    rating: 5,
    reviews: 0,
    purchases: 0,
    positions: [],
    reviewsList: []
  }, store));
  saveDb();
  showToast("Товар добавлен");
  renderOwnerPanel();
}

function handleOwnerAddPosition(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const store = storeById(form.dataset.storeId);
  const product = productById(store, form.dataset.productId);
  if (!product) return;
  const data = new FormData(form);
  const priceUsd = Number(data.get("priceUsd") || product.priceUsd || 0);
  product.positions = product.positions || [];
  product.positions.unshift({
    id: `position-${Date.now()}`,
    title: String(data.get("title") || product.title).trim(),
    description: String(data.get("description") || "").trim(),
    priceUsd,
    country: String(data.get("country") || (store.countries || [])[0] || "moldova").trim(),
    city: String(data.get("city") || "chisinau").trim(),
    district: String(data.get("district") || "").trim(),
    deliveryType: String(data.get("deliveryType") || "Товар").trim(),
    weight: String(data.get("weight") || "-").trim(),
    deliveryItems: String(data.get("deliveryItems") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    stock: String(data.get("deliveryItems") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).length,
    status: "ready"
  });
  product.priceUsd = product.priceUsd || priceUsd;
  product.price = `${Number(product.priceUsd || priceUsd).toFixed(2)}$`;
  saveDb();
  showToast("Позиция добавлена");
  renderOwnerPanel();
}

function ownerDeleteProduct(productId, storeId) {
  const store = storeById(storeId);
  if (!store) return;
  store.products = (store.products || []).filter((product) => product.id !== productId);
  saveDb();
  renderOwnerPanel();
}

function ownerDeletePosition(positionId, productId, storeId) {
  const store = storeById(storeId);
  const product = productById(store, productId);
  if (!product) return;
  product.positions = (product.positions || []).filter((position) => position.id !== positionId);
  saveDb();
  renderOwnerPanel();
}

function renderSellerPortal() {
  route = "seller";
  const applications = storeApplicationsForCurrentUser();
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>Панель магазина</h2>
        <p>Здесь магазин подает заявку. После одобрения владельцем появится управление витриной, товарами, статистикой и диспутами.</p>
        <form class="form" data-store-application-form>
          <div class="row">
            <label class="field">Название магазина<input name="name" required></label>
            <label class="field">Тег<input name="tag" placeholder="@store"></label>
          </div>
          <label class="field">Короткое описание<input name="short"></label>
          <label class="field">Полное описание<textarea name="description"></textarea></label>
          <div class="row">
            <label class="field">Страна<select name="country"><option value="moldova">Молдова</option><option value="transnistria">Приднестровье</option></select></label>
            <label class="field">Города через запятую<input name="cities" placeholder="chisinau, balti"></label>
          </div>
          <label class="field">LTC кошелек магазина<input name="ltcWallet" placeholder="ltc1..."></label>
          <label class="field">Пароль отдельной админки<input name="adminPassword" type="password" required></label>
          <button class="primary">Отправить заявку</button>
        </form>
      </article>
      <article class="panel">
        <h2>Мои заявки</h2>
        ${applications.map((application) => `
          <article class="ref-item">
            <div><h3>${esc(application.name)}</h3><p>${esc(application.tag || "")} · ${esc(application.status)}</p></div>
            <span class="status-pill">${esc(application.status)}</span>
          </article>
        `).join("") || `<p>Заявок пока нет.</p>`}
      </article>
    </section>
  `);
  document.querySelector("[data-store-application-form]").onsubmit = handleStoreApplicationCreate;
}

function handleStoreApplicationCreate(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  db.storeApplications.unshift({
    id: `store-app-${Date.now()}`,
    status: "pending",
    createdAt: Date.now(),
    applicantLogin: db.currentUser,
    ownerLogin: db.currentUser,
    name,
    tag: String(data.get("tag") || "").trim(),
    short: String(data.get("short") || "").trim(),
    description: String(data.get("description") || "").trim(),
    country: data.get("country") || "moldova",
    cities: String(data.get("cities") || "").split(",").map((item) => item.trim()).filter(Boolean),
    ltcWallet: String(data.get("ltcWallet") || "").trim(),
    adminPassword: String(data.get("adminPassword") || "").trim()
  });
  saveDb();
  showToast("Заявка отправлена владельцу");
  renderSellerPortal();
}

function renderAdmin() {
  if (!isAdmin()) {
    route = "admin";
    layout(`
      <section class="screen">
        <article class="panel">
          <h2>Общая админка</h2>
          <p>Введите пароль общей админки сайта.</p>
          <form class="form" data-admin-access-form>
            <label class="field">Пароль<input name="password" type="password" required autocomplete="current-password"></label>
            <button class="primary">Войти в админку</button>
          </form>
        </article>
      </section>
    `);
    document.querySelector("[data-admin-access-form]").onsubmit = (event) => {
      event.preventDefault();
      const password = new FormData(event.currentTarget).get("password");
      if (password !== ADMIN_PANEL_PASSWORD) {
        showToast("Неверный пароль админки");
        return;
      }
      try {
        localStorage.setItem(ADMIN_ACCESS_KEY, "ok");
      } catch {}
      renderAdmin();
    };
    return;
  }
  route = "admin";
  layout(`
    <section class="screen">
      <article class="panel">
        <h2>${tr("admin")}</h2>
        <p><a href="/?cms-visual=1">Textolite mode: edit texts on the site</a></p>
        <p><a href="/text-admin.html">Text Admin: edit text list</a></p>
        <form class="form" data-store-form>
          <div class="row">
            <label class="field">${tr("tag")}<input name="tag" required placeholder="@tag"></label>
            <label class="field">${tr("ownerLogin")}<input name="ownerLogin" required placeholder="seller login"></label>
          </div>
          <div class="check-row">
            <label><input name="isTop" type="checkbox"> Показывать в TOP 10</label>
            <label><input name="isFeatured" type="checkbox"> Добавить в ТОП</label>
            <label><input name="isNew" type="checkbox"> Добавить в НОВЫЕ</label>
            <label><input name="visibleInCatalog" type="checkbox" checked> Раздел магазины</label>
          </div>
          <label class="field">${tr("name")}<input name="name" required></label>
          <label class="field">${tr("short")}<input name="short" required></label>
          <label class="field">${tr("full")}<textarea name="description" required></textarea></label>
          <div class="row store-filter-selects" data-store-filter-group>
            ${storeFilterPicker("Страны фильтра", "countries", storeFilterCountryOptions(["moldova"]))}
            ${storeFilterPicker("Города фильтра", "cities", storeFilterCityOptions(["moldova"], []))}
          </div>
          <label class="field">${tr("upload")}<input name="image" type="file" accept="image/*,video/*"></label>
          <label class="field">Баннер страницы<input name="cover" type="file" accept="image/*"></label>
          <label class="field">Пароль админки этой карточки<input name="adminPassword" type="password" required placeholder="пароль для магазина"></label>
          <button class="primary">${tr("addStore")}</button>
        </form>
      </article>
      <article class="panel">
        <h2>Добавить обменник</h2>
        <form class="form" data-exchange-admin-form>
          <label class="field">${tr("ownerLogin")}<input name="ownerLogin" required placeholder="operator login"></label>
          <label class="field">${tr("name")}<input name="name" required placeholder="Обменник"></label>
          <label class="field">${tr("full")}<textarea name="description" required></textarea></label>
          <div class="row">
            <label class="field">Курс обмена MDL/$<input name="exchangeRate" type="number" step="0.01" value="19" required></label>
            <label class="field">Курс обнала MDL/$<input name="cashoutRate" type="number" step="0.01" value="17" required></label>
          </div>
          <label class="field">LTC кошелек обменника<input name="ltcWallet" placeholder="ltc1..."></label>
          <div class="row store-filter-selects" data-store-filter-group>
            ${storeFilterPicker("Страны фильтра", "countries", storeFilterCountryOptions(["moldova"]))}
            ${storeFilterPicker("Города фильтра", "cities", storeFilterCityOptions(["moldova"], []))}
          </div>
          <div class="row">
            ${exchangeMethods.map((method) => `<label class="field">${method}<input name="req_${method}" value="60327998"></label>`).join("")}
          </div>
          <label class="field">${tr("upload")}<input name="image" type="file" accept="image/*,video/*"></label>
          <label class="field">Пароль админки этого обменника<input name="adminPassword" type="password" required placeholder="пароль для обменника"></label>
          <button class="primary">Добавить обменник</button>
        </form>
      </article>
      ${adminCreationNoticeView()}
      <article class="panel">
        <h2>Настройки оплат</h2>
        <form class="form" data-payment-settings-form>
          <label class="field">Платежный шлюз<input value="Подключен" readonly></label>
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
      <form class="form admin-store-form" data-admin-product-form data-store-id="${esc(store.id)}" data-product-id="${esc(product.id || "")}" data-position-id="${esc(position.id || "")}">
        <div class="admin-section-title"><strong>Основное магазина</strong><span>Карточка, профиль и отдельная админка</span></div>
        <label class="field">Баннер страницы магазина<input name="storeCover" type="file" accept="image/*"></label>
        <label class="field">Ссылка старой админки<input value="${esc(sellerAdminLink(store))}" readonly></label>
        <label class="field">Ссылка новой Shop Admin панели<input value="${esc(shopPanelLink(store))}" readonly></label>
        <label class="field">Пароль отдельной админки<input name="adminPassword" value="${esc(storeAdminPassword(store))}"></label>
        ${route !== "seller" ? `
          <div class="check-row">
            <label><input name="isTop" type="checkbox" ${store.isTop ? "checked" : ""}> Показывать в TOP 10</label>
            <label><input name="isFeatured" type="checkbox" ${store.isFeatured ? "checked" : ""}> Добавить в ТОП</label>
            <label><input name="isNew" type="checkbox" ${store.isNew ? "checked" : ""}> Добавить в НОВЫЕ</label>
            <label><input name="visibleInCatalog" type="checkbox" ${store.visibleInCatalog !== false ? "checked" : ""}> Раздел магазины</label>
          </div>
        ` : ""}
        <div class="row">
          <label class="field">Название магазина<input name="storeName" value="${esc(store.name || "")}"></label>
          <label class="field">Короткое описание<input name="storeShort" value="${esc(store.short || "")}"></label>
        </div>
        <label class="field">Описание страницы магазина<textarea name="storeDescription">${esc(store.description || "")}</textarea></label>
        <div class="row store-filter-selects" data-store-filter-group data-country-name="storeCountries" data-city-name="storeCities" data-district-name="storeDistricts">
          ${storeFilterPicker("Страны фильтра", "countries", storeFilterCountryOptions(store.countries || [], "storeCountries"))}
          ${storeFilterPicker("Города фильтра", "cities", storeFilterCityOptions(store.countries || [], store.cities || [], "storeCities"))}
          ${storeFilterPicker("Районы фильтра", "districts", storeFilterDistrictOptions(store.countries || [], store.cities || [], store.districts || [], "storeDistricts"))}
        </div>
        <label class="field">LTC счет магазина<input name="ltcWallet" value="${esc(store.ltcWallet || "")}" placeholder="ltc1..."></label>
        <label class="field">Название товара<input name="title" value="${esc(product.title || "Подработка")}" required></label>
        <label class="field">Описание товара<textarea name="description">${esc(product.description || "")}</textarea></label>
        <label class="field">Описания для выдачи клиенту<textarea name="deliveryItems" placeholder="Каждая новая строка = один доступный заказ">${esc((product.deliveryItems || []).join("\n"))}</textarea></label>
        <div class="row">
          <label class="field">Категория<input name="category" value="${esc(product.category || "Работа / Курьер")}"></label>
          <label class="field">Цена, $<input name="priceUsd" type="number" min="0" step="0.01" value="${esc(product.priceUsd || position.priceUsd || 50)}"></label>
        </div>
        <div class="row" data-location-group>
          <label class="field">Страна<select name="country" data-location-country>${countrySelectOptions(position.country || "moldova")}</select></label>
          <label class="field">Город<select name="city" data-location-city>${citySelectOptions(position.country || "moldova", position.city || "chisinau")}</select></label>
          <label class="field">Район<select name="district" data-location-district>${districtSelectOptions(position.country || "moldova", position.city || "chisinau", position.district || "")}</select></label>
          <label class="field">Тип<input name="deliveryType" value="${esc(position.deliveryType || "Товар")}"></label>
          <label class="field">Вес<input name="weight" value="${esc(position.weight || "")}"></label>
        </div>
        <label class="field">Фото страницы магазина<input name="storeImage" type="file" accept="image/*"></label>
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
    provider: "gateway",
    payBaseUrl: "",
    platformCommissionPercent: Number(data.get("platformCommissionPercent") || 0),
    platformLtcWallet: data.get("platformLtcWallet").trim()
  };
  saveDb();
  showToast("Настройки оплат сохранены");
  renderAdmin();
}

function bindAdminProductForms() {
  bindLocationSelects();
  bindStoreFilterSelects();
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
      store.adminPassword = data.get("adminPassword").trim() || storeAdminPassword(store);
      if (route !== "seller") {
        store.isTop = Boolean(data.get("isTop"));
        store.isFeatured = Boolean(data.get("isFeatured"));
        store.isNew = Boolean(data.get("isNew"));
        store.visibleInCatalog = Boolean(data.get("visibleInCatalog"));
      }
      store.name = data.get("storeName").trim() || store.name;
      store.short = data.get("storeShort").trim() || store.short;
      store.description = data.get("storeDescription").trim();
      store.countries = listFromForm(data, "storeCountries");
      store.cities = listFromForm(data, "storeCities");
      store.districts = listFromForm(data, "storeDistricts");
      product.title = data.get("title").trim();
      product.category = data.get("category").trim();
      product.description = data.get("description").trim();
      product.sellerManaged = true;
      product.deliveryItems = String(data.get("deliveryItems") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      const mainFile = data.get("mainImage");
      const storeImage = data.get("storeImage");
      const galleryFiles = Array.from(data.getAll("images")).filter((file) => file && file.size).slice(0, 5);
      const gallery = galleryFiles.length ? await Promise.all(galleryFiles.map(fileToDataUrl)) : [];
      const storeCover = data.get("storeCover");
      if (storeImage && storeImage.size) {
        const image = await fileToDataUrl(storeImage);
        store.image = image;
      }
      if (storeCover && storeCover.size) {
        store.cover = await fileToDataUrl(storeCover);
      }
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
      position.country = data.get("country").trim() || store.countries[0] || "moldova";
      position.city = data.get("city").trim() || "chisinau";
      position.district = data.get("district").trim();
      position.deliveryType = data.get("deliveryType").trim() || "Товар";
      position.weight = data.get("weight").trim();
      position.stock = product.deliveryItems.length;
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
  const coverFile = data.get("cover");
  const cover = coverFile && coverFile.size ? await fileToDataUrl(coverFile) : image;
  const ownerLogin = data.get("ownerLogin").trim();
  const adminPassword = String(data.get("adminPassword") || "").trim();
  const name = data.get("name").trim();
  const id = uniqueStoreId(name || data.get("tag"));
  const existingOwner = db.users.find((user) => sameLogin(user.login, ownerLogin));
  const finalOwnerLogin = existingOwner?.login || ownerLogin;
  if (!existingOwner) {
    db.users.push({ login: ownerLogin, password: adminPassword || "123", name: ownerLogin, role: "seller" });
  }
  const store = {
    id,
    tag: data.get("tag").trim(),
    ownerLogin: finalOwnerLogin,
    adminPassword,
    isTop: Boolean(data.get("isTop")),
    isFeatured: Boolean(data.get("isFeatured")),
    isNew: Boolean(data.get("isNew")),
    visibleInCatalog: Boolean(data.get("visibleInCatalog")),
    countries: listFromForm(data, "countries"),
    cities: listFromForm(data, "cities"),
    districts: [],
    name,
    short: data.get("short").trim(),
    description: data.get("description").trim(),
    image,
    cover,
    status: "active",
    salesBlocked: false,
    autoReleaseHours: Math.max(1, Number(db.ownerSettings?.defaultAutoReleaseHours || 24)),
    ...NEW_STORE_STATS,
    products: [],
    reviewsList: []
  };
  db.stores.push(store);
  adminCreationNotice = `
    <h3>Новая карта создана</h3>
    <p><strong>${esc(store.name)}</strong> · ${new Date().toLocaleString()}</p>
    <p>Старая админка магазина: <a href="${esc(sellerAdminLink(store))}">${esc(sellerAdminLink(store))}</a></p>
    <p>Новая Shop Admin панель: <a href="${esc(shopPanelLink(store))}">${esc(shopPanelLink(store))}</a></p>
    <p>Логин владельца: <strong>${esc(finalOwnerLogin)}</strong></p>
    <p>Пароль админ панели: <strong>${esc(adminPassword || "не задан")}</strong></p>
  `;
  saveDb();
  renderAdmin();
}

async function handleExchangeCardCreate(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = data.get("name").trim();
  const id = uniqueExchangeId(name);
  if (db.exchangeCards.some((card) => card.id === id)) {
    showToast("Такой обменник уже есть");
    return;
  }
  const ownerLogin = data.get("ownerLogin").trim();
  const adminPassword = String(data.get("adminPassword") || "").trim();
  const existingOwner = db.users.find((user) => sameLogin(user.login, ownerLogin));
  const finalOwnerLogin = existingOwner?.login || ownerLogin;
  if (!existingOwner) {
    db.users.push({ login: ownerLogin, password: adminPassword || "123", name: ownerLogin, role: "seller", createdAt: isoDate(new Date()) });
  }
  const file = data.get("image");
  const image = file && file.size ? await fileToDataUrl(file) : fallbackImage;
  const card = normalizeExchangeCard({
    id,
    name,
    ownerLogin: finalOwnerLogin,
    adminPassword,
    description: data.get("description").trim(),
    image,
    countries: listFromForm(data, "countries"),
    cities: listFromForm(data, "cities"),
    districts: [],
    regions: listFromForm(data, "countries"),
    exchangeRate: Number(data.get("exchangeRate")),
    cashoutRate: Number(data.get("cashoutRate")),
    ltcUsd: 54.2,
    ltcWallet: data.get("ltcWallet"),
    requisites: exchangeMethods.map((method) => ({ method, value: data.get(`req_${method}`), active: true })),
    active: true
  });
  db.exchangeCards.push(card);
  adminCreationNotice = `
    <h3>Новая карта обменника создана</h3>
    <p><strong>${esc(card.name)}</strong> · ${new Date().toLocaleString()}</p>
    <p>Админ панель обменника: <a href="${esc(exchangeAdminLink())}">${esc(exchangeAdminLink())}</a></p>
    <p>Логин владельца: <strong>${esc(finalOwnerLogin)}</strong></p>
    <p>Пароль админ панели: <strong>${esc(adminPassword || "не задан")}</strong></p>
  `;
  saveDb();
  renderAdmin();
}

function sellerDashboardShell(store, standalone = false, activeTab = "dashboard") {
  const orders = (db.orders || []).filter((order) => order.storeId === store.id);
  const paidOrders = paidStoreOrders(store.id);
  const today = new Date().toDateString();
  const todayOrders = paidOrders.filter((order) => new Date(Number(order.paidAt || order.completedAt || order.closedAt || order.createdAt || 0)).toDateString() === today);
  const products = Array.isArray(store.products) ? store.products : [];
  const positions = products.flatMap((product) => product.positions || []);
  const stockTotal = positions.reduce((sum, position) => sum + Number(position.stock || 0), 0);
  const clients = new Set(paidOrders.map((order) => order.login).filter(Boolean));
  const salesUsd = storeBalanceUsd(store.id);
  const todaySalesUsd = storeTodaySalesUsd(store.id);
  const recentOrders = orders.slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 6);
  const districts = new Map();
  positions.forEach((position) => {
    const key = position.district || position.city || "Без района";
    const current = districts.get(key) || { count: 0, value: 0 };
    current.count += Number(position.stock || 0);
    current.value += Number(position.stock || 0) * Number(position.priceUsd || 0);
    districts.set(key, current);
  });
  const productRows = products.slice(0, 7).map((product) => {
    const productStock = (product.positions || []).reduce((sum, position) => sum + Number(position.stock || 0), 0);
    return { title: product.title || "Товар", stock: productStock, value: productStock * Number(product.priceUsd || 0) };
  });
  const txRows = (db.walletTransactions || []).slice(-6).reverse();
  const navHtml = shopPanelNavV2(activeTab);
  if (activeTab !== "dashboard") {
    return `
      <article class="seller-dashboard-shell">
        <aside class="seller-dashboard-nav">
          <div class="seller-dashboard-brand">
            <img src="assets/logo1-transparent.png" alt="CERBER">
            <span>Shop Admin</span>
          </div>
          ${navHtml}
        </aside>
        <div class="seller-dashboard-main">
          <header class="seller-dashboard-top">
            <div>
              <strong>${esc(store.name)}</strong>
              <span>${esc(store.tag || store.id)} · ${storeStatusLabel(store)}</span>
            </div>
            <div class="seller-dashboard-balance">
              <span>Баланс магазина</span>
              <strong>${salesUsd.toFixed(2)} $</strong>
              <small>${usdToLtc(salesUsd).toFixed(8)} LTC</small>
            </div>
            <button class="seller-dashboard-user">${esc(store.ownerLogin || "seller")} ▾</button>
            <button class="ghost-button" data-shop-panel-logout>Выйти</button>
          </header>
          ${shopPanelTabContent(activeTab, { store, orders, products, positions, productRows, districts, recentOrders, txRows, clients, salesUsd, stockTotal })}
        </div>
      </article>
    `;
  }
  return `
    <article class="seller-dashboard-shell">
      <aside class="seller-dashboard-nav">
        <div class="seller-dashboard-brand">
          <img src="assets/logo1-transparent.png" alt="CERBER">
          <span>Shop Admin</span>
        </div>
        ${navHtml}
      </aside>
      <div class="seller-dashboard-main">
        <header class="seller-dashboard-top">
          <div>
            <strong>${esc(store.name)}</strong>
            <span>${esc(store.tag || store.id)} · ${storeStatusLabel(store)}</span>
          </div>
          <div class="seller-dashboard-balance">
            <span>Баланс магазина</span>
            <strong>${salesUsd.toFixed(2)} $</strong>
            <small>${usdToLtc(salesUsd).toFixed(8)} LTC</small>
          </div>
          <button class="seller-dashboard-user">${esc(store.ownerLogin || "seller")} ▾</button>
          ${standalone ? `<button class="ghost-button" data-seller-admin-logout>Выйти</button>` : `<button class="ghost-button" data-shop-panel-logout>Выйти</button>`}
        </header>

        <section class="seller-dashboard-hero">
          <div>
            <h2>Dashboard</h2>
            <p>Панель магазина: статистика, заявки, склад, клиенты и связь.</p>
          </div>
          <a class="primary link-button" href="#seller-tools">Управлять товарами</a>
        </section>

        <section class="seller-dashboard-stats">
          ${sellerDashStat("Оплачено сегодня", todayOrders.length, "Продажи за день")}
          ${sellerDashStat("Доход сегодня", `${todaySalesUsd.toFixed(2)} $`, "Зачислено за день")}
          ${sellerDashStat("Общий доход", `${salesUsd.toFixed(2)} $`, "Баланс магазина")}
          ${sellerDashStat("Клиентов", clients.size, "Всего покупателей")}
          ${sellerDashStat("Склад", stockTotal, "Доступных позиций")}
          ${sellerDashStat("Диспуты", storeDisputes(store.id).length, "Открытые обращения")}
        </section>

        <section class="seller-dashboard-grid">
          <div class="seller-dashboard-card seller-wide-card">
            <div class="seller-card-head">
              <h3>Ежемесячный заработок</h3>
              <span>Последние 30 дней</span>
            </div>
            <strong class="seller-money">${salesUsd.toFixed(2)} $</strong>
            <div class="seller-bars">
              ${[35, 52, 44, 70, 48, 82, 66, 90, 62, 76, 58, 84].map((value) => `<i style="height:${value}%"></i>`).join("")}
            </div>
          </div>
          <div class="seller-dashboard-card">
            <div class="seller-card-head">
              <h3>Источники продаж</h3>
            </div>
            <div class="seller-source"><span>Telegram</span><strong>${orders.filter((order) => order.source === "telegram").length}</strong></div>
            <div class="seller-source"><span>Сайт</span><strong>${orders.filter((order) => !order.source || order.source === "site").length}</strong></div>
            <div class="seller-source"><span>Tor</span><strong>${orders.filter((order) => order.source === "tor").length}</strong></div>
          </div>
          <div class="seller-dashboard-card">
            <div class="seller-card-head">
              <h3>Типы товаров на складе</h3>
            </div>
            ${productRows.length ? productRows.map((row) => `
              <div class="seller-stock-row">
                <span>${esc(row.title)}</span>
                <strong>${row.stock}</strong>
                <progress max="100" value="${Math.min(100, row.stock * 10)}"></progress>
              </div>
            `).join("") : `<p>Товаров пока нет.</p>`}
          </div>
          <div class="seller-dashboard-card">
            <div class="seller-card-head">
              <h3>Склад: районы</h3>
            </div>
            ${[...districts.entries()].slice(0, 8).map(([name, item]) => `
              <div class="seller-tree-row"><span>${esc(name)}</span><strong>${item.count} шт.</strong></div>
            `).join("") || `<p>Склад пока пуст.</p>`}
          </div>
          <div class="seller-dashboard-card seller-wide-card">
            <div class="seller-card-head">
              <h3>Последние заказы</h3>
              <span>${orders.length} всего</span>
            </div>
            <div class="seller-dashboard-table">
              <div><strong>#</strong><strong>Клиент</strong><strong>Сумма</strong><strong>Статус</strong></div>
              ${recentOrders.length ? recentOrders.map((order) => `
                <div>
                  <span>${esc(order.id || "-")}</span>
                  <span>${esc(order.login || "client")}</span>
                  <span>${Number(order.amountUsd || 0).toFixed(2)} $</span>
                  <span>${esc(order.status || "new")}</span>
                </div>
              `).join("") : `<p>Заказов пока нет.</p>`}
            </div>
          </div>
          <div class="seller-dashboard-card">
            <div class="seller-card-head">
              <h3>Последние транзакции</h3>
            </div>
            ${txRows.length ? txRows.map((tx) => `
              <div class="seller-source"><span>${esc(tx.title || tx.type || "Операция")}</span><strong>${Number(tx.amountUsd || 0).toFixed(2)} $</strong></div>
            `).join("") : `<p>Транзакций пока нет.</p>`}
          </div>
        </section>
      </div>
    </article>
    <span id="seller-tools"></span>
  `;
}

function sellerDashStat(label, value, hint) {
  return `
    <div class="seller-dash-stat">
      <span>${esc(label)}</span>
      <strong>${esc(String(value))}</strong>
      <small>${esc(hint)}</small>
    </div>
  `;
}

function shopPanelNav(activeTab = "dashboard") {
  const items = [
    ["dashboard", "⌂", "Dashboard"],
    ["orders", "▣", "Заказы"],
    ["shop", "▤", "Магазин"],
    ["storage", "▥", "Склад"],
    ["clients", "◇", "Клиенты"],
    ["connect", "✉", "Связь"],
    ["staff", "⚙", "Персонал"]
  ];
  return items.map(([id, icon, label]) => `
    <button class="${activeTab === id ? "active" : ""}" data-shop-tab="${id}" type="button">
      <span>${icon}</span>${label}
    </button>
  `).join("");
}

function shopPanelNavV2(activeTab = "dashboard") {
  const items = [
    ["dashboard", "D", "Dashboard"],
    ["profile", "P", "Профиль"],
    ["cards", "C", "Карточки"],
    ["products", "T", "Товары"],
    ["orders", "O", "Заказы"],
    ["disputes", "!", "Диспуты"],
    ["finances", "$", "Финансы"],
    ["settings", "*", "Настройки"]
  ];
  return items.map(([id, icon, label]) => `
    <button class="${activeTab === id ? "active" : ""}" data-shop-tab="${id}" type="button">
      <span>${icon}</span>${label}
    </button>
  `).join("");
}

function shopPanelTabContent(tab, data) {
  const { store, orders, products, positions, productRows, districts, recentOrders, txRows, clients, salesUsd, stockTotal } = data;
  if (tab === "profile") return shopProfileTab(store);
  if (tab === "cards") return shopCardsTab(store, products);
  if (tab === "products") return shopProductsTab(store, products);
  if (tab === "disputes") return shopDisputesTab(store);
  if (tab === "finances") return shopFinancesTab(store, salesUsd, txRows);
  if (tab === "settings") return shopSettingsTab(store);
  if (tab === "orders") {
    return `
      <section class="seller-dashboard-hero"><div><h2>Заказы</h2><p>Таблица заявок клиентов, статусы оплат и быстрый контроль выдачи.</p></div></section>
      <section class="seller-dashboard-card seller-wide-card">
        <div class="seller-card-head"><h3>Последние заказы</h3><span>${orders.length} всего</span></div>
        <div class="seller-dashboard-table">
          <div><strong>#</strong><strong>Клиент</strong><strong>Сумма</strong><strong>Статус</strong></div>
          ${recentOrders.length ? recentOrders.map((order) => `
            <div><span>${esc(order.id || "-")}</span><span>${esc(order.login || "client")}</span><span>${Number(order.amountUsd || 0).toFixed(2)} $</span><span>${esc(order.status || "new")}</span></div>
          `).join("") : `<p>Заказов пока нет.</p>`}
        </div>
      </section>
    `;
  }
  if (tab === "shop") {
    return `
      <section class="seller-dashboard-hero"><div><h2>Магазин</h2><p>Профиль витрины, описание, статус, баланс и основные показатели.</p></div></section>
      <section class="seller-dashboard-grid">
        ${sellerDashStat("Название", store.name || "Shop", store.tag || store.id)}
        ${sellerDashStat("Статус", storeStatusLabel(store), "Доступность витрины")}
        ${sellerDashStat("Оборот", `${salesUsd.toFixed(2)} $`, `${usdToLtc(salesUsd).toFixed(8)} LTC`)}
        <div class="seller-dashboard-card seller-wide-card">
          <div class="seller-card-head"><h3>Описание магазина</h3></div>
          <p>${esc(store.description || "Описание пока не заполнено.")}</p>
        </div>
      </section>
    `;
  }
  if (tab === "storage") {
    return `
      <section class="seller-dashboard-hero"><div><h2>Склад</h2><p>Остатки по товарам, районам и позициям.</p></div></section>
      <section class="seller-dashboard-grid">
        <div class="seller-dashboard-card">
          <div class="seller-card-head"><h3>Товары</h3><span>${stockTotal} шт.</span></div>
          ${productRows.length ? productRows.map((row) => `<div class="seller-stock-row"><span>${esc(row.title)}</span><strong>${row.stock}</strong><progress max="100" value="${Math.min(100, row.stock * 10)}"></progress></div>`).join("") : `<p>Склад пока пуст.</p>`}
        </div>
        <div class="seller-dashboard-card">
          <div class="seller-card-head"><h3>Районы</h3><span>${positions.length} позиций</span></div>
          ${[...districts.entries()].map(([name, item]) => `<div class="seller-tree-row"><span>${esc(name)}</span><strong>${item.count} шт.</strong></div>`).join("") || `<p>Районов пока нет.</p>`}
        </div>
      </section>
    `;
  }
  if (tab === "clients") {
    const clientRows = [...clients].slice(0, 12);
    return `
      <section class="seller-dashboard-hero"><div><h2>Клиенты</h2><p>Покупатели, последние активности и быстрый доступ к переписке.</p></div></section>
      <section class="seller-dashboard-card seller-wide-card">
        <div class="seller-card-head"><h3>Клиенты магазина</h3><span>${clients.size} всего</span></div>
        ${clientRows.length ? clientRows.map((login) => `<div class="seller-source"><span>${esc(login)}</span><strong>${orders.filter((order) => sameLogin(order.login, login)).length} заказов</strong></div>`).join("") : `<p>Клиентов пока нет.</p>`}
      </section>
    `;
  }
  if (tab === "connect") {
    return `
      <section class="seller-dashboard-hero"><div><h2>Связь</h2><p>Сообщения, поддержка, рассылки и уведомления магазина.</p></div></section>
      <section class="seller-dashboard-grid">
        <div class="seller-dashboard-card"><div class="seller-card-head"><h3>Сообщения</h3><span>0 новых</span></div><p>Здесь будет лента обращений и переписок с клиентами.</p></div>
        <div class="seller-dashboard-card"><div class="seller-card-head"><h3>Рассылки</h3><span>готово к подключению</span></div><p>Блок для новостей, акций и массовых сообщений.</p></div>
      </section>
    `;
  }
  if (tab === "staff") {
    return `
      <section class="seller-dashboard-hero"><div><h2>Персонал</h2><p>Доступы сотрудников, роли и права внутри магазина.</p></div></section>
      <section class="seller-dashboard-card seller-wide-card">
        <div class="seller-card-head"><h3>Команда</h3><span>1 активный доступ</span></div>
        <div class="seller-source"><span>${esc(store.ownerLogin || "test")}</span><strong>Владелец</strong></div>
        <p>Новые сотрудники и права будут подключаться здесь.</p>
      </section>
    `;
  }
  return `
    <section class="seller-dashboard-hero"><div><h2>Dashboard</h2><p>Панель магазина.</p></div></section>
  `;
}

function shopAllowedCountries(store) {
  return Array.isArray(store.countries) && store.countries.length ? store.countries : ["moldova"];
}

function shopDefaultCountry(store) {
  return shopAllowedCountries(store)[0] || "moldova";
}

function shopDefaultCity(store) {
  const country = shopDefaultCountry(store);
  return (store.cities || [])[0] || Object.keys(filterOptions.countries[country]?.cities || filterOptions.countries.moldova.cities)[0] || "chisinau";
}

function shopProfileTab(store) {
  return `
    <section class="seller-dashboard-hero"><div><h2>Профиль</h2><p>Публичная страница магазина, баннер, аватар, название и описание.</p></div></section>
    <section class="seller-dashboard-card seller-wide-card">
      <form class="form" data-shop-profile-form>
        <div class="row">
          <label class="field">Название<input name="name" value="${esc(store.name || "")}" required></label>
          <label class="field">Тег<input name="tag" value="${esc(store.tag || "")}"></label>
        </div>
        <label class="field">Короткое описание<input name="short" value="${esc(store.short || "")}"></label>
        <label class="field">Описание<textarea name="description">${esc(store.description || "")}</textarea></label>
        <div class="row">
          <label class="field">Аватар<input name="image" type="file" accept="image/*"></label>
          <label class="field">Баннер<input name="cover" type="file" accept="image/*"></label>
        </div>
        <button class="primary">Сохранить профиль</button>
      </form>
    </section>
  `;
}

function shopCardsTab(store, products) {
  return `
    <section class="seller-dashboard-hero"><div><h2>Карточки</h2><p>Карточка открывает отдельную страницу товара или категории.</p></div></section>
    <section class="seller-dashboard-card seller-wide-card">
      <form class="form" data-shop-card-form>
        <div class="row">
          <label class="field">Название<input name="title" required></label>
          <label class="field">Цена от, $<input name="priceUsd" type="number" min="0" step="0.01" value="10"></label>
        </div>
        <label class="field">Описание<textarea name="description"></textarea></label>
        <div class="row">
          <label class="field">Главная аватарка<input name="mainImage" type="file" accept="image/*"></label>
          <label class="field">Дополнительно до 4 фото<input name="images" type="file" accept="image/*" multiple></label>
        </div>
        <div class="row">
          <label class="field">Позиция<input name="position" type="number" min="0" step="1" value="${products.length + 1}"></label>
          <label class="field">Статус<select name="status"><option value="active">active</option><option value="disabled">disabled</option></select></label>
        </div>
        <button class="primary">Создать карточку</button>
      </form>
    </section>
    <section class="seller-dashboard-card seller-wide-card">
      <div class="seller-card-head"><h3>Список карточек</h3><span>${products.length}</span></div>
      ${sortedStoreProducts(store, true).map((product, index) => `
        <div class="seller-source">
          <span>${esc(product.title)} · ${esc(product.status || "active")} · ${Number(product.priceUsd || 0).toFixed(2)} $</span>
          <strong>
            <button class="ghost-button" data-shop-card-move="up" data-card-id="${esc(product.id)}" ${index === 0 ? "disabled" : ""}>Вверх</button>
            <button class="ghost-button" data-shop-card-move="down" data-card-id="${esc(product.id)}" ${index === products.length - 1 ? "disabled" : ""}>Вниз</button>
            <button class="ghost-button danger" data-shop-card-delete="${esc(product.id)}">Удалить</button>
          </strong>
        </div>
      `).join("") || `<p>Карточек пока нет.</p>`}
    </section>
  `;
}

function shopProductsTab(store, products) {
  const card = sortedStoreProducts(store, true)[0];
  const country = shopDefaultCountry(store);
  const city = shopDefaultCity(store);
  return `
    <section class="seller-dashboard-hero"><div><h2>Товары</h2><p>Товары создаются внутри карточек. Каждая строка выдачи равна одной единице остатка.</p></div></section>
    <section class="seller-dashboard-card seller-wide-card">
      ${products.length ? `<form class="form" data-shop-product-form>
        <label class="field">Карточка<select name="cardId">${sortedStoreProducts(store, true).map((product) => `<option value="${esc(product.id)}">${esc(product.title)}</option>`).join("")}</select></label>
        <div class="row">
          <label class="field">Название<input name="title" value="${esc(card?.title || "")}" required></label>
          <label class="field">Цена<input name="priceUsd" type="number" min="0" step="0.01" value="${esc(card?.priceUsd || 10)}" required></label>
        </div>
        <label class="field">Описание<textarea name="description"></textarea></label>
        <div class="row">
          <label class="field">Вес<input name="weight" placeholder="1"></label>
          <label class="field">Тип<input name="deliveryType" placeholder="Самовывоз / Доставка"></label>
        </div>
        <div class="row" data-location-group>
          <label class="field muted">Страна<input value="${esc(filterOptions.countries[country]?.label || country)}" disabled><input name="country" type="hidden" value="${esc(country)}"></label>
          <label class="field">Город<select name="city" data-shop-location-city>${scopedCitySelectOptions(store, country, city)}</select></label>
          <label class="field">Район<select name="district" data-shop-location-district>${scopedDistrictSelectOptions(store, country, city, "")}</select></label>
        </div>
        <label class="field">Описание товара для выдачи<textarea name="deliveryItems" placeholder="Каждая новая строка = отдельный товар"></textarea></label>
        <button class="primary">Добавить товар в карточку</button>
      </form>` : `<p>Сначала создайте карточку.</p>`}
    </section>
    <section class="seller-dashboard-card seller-wide-card">
      <div class="seller-card-head"><h3>Товары внутри карточек</h3></div>
      ${sortedStoreProducts(store, true).map((product) => `
        <div class="seller-card-head"><h3>${esc(product.title)}</h3><span>${(product.positions || []).reduce((sum, p) => sum + Number(p.stock || 0), 0)} шт.</span></div>
        ${(product.positions || []).map((position) => `<div class="seller-source"><span>${esc(position.title)} · ${esc(locationLabel(position))} · ${Number(position.priceUsd || 0).toFixed(2)} $ · ${Number(position.stock || 0)} шт.</span><strong><button class="ghost-button danger" data-shop-position-delete="${esc(position.id)}" data-card-id="${esc(product.id)}">Удалить</button></strong></div>`).join("") || `<p>Товаров внутри карточки пока нет.</p>`}
      `).join("")}
    </section>
  `;
}

function shopDisputesTab(store) {
  const disputes = storeDisputes(store.id);
  return `<section class="seller-dashboard-hero"><div><h2>Диспуты</h2><p>Споры по заказам этого магазина.</p></div></section>
  <section class="seller-dashboard-card seller-wide-card">${disputes.map((order) => `<div class="seller-source"><span>${esc(order.product || order.id)} · ${esc(order.login || "")}</span><strong>${Number(order.amountUsd || 0).toFixed(2)} $</strong></div>`).join("") || `<p>Открытых диспутов нет.</p>`}</section>`;
}

function shopFinancesTab(store, salesUsd, txRows) {
  return `<section class="seller-dashboard-hero"><div><h2>Финансы</h2><p>Оборот, баланс и последние операции магазина.</p></div></section>
  <section class="seller-dashboard-stats">${sellerDashStat("Баланс", `${salesUsd.toFixed(2)} $`, `${usdToLtc(salesUsd).toFixed(8)} LTC`)}${sellerDashStat("Комиссия", `${Number(store.commissionPercent || 0)}%`, "магазин")}</section>
  <section class="seller-dashboard-card seller-wide-card">${txRows.length ? txRows.map((tx) => `<div class="seller-source"><span>${esc(tx.title || tx.type || "Операция")}</span><strong>${Number(tx.amountUsd || 0).toFixed(2)} $</strong></div>`).join("") : `<p>Операций пока нет.</p>`}</section>`;
}

function shopSettingsTab(store) {
  return `<section class="seller-dashboard-hero"><div><h2>Настройки</h2><p>Пароль панели, кошелёк и автозакрытие сделок.</p></div></section>
  <section class="seller-dashboard-card seller-wide-card"><form class="form" data-shop-settings-form>
    <div class="row"><label class="field">LTC кошелёк<input name="ltcWallet" value="${esc(store.ltcWallet || "")}"></label><label class="field">Автозакрытие, часов<input name="autoReleaseHours" type="number" min="0" max="72" value="${esc(store.autoReleaseHours || db.ownerSettings?.defaultAutoReleaseHours || 24)}"></label></div>
    <label class="field">Новый пароль панели<input name="adminPassword" type="password" placeholder="оставить пустым"></label>
    <button class="primary">Сохранить настройки</button>
  </form></section>`;
}

function shopPanelSession() {
  try {
    return localStorage.getItem(SHOP_PANEL_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function shopPanelStore() {
  const id = shopPanelHashId() || shopPanelSession();
  return db.stores.find((store) => store.id === id) || null;
}

function shopPanelLoginStore(login, password) {
  const hashId = shopPanelHashId();
  const candidates = hashId
    ? db.stores.filter((store) => store.id === hashId)
    : db.stores.filter((store) => sameLogin(store.ownerLogin, login) || sameLogin(store.id, login));
  return candidates.find((store) => String(storeAdminPassword(store) || "") === String(password || "")) || null;
}

function renderShopPanelLogin(message = "") {
  const hashStore = db.stores.find((store) => store.id === shopPanelHashId());
  document.body.dataset.theme = db.theme;
  root.innerHTML = `
    <main class="auth-wrap shop-panel-login">
      <section class="auth-card">
        <img src="assets/logo1-transparent.png" alt="CERBER">
        <h1>Shop Admin</h1>
        <p>Отдельная панель управления магазином.</p>
        ${hashStore ? `<p>${esc(hashStore.name)} · ${esc(hashStore.ownerLogin || hashStore.id)}</p>` : ""}
        ${message ? `<p class="notice">${esc(message)}</p>` : ""}
        <form class="form" data-shop-panel-login>
          <label class="field">Логин<input name="login" required autocomplete="username" value="${esc(hashStore?.ownerLogin || "")}"></label>
          <label class="field">Пароль<input name="password" type="password" required autocomplete="current-password"></label>
          <button class="primary" type="submit">Войти</button>
        </form>
      </section>
    </main>
    <div class="toast"></div>
  `;
  document.querySelector("[data-shop-panel-login]").onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const login = String(data.get("login") || "").trim();
    const password = String(data.get("password") || "");
    let store = shopPanelLoginStore(login, password);
    if (API_ENABLED) {
      try {
        const payload = await apiFetch("/api/store-admin/login", {
          method: "POST",
          body: JSON.stringify({ storeId: hashStore?.id || shopPanelHashId() || "", login, password })
        });
        localStorage.setItem(SELLER_ADMIN_API_TOKEN_KEY, payload.token);
        applyRemoteState(payload);
        store = shopPanelLoginStore(login, password);
      } catch (error) {
        renderShopPanelLogin(error.message || "Неверный логин или пароль");
        return;
      }
    }
    if (!store) {
      renderShopPanelLogin("Неверный логин или пароль");
      return;
    }
    try {
      localStorage.setItem(SHOP_PANEL_SESSION_KEY, store.id);
    } catch {}
    renderShopPanel("dashboard");
  };
}

function renderShopPanel(activeTab = "dashboard") {
  const store = shopPanelStore();
  if (!store) return renderShopPanelLogin();
  const html = sellerDashboardShell(store, false, activeTab);
  document.body.dataset.theme = db.theme;
  root.innerHTML = `
    <main class="shop-panel-page">
      ${html}
    </main>
    <div class="toast"></div>
  `;
  document.querySelectorAll("[data-shop-tab]").forEach((button) => {
    button.onclick = () => renderShopPanel(button.dataset.shopTab);
  });
  document.querySelector("[data-shop-panel-logout]")?.addEventListener("click", () => {
    try {
      localStorage.removeItem(SHOP_PANEL_SESSION_KEY);
      localStorage.removeItem(SELLER_ADMIN_API_TOKEN_KEY);
    } catch {}
    renderShopPanelLogin();
  });
  bindShopPanelActions(store, activeTab);
}

function shopLines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function shopPersistAndRender(tab = "dashboard") {
  saveDb();
  showToast("Сохранено");
  renderShopPanel(tab);
}

function bindShopPanelActions(store, activeTab) {
  bindLocationSelects();
  bindShopLocationSelects(store);
  document.querySelector("[data-shop-profile-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    store.name = String(data.get("name") || "").trim();
    store.tag = String(data.get("tag") || "").trim();
    store.short = String(data.get("short") || "").trim();
    store.description = String(data.get("description") || "").trim();
    const image = data.get("image");
    const cover = data.get("cover");
    if (image && image.size) store.image = await fileToDataUrl(image);
    if (cover && cover.size) store.cover = await fileToDataUrl(cover);
    if (!store.cover) store.cover = store.image || fallbackImage;
    shopPersistAndRender("profile");
  });

  document.querySelector("[data-shop-card-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    if (!title) return;
    const mainFile = data.get("mainImage");
    const galleryFiles = Array.from(data.getAll("images")).filter((file) => file && file.size).slice(0, 4);
    const gallery = galleryFiles.length ? await Promise.all(galleryFiles.map(fileToDataUrl)) : [];
    const mainImage = mainFile && mainFile.size ? await fileToDataUrl(mainFile) : (gallery[0] || store.image || fallbackImage);
    const images = [mainImage, ...gallery.filter((image) => image !== mainImage)].slice(0, 5);
    store.products = Array.isArray(store.products) ? store.products : [];
    store.products.push(normalizeProduct({
      id: `card-${Date.now()}`,
      title,
      category: title,
      description: String(data.get("description") || "").trim(),
      priceUsd: Number(data.get("priceUsd") || 0),
      price: `от ${Number(data.get("priceUsd") || 0)}$`,
      image: images[0],
      images,
      position: Number(data.get("position") || store.products.length + 1),
      status: String(data.get("status") || "active"),
      sellerManaged: true,
      positions: [],
      reviewsList: []
    }, store));
    shopPersistAndRender("cards");
  });

  document.querySelectorAll("[data-shop-card-move]").forEach((button) => button.onclick = () => {
    const ordered = sortedStoreProducts(store, true);
    const index = ordered.findIndex((product) => product.id === button.dataset.cardId);
    const delta = button.dataset.shopCardMove === "up" ? -1 : 1;
    const other = ordered[index + delta];
    if (!other || index < 0) return;
    const current = ordered[index];
    const currentPosition = Number(current.position || index + 1);
    current.position = Number(other.position || index + delta + 1);
    other.position = currentPosition;
    shopPersistAndRender("cards");
  });

  document.querySelectorAll("[data-shop-card-delete]").forEach((button) => button.onclick = () => {
    if (!confirm("Удалить карточку и все товары внутри?")) return;
    store.products = (store.products || []).filter((product) => product.id !== button.dataset.shopCardDelete);
    shopPersistAndRender("cards");
  });

  document.querySelector("[data-shop-product-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const product = (store.products || []).find((item) => item.id === data.get("cardId"));
    if (!product) return;
    const deliveryItems = shopLines(data.get("deliveryItems"));
    product.positions = Array.isArray(product.positions) ? product.positions : [];
    const priceUsd = Number(data.get("priceUsd") || product.priceUsd || 0);
    product.positions.unshift({
      id: `position-${Date.now()}`,
      title: String(data.get("title") || product.title || "").trim(),
      description: String(data.get("description") || "").trim(),
      priceUsd,
      weight: String(data.get("weight") || "").trim(),
      deliveryType: String(data.get("deliveryType") || "").trim() || "Товар",
      country: String(data.get("country") || shopDefaultCountry(store)),
      city: String(data.get("city") || shopDefaultCity(store)),
      district: String(data.get("district") || "").trim(),
      deliveryItems,
      stock: deliveryItems.length,
      status: "ready"
    });
    product.priceUsd = product.positions.length ? Math.min(...product.positions.map((p) => Number(p.priceUsd || priceUsd))) : priceUsd;
    product.price = `от ${Number(product.priceUsd || 0)}$`;
    shopPersistAndRender("products");
  });

  document.querySelectorAll("[data-shop-position-delete]").forEach((button) => button.onclick = () => {
    const product = (store.products || []).find((item) => item.id === button.dataset.cardId);
    if (!product) return;
    product.positions = (product.positions || []).filter((position) => position.id !== button.dataset.shopPositionDelete);
    shopPersistAndRender("products");
  });

  document.querySelector("[data-shop-settings-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    store.ltcWallet = String(data.get("ltcWallet") || "").trim();
    store.autoReleaseHours = Math.max(0, Math.min(72, Number(data.get("autoReleaseHours") || 24)));
    const nextPassword = String(data.get("adminPassword") || "").trim();
    if (nextPassword) store.adminPassword = nextPassword;
    shopPersistAndRender("settings");
  });
}

function renderSeller() {
  const stores = sellerStores();
  if (!stores.length) return renderSellerPortal();
  route = "seller";
  const store = stores[0];
  const sellerCountries = Array.isArray(store.countries) && store.countries.length ? store.countries : ["moldova"];
  const sellerDefaultCountry = sellerCountries[0] || "moldova";
  const sellerDefaultCity = Object.keys(filterOptions.countries[sellerDefaultCountry]?.cities || filterOptions.countries.moldova.cities)[0] || "chisinau";
  const standalone = Boolean(sellerAdminStore());
  const risk = storeRisk(store);
  const disputes = storeDisputes(store.id);
  layout(`
    <section class="screen seller-admin-screen">
      <article class="panel">
        <h2>${standalone ? "Админка магазина" : tr("seller")}: ${esc(store.name)}</h2>
        ${standalone ? `<button class="ghost-button" data-seller-admin-logout>Выйти из админки</button>` : ""}
        <p class="status-pill">${storeStatusLabel(store)}</p>
        <div class="stats">
          ${ownerStatCard("заказов", risk.orders)}
          ${ownerStatCard("споров", risk.disputes)}
          ${ownerStatCard("продажи, $", storeSalesUsd(store.id).toFixed(2))}
          ${ownerStatCard("автозавершение, ч", store.autoReleaseHours || db.ownerSettings?.defaultAutoReleaseHours || 24)}
        </div>
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
        ${disputes.map((order) => `
          <article class="ref-item">
            <div><h3>${esc(order.product || order.id)}</h3><p>${esc(order.login)} · ${Number(order.amountUsd || 0).toFixed(2)} $</p></div>
            <div>
              <span class="status-pill">Открыт</span>
              <button class="ghost-button" data-seller-dispute-chat="${esc(order.login)}">Ответить клиенту</button>
            </div>
          </article>
        `).join("") || `<p>Открытых диспутов нет.</p>`}
        <form class="form" data-product-form>
          <label class="field">${tr("name")}<input name="title" required></label>
          <label class="field">${tr("short")}<input name="category" required></label>
          <label class="field">Описание<textarea name="description"></textarea></label>
          <div class="row">
            <label class="field">Цена, $<input name="priceUsd" type="number" min="0" step="0.01" value="50" required></label>
            <label class="field">Кол-во<input name="stock" type="number" min="0" step="1" value="1" required></label>
          </div>
          <label class="field">Тип<input name="deliveryType" value="Курьер"></label>
          <div class="row" data-location-group>
            <label class="field">Страна<select name="country" data-location-country>${scopedCountrySelectOptions(sellerCountries, sellerDefaultCountry)}</select></label>
            <label class="field">Город<select name="city" data-location-city>${citySelectOptions(sellerDefaultCountry, sellerDefaultCity)}</select></label>
            <label class="field">Район<select name="district" data-location-district>${districtSelectOptions(sellerDefaultCountry, sellerDefaultCity, "")}</select></label>
          </div>
          <label class="field">Описания для выдачи клиенту<textarea name="deliveryItems" placeholder="Каждая новая строка = один доступный заказ"></textarea></label>
          <label class="field">Главное фото<input name="mainImage" type="file" accept="image/*"></label>
          <label class="field">${tr("upload")}<input name="images" type="file" accept="image/*" multiple></label>
          <button class="primary">${tr("addProduct")}</button>
        </form>
      </article>
      ${store.products.map((product) => productCardView(product, store)).join("")}
    </section>
  `);
  document.querySelector("[data-seller-admin-logout]")?.addEventListener("click", () => {
    try {
      localStorage.removeItem(SELLER_ADMIN_KEY);
      localStorage.removeItem(SELLER_ADMIN_API_TOKEN_KEY);
    } catch {}
    const storeId = store.id;
    sellerAdminStoreId = storeId;
    renderSellerAdminLogin(storeId);
  });
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
  document.querySelectorAll("[data-seller-dispute-chat]").forEach((button) => {
    button.onclick = () => {
      activePrivateLogin = button.dataset.sellerDisputeChat;
      renderMessages();
    };
  });
  bindLocationSelects();
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
        city: String(data.get("city") || "chisinau").trim(),
        district: String(data.get("district") || "").trim(),
        deliveryType: data.get("deliveryType").trim() || "Курьер",
        deliveryItems,
        stock: deliveryItems.length,
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

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function showModal(html, className = "") {
  document.querySelector("[data-modal]").innerHTML = `<div class="modal ${className}">${html}</div>`;
  document.querySelector("[data-modal]").classList.add("open");
}

async function trackSiteBroadcast(notification, action) {
  if (!notification?.id || !API_ENABLED || !localStorage.getItem(API_TOKEN_KEY)) return;
  try {
    await fetch(apiUrl(`/api/broadcasts/${encodeURIComponent(notification.id)}/track`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem(API_TOKEN_KEY)}`
      },
      body: JSON.stringify({ action })
    });
  } catch {}
}

function showPendingSiteBroadcast() {
  if (!db.currentUser || !currentUser() || !document.querySelector("[data-modal]")) return;
  const notification = (db.siteNotifications || []).find((item) => (
    sameLogin(item.login, db.currentUser) && !item.closedAt && !item.clickedAt
  ));
  if (!notification) return;
  const isBanner = notification.type === "banner";
  showModal(`
    <h2>${esc(notification.title || "Уведомление")}</h2>
    ${notification.photoUrl ? `<img class="broadcast-image" src="${esc(notification.photoUrl)}" alt="">` : ""}
    <p>${esc(notification.body || "")}</p>
    <button class="primary" data-broadcast-click="${esc(notification.id)}">${isBanner ? "Открыть" : "Понятно"}</button>
    <button class="ghost-button" data-broadcast-close="${esc(notification.id)}">${tr("close")}</button>
  `, isBanner ? "broadcast-banner-modal" : "broadcast-popup-modal");
  document.querySelector("[data-broadcast-click]")?.addEventListener("click", async () => {
    notification.clickedAt = Date.now();
    await trackSiteBroadcast(notification, "clicked");
    if (notification.buttonUrl) window.open(notification.buttonUrl, "_blank", "noopener");
    document.querySelector("[data-modal]")?.classList.remove("open");
  });
  document.querySelector("[data-broadcast-close]")?.addEventListener("click", async () => {
    notification.closedAt = Date.now();
    await trackSiteBroadcast(notification, "closed");
    document.querySelector("[data-modal]")?.classList.remove("open");
  });
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
      openProductCheckoutModal(button.dataset.productStore, button.dataset.product, button.dataset.buyPosition);
    };
  });
  document.querySelector("[data-menu]").onclick = () => document.querySelector("[data-nav-pop]").classList.add("open");
  document.querySelector("[data-account]").onclick = () => document.querySelector("[data-account-pop]").classList.add("open");
  document.querySelector("[data-menu-deposit]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelector("[data-account-pop]")?.classList.remove("open");
    openWalletDepositModal();
  });
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
  bindGroupFloatingWidget();
}

function bindGroupFloatingWidget() {
  document.querySelectorAll("[data-group-widget-toggle]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      groupWidgetOpen = !groupWidgetOpen;
      if (groupWidgetOpen) markGroupWidgetSeen();
      renderCurrent();
    };
  });
  const list = document.querySelector("[data-group-widget-list]");
  if (list) list.scrollTop = list.scrollHeight;
  document.querySelector("[data-group-widget-form]")?.addEventListener("submit", handleGroupWidgetSend);
  document.querySelector("[data-group-widget-attach]")?.addEventListener("click", () => document.querySelector("[data-group-widget-file]")?.click());
  document.querySelector("[data-group-widget-file]")?.addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0];
    document.querySelector("[data-group-widget-file-name]").textContent = file ? file.name : "";
  });
  document.querySelector("[data-group-widget-voice]")?.addEventListener("click", toggleGroupWidgetVoiceRecord);
}

async function handleGroupWidgetSend(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user) return renderAuth();
  ensureGroupSettings();
  if (!isGroupMember(user.login)) db.groupSettings.members.push(user.login);
  markGroupPresence(user.login);
  const form = event.currentTarget;
  const body = String(new FormData(form).get("body") || "").trim();
  const file = form.querySelector("[data-group-widget-file]")?.files?.[0];
  if (!body && (!file || !file.size) && !groupWidgetVoiceDraft) return;
  const attachments = file && file.size ? [{
    name: file.name,
    type: file.type,
    url: await fileToDataUrl(file)
  }] : (groupWidgetVoiceDraft ? [groupWidgetVoiceDraft] : []);
  db.groupMessages.push({
    id: `group-${Date.now()}`,
    fromLogin: user.login,
    body,
    attachments,
    likes: [],
    createdAt: Date.now(),
    date: new Date().toLocaleString()
  });
  groupWidgetVoiceDraft = null;
  groupWidgetOpen = true;
  markGroupWidgetSeen();
  saveDb();
  renderCurrent();
}

async function toggleGroupWidgetVoiceRecord(event) {
  const button = event.currentTarget;
  if (groupWidgetVoiceRecorder && groupWidgetVoiceRecorder.state === "recording") {
    groupWidgetVoiceRecorder.stop();
    button.classList.remove("recording");
    button.textContent = "🎙";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("Запись голоса недоступна в этом браузере");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    groupWidgetVoiceChunks = [];
    groupWidgetVoiceRecorder = new MediaRecorder(stream);
    groupWidgetVoiceRecorder.ondataavailable = (recordEvent) => {
      if (recordEvent.data.size) groupWidgetVoiceChunks.push(recordEvent.data);
    };
    groupWidgetVoiceRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(groupWidgetVoiceChunks, { type: groupWidgetVoiceRecorder.mimeType || "audio/webm" });
      groupWidgetVoiceDraft = {
        name: `voice-${Date.now()}.webm`,
        type: blob.type,
        url: await blobToDataUrl(blob)
      };
      document.querySelector("[data-group-widget-file-name]").textContent = "Голосовое сообщение готово";
    };
    groupWidgetVoiceRecorder.start();
    button.classList.add("recording");
    button.textContent = "■";
    document.querySelector("[data-group-widget-file-name]").textContent = "Идёт запись голоса...";
  } catch {
    showToast("Не удалось включить микрофон");
  }
}

function bindStoreCards() {
  document.querySelectorAll("[data-store]").forEach((button) => button.onclick = () => renderStore(button.dataset.store, "positions"));
}

function routeTo(next) {
  if (next === "filters") return renderFilters();
  if (next === "rules") return openRulesModal();
  if (next === "messages" && route !== "messages") activePrivateLogin = "";
  route = next;
  renderCurrent();
}

function renderCurrent() {
  if (isShopPanelHash()) return renderShopPanel();
  const hashStoreId = sellerAdminHashId();
  if (hashStoreId) {
    sellerAdminStoreId = hashStoreId;
    if (sellerAdminSessionId() === hashStoreId) return renderSeller();
    return renderSellerAdminLogin(hashStoreId);
  }
  if (!db.currentUser || !currentUser()) return renderAuth();
  const directRoute = hashRoute();
  if (directRoute) route = directRoute;
  if (route === "home") return renderHome();
  if (route === "catalog") return renderCatalog();
  if (route === "orders") return renderOrders(activeOrdersTab);
  if (route === "messages") return renderMessages();
  if (route === "group-chat") return renderGroupChat();
  if (route === "support") return renderSupport();
  if (route === "referrals") return renderReferrals(activeReferralTab);
  if (route === "exchange") return renderExchangeCatalog();
  if (route === "exchange-profile") return renderExchangeProfile(activeExchangeId, activeExchangeTab);
  if (route === "exchange-chat") return renderExchangeChat(activeExchangeId);
  if (route === "exchange-order") return renderExchangeOrderDetail(activeExchangeOrderId);
  if (route === "exchange-admin") return renderExchangeOperator();
  if (route === "wallet") return renderWallet();
  if (route === "owner") return renderOwnerPanel();
  if (route === "admin") return renderAdmin();
  if (route === "seller") return renderSeller();
  if (route === "product") return renderProductView(activeStoreId || db.stores[0].id, activeProductId);
  if (route === "store") return renderStore(activeStoreId || db.stores[0].id, activeStoreTab);
  if (route === "chat") return renderChat(activeStoreId || db.stores[0].id);
  renderHome();
}

async function initApp() {
  await loadRemoteConfig();
  await loadCmsTextOverrides();
  await loadRemoteState();
  await loadRemoteSession();
  await fetchLitecoinUsdRate();
  watchCmsVisualTextOverrides();
  renderCurrent();
  setTimeout(showPendingSiteBroadcast, 350);
}

window.addEventListener("hashchange", renderCurrent);

initApp();
