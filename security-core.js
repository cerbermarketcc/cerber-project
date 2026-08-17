import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function constantTimeEqual(left = "", right = "") {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function base32Encode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || "");
  let bits = "";
  let output = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  for (let offset = 0; offset < bits.length; offset += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

export function base32Decode(value = "") {
  const clean = String(value).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(Math.max(20, Number(bytes) || 20)));
}

export function totpCodeForStep(secret = "", step = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secret);
  if (key.length < 16 || !Number.isSafeInteger(step) || step < 0) return "";
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secret = "", suppliedCode = "", options = {}) {
  const code = String(suppliedCode).replace(/\D/g, "");
  if (code.length !== 6) return { valid: false, step: -1 };
  const timestamp = Number(options.timestamp ?? Date.now());
  const window = Math.min(2, Math.max(0, Number(options.window ?? 1)));
  const currentStep = Math.floor(timestamp / 30000);
  for (let delta = -window; delta <= window; delta += 1) {
    const step = currentStep + delta;
    if (step >= 0 && constantTimeEqual(code, totpCodeForStep(secret, step))) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: -1 };
}

export function normalizeRecoveryCode(value = "") {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateRecoveryCodes(count = 10) {
  const total = Math.min(20, Math.max(6, Number(count) || 10));
  return Array.from({ length: total }, () => {
    const bytes = crypto.randomBytes(12);
    let code = "";
    for (const byte of bytes) code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
  });
}

export function hashRecoveryCode(serverSecret = "", accountId = "", code = "") {
  if (!serverSecret || !accountId || !normalizeRecoveryCode(code)) return "";
  return crypto.createHmac("sha256", serverSecret)
    .update(`recovery:v1:${accountId}:${normalizeRecoveryCode(code)}`)
    .digest("base64url");
}

export function recoveryCodeHashes(serverSecret = "", accountId = "", codes = []) {
  return codes.map((code) => hashRecoveryCode(serverSecret, accountId, code)).filter(Boolean);
}

export function consumeRecoveryCode(hashes = [], serverSecret = "", accountId = "", code = "") {
  const candidate = hashRecoveryCode(serverSecret, accountId, code);
  const source = Array.isArray(hashes) ? hashes.map(String) : [];
  const index = source.findIndex((hash) => constantTimeEqual(hash, candidate));
  if (index < 0) return { valid: false, hashes: source };
  return { valid: true, hashes: source.filter((_hash, hashIndex) => hashIndex !== index) };
}

export function validIdempotencyKey(value = "") {
  const key = String(value).trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(key) ? key : "";
}

export function normalizePublicBaseUrl(value = "", options = {}) {
  const production = Boolean(options.production);
  const fallback = String(options.fallback || "https://cerber.vip").replace(/\/+$/, "");
  const allowedHosts = new Set((options.allowedHosts || ["cerber.vip", "cerber.to", "cerber.love"])
    .map((host) => String(host || "").trim().toLowerCase())
    .filter(Boolean));
  let candidate = String(value || fallback).trim();
  const embeddedUrl = candidate.match(/https?:\/\/[^\s\])}"']+/i)?.[0];
  if (embeddedUrl) candidate = embeddedUrl;
  else if (/^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(candidate)) {
    candidate = `${production ? "https" : "http"}://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(parsed.protocol)) return fallback;
    if (production && (parsed.protocol !== 'https:' || !allowedHosts.has(hostname))) return fallback;
    return parsed.origin;
  } catch {
    return fallback;
  }
}

export function cleanMarketplaceLaunchState(state = {}) {
  const source = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  return {
    ...source,
    ownerStores: [],
    publicStoresCache: [],
    stores: [],
    exchangers: [],
    exchangeCards: [],
    exchangeRequests: [],
    storeApplications: [],
    orders: [],
    walletTransactions: [],
    walletDeposits: [],
    walletWithdrawals: [],
    referralPayments: [],
    siteNotifications: [],
    broadcasts: [],
    supportTickets: [],
    nowpaymentsIpnEvents: [],
    adminLogs: [],
    balances: {},
    ltcBalances: {},
    ltcBalanceVersions: {},
    storeBalancesUsd: {},
    storeBalancesLtc: {},
    ownerBalanceUsd: 0,
    ownerBalanceLtc: 0
  };
}

export function boundedUserText(value = "", maxLength = 5000, fieldName = "Text") {
  const limit = Math.min(100_000, Math.max(1, Number(maxLength) || 5000));
  const text = String(value ?? "").trim();
  if (text.length > limit) {
    const error = new Error(`${String(fieldName || "Text").slice(0, 80)} exceeds ${limit} characters`);
    error.status = 400;
    error.code = "TEXT_TOO_LONG";
    throw error;
  }
  return text;
}

export function isBlockedStaticPath(value = "") {
  const pathname = String(value || "").split("?", 1)[0].replace(/\\/g, "/");
  return /^\/(?:\.[^/]+|node_modules|scripts|test|textolite)(?:\/|$)/i.test(pathname)
    || /^\/(?:server\.js|security-core\.js|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|render\.yaml|supabase-schema\.sql|supabase-security-2fa\.sql|.*\.env(?:\..*)?|cms-texts\.json|SECURITY_AUDIT\.md)$/i.test(pathname)
    || /\.(?:php|ini|md|sql|ya?ml|lock|log|bak|old|orig|map|pem|key|crt|pfx|dump|zip|tar|gz)$/i.test(pathname);
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function amountsMatch(left, right, relativeTolerance = 0.0001, absoluteTolerance = 0.00000001) {
  const first = finitePositive(left);
  const second = finitePositive(right);
  if (!first || !second) return false;
  return Math.abs(first - second) <= Math.max(absoluteTolerance, Math.max(first, second) * relativeTolerance);
}

export function validateProviderPayment(payload = {}, expected = {}) {
  const providerPaymentId = String(payload.payment_id || payload.id || "").trim();
  const expectedPaymentId = String(expected.paymentId || "").trim();
  if (!providerPaymentId || (expectedPaymentId && providerPaymentId !== expectedPaymentId)) {
    return { ok: false, reason: "payment_id_mismatch" };
  }

  const providerOrderId = String(payload.order_id || payload.order || payload.orderId || "").trim();
  const expectedOrderId = String(expected.orderId || expected.id || "").trim();
  if (!providerOrderId || (expectedOrderId && providerOrderId !== expectedOrderId)) {
    return { ok: false, reason: "order_id_mismatch" };
  }

  const expectedCurrency = String(expected.payCurrency || expected.coinId || "").trim().toLowerCase();
  const providerCurrency = String(payload.pay_currency || payload.payCurrency || "").trim().toLowerCase();
  if (!providerCurrency || (expectedCurrency && providerCurrency !== expectedCurrency)) {
    return { ok: false, reason: "pay_currency_mismatch" };
  }

  const expectedUsd = finitePositive(expected.amountUsd || expected.priceAmount);
  const providerUsd = finitePositive(payload.price_amount || payload.priceAmount);
  const priceCurrency = String(payload.price_currency || payload.priceCurrency || "").trim().toLowerCase();
  if (!expectedUsd || !providerUsd || priceCurrency !== "usd" || !amountsMatch(expectedUsd, providerUsd, 0.0001, 0.01)) {
    return { ok: false, reason: "price_amount_mismatch" };
  }

  const expectedPayAmount = finitePositive(expected.payAmount || expected.expectedPayAmount);
  const providerPayAmount = finitePositive(payload.pay_amount || payload.payAmount);
  if (expectedPayAmount && (!providerPayAmount || !amountsMatch(expectedPayAmount, providerPayAmount, 0.0001, 0.00000001))) {
    return { ok: false, reason: "pay_amount_mismatch" };
  }

  const actuallyPaid = finitePositive(payload.actually_paid || payload.actuallyPaid);
  const requiredPayAmount = expectedPayAmount || providerPayAmount;
  if (!requiredPayAmount || !actuallyPaid) return { ok: false, reason: "paid_amount_missing" };
  const tolerance = Math.max(0.00000001, requiredPayAmount * 0.000001);
  if (actuallyPaid + tolerance < requiredPayAmount) return { ok: false, reason: "underpaid" };

  return {
    ok: true,
    paymentId: providerPaymentId,
    orderId: providerOrderId,
    payCurrency: providerCurrency,
    actuallyPaid,
    expectedPayAmount: requiredPayAmount
  };
}

export function validateProviderPayout(payload = {}, expected = {}) {
  const currency = String(payload.currency || payload.pay_currency || "").trim().toLowerCase();
  const expectedCurrency = String(expected.currency || "ltc").trim().toLowerCase();
  if (!currency || currency !== expectedCurrency) return { ok: false, reason: "payout_currency_mismatch" };

  const amount = finitePositive(payload.amount);
  const expectedAmount = finitePositive(expected.amount);
  if (!amount || !expectedAmount || !amountsMatch(amount, expectedAmount, 0, 0.000001)) {
    return { ok: false, reason: "payout_amount_mismatch" };
  }

  const address = String(payload.address || "").trim();
  const expectedAddress = String(expected.address || "").trim();
  if (!address || !expectedAddress || !constantTimeEqual(address, expectedAddress)) {
    return { ok: false, reason: "payout_address_mismatch" };
  }

  return { ok: true, currency, amount, address };
}

export function trustedWalletCreditLtc(deposit = {}, providerPayload = {}) {
  const outcomeCurrency = String(providerPayload.outcome_currency || providerPayload.outcomeCurrency || "").trim().toLowerCase();
  const outcomeAmount = finitePositive(providerPayload.outcome_amount || providerPayload.outcomeAmount);
  if (outcomeCurrency === "ltc" && outcomeAmount) return outcomeAmount;

  const payCurrency = String(deposit.payCurrency || deposit.coinId || providerPayload.pay_currency || "").trim().toLowerCase();
  const actuallyPaid = finitePositive(providerPayload.actually_paid || providerPayload.actuallyPaid);
  if (payCurrency === "ltc") return actuallyPaid;

  const trustedUsd = finitePositive(deposit.amountUsd || providerPayload.price_amount || providerPayload.priceAmount);
  const trustedRate = finitePositive(deposit.ltcUsdRateAtCreation);
  return trustedUsd && trustedRate ? trustedUsd / trustedRate : 0;
}

const ADMIN_SELF_SERVICE_ROUTES = [
  ["POST", /^\/api\/admin\/logout$/],
  ["POST", /^\/api\/admin\/2fa\/recovery-codes$/],
  ["DELETE", /^\/api\/admin\/2fa$/]
];

const ADMIN_ROLE_ROUTES = {
  manager: [
    ["GET", /^\/api\/admin\/overview$/],
    ["POST", /^\/api\/admin\/stores$/],
    ["PATCH", /^\/api\/admin\/stores\/[^/]+$/],
    ["PATCH", /^\/api\/admin\/stores\/[^/]+\/products\/[^/]+$/],
    ["POST", /^\/api\/admin\/exchangers$/],
    ["PATCH", /^\/api\/admin\/exchangers\/[^/]+$/],
    ["GET", /^\/api\/admin\/disputes\/[^/]+$/],
    ["POST", /^\/api\/admin\/disputes\/[^/]+\/(?:join|reply)$/],
    ["POST", /^\/api\/admin\/private-messages$/],
    ["PATCH", /^\/api\/admin\/messages\/[^/]+$/],
    ["DELETE", /^\/api\/admin\/messages\/[^/]+$/]
  ],
  moderator: [
    ["GET", /^\/api\/admin\/overview$/],
    ["GET", /^\/api\/admin\/disputes\/[^/]+$/],
    ["POST", /^\/api\/admin\/disputes\/[^/]+\/(?:join|reply)$/],
    ["POST", /^\/api\/admin\/support-tickets\/[^/]+\/(?:reply|close)$/],
    ["POST", /^\/api\/admin\/private-messages$/],
    ["PATCH", /^\/api\/admin\/messages\/[^/]+$/],
    ["DELETE", /^\/api\/admin\/messages\/[^/]+$/]
  ],
  support: [
    ["GET", /^\/api\/admin\/overview$/],
    ["GET", /^\/api\/admin\/users\/[^/]+$/],
    ["POST", /^\/api\/admin\/support-tickets\/[^/]+\/(?:reply|close)$/],
    ["POST", /^\/api\/admin\/private-messages$/],
    ["PATCH", /^\/api\/admin\/messages\/[^/]+$/],
    ["DELETE", /^\/api\/admin\/messages\/[^/]+$/]
  ]
};

export function adminRoleAllowsRequest(role = "", method = "GET", pathname = "") {
  const normalizedRole = String(role || "").toLowerCase();
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(pathname || "").split("?", 1)[0];
  if (["owner", "admin"].includes(normalizedRole)) return true;
  const matches = ([...ADMIN_SELF_SERVICE_ROUTES, ...(ADMIN_ROLE_ROUTES[normalizedRole] || [])])
    .some(([allowedMethod, routePattern]) => allowedMethod === normalizedMethod && routePattern.test(normalizedPath));
  return matches;
}

function boundedText(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function boundedNumber(value, minimum = 0, maximum = 1_000_000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function safeObjectId(value, fallback = "") {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 120);
  return normalized || fallback;
}

function sellerDeliveryItems(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 5000)
    .map((item) => boundedText(item, 4000))
    .filter(Boolean);
}

function sellerPositionInput(position = {}, index = 0, product = {}) {
  const deliveryItems = sellerDeliveryItems(position.deliveryItems);
  const status = ["active", "disabled", "ready", "preorder"].includes(String(position.status || "").toLowerCase())
    ? String(position.status).toLowerCase()
    : "ready";
  return {
    id: safeObjectId(position.id, `position-${index + 1}`),
    variantId: safeObjectId(position.variantId),
    subtype: boundedText(position.subtype, 120),
    title: boundedText(position.title || product.title || product.name || "Product", 160),
    description: boundedText(position.description, 4000),
    deliveryItems,
    delimiter: boundedText(position.delimiter || "\n", 8) || "\n",
    priceUsd: boundedNumber(position.priceUsd ?? product.priceUsd, 0, 1_000_000),
    country: boundedText(position.country, 80),
    city: boundedText(position.city, 120),
    district: boundedText(position.district, 160),
    deliveryType: boundedText(position.deliveryType || "Product", 120),
    saleMode: String(position.saleMode || position.productMode || position.orderMode || "ready").toLowerCase() === "preorder" ? "preorder" : "ready",
    weight: boundedText(position.weight, 80),
    stock: deliveryItems.length || Math.floor(boundedNumber(position.stock, 0, 1_000_000)),
    status
  };
}

export function mergeSellerProductInput(existing = {}, input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const current = existing && typeof existing === "object" ? existing : {};
  const title = boundedText(source.title ?? source.name ?? current.title ?? current.name, 160);
  const requestedStatus = String(source.status ?? current.status ?? "active").toLowerCase();
  const status = ["active", "disabled", "ready", "preorder"].includes(requestedStatus) ? requestedStatus : "active";
  const variantsSource = Object.prototype.hasOwnProperty.call(source, "variants") ? source.variants : current.variants;
  const positionsSource = Object.prototype.hasOwnProperty.call(source, "positions") ? source.positions : current.positions;
  const deliverySource = Object.prototype.hasOwnProperty.call(source, "deliveryItems") ? source.deliveryItems : current.deliveryItems;
  const priceUsd = boundedNumber(source.priceUsd ?? current.priceUsd, 0, 1_000_000);
  const variants = (Array.isArray(variantsSource) ? variantsSource : []).slice(0, 100).map((variant, index) => ({
    id: safeObjectId(variant?.id, `variant-${index + 1}`),
    subtype: boundedText(variant?.subtype, 120),
    weight: boundedText(variant?.weight, 80),
    priceUsd: boundedNumber(variant?.priceUsd ?? priceUsd, 0, 1_000_000)
  }));
  const editable = {
    id: safeObjectId(source.id ?? current.id, safeObjectId(current.id)),
    title,
    name: boundedText(source.name ?? title, 160) || title,
    short: boundedText(source.short ?? current.short, 500),
    description: boundedText(source.description ?? current.description, 8000),
    category: boundedText(source.category ?? current.category, 120),
    subtype: boundedText(source.subtype ?? current.subtype, 120),
    weight: boundedText(source.weight ?? current.weight, 80),
    status,
    active: source.active === undefined ? current.active !== false : source.active !== false,
    position: Math.floor(boundedNumber(source.position ?? current.position ?? 1, 1, 10000)),
    priceUsd,
    price: `from ${priceUsd.toFixed(2)}$`,
    image: boundedText(source.image ?? current.image, 8 * 1024 * 1024),
    images: (Array.isArray(source.images) ? source.images : (Array.isArray(current.images) ? current.images : [])).slice(0, 5).map((item) => boundedText(item, 8 * 1024 * 1024)),
    gallery: (Array.isArray(source.gallery) ? source.gallery : (Array.isArray(current.gallery) ? current.gallery : [])).slice(0, 8).map((item) => boundedText(item, 8 * 1024 * 1024)),
    variants,
    positions: (Array.isArray(positionsSource) ? positionsSource : []).slice(0, 1000).map((position, index) => sellerPositionInput(position, index, { title, priceUsd })),
    deliveryItems: sellerDeliveryItems(deliverySource)
  };
  return {
    ...current,
    ...editable,
    purchases: Math.max(0, Number(current.purchases || 0) || 0),
    reviews: Math.max(0, Number(current.reviews || 0) || 0),
    rating: Math.min(5, Math.max(0, Number(current.rating ?? 5) || 0)),
    reviewsList: Array.isArray(current.reviewsList) ? current.reviewsList : []
  };
}

function hasPrefix(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

export function mediaMagicMatches(mimeType = "", buffer = Buffer.alloc(0)) {
  const mime = String(mimeType).toLowerCase();
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (["image/jpeg", "image/jpg"].includes(mime)) return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (mime === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mime === "audio/mpeg") return hasPrefix(buffer, [0x49, 0x44, 0x33]) || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  if (["audio/ogg", "video/ogg"].includes(mime)) return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (["audio/webm", "video/webm"].includes(mime)) return hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  if (["audio/mp4", "video/mp4", "video/quicktime"].includes(mime)) return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  if (mime === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  return false;
}

export function parseInlineMedia(value = "", allowedTypes = new Set(), maxBytes = 5 * 1024 * 1024) {
  const source = String(value).trim();
  const match = source.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mimeType = String(match[1]).toLowerCase();
  if (!allowedTypes.has(mimeType)) return null;
  const encoded = match[2].replace(/\s/g, "");
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > maxBytes || !mediaMagicMatches(mimeType, buffer)) return null;
  return { source, mimeType, buffer };
}

export function sanitizeErrorForLog(error) {
  return {
    name: String(error?.name || "Error").slice(0, 80),
    message: String(error?.message || "Unexpected error").replace(/[\r\n\t]+/g, " ").slice(0, 300),
    code: String(error?.code || "").slice(0, 80),
    status: Number(error?.status || 0) || undefined
  };
}

export function sanitizeAuditDetails(value, key = "", depth = 0) {
  const normalizedKey = String(key || "").toLowerCase();
  if (/(?:password|passwd|secret|token|authorization|cookie|private[_-]?key|api[_-]?key|totp|recovery[_-]?code)/i.test(normalizedKey)) {
    return "[redacted]";
  }
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const clean = value.replace(/[\r\n\t]+/g, " ").slice(0, 500);
    if (/(?:address|wallet)/i.test(normalizedKey) && clean.length > 12) return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
    return clean;
  }
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditDetails(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([itemKey, itemValue]) => [
      String(itemKey).slice(0, 80),
      sanitizeAuditDetails(itemValue, itemKey, depth + 1)
    ]));
  }
  return String(value).slice(0, 200);
}
