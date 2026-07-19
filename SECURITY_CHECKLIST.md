# CERBER Security Checklist

Дата: 2026-07-19

## Закрыто сейчас

- [x] Rate limit на обычный логин.
- [x] Rate limit на регистрацию.
- [x] Rate limit на Telegram-логин.
- [x] Rate limit на общий чат.
- [x] Rate limit на личные сообщения.
- [x] Rate limit на сообщения обменникам.
- [x] Rate limit на вывод пользователя.
- [x] Rate limit на вывод магазина.
- [x] Rate limit на вывод владельца.
- [x] Фильтр опасных вложений в чатах и тикетах.
- [x] Фильтр опасных вложений в Telegram group helpers.
- [x] Fingerprint-журнал NOWPayments payment IPN.
- [x] Fingerprint-журнал NOWPayments payout IPN.
- [x] Idempotency/fingerprint для вывода пользователя.
- [x] Idempotency/fingerprint для вывода магазина.
- [x] Idempotency/fingerprint для вывода владельца.
- [x] SQL-заготовка таблицы `orders`.
- [x] SQL-заготовка таблицы `wallet_deposits`.
- [x] SQL-заготовка таблицы `wallet_withdrawals`.
- [x] SQL-заготовка таблицы `ledger_entries`.
- [x] SQL-заготовка таблицы `payment_ipn_events`.
- [x] Блокировка пользователя проверяется при логине.
- [x] Блокировка пользователя проверяется при запросах с активной сессией.

## Нужно сделать следующим проходом

- [ ] Применить `supabase-schema.sql` в Supabase SQL Editor.
- [ ] Перенести заказы из общего JSON-state в таблицу `orders`.
- [ ] Перенести выводы из общего JSON-state в таблицу `wallet_withdrawals`.
- [ ] Перенести пополнения из общего JSON-state в таблицу `wallet_deposits`.
- [ ] Добавить транзакционную обработку оплат и выводов.
- [ ] Добавить idempotency key на создание выводов со стороны клиента.
- [ ] Проверить каждый `/api/admin/*` маршрут на роль и права.
- [ ] Проверить каждый `/api/store-admin/*` маршрут на права staff.
- [ ] Разнести audit logs в отдельную append-only таблицу.
- [ ] Добавить отдельные лимиты на admin actions: блокировки, массовые рассылки, настройки.
- [ ] Сделать whitelist типов файлов не только в server.js, но и на уровне UI.
- [ ] Проверить все домены и onion-ссылки на один backend и одну Supabase-базу.
- [ ] Проверить Telegram webhook secret для основного бота и зеркал.
- [ ] Проверить, что Render env vars одинаковые на всех сервисах.

## Критичные env-переменные

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_BASE_URL`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `NOWPAYMENTS_PAYOUTS_ENABLED`
- `NOWPAYMENTS_EMAIL`
- `NOWPAYMENTS_PASSWORD`
- `NOWPAYMENTS_PAYOUT_2FA_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

## Проверка перед релизом

- [ ] `npm run build`
- [ ] `/api/config` отвечает 200.
- [ ] Владелец входит в админку.
- [ ] Магазин входит в админку магазина.
- [ ] Пользователь входит на сайте.
- [ ] Общий чат сохраняет сообщения по языковым комнатам.
- [ ] Личное сообщение видно отправителю и получателю.
- [ ] Диспут виден владельцу, клиенту и магазину.
- [ ] Сообщения диспута видны всем участникам.
- [ ] Закрытый диспут не принимает новые сообщения.
- [ ] Деньги магазина доступны к выводу только после закрытия/завершения заказа без активного диспута.
- [ ] NOWPayments IPN с неверной подписью получает 401.
- [ ] Повторный NOWPayments IPN не меняет баланс второй раз.
