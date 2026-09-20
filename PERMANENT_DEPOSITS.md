# Permanent wallet deposits

The wallet page requests one NOWPayments pay-in address per customer and currency. Each
confirmed provider payment to that address receives a separate ledger record keyed by
the provider `payment_id`; the credited LTC and USD are calculated from the amount
actually received. The first payment and later repeated payments are handled the same
way. Product-order payments and older amount-specific wallet payments keep their
existing verification rules.

Until the feature flag and required NOWPayments credentials are present, the
website keeps the existing amount-specific top-up form and endpoint. Disabling
the flag later does not stop reconciliation of addresses already issued.

Before enabling this on a live account:

1. Confirm with NOWPayments that **Extra deposit auto processing / Repeated payments**
   is enabled for this account and the chosen currencies. Set the repeated-payment
   default to **Finished** and verify that a below-quote but above-minimum initial
   transfer also reaches `finished`.
2. Run `supabase-permanent-deposits.sql` in Supabase. Keep the existing
   `wallet_deposits.provider_payment_id` unique constraint.
3. Configure `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`,
   `NOWPAYMENTS_EMAIL`, `NOWPAYMENTS_PASSWORD`, and the public callback URL. Then set
   `NOWPAYMENTS_PERMANENT_DEPOSITS_ENABLED=true`.
4. In a provider test environment, send two separate transfers to the same address,
   replay each IPN, restart the server, and verify that each provider payment ID
   appears once in `wallet_deposits`, `wallet_transactions`, and the customer balance.

The `/api/wallet/deposits/sync` endpoint and background reconciliation check the
original payment's `payment_extra_ids`. When list API credentials are configured,
the background job also scans recent payments to recover missed IPNs.

The minimum acceptable transfer is set by NOWPayments and can change. A transfer
worth exactly $1 cannot be guaranteed if it is below that minimum or is rejected by
the provider. Never show an address as permanent until repeated-payment processing
has been confirmed for the live account. NOWPayments' terms place the risk of
reusing ordinary generated addresses on the merchant.
