-- Run once against an existing Supabase database before enabling permanent deposits.
-- The authoritative balance and payment ledger still live in app_settings;
-- these indexes add a second uniqueness check to the finance mirror.
create unique index if not exists wallet_permanent_address_coin_unique_idx
  on wallet_deposits (pay_currency, lower(data->>'payAddress'))
  where data->>'kind' = 'permanent_address';

create unique index if not exists wallet_permanent_address_seed_unique_idx
  on wallet_deposits ((data->>'seedPaymentId'))
  where data->>'kind' = 'permanent_address';
