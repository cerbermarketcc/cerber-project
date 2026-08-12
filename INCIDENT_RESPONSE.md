# CERBER Security Incident Response

## Immediate containment

1. Deploy the current `main` branch before reopening the site.
2. Run `supabase-incident-lockdown.sql` in Supabase SQL Editor. It preserves business data but revokes every existing user, shop, and staff password.
3. Rotate the Supabase service-role key and database password.
4. Rotate `MARKET_ADMIN_PASSWORD`, `ADMIN_TOTP_SECRET`, `ADMIN_JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `SELLER_ADMIN_SECRET`, `IP_HASH_SECRET`, and `CAPTCHA_SECRET` in Render.
5. Rotate NOWPayments API, IPN, payout credentials, email password, and payout 2FA secret. Keep payouts disabled until a controlled test succeeds.
6. Revoke and recreate all Telegram bot tokens and webhook secrets.
7. Force a clean Render deploy and confirm `/api/health` reports `incident-lockdown-2026-08-12-v156`.
8. Reset every shop panel password from the owner panel. Existing shop credentials and staff sessions are intentionally rejected by this build.

Automatic payouts are fail-closed during incident recovery. After credentials are rotated and a controlled payout succeeds, set `INCIDENT_PAYOUT_UNLOCK=reviewed-2026-08-12-v1` in Render. Until then, withdrawal requests remain recorded but cannot send funds.

## Investigation and recovery

1. Export Render logs, Supabase logs, NOWPayments history, Telegram webhook history, and audit logs before deleting anything.
2. Review unauthorized profile, store, wallet, payout, order, DNS, environment-variable, and webhook changes.
3. Restore changed records from a known-good backup, not from attacker-provided data.
4. Notify affected users that passwords and any exposed personal data must be treated as compromised.
5. Ask users to reset any password reused on another service.
6. Put every official domain behind Cloudflare with proxying, WAF managed rules, bot protection, rate limits, and DNSSEC.

## Deployment acceptance checks

- Anonymous `/api/state` contains no users, messages, orders, balances, wallets, payout data, or delivery items.
- Requests with an unapproved `Host` return HTTP 421.
- Requests from an unapproved browser `Origin` to `/api/*` return HTTP 403.
- Owner login requires login, password, and TOTP.
- Old owner, seller, and customer sessions no longer work.
- Supabase REST requests using the public anon key cannot select or modify protected tables.
- NOWPayments payouts remain disabled until IP restrictions and new credentials are confirmed.
