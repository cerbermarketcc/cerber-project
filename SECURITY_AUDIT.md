# CERBER Security Audit

Дата повторной проверки: 2026-08-17

Ветка исправлений: `codex/security-audit-2fa`

Область: frontend, Node.js/Express backend, REST/WebSocket API, Supabase/Postgres, NOWPayments, Telegram webhooks, uploads, Render deployment и административные панели.

Аудит ориентирован на [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) и актуальный [OWASP Top Ten](https://owasp.org/www-project-top-ten/). Это не формальная сертификация ASVS и не заменяет внешний penetration test.

## Executive Summary

Исходное состояние содержало несколько критических архитектурных рисков: общие административные секреты без обязательной 2FA, слишком широкое доверие к клиентским финансовым данным, небезопасные legacy-пути восстановления заказов, недостаточную изоляцию Supabase, хранение токенов в браузере и возможность повторной обработки некоторых событий.

В ветке исправлений реализованы обязательная TOTP 2FA для всех административных ролей и обеих административных областей, серверная RBAC/IDOR-защита, проверка NOWPayments IPN, идемпотентность и межпроцессные финансовые блокировки, строгий публичный контракт данных, безопасная загрузка файлов, security headers, rate limiting, server-side sessions и regression tests.

Обычные клиенты не получили 2FA: регистрация и вход клиентов используют прежний flow с captcha и server-side session. 2FA применяется только к `owner`, `admin`, `manager`, `moderator`, `support`, владельцам магазинов и сотрудникам магазинов с административным доступом.

Кодовая ветка проходит build, 47 automated security tests, HTTP smoke checks и dependency audit без известных уязвимостей. Production нельзя считать защищённым этой версией, пока не выполнены обязательные внешние действия:

1. Применить `supabase-security-2fa.sql` в production Supabase.
2. Применить `supabase-auth-rate-limits.sql` для межпроцессной защиты административного входа.
3. Заменить все секреты, которые ранее попадали в Git, логи или скриншоты, затем отозвать старые сессии.

## Architecture

| Компонент | Реализация | Граница доверия |
|---|---|---|
| Frontend | `index.html`, `app.js`, `styles.css` | Полностью недоверенная среда; значения и запросы могут быть изменены пользователем |
| Owner admin | `market-admin.html`, `market-admin.js` | Полный доступ только после password + TOTP/recovery code |
| Text admin | `text-admin.html`, `text-admin.js` | Тот же обязательный MFA flow, включая первичную настройку |
| Store admin | Клиентский shop panel в `app.js` | Отдельная MFA-учётная запись владельца/сотрудника магазина |
| Backend | `server.js`, Express | Единственная доверенная точка проверки auth, RBAC, цены, баланса и статусов |
| Security core | `security-core.js` | TOTP, recovery codes, input bounds, payment validation, RBAC, upload validation |
| Database | Supabase/Postgres | Service-role доступ только у backend; private tables закрываются RLS/revokes |
| Payments | NOWPayments API/IPN/payout IPN | Доверие только после HMAC и сверки сохранённой операции |
| Bots | Telegram main/site/proverka/mirror webhooks | Secret header, replay protection, serialized state changes |
| Files | Supabase Storage | Только allowlisted media с magic-byte validation и generated object paths |
| Deployment | Render + Cloudflare/custom domains | HTTPS, strict Host/Origin allowlists, Node.js 22 |

### Основные trust boundaries

- Browser -> API: все IDs, цены, суммы, роли, статусы и user login считаются недоверенными.
- Provider -> webhook: payload считается недоверенным до проверки подписи и сохранённой операции.
- Public Supabase access -> DB: `anon` и `authenticated` не должны читать private tables.
- Admin challenge -> admin session: password challenge не является полноценной сессией и не принимается admin API.
- Store admin -> store objects: `storeId` берётся из проверенного MFA token, а не из тела запроса.

### Хранение сессий и секретов

- Customer session: случайный 32-byte token, в БД хранится только HMAC digest; production TTL 24 часа; обязательная привязка к User-Agent; logout удаляет запись.
- Admin session: HMAC token на 2 часа, `mfa: true`, device hash, credential/session version; аккаунт повторно проверяется в БД на каждом admin request.
- MFA challenge: отдельный purpose-bound token на 10 минут; не принимается `verifyAdminToken`.
- TOTP secret: отдельный для каждого администратора, AES-256-GCM encrypted at rest.
- Recovery codes: показываются один раз, в БД хранятся HMAC hashes, каждый код одноразовый.
- Browser: чувствительные bearer tokens удалены из `localStorage` и хранятся только в runtime/`sessionStorage`.

## API Inventory

Ниже приведена внутренняя карта всех типов маршрутов. Конкретные маршруты определены в `server.js`; шаблоны объединены только там, где auth/input/sensitivity одинаковы.

| Method | Endpoint / pattern | Auth | Role / ownership | Основной input | Sensitive data |
|---|---|---|---|---|---|
| GET | `/api/health` | Public | None | None | Только build/time |
| GET | `/api/config`, `/api/rates/ltc-usd`, `/api/cms-texts`, `/api/cms-base-texts` | Public | None | Query only | Только public config/text/rate |
| GET | `/api/state` | Optional bearer | Own user if present | Bearer | Anonymous получает только public catalog |
| GET | `/api/auth/captcha` | Public + rate limit | None | IP/device | Ответ captcha не раскрывается |
| POST | `/api/auth/register`, `/api/auth/login` | Captcha + rate limit | Customer only | Login/password/name/ref | Password никогда не возвращается/не логируется |
| POST | `/api/auth/logout`; GET `/api/session` | Customer bearer | Current session | Bearer | Own session/profile |
| POST | `/api/referrals/claim-code` | Customer bearer | Own account | Existing server code | Own referral state |
| POST/GET/PATCH | `/api/support/tickets*`, `/api/group/*`, `/api/private-messages*`, `/api/messages/:id` | Customer bearer | Own ticket/chat/message | Bounded text/media/action | Own messages and attachments |
| POST | `/api/exchangers/:id/messages`, `/api/exchangers/:id/reviews` | Customer bearer | Current user | Bounded text/rating | Public review/chat subset |
| GET | `/api/profiles/:login` | Customer bearer | Public profile only | Login path | Login/name/createdAt only |
| POST | `/api/orders/product/balance` | Customer bearer + idempotency + finance lock | Own balance | Store/product/position IDs | Server-derived price and own balance |
| POST | `/api/orders/product/deposit` | Customer bearer + idempotency + finance lock | Own order | Product IDs/currency | Server-derived price/payment request |
| POST | `/api/orders/:id/complete`, `/review`, `/dispute/*` | Customer bearer | Own order | Order ID/text/rating | Own order/dispute |
| POST | `/api/payments/*/create`, `/api/orders/payments/sync` | Customer bearer | Own order | Order ID | Provider reference, no secrets |
| POST/GET | `/api/wallet/deposits*`, `/api/wallet/withdrawals` | Customer bearer + finance lock | Own wallet | Bounded amount/currency/address | Own deposits/withdrawals/balance |
| POST | `/api/payments/nowpayments/ipn`, `/payout-ipn` | Provider HMAC | Matching stored operation | Signed provider JSON | Financial state |
| POST | `/api/telegram/webhook`, `/mirror/:id`, `/site-notify-bot/webhook`, `/proverka-bot/webhook` | Telegram secret | Matching bot | Telegram update ID/payload | Bot/private notification state |
| POST | `/api/admin/login` | Password + rate limit | Administrative roles only | Login/password | Returns MFA challenge, not session |
| POST | `/api/admin/2fa/setup`, `/confirm`, `/verify` | MFA challenge | Matching admin account/device | TOTP/recovery code | One-time QR/secret or full token |
| GET/POST/PATCH | `/api/admin/accounts*` | Full MFA admin | Owner for account management | Explicit allowlist | Admin metadata, no TOTP secret/hash |
| GET | `/api/admin/overview`, `/users/:login`, `/disputes/:id` | Full MFA admin | RBAC allowlist | Filters/path IDs | Role-filtered admin data |
| POST/PATCH/DELETE | `/api/admin/stores*`, `/exchangers*`, `/messages*`, `/support*`, `/broadcasts` | Full MFA admin | RBAC plus owner-only where critical | Explicit normalized fields | Administrative state |
| POST | `/api/admin/users/:login/balance`, `/orders/recover`, `/withdrawals*`, `/settings` | Full MFA admin | Owner only + finance lock/idempotency | Bounded amount/status/settings | Critical financial data |
| POST | `/api/store-admin/login` | Password + rate limit | Store owner/staff | Store/login/password | Returns MFA challenge only |
| POST | `/api/store-admin/2fa/setup`, `/confirm`, `/verify` | Store MFA challenge | Matching store account/device | TOTP/recovery code | One-time QR/secret or full token |
| GET/PUT/POST/PATCH/DELETE | `/api/store-admin/*` | Full store MFA | Token store ID + staff permissions | Explicit product/store/message fields | Current store only |
| GET | `/api/health/deep`, `/api/admin/db-diagnostics` | Full site MFA | Role allowlist | None | Sanitized diagnostics |
| POST/PUT | `/api/cms-texts` write | Full site MFA | Role allowlist | Safe text catalog | CMS content only |
| POST | `/api/translate`, `/api/broadcasts/:id/track` | Public + strict rate/idempotency | None/current notification | Bounded text/action | No account secrets |
| Any | Deprecated `/api/owner/*`, Telegram password login, restore-session and destructive legacy routes | Disabled | None | Ignored | `410/403`, no state mutation |

## Vulnerabilities Found

### SEC-001 - CRITICAL - Previously exposed credentials

- Affected: Git history, historical deployment configuration, screenshots and incident-era logs.
- Cause: long-lived provider/database/admin secrets were handled outside a strict rotation policy.
- Impact: database takeover, admin takeover, payout theft, Telegram bot takeover.
- Fix in code: secrets removed from frontend/current tree, sensitive static paths blocked, logs redacted, `.gitignore` added, sessions/version epoch can be invalidated.
- Remaining action: rotate every listed secret in `INCIDENT_RESPONSE.md`. A secret shown in a screenshot is compromised even if the screenshot was private.
- Test: current-tree secret pattern scan; static file blocking; log redaction regression tests.
- Status: **PARTIAL / PRODUCTION BLOCKER**.

### SEC-002 - CRITICAL - Administrative access without per-account mandatory MFA

- Affected: owner admin, text admin, store owner/staff admin, all `/api/admin/*` and `/api/store-admin/*` routes.
- Cause: shared/long-lived credentials and frontend-oriented protection.
- Impact: complete administrative takeover after one password leak.
- Fix: `admin_accounts`, per-account TOTP, encrypted secrets, one-use recovery codes, MFA challenge/full-session separation, DB revalidation, device binding, owner reset and session version invalidation.
- Tests: TOTP RFC compatibility, recovery code consumption, direct API denial, text-admin first-login MFA, customer auth separation, WebSocket pre-auth denial.
- Status: **FIXED IN CODE; DB MIGRATION REQUIRED**.

### SEC-003 - CRITICAL - Payment manipulation, replay and double credit

- Affected: NOWPayments creation/IPN/payout IPN, wallet credits, product orders and withdrawals.
- Cause: client/provider fields were not consistently tied to the server record; state updates lacked a cross-instance critical section.
- Impact: free products, duplicate credit, incorrect payout or double spending.
- Fix: server-derived product prices, HMAC verification, order/payment/currency/amount/address validation, replay fingerprints, idempotency keys, ledger IDs, atomic operation locks and provider-only payout completion.
- Tests: provider payment/payout mismatch tests, repeated webhook wiring, untrusted LTC estimate test, reservation/idempotency/race wiring.
- Status: **FIXED**.

### SEC-004 - CRITICAL - Legacy endpoint could manufacture a paid order

- Affected: `POST /api/admin/orders/repair-missing`, legacy order/message recovery helpers.
- Cause: arbitrary admin-supplied fields and chat history could be interpreted as proof of payment.
- Impact: fabricated balances, seller income and owner commission.
- Fix: dangerous endpoint returns `410` before reading request data; recovery produces `manual_review/review`; chat messages can never create settlement; settlement requires `paymentStatus === paid`.
- Test: `legacy order recovery cannot manufacture a paid order or settlement`.
- Status: **FIXED**.

### SEC-005 - HIGH - Broken access control / IDOR / excessive data exposure

- Affected: profiles, messages, orders, disputes, deposits, admin/store APIs and anonymous state.
- Cause: mixed client IDs and broad state payloads.
- Impact: horizontal data access, role escalation and bulk data leakage.
- Fix: ownership checks on backend, admin/store middleware, explicit RBAC route allowlist, token-derived store ID, restricted profile response and minimal anonymous catalog contract.
- Tests: anonymous contract, profile role isolation, admin MFA middleware, owner-only critical routes.
- Status: **FIXED**.

### SEC-006 - HIGH - Public Supabase access to private tables

- Affected: profiles, sessions, settings, messages, orders, finance, audit and admin account tables.
- Cause: insufficiently strict RLS/grants for a server-owned data model.
- Impact: bypassing backend authorization and mass data disclosure/modification.
- Fix: `FORCE ROW LEVEL SECURITY`, revoke from `public/anon/authenticated`, service-role-only admin/lock functions.
- Test: migration wiring assertions.
- Status: **FIXED IN MIGRATION; PRODUCTION APPLICATION REQUIRED**.

### SEC-007 - HIGH - Financial race conditions

- Affected: balance purchases, wallet withdrawals, payment reconciliation, payout queue and balance adjustments.
- Cause: JSON state read/modify/write could overlap across requests/instances.
- Impact: negative balance, duplicate purchase, duplicate payout.
- Fix: Postgres advisory-style operation lock table/RPC, global finance lock middleware, operation-specific idempotency and unique ledger/event IDs.
- Tests: concurrent-operation wiring and repeated operation regression tests.
- Status: **FIXED**.

### SEC-008 - HIGH - Unsafe uploads and active content

- Affected: store images/gallery, message/support attachments and broadcast images.
- Cause: MIME/extension or user path could be trusted.
- Impact: stored XSS, executable content, path overwrite and oversized payload DoS.
- Fix: allowlisted MIME, magic-byte verification, no SVG/HTML, bounded size/count, SHA/generated storage paths and server-trusted content URLs.
- Tests: valid image versus script/SVG payload; static traversal/secret path tests.
- Status: **FIXED WITH RESIDUAL HARDENING**.

### SEC-009 - HIGH - Referral owner forgery

- Affected: registration referral helper.
- Cause: client `referrerLogin` and unknown code could create/assign server referral ownership.
- Impact: stolen referral rewards and manipulated balances.
- Fix: only an already existing server-owned referral code can resolve an owner; client hint must match. New 96-bit random codes are generated only by the server; the browser no longer uses login/time/`Math.random()`.
- Tests: referral code ownership and manufactured referral registration regressions.
- Status: **FIXED**.

### SEC-010 - HIGH - Dispute/status could imply payment

- Affected: dispute close and order settlement helpers.
- Cause: non-payment lifecycle states were treated as sufficient proof of payment.
- Impact: settlement without provider confirmation.
- Fix: unpaid disputes cannot close into paid state; only verified `paid` orders settle.
- Tests: dispute close cannot forge paid order; legacy settlement regression.
- Status: **FIXED**.

### SEC-011 - HIGH - Admin WebSocket data before authentication

- Affected: realtime admin channel.
- Cause: socket connection itself was treated as sufficient authentication.
- Impact: live administrative data disclosure.
- Fix: first-message authentication, DB-backed MFA/session validation, no send before `isAdminAuthenticated`, 16 KB payload cap.
- Test: admin realtime authentication wiring.
- Status: **FIXED**.

### SEC-012 - HIGH - Legacy plaintext store panel passwords

- Affected: `stores.data`, staff records and `app_settings.ownerStores` fallback.
- Cause: historical schema stored `adminPassword/password` alongside hashes.
- Impact: credential disclosure after a DB read.
- Fix: bcrypt cost 12, plaintext fields removed at the central store persistence boundary, on every login and by startup migration for both primary rows and fallback state. The owner bootstrap supports `MARKET_ADMIN_PASSWORD_HASH`, so Render does not need to retain an open password after migration.
- Test: startup secret migration and all-store-write-path regressions.
- Status: **FIXED IN CODE; VERIFY AFTER DEPLOY**.

### SEC-013 - MEDIUM - Bearer tokens persisted in localStorage

- Affected: customer/admin/store browser sessions.
- Cause: persistent browser storage survives browser restarts and is easier to reuse after local compromise/XSS.
- Impact: session theft and replay.
- Fix: incident reset removes old keys; sensitive tokens use runtime/`sessionStorage`; server TTL/device/session version still enforced.
- Test: customer server-side session wiring and source scan.
- Status: **FIXED**.

### SEC-014 - MEDIUM - HTTP/CORS/static/error information leakage

- Affected: all HTTP routes and static serving.
- Cause: incomplete headers/Host checks and generic static root.
- Impact: clickjacking, source/config disclosure, unsafe cross-origin calls and internal error disclosure.
- Fix: strict Host/Origin allowlists, HSTS, CSP, DENY frame policy, nosniff, no-referrer, Permissions-Policy, blocked source/config/backup files and generic production errors.
- Tests: 19 HTTP smoke checks and wiring tests.
- Status: **FIXED**.

### SEC-015 - MEDIUM - Incomplete anti-abuse controls

- Affected: login, registration, MFA, messaging, translation, payment creation/sync and withdrawals.
- Cause: missing endpoint-specific limits and idempotency.
- Impact: brute force, credential stuffing, spam and provider/API exhaustion.
- Fix: separate account/IP lockouts, randomized failure delay, `Retry-After`, body limits, challenge TTL and idempotency keys. Site/store password and MFA failures are persisted atomically in Postgres; an in-memory limiter remains as fail-safe.
- Test: privileged account/IP lockout migration and route wiring; expensive-action rate-limit regression.
- Status: **FIXED IN CODE; `supabase-auth-rate-limits.sql` REQUIRED**.

### SEC-016 - MEDIUM - Dynamic JavaScript execution in text administration

- Affected: text catalog loader.
- Cause: downloaded application source could be evaluated to extract text.
- Impact: stored/admin XSS and arbitrary code in privileged origin.
- Fix: server-side safe catalog parser/API; no `eval`/`Function`.
- Test: text admin dynamic execution regression.
- Status: **FIXED**.

### SEC-017 - MEDIUM - Replayed bot/tracking events

- Affected: Telegram webhooks and broadcast statistics.
- Cause: repeated update/action could mutate state multiple times.
- Impact: duplicate messages/actions and falsified statistics.
- Fix: webhook secret, update ID replay cache, serialized state lock and per-notification one-time timestamps.
- Test: Telegram replay and broadcast tracking tests.
- Status: **FIXED**.

### SEC-018 - MEDIUM - Secondary admin entry lacked first-login MFA setup

- Affected: `/text-admin`.
- Cause: UI accepted an existing TOTP but could not enroll a new admin.
- Impact: operational lockout or pressure to weaken MFA.
- Fix: password -> setup/verify -> full token flow, QR/manual secret, recovery-code display; sensitive MFA responses are `no-store`.
- Test: text admin mandatory first-login MFA and cache-control regressions.
- Status: **FIXED**.

### SEC-019 - LOW - Missing source-control secret exclusions

- Affected: repository root.
- Cause: no `.gitignore`.
- Impact: accidental commit of `.env`, keys, dumps, logs or browser profiles.
- Fix: added `.gitignore` for secrets, backups, reports, caches and test artifacts.
- Test: current-tree secret scan and static denylist test.
- Status: **FIXED**.

### SEC-020 - MEDIUM - Public legacy admin hash disclosed the admin URL

- Affected: `/#admin`, `/#owner` in the buyer application.
- Cause: an unauthenticated legacy screen linked to the real administrative login page.
- Impact: no API authorization bypass, but unnecessary endpoint discovery and attack-surface disclosure.
- Fix: legacy hashes are no longer accepted as routes, their hash is cleared, and unauthenticated visitors return to normal customer authentication without an admin link.
- Test: public hash route disclosure regression.
- Status: **FIXED**.

### SEC-021 - HIGH - Incomplete DOM XSS defense in depth

- Affected: dynamic cards, chat attachments, modal content and URL-bearing attributes.
- Cause: output encoding was extensive but depended on every template call being correct; HTML escaping alone does not make a `javascript:` URL safe.
- Impact: session theft or privileged actions if a future stored/reflected injection reached an unsafe DOM sink.
- Fix: retained contextual escaping, added a centralized rendered-HTML sanitizer, blocked active tags/event handlers/`srcdoc`, allowlisted URL schemes, restricted inline style syntax and enforced `noopener noreferrer` for new windows.
- Test: dangerous scheme/tag/attribute wiring regression plus existing upload/CSP tests.
- Status: **FIXED WITH RESIDUAL TEMPLATE REVIEW RISK**.

## Admin 2FA Verification

| Scenario | Result |
|---|---|
| Existing owner: password -> TOTP -> admin session | PASS in code/tests |
| New admin: first login -> QR/manual secret -> confirm -> recovery codes -> session | PASS in code/tests |
| Wrong/reused TOTP | Rejected; atomic `last_totp_step` prevents replay |
| Recovery code | One use; hash removed and credential version rotated |
| Direct `/api/admin/*` with password challenge | 401 |
| Direct `/api/store-admin/*` with password challenge | 401 |
| Disabled/reset account with old session | 401 after version mismatch |
| Owner resets another admin/store admin 2FA | Implemented and logged |
| Store owner resets staff 2FA | Implemented and logged |
| Ordinary customer registration/login | No TOTP/QR/recovery flow |
| Text admin first login | Full setup/verify flow implemented |

## Security Checklist

| Area | Status | Notes |
|---|---|---|
| Authentication | PASS* | bcrypt, captcha, generic errors, persistent privileged limiter; `*` migration required |
| Admin 2FA | PASS* | `*` Requires production migration and first enrollment |
| Authorization | PASS | Backend deny-by-default middleware + RBAC + ownership |
| Sessions | PASS | HMAC digests/versioning/TTL/device binding/logout invalidation |
| API | PASS | Inventory reviewed; legacy mutation routes disabled |
| Payments | PASS | Server prices, provider validation and idempotency |
| Webhooks | PASS | HMAC/secret, replay protection, stored-operation matching |
| Race Conditions | PASS* | `*` Requires operation-lock migration in production |
| SQL Injection | PASS | Supabase query builder/RPC; no user-concatenated raw SQL found |
| XSS | PASS WITH RISK | Escaping/sanitization/CSP; extensive DOM templates remain review-sensitive |
| CSRF | PASS | Bearer-header model, no auth cookies, no credentialed CORS |
| SSRF | PASS | Outbound fetch hosts are fixed; no user-controlled URL fetch found |
| File Upload | PASS WITH RISK | Magic bytes/path/size; no AV scan or mandatory re-encode |
| Path Traversal | PASS | Generated object names and blocked static path classes |
| Secrets | FAIL UNTIL ROTATED | Current tree clean; historical/exposed values require provider rotation |
| Dependencies | PASS | Production audit: no known vulnerabilities on 2026-08-14 |
| HTTP Configuration | PASS WITH RISK | Strong headers; CSP still permits inline styles |
| CORS | PASS | Exact origins only; no credentialed wildcard |
| Logging | PASS | Security events with redaction; audit deletion disabled |
| Deployment | PENDING | Branch, migration and secret rotation not yet applied to production |
| Backup/Recovery | NOT VERIFIED | Backup exists at provider level, restore drill not performed |

## Tests Performed

### Automated unit/regression tests

- 47/47 passed with `node --test test/*.test.js`.
- TOTP Base32/RFC 6238 behavior and replay step.
- Recovery code entropy, hashing and one-time consumption.
- Payment/order/currency/amount/address mismatch rejection.
- Untrusted client LTC estimate rejection.
- Idempotency key validation.
- Upload MIME and magic-byte rejection for script/SVG payloads.
- RBAC, owner-only routes and administrative MFA middleware.
- Customer auth isolation from 2FA.
- Text-admin first-login MFA.
- WebSocket pre-auth denial.
- Public-state data minimization and profile role isolation.
- Referral forgery, dispute payment forgery and unsafe order recovery.
- Persistent admin/store account and IP lockouts, session lifecycle, error handling and migration wiring.
- Public admin hash removal, server-only referral generation, password persistence and DOM XSS regressions.

### Build and dependency checks

- `node --check` passed for `server.js`, `app.js`, `market-admin.js`, `text-admin.js`, `security-core.js`.
- Production dependency audit: no known vulnerabilities.
- Current-tree secret pattern scan: no literal provider/admin tokens found.
- Git history scan: historical sensitive configuration references found; rotation required.

### HTTP smoke checks

- 19/19 passed against a local production-mode server.
- Health and minimal anonymous state.
- Captcha answer absent from client token.
- Source and `node_modules` blocked.
- Unapproved Host/Origin blocked.
- Oversized body rejected.
- Admin/store/deep-health denied without full MFA session.
- MFA setup denied without password challenge.
- Legacy owner/Telegram password routes disabled.

### Not performed automatically

- No real payment, payout or destructive production request was sent.
- No production secret was read or printed.
- SQL migration was not applied automatically.
- No real Authenticator secret was generated for the owner by the audit process.
- No external black-box pentest, WAF test, phishing simulation or Supabase restore drill was performed.

## Remaining Risks

1. **Secret rotation is mandatory.** Replace Supabase service role/DB credentials, all admin/session/encryption secrets, NOWPayments API/IPN/payout credentials and TOTP secret, Telegram tokens/webhook secrets and Turnstile secret. Update Render atomically and revoke old sessions.
2. **Migrations must be applied.** Until `supabase-security-2fa.sql` and `supabase-auth-rate-limits.sql` are active, admin 2FA/operation locks and cross-instance brute-force protection cannot work safely.
3. **Backend still uses Supabase service role.** RLS blocks direct public access, but compromise of the Render service role remains high impact. A future architecture should move critical financial mutations into narrow SECURITY DEFINER RPCs and use a less privileged runtime role.
4. **Financial state is partly stored as a large JSON document.** Locks prevent concurrent mutation, but normalized transactional tables would provide stronger constraints and recovery.
5. **General non-privileged limits remain process-local.** Privileged password/MFA limits are Postgres-backed after migration; high-volume public endpoints still rely mainly on the current Render process and Cloudflare.
6. **CSP allows `style-src 'unsafe-inline'`.** Script execution remains restricted, but removing inline styles would strengthen CSP.
7. **Uploaded images are validated, not fully re-encoded.** Add image re-encoding/metadata stripping and malware scanning if uploads become higher risk.
8. **No formal backup restore test.** Verify encrypted Supabase backups and perform a documented restore drill.
9. **No customer password reset/email flow exists.** It was not added because the project does not currently implement those features and the user requested no client-auth redesign for 2FA.
10. **No security guarantee is absolute.** Monitoring, provider-side MFA, Cloudflare/WAF rules and periodic external testing remain necessary.

## Production Deployment Gate

Do not expose the new admin flow until all steps are complete:

1. Rotate compromised credentials listed in `INCIDENT_RESPONSE.md`.
2. Set strong unique values (minimum 32 random bytes) for `ADMIN_JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `SELLER_ADMIN_SECRET`, `CAPTCHA_SECRET` and `IP_HASH_SECRET`.
3. Set `SECURITY_TOKEN_EPOCH_MS` to invalidate all pre-incident customer/admin sessions.
4. Apply `supabase-security-2fa.sql`, then `supabase-auth-rate-limits.sql`, and verify RLS/revokes/RPC functions.
5. Keep `NOWPAYMENTS_PAYOUTS_ENABLED=false` until payment/payout smoke tests and provider whitelist settings pass.
6. Deploy this branch and confirm all domains report the same build.
7. Owner first login: enroll Authenticator and store recovery codes offline.
8. Confirm every existing owner/staff/admin account is forced through enrollment.
9. Run `SECURITY_SMOKE_URL=https://cerber.vip npm run test:security` without placing admin secrets in shell history.
10. Monitor failed logins, authorization denials, payment verification failures and payout manual-review events.

## Final Security Score

**86/100 for the remediated code branch.**

The score is intentionally below 100 because privileged service-role architecture, JSON financial state, some public process-local limits, upload re-encoding, backup recovery and external penetration testing remain unresolved. Current production should not inherit the 86/100 score until secret rotation, both SQL migrations, deployment and live verification are complete.

## Final Conclusion

Цикл `найти -> доказать -> исправить -> протестировать -> повторно проверить` выполнен для найденных code-level CRITICAL/HIGH проблем. Ветка собирается, security regression tests и HTTP smoke checks проходят. Остаточные production-блокеры не скрыты: секреты необходимо заменить у внешних провайдеров, а SQL-миграцию необходимо применить в Supabase до включения новой административной схемы.
