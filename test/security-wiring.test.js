import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const appClient = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const adminClient = readFileSync(new URL("../market-admin.js", import.meta.url), "utf8");
const textAdminClient = readFileSync(new URL("../text-admin.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase-security-2fa.sql", import.meta.url), "utf8");
const authRateLimitMigration = readFileSync(new URL("../supabase-auth-rate-limits.sql", import.meta.url), "utf8");
const legacyStateLockdown = readFileSync(new URL("../supabase-legacy-state-lockdown.sql", import.meta.url), "utf8");
const lockdownVerification = readFileSync(new URL("../supabase-verify-lockdown.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase-schema.sql", import.meta.url), "utf8");
const renderConfig = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

function routeBody(method, route) {
  const marker = `app.${method}("${route}"`;
  const start = server.indexOf(marker);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${route} must exist`);
  const nextRoute = server.indexOf("\napp.", start + marker.length);
  return server.slice(start, nextRoute < 0 ? server.length : nextRoute);
}

test("all administrative APIs require an enabled database-backed MFA account", () => {
  assert.match(server, /siteAdminPath[\s\S]{0,1800}!account\.totp_enabled/);
  assert.match(server, /storeAdminPath[\s\S]{0,1800}!account\.totp_enabled/);
  assert.match(server, /adminRoleCanRequest\(account\.role, req\)/);
  assert.match(server, /account\.credential_version[\s\S]{0,300}token\.credentialVersion/);
  assert.match(server, /account\.session_version[\s\S]{0,300}token\.sessionVersion/);
});

test("admin MFA challenges cannot authorize APIs and sensitive responses are not cached", () => {
  assert.match(server, /purpose: "admin-mfa-challenge"/);
  assert.match(server, /update\(`challenge:\$\{payload\}`\)/);
  assert.match(server, /if \(!data\.mfa \|\| !data\.accountId/);
  assert.match(server, /siteMfaPublicRoutes\.has\(req\.path\)[\s\S]{0,220}Cache-Control", "no-store"/);
  assert.match(server, /accountForMfaChallenge\(req, "site"\)/);
  assert.match(server, /accountForMfaChallenge\(req, "store"\)/);
});

test("ordinary customer authentication remains separate from administrative 2FA", () => {
  const registration = routeBody("post", "/api/auth/register");
  const login = routeBody("post", "/api/auth/login");
  assert.doesNotMatch(registration, /totp|recoveryCode|challengeToken|signAdminToken/);
  assert.doesNotMatch(login, /totp|recoveryCode|challengeToken|signAdminToken/);
  assert.match(registration, /createUserSession\(req, (?:key|existing\.login_key \|\| key)\)/);
  assert.match(login, /createUserSession\(req, user\.login_key\)/);
});

test("all public mirrors use one shared customer account database without cross-origin auth fallback", () => {
  const registration = routeBody("post", "/api/auth/register");
  const login = routeBody("post", "/api/auth/login");
  assert.match(appClient, /const API_ORIGIN = API_ENABLED \? location\.origin : PRIMARY_API_ORIGIN;/);
  assert.match(appClient, /const API_ORIGINS = \[API_ORIGIN\];/);
  assert.doesNotMatch(appClient, /\[PRIMARY_API_ORIGIN, API_ORIGIN\]/);
  assert.match(registration, /supabase\.from\("profiles"\)\.select\("\*"\)\.eq\("login_key", key\)/);
  assert.match(registration, /supabase\.from\("profiles"\)\.insert\(profileInsert\)/);
  assert.match(login, /supabase\.from\("profiles"\)\.select\("\*"\)\.eq\("login_key", key\)/);
  assert.doesNotMatch(`${registration}\n${login}`, /req\.(?:hostname|headers\.host)|domain|origin.*login_key/i);
  assert.match(indexHtml, /app\.js\?v=165/);
});

test("privileged login failures are locked by account and IP across server instances", () => {
  const adminLogin = routeBody("post", "/api/admin/login");
  const storeLogin = routeBody("post", "/api/store-admin/login");
  assert.match(server, /function privilegedRateLimitKeys[\s\S]{0,1200}:account[\s\S]{0,800}:ip/);
  assert.match(server, /limit: 5,[\s\S]{0,120}lockMs: 30 \* 60 \* 1000/);
  assert.match(server, /limit: 20,[\s\S]{0,120}lockMs: 60 \* 60 \* 1000/);
  assert.match(adminLogin, /assertPrivilegedLoginRateLimit\(req, "site-admin-login", login\)/);
  assert.match(adminLogin, /markPrivilegedLoginAttempt\(req, "site-admin-login", credentials\.account \? login : "", false\)/);
  assert.match(storeLogin, /assertPrivilegedLoginRateLimit\(req, "store-admin-login", privilegedIdentity\)/);
  assert.match(storeLogin, /markPrivilegedLoginAttempt\(req, "store-admin-login", ownerLoginOk \|\| staff \? privilegedIdentity : "", false\)/);
  assert.match(server, /res\.setHeader\("Retry-After"/);
  assert.match(authRateLimitMigration, /create table if not exists public\.auth_rate_limits/i);
  assert.match(authRateLimitMigration, /for update/i);
  assert.match(authRateLimitMigration, /force row level security/i);
  assert.match(authRateLimitMigration, /revoke all privileges on table public\.auth_rate_limits from public, anon, authenticated/i);
  assert.match(authRateLimitMigration, /grant execute on function public\.record_auth_failure[\s\S]{0,100}service_role/i);
  assert.match(adminLogin, /Неверный логин или пароль/);
  assert.doesNotMatch(adminLogin, /Invalid login credentials/);
});

test("private message refreshes share one in-flight request", () => {
  assert.match(appClient, /let privateMessagesLoadPromise = null/);
  assert.match(appClient, /if \(privateMessagesLoadPromise\) return privateMessagesLoadPromise/);
  assert.match(appClient, /finally \{\s*privateMessagesLoadPromise = null/);
});

test("public hash routes do not disclose an administrative entry point", () => {
  const hashRoutes = appClient.match(/function hashRoute\(\)[\s\S]{0,500}?\n\}/)?.[0] || "";
  const legacyAdmin = appClient.match(/function renderLegacyAdminDisabled\(\)[\s\S]{0,500}?\n\}/)?.[0] || "";
  assert.doesNotMatch(hashRoutes, /["'](?:admin|owner)["']/);
  assert.doesNotMatch(appClient, /market-admin\.html/);
  assert.match(legacyAdmin, /history\.replaceState/);
  assert.match(legacyAdmin, /renderAuth\(\)/);
});

test("passwords are hashed before database persistence and legacy store secrets are stripped", () => {
  const registration = routeBody("post", "/api/auth/register");
  const adminCreate = routeBody("post", "/api/admin/accounts");
  const saveStoreStart = server.indexOf("async function saveStoreRow");
  const saveStoreEnd = server.indexOf("\nasync function", saveStoreStart + 30);
  const saveStore = server.slice(saveStoreStart, saveStoreEnd);
  assert.match(registration, /bcrypt\.hash\(password, 12\)/);
  assert.match(adminCreate, /password_hash: await bcrypt\.hash\(password, 12\)/);
  assert.match(server, /MARKET_ADMIN_PASSWORD_HASH/);
  assert.match(server, /verifyConfiguredMarketAdminPassword/);
  assert.match(saveStore, /normalizeStoreSecrets\(store\)/);
  assert.match(server, /delete item\.adminPassword/);
  assert.match(server, /delete staffItem\.password/);
  assert.match(appClient, /function clientStorageUser[\s\S]{0,220}password_hash/);
  assert.match(appClient, /function clientStorageStore[\s\S]{0,220}adminPasswordHash/);
  assert.equal((server.match(/\.from\("stores"\)\s*\.upsert/g) || []).length, 1);
});

test("rendered user content is escaped and dangerous URL schemes are filtered", () => {
  assert.match(appClient, /function esc\(value\)[\s\S]{0,220}amp;[\s\S]{0,120}quot;/);
  assert.match(appClient, /function safeContentUrl[\s\S]{0,900}url\.protocol === "https:"/);
  assert.match(appClient, /function sanitizeRenderedHtml[\s\S]{0,1400}blockedTags/);
  assert.match(appClient, /name\.startsWith\("on"\) \|\| name === "srcdoc"/);
  assert.match(appClient, /root\.innerHTML = sanitizeRenderedHtml\(`/);
  assert.match(appClient, /innerHTML = sanitizeRenderedHtml\(`<div class="modal/);
  assert.match(adminClient, /function sanitizeAdminHtml[\s\S]{0,1400}blockedTags/);
  assert.match(adminClient, /name\.startsWith\("on"\) \|\| name === "srcdoc"/);
  assert.match(adminClient, /sanitizeAdminHtml\(renderSection\(\)\)/);
  assert.match(adminClient, /safeAdminContentUrl[\s\S]{0,900}url\.protocol === "https:"/);
  assert.doesNotMatch(appClient, /(?:eval|Function)\s*\(/);
  assert.doesNotMatch(adminClient, /(?:eval|Function)\s*\(/);
});

test("browser clients never connect directly to Supabase or fall back to the Render origin", () => {
  for (const client of [appClient, adminClient, textAdminClient]) {
    assert.doesNotMatch(client, /createClient\s*\(|SUPABASE_(?:ANON|SERVICE_ROLE)_KEY|\.from\(["'](?:profiles|sessions|orders|messages|app_settings)["']\)/);
    assert.doesNotMatch(client, /cerber-project\.onrender\.com/);
    assert.doesNotMatch(client, /supabase/i);
  }
  assert.match(appClient, /const PRIMARY_API_ORIGIN = "https:\/\/cerber\.vip"/);
  assert.match(adminClient, /const API_ORIGINS = \[API_ORIGIN\]/);
  assert.doesNotMatch(appClient, /onrender\.com|ltc1[ac-hj-np-z02-9]{8,87}/i);
  assert.doesNotMatch(server, /NOWPAYMENTS_LTC_WALLET\s*\|\|\s*["']ltc1/i);
});

test("visual marketplace cleanup never clears a confirmed client wallet balance", () => {
  const resetStart = appClient.indexOf("function applyVisualMarketplaceReset(next = {})");
  const resetEnd = appClient.indexOf("\nfunction normalizeDb", resetStart);
  const reset = appClient.slice(resetStart, resetEnd);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  assert.match(reset, /walletTransactions[\s\S]{0,250}\.filter\(isMarketplaceRecordAfterVisualReset\)/);
  assert.doesNotMatch(reset, /next\.(?:balances|ltcBalances)\s*=\s*\{\}/);
});

test("registration captcha survives Cloudflare proxy changes without weakening request rate limits", () => {
  const fingerprint = server.match(/function internalCaptchaFingerprint\(req = \{\}\) \{[\s\S]{0,500}?\n\}/)?.[0] || "";
  const clientAddress = server.match(/function clientIp\(req\) \{[\s\S]{0,500}?\n\}/)?.[0] || "";
  assert.match(fingerprint, /user-agent/);
  assert.doesNotMatch(fingerprint, /clientIp\(req\)/);
  assert.match(clientAddress, /cf-connecting-ip/);
  assert.match(clientAddress, /req\.ip/);
});

test("direct Render origin is closed while health and signed provider callbacks remain reachable", () => {
  assert.match(server, /const blockDirectRenderOrigin = isProduction/);
  assert.match(server, /directRenderHosts\.has\(requestHostname\(req\)\)/);
  assert.match(server, /const cloudflareOriginSecret = String\(process\.env\.CLOUDFLARE_ORIGIN_SECRET/);
  assert.match(server, /hasVerifiedCloudflareOrigin\(req\)/);
  assert.match(server, /directRenderHosts\.has\(requestHostname\(req\)\)[\s\S]{0,160}!verifiedCloudflareOrigin/);
  assert.match(server, /server\.on\("upgrade",[\s\S]{0,500}directRenderRequest && !verifiedCloudflareOrigin/);
  assert.match(server, /server\.on\("upgrade",[\s\S]{0,650}enforceCloudflareOriginSecret && cloudflareOriginSecret && !verifiedCloudflareOrigin/);
  assert.match(server, /pathname === "\/api\/health"/);
  assert.match(server, /"\/api\/payments\/nowpayments\/ipn"/);
  const connectDirective = server.match(/"connect-src[^\n]+/)?.[0] || "";
  assert.doesNotMatch(connectDirective, /onrender\.com|api\.telegram\.org/);
  assert.match(server, /configuredAllowedOrigins[\s\S]{0,260}productionPublicOrigins\.has/);
  assert.match(server, /trustedMediaOrigins[\s\S]{0,260}!directRenderHosts\.has/);
  assert.match(renderConfig, /BLOCK_DIRECT_RENDER_ORIGIN[\s\S]{0,80}value: "true"/);
  assert.match(renderConfig, /CLOUDFLARE_ORIGIN_SECRET[\s\S]{0,80}sync: false/);
});

test("legacy shared Supabase state is fail-closed and verification detects permissive access", () => {
  assert.match(legacyStateLockdown, /to_regclass\('public\.cerberus_state'\)/);
  assert.match(legacyStateLockdown, /enable row level security/i);
  assert.match(legacyStateLockdown, /force row level security/i);
  assert.match(legacyStateLockdown, /drop policy if exists/i);
  assert.match(legacyStateLockdown, /revoke all privileges on table public\.cerberus_state from public, anon, authenticated/i);
  assert.match(legacyStateLockdown, /grant all privileges on table public\.cerberus_state to service_role/i);
  assert.match(legacyStateLockdown, /revoke execute on all functions in schema public from public, anon, authenticated/i);
  assert.match(legacyStateLockdown, /revoke all privileges on schema public from public, anon, authenticated/i);
  assert.doesNotMatch(legacyStateLockdown, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
  assert.match(lockdownVerification, /role_table_grants/);
  assert.match(lockdownVerification, /coalesce\(qual/);
  assert.match(schema, /revoke all privileges on all tables in schema public from public, anon, authenticated/i);
});

test("repository ignores common secret, SSH and certificate formats", () => {
  for (const expected of [".env", "*.pem", "*.key", "*.p12", "*.pfx", "*.ppk", "id_rsa", "id_ed25519", ".ssh/", "secrets/"]) {
    assert.ok(gitignore.split(/\r?\n/).includes(expected), `${expected} must be ignored`);
  }
  assert.ok(gitignore.split(/\r?\n/).includes("!.env.example"));
});

test("the text administration entry point supports mandatory first-login MFA", () => {
  assert.match(textAdminClient, /payload\.requiresMfaSetup/);
  assert.match(textAdminClient, /\/api\/admin\/2fa\/setup/);
  assert.match(textAdminClient, /\/api\/admin\/2fa\/confirm/);
  assert.match(textAdminClient, /payload\.requiresMfa/);
  assert.match(textAdminClient, /\/api\/admin\/2fa\/verify/);
  assert.match(textAdminClient, /recoveryCodes/);
  assert.doesNotMatch(textAdminClient, /body: JSON\.stringify\(\{ login: form\.get\("login"\), password: form\.get\("password"\), totp:/);
});

test("admin realtime sends no data before database-backed MFA session validation", () => {
  assert.match(server, /client\.isAdminAuthenticated === true/);
  assert.match(server, /socket\.isAdminAuthenticated = false/);
  assert.match(server, /message\?\.type === "authenticate"/);
  assert.match(server, /account\.role !== admin\.role/);
  assert.match(server, /maxPayload: 16 \* 1024/);
  assert.doesNotMatch(adminClient, /new WebSocket\([^\n]+\["cerber-admin", token\]/);
  assert.match(adminClient, /send\(JSON\.stringify\(\{ type: "authenticate", token \}\)\)/);
});

test("disabled destructive marketplace endpoint contains no dormant deletion logic", () => {
  const route = routeBody("delete", "/api/admin/marketplace-data");
  assert.match(route, /status\(403\)/);
  assert.doesNotMatch(route, /\.from\("stores"\)\.delete/);
  assert.doesNotMatch(route, /marketplace_bulk_cleared/);
});

test("critical owner finance and repair routes require the owner role", () => {
  const criticalRoutes = [
    ["get", "/api/admin/payments/payout-config"],
    ["post", "/api/admin/users/:login/balance"],
    ["post", "/api/admin/orders/recover"],
    ["post", "/api/admin/orders/repair-missing"],
    ["put", "/api/admin/settings"],
    ["post", "/api/admin/withdrawals/owner"],
    ["post", "/api/admin/withdrawals/:id/status"]
  ];
  for (const [method, route] of criticalRoutes) {
    assert.match(routeBody(method, route), /requireOwnerAdmin\(req\)/, `${route} must be owner-only`);
  }
  assert.match(routeBody("post", "/api/admin/users/:login/balance"), /requestIdempotencyKey\(req, "Balance adjustment"\)/);
  assert.match(routeBody("post", "/api/admin/withdrawals/:id/status"), /controlled only by a verified provider callback/);
});

test("NOWPayments callbacks require HMAC, idempotency and trusted amount validation", () => {
  const paymentIpn = routeBody("post", "/api/payments/nowpayments/ipn");
  const payoutIpn = routeBody("post", "/api/payments/nowpayments/payout-ipn");
  assert.match(paymentIpn, /verifyNowpaymentsSignature\(req\)/);
  assert.match(paymentIpn, /rememberNowpaymentsIpn\(state, fingerprint, "payment"\)/);
  assert.match(paymentIpn, /validateProviderPayment\(req\.body, (?:deposit|order)\)/);
  assert.match(payoutIpn, /verifyNowpaymentsSignature\(req\)/);
  assert.match(payoutIpn, /rememberNowpaymentsIpn\(state, fingerprint, "payout"\)/);
  assert.match(payoutIpn, /validateProviderPayout\(req\.body/);
  assert.doesNotMatch(server, /amountLtcEstimate/);
  assert.match(server, /normalizePublicBaseUrl\(process\.env\.PUBLIC_BASE_URL, \{ production: isProduction \}\)/);
});

test("Telegram webhooks require a secret, serialize state changes and reject replayed updates", () => {
  for (const [method, route] of [
    ["post", "/api/site-notify-bot/webhook"],
    ["post", "/api/telegram/webhook"],
    ["post", "/api/telegram/mirror/:webhookId"]
  ]) {
    const body = routeBody(method, route);
    assert.match(body, /requireTelegramWebhookSecret\(req/);
    assert.match(body, /rememberTelegramWebhookUpdate\(state, req\.body/);
    assert.match(body, /update\.duplicate/);
  }
  const proverka = routeBody("post", "/api/proverka-bot/webhook");
  assert.match(proverka, /requireTelegramWebhookSecret\(req/);
  assert.match(proverka, /rememberTelegramWebhookUpdate\(state\.proverkaBot, req\.body/);
  assert.match(proverka, /update\.duplicate/);
  assert.match(server, /\/\^\\\/api\\\/telegram\\\/\(\?:wallet\|webhook\|mirror\)/);
});

test("the text administration page does not execute downloaded JavaScript", () => {
  assert.doesNotMatch(textAdminClient, /\bFunction\s*\(/);
  assert.doesNotMatch(textAdminClient, /\beval\s*\(/);
  assert.match(textAdminClient, /\/api\/cms-base-texts/);
  assert.match(server, /function readBaseTextCatalog\(\)/);
  assert.match(server, /Base text catalog contains a non-string entry/);
});

test("production errors and health responses do not expose internal exception messages", () => {
  assert.doesNotMatch(server, /В Supabase ещё не созданы таблицы/);
  assert.match(server, /error: Number\(error\?\.status \|\| 500\) === 504 \? "timeout" : "check_failed"/);
  assert.match(server, /let message = status >= 500 \? "Сервер временно недоступен"/);
  assert.doesNotMatch(server, /res\.status\((?:500|502|503)\)\.json\(\{ error: invoice\.message/);
  assert.doesNotMatch(server, /res\.status\((?:500|502|503)\)\.json\(\{ error: "(?:NOWPAYMENTS|TELEGRAM|SITE_NOTIFY|PROVERKA)_[A-Z_]+/);
});

test("production CORS and Host validation do not trust localhost", () => {
  assert.match(server, /!isProduction && localCorsOriginPattern\.test\(origin\)/);
  assert.match(server, /!isProduction && localHostPattern\.test\(value\)/);
  assert.doesNotMatch(server, /Access-Control-Allow-Credentials/);
});

test("financial background jobs use the cross-instance database lock", () => {
  assert.match(server, /async function processNowpaymentsWithdrawalPayout[\s\S]{0,500}withOperationLocks\([\s\S]{0,200}"finance:state"/);
  assert.match(server, /async function resumeQueuedWithdrawalPayouts[\s\S]{0,500}withOperationLocks\([\s\S]{0,200}"finance:state"/);
});

test("database migrations enforce private tables and per-admin 2FA state", () => {
  assert.match(migration, /create table if not exists public\.admin_accounts/i);
  assert.match(migration, /totp_secret_enc text/i);
  assert.match(migration, /recovery_code_hashes jsonb/i);
  assert.match(migration, /create or replace function public\.acquire_operation_locks/i);
  assert.match(`${schema}\n${migration}`, /force row level security/i);
  assert.match(`${schema}\n${migration}`, /revoke all privileges on table public\.admin_accounts, public\.operation_locks from public, anon, authenticated/i);
});

test("customer sessions are server-side, expiring and device-bound", () => {
  assert.match(server, /sessionTokenDigest\(token\)/);
  assert.match(server, /Date\.now\(\) - createdAt > userSessionTtlMs/);
  assert.match(server, /createBoundUserSessionToken\(req\)/);
  assert.match(server, /userSessionTokenMatchesRequest\(token, req\)/);
  assert.match(server, /secretValuesMatch\(parts\[2\], userSessionAgentFingerprint\(req\)\)/);
  assert.match(server, /from\("sessions"\)\.select\("login_key,created_at"\)/);
  assert.doesNotMatch(server, /from\("sessions"\)\.select\("login_key,created_at,user_agent"\)/);
  assert.match(server, /supabase\.from\("sessions"\)\.delete\(\)\.eq\("token", tokenDigest\)/);
});

test("ordinary profile lookup cannot disclose or grant an administrative role", () => {
  const profileLookup = routeBody("get", "/api/profiles/:login");
  assert.doesNotMatch(profileLookup, /role\s*:/);
  assert.match(server, /function publicUser\(row\) \{[\s\S]{0,120}\{ login: row\.login, name: row\.name \}/);
  assert.match(server, /function isGroupModeratorUser[\s\S]{0,240}return false/);
  assert.match(server, /Administrative authority is never derived from an ordinary customer/);
});

test("production test routes and repeated broadcast statistics are fail-closed", () => {
  const testDispute = routeBody("post", "/api/admin/disputes/test");
  assert.match(testDispute, /requireOwnerAdmin\(req\)/);
  assert.match(testDispute, /NODE_ENV === "production"/);
  const tracking = routeBody("post", "/api/broadcasts/:id/track");
  assert.match(tracking, /withOperationLocks\(\[lockKey\]/);
  assert.match(tracking, /if \(notification\[timestampKey\]\) return \{ recorded: false \}/);
  assert.match(tracking, /assertClientRateLimit\(req, "broadcast-track"/);
});

test("product reservations are bounded, idempotent and fail closed after expiry", () => {
  const reservation = routeBody("post", "/api/orders/product/deposit");
  assert.match(reservation, /activePositionReservation/);
  assert.match(reservation, /activePendingOrders\.length >= 5/);
  assert.match(reservation, /order\.stockReservedAt = Date\.now\(\)/);
  assert.match(server, /late_payment_inventory_unavailable/);
  assert.match(server, /Paid order requires manual review because its inventory reservation expired/);
});

test("expensive user actions have endpoint-specific anti-abuse limits", () => {
  const requiredScopes = [
    "support-ticket-create",
    "support-ticket-reply",
    "group-message",
    "private-message",
    "product-balance-purchase",
    "product-payment-reservation",
    "payment-invoice-create",
    "wallet-deposit-create",
    "wallet-withdrawal",
    "wallet-deposit-sync",
    "order-payment-sync"
  ];
  for (const scope of requiredScopes) assert.match(server, new RegExp(`assertClientRateLimit\\(req, "${scope}"`));
});

test("referral codes are server-owned and cannot be replaced by the client", () => {
  const claim = routeBody("post", "/api/referrals/claim-code");
  const browserGenerator = appClient.match(/function referralCodeFor\(login = db\.currentUser\)[\s\S]{0,400}?\n\}/)?.[0] || "";
  assert.match(claim, /ensureReferralCodeForState\(state, user\.login\)/);
  assert.match(claim, /!secretValuesMatch\(submittedCode, code\)/);
  assert.match(claim, /referral_code_override_rejected/);
  assert.doesNotMatch(claim, /state\.referralCodes\[key\]\s*=\s*(?:submittedCode|req\.body|code)/);
  assert.match(claim, /assertClientRateLimit\(req, "referral-code-sync"/);
  assert.match(server, /ensureReferralCodeForState[\s\S]{0,500}crypto\.randomBytes\(12\)/);
  assert.doesNotMatch(browserGenerator, /Date\.now|Math\.random|saveDb/);
  assert.match(appClient, /body: JSON\.stringify\(\{\}\)/);
});

test("registration cannot manufacture a referral owner from client hints", () => {
  const helperStart = server.indexOf("async function applyReferralRegistrationWithPrefixFallback");
  const helperEnd = server.indexOf("\nfunction authStateForUser", helperStart);
  const helper = server.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(helper, /Object\.entries\(state\.referralCodes\)/);
  assert.match(helper, /hintedOwner[\s\S]{0,120}!sameLogin/);
  assert.doesNotMatch(helper, /state\.referralCodes\[[^\]]+\]\s*=/);
  assert.doesNotMatch(helper, /\.from\("profiles"\)/);

  const registration = routeBody("post", "/api/auth/register");
  const login = routeBody("post", "/api/auth/login");
  assert.doesNotMatch(registration, /queuePendingReferralRegistration/);
  assert.doesNotMatch(login, /queuePendingReferralRegistration/);

  const pendingResolverStart = server.indexOf("function resolvePendingReferralsForLogin");
  const pendingResolverEnd = server.indexOf("\nfunction applyReferralReward", pendingResolverStart);
  const pendingResolver = server.slice(pendingResolverStart, pendingResolverEnd);
  assert.match(pendingResolver, /state\.referralCodes\?\.\[ownerKey\]/);
  assert.doesNotMatch(pendingResolver, /state\.referralCodes\[[^\]]+\]\s*=/);
});

test("anonymous state exposes only the public catalog contract", () => {
  const stateStart = server.indexOf("async function stateFor(user)");
  const authenticatedQueries = server.indexOf("const queriesStartedAt", stateStart);
  const publicRouteStart = server.indexOf('app.get("/api/state"', authenticatedQueries);
  const publicRouteEnd = server.indexOf('app.put("/api/state"', publicRouteStart);
  const anonymousState = [
    server.slice(stateStart, authenticatedQueries),
    server.slice(publicRouteStart, publicRouteEnd)
  ].join("\n");
  assert.ok(stateStart >= 0 && authenticatedQueries > stateStart && publicRouteEnd > publicRouteStart);
  for (const key of [
    "users",
    "messages",
    "orders",
    "referrals",
    "balances",
    "walletTransactions",
    "walletDeposits",
    "walletWithdrawals",
    "bots",
    "supportTickets",
    "blockedUsers",
    "ownerSettings",
    "paymentSettings"
  ]) assert.doesNotMatch(anonymousState, new RegExp(`\\b${key}\\s*:`), key);
  for (const key of ["stores", "exchangeCards", "exchangers", "groupSettings", "filters"])
    assert.match(anonymousState, new RegExp(`\\b${key}\\s*:`), key);
});

test("closing a dispute cannot forge a paid order", () => {
  const close = routeBody("post", "/api/orders/:id/dispute/close");
  assert.match(close, /!order\.disputeOpen/);
  assert.match(close, /order\.paymentStatus[\s\S]{0,120}!== "paid"/);
  assert.match(close, /unpaid_dispute_close_rejected/);
  assert.doesNotMatch(close, /order\.paymentStatus\s*=\s*"paid"/);
  assert.match(close, /assertClientRateLimit\(req, "dispute-close"/);
});

test("legacy order recovery cannot manufacture a paid order or settlement", () => {
  const repair = routeBody("post", "/api/admin/orders/repair-missing");
  const disabledAt = repair.indexOf("return res.status(410)");
  const legacyBodyUse = repair.indexOf("req.body", repair.indexOf("try"));
  assert.ok(disabledAt >= 0 && (legacyBodyUse < 0 || disabledAt < legacyBodyUse));
  assert.match(repair, /unsafe_order_repair_rejected/);

  assert.match(server, /paymentStatus: "review",\s*\n\s*paymentProvider: "recovered-unverified"/);
  assert.doesNotMatch(server, /paymentProvider: "recovered",/);
  assert.match(server, /async function ensureProductOrderSettlement[\s\S]{0,260}if \(paymentStatus !== "paid"\) return false/);
  assert.doesNotMatch(server, /if \(\["active", "completed", "closed", "paid"\]\.includes\(status\)\) \{\s*order\.paymentStatus = "paid"/);
  assert.match(server, /function storeSaleLedgerOrderFromMessage[\s\S]{0,220}Legacy chat messages are not cryptographic proof of payment[\s\S]{0,80}return null;/);
});

test("one-time clean launch reset preserves profiles and the site owner", () => {
  assert.match(server, /clean-marketplace-launch-2026-08-17-v168/);
  assert.match(server, /maintenance_\$\{cleanLaunchResetId\}/);
  assert.match(server, /await runCleanLaunchResetOnce\(\)/);
  assert.match(server, /runCleanLaunchResetOnce\(\{ force: true, finalize: true \}\)/);
  assert.match(server, /status: options\.finalize \? "completed" : "pending-final-pass"/);
  assert.match(server, /deleteAllRowsForCleanLaunch\("stores", "id"\)/);
  assert.match(server, /\.eq\("scope", "store"\)/);
  assert.match(server, /\.eq\("scope", "site"\)[\s\S]{0,120}\.neq\("role", "owner"\)/);
  assert.match(server, /deleteAllRowsForCleanLaunch\("audit_logs", "id"/);
  assert.match(server, /!Array\.isArray\(primary\?\.exchangeCards\)[\s\S]{0,100}!Array\.isArray\(backup\?\.exchangeCards\)/);
  const resetStart = server.indexOf("async function runCleanLaunchResetOnce");
  const resetEnd = server.indexOf("\nfunction compactSettingsData", resetStart);
  const resetBody = server.slice(resetStart, resetEnd);
  assert.doesNotMatch(resetBody, /deleteAllRowsForCleanLaunch\("profiles"|deleteAllRowsForCleanLaunch\("sessions"/);
  assert.doesNotMatch(resetBody, /from\("profiles"\)\.delete|from\("sessions"\)\.delete/);
});
