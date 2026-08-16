# Cerber security hardening - 2026-08-16

## Production baseline

The deployed `index.html`, `app.js`, and `styles.css` from `cerber.vip`,
`cerber.to`, `cerber.love`, and `cerber-project.onrender.com` were compared with
Git commit `d6272fc`. After normalizing Git's CRLF working-tree conversion to
LF, every production asset matched `origin/main` byte-for-byte.

The repository in `C:\Users\user\Documents\New project` is the unrelated
`Eden1223232/edenmenu` project and was not modified. The production Cerber
repository is `cerbermarketcc/cerber-project`.

## Supabase findings

- The deployed browser clients do not contain a Supabase URL, anon key,
  service-role key, or calls to Supabase tables.
- `@supabase/supabase-js` is imported only by `server.js`; the service-role key
  is read only from the server environment.
- `public.cerberus_state`, the `cerberus-main` row, and permissive
  `using (true)` / `with check (true)` policies do not exist in the current Git
  tree or any fetched branch/history of this repository.
- `supabase-schema.sql` enables and forces RLS and revokes all table, sequence,
  function, and schema access from `PUBLIC`, `anon`, and `authenticated`.
- `supabase-legacy-state-lockdown.sql` was added as an idempotent production
  defense. If an old database still contains `public.cerberus_state`, it drops
  every policy and revokes all browser-role privileges while preserving data
  for server-side migration.
- `supabase-verify-lockdown.sql` reports browser grants and permissive policies.
  Both result sets must be empty.

### Identity model caveat

Current customer accounts are custom application accounts keyed by
`profiles.login_key`; they are not Supabase Auth users. Therefore `auth.uid()`
is not a valid ownership identity for the deployed application. The secure
current model is stricter at the database boundary: browser roles have no table
access, and `server.js` checks ownership before using the service role.

The database is not yet fully normalized by `owner_id`. Orders, deposits, and
withdrawals have `login_key`, while some legacy aggregate state remains in the
server-only `app_settings` JSON. Migrating that data requires a staged data
migration, reconciliation, and rollback plan; adding a fake `owner_id` policy
without Supabase Auth would not protect anything.

## Implemented changes

- Browser and owner-admin API fallbacks now use `https://cerber.vip`, never the
  public Render origin.
- Store/admin links remain on the domain currently opened by the operator.
- The CSP no longer allows browser connections or WebSockets to Render or the
  Telegram API.
- Production rejects normal traffic addressed directly to
  `cerber-project.onrender.com`. Only `/api/health` and signed NOWPayments /
  Telegram webhook endpoints are exempt.
- Optional `CLOUDFLARE_ORIGIN_SECRET` validation prevents direct-origin bypass
  with a forged Host header once Cloudflare injects the matching private header.
- Customer session lifetime is clamped to 1-168 hours and defaults to 24 hours.
- `.gitignore` covers environment files, private keys, SSH identities,
  certificates, keystores, VPN profiles, password vaults, and secret folders.
- `scripts/check-secrets.mjs` scans tracked and new non-ignored files without
  printing detected values.

## Manual production actions

### 1. Supabase

1. Create a fresh protected database backup and confirm restore access.
2. Open SQL Editor as the project owner.
3. Run `supabase-legacy-state-lockdown.sql` once.
4. Run `supabase-verify-lockdown.sql`.
5. Confirm both result sets contain zero rows. Stop if any grant or permissive
   policy remains.
6. In a later maintenance window, migrate remaining user balances and private
   aggregate fields out of `app_settings` into typed tables with immutable user
   identifiers. Do not expose those tables to browser roles.
7. If a Supabase service-role key was ever disclosed, rotate it in Supabase,
   replace only `SUPABASE_SERVICE_ROLE_KEY` in Render, redeploy, verify health,
   and revoke the old key. Never send that value in chat or commit it.

### 2. Cloudflare and Render origin lock

Do these steps in this order to avoid an outage:

1. Generate a new random value of at least 32 characters on the operator's
   machine. Do not store it in Git or send it in chat.
2. In each Cloudflare zone (`cerber.vip`, `cerber.to`, `cerber.love`), create a
   Request Header Transform Rule for proxied site traffic that sets
   `X-Cerber-Origin-Verify` to that value before the request reaches Render.
3. Confirm the rule is enabled on all three hostnames, including `www` if used.
4. Add the same value to Render as `CLOUDFLARE_ORIGIN_SECRET` and ensure
   `BLOCK_DIRECT_RENDER_ORIGIN=true`.
5. Redeploy. Verify all three domains, registration/login, admin MFA, uploads,
   payments, WebSockets, and webhooks.
6. Verify `https://cerber-project.onrender.com/` returns 404 while
   `/api/health` remains available for Render health checks.
7. Point NOWPayments and Telegram webhooks at a Cloudflare-proxied Cerber domain.
   The direct webhook exemptions can be removed after all providers are moved.

### 3. Telegram / BotFather

For every bot that may have been exposed:

1. Use BotFather to revoke the old token and issue a new one.
2. Replace the matching Render variable without copying it into source files:
   `TELEGRAM_BOT_TOKEN`, `PROVERKA_BOT_TOKEN`, or
   `SITE_NOTIFY_BOT_TOKEN`.
3. Generate new independent webhook secrets and replace the corresponding
   `*_WEBHOOK_SECRET` variables.
4. Redeploy and verify `getWebhookInfo`, webhook URL, pending update count, and
   a real test message.
5. Revoke first; deleting a token from Git does not invalidate it.

### 4. SSH / VPS

No private SSH key signature was found in the current tree or Git history, and
this repository contains no VPS inventory. On every actual VPS:

1. Generate a new key pair on a trusted machine.
2. Add only the new public key to the intended account's `authorized_keys`.
3. Verify a second SSH session before removing anything.
4. Remove old or unknown public keys, disable password login and root SSH where
   operationally possible, and review recent authentication logs.
5. Rotate provider/API credentials stored on that VPS and restart affected
   services.

### 5. Git history cleanup

The current worktree and fetched history produced no credential signatures, so
a destructive force-rewrite is not justified now. If a real secret-bearing
file or commit is identified later:

1. Revoke/rotate the secret first.
2. Make a protected backup of refs.
3. Use `git filter-repo` with the exact affected path or replacement rules.
4. Review the rewritten repository, then force-push all affected branches and
   tags with coordination.
5. Invalidate old clones and CI caches. History cleanup is not a substitute for
   secret rotation.

## Bearer-to-cookie migration plan

Customer and administrative bearer tokens are still kept in `sessionStorage`.
Moving them safely requires a coordinated rollout because the SPA currently
uses token presence for routing, uploads, WebSockets, and session restoration.

1. Add server support for short-lived `__Host-` prefixed HttpOnly, Secure,
   SameSite=Lax cookies while temporarily accepting existing bearer tokens.
2. Add a cryptographically random CSRF cookie and require a matching
   `X-CSRF-Token` header for every cookie-authenticated POST/PUT/PATCH/DELETE.
3. Change login, registration, MFA completion, logout, HTTP API, and WebSocket
   upgrade flows to use cookies with same-origin credentials. Never return the
   session secret in JSON.
4. Deploy updated clients, wait beyond the old asset/session lifetime, then
   remove bearer fallback and advance `SECURITY_TOKEN_EPOCH_MS`.
5. Apply the same migration separately to owner and store-admin sessions; test
   MFA setup, recovery codes, role changes, logout, and session revocation.
6. Add regression tests for CSRF rejection, cookie flags, login fixation,
   logout invalidation, cross-origin requests, and WebSocket origin checks.

This migration was intentionally not partially enabled in this change: mixing
cookie and bearer assumptions without updating every client gate would break
orders, admin panels, uploads, and realtime messaging.

## Verification performed

- Production asset hashes on all three domains and the Render origin.
- Git `origin/main` comparison and full fetched-history signature scan.
- JavaScript syntax/build checks.
- 42 Node security and regression tests.
- Secret scan over every tracked or new non-ignored version-control candidate.
- Static checks for browser Supabase access, RLS lockdown, origin bypass,
  administrative MFA, payment/webhook validation, and unauthorized access.

## Remaining risks

- The Cloudflare secret-header protection is inactive until the same new secret
  is configured in Cloudflare and Render.
- SQL migrations are not active until run in the production Supabase project.
- Bearer tokens remain in `sessionStorage` pending the coordinated cookie/CSRF
  migration above.
- Legacy aggregate state in `app_settings` is server-only but not fully
  normalized by immutable `owner_id`.
- Code review cannot verify Cloudflare account rules, Render environment values,
  Supabase backups, external VPS access, or whether provider tokens were exposed
  outside Git.
