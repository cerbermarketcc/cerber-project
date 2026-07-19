# CERBER Security Audit

Дата: 2026-07-19

## Что проверено в первом проходе

- Серверные маршруты авторизации, регистрации, сессии пользователя.
- Общий чат, личные сообщения, сообщения обменникам и вложения.
- Выводы пользователя, магазина и владельца.
- NOWPayments IPN для оплат и payout-уведомлений.
- Заголовки безопасности, CORS, CSP и статическая раздача файлов.
- Блокировка пользователей через `blockedUsers`.

## Исправлено

1. Добавлен backend rate limit для чувствительных действий:
   - `/api/auth/register`
   - `/api/auth/login`
   - `/api/telegram/login`
   - `/api/group/messages`
   - `/api/private-messages`
   - `/api/exchangers/:id/messages`
   - `/api/wallet/withdrawals`
   - `/api/store-admin/withdrawals`
   - `/api/admin/withdrawals/owner`

2. Ужесточена проверка вложений:
   - разрешены только `png`, `jpg/jpeg`, `gif`, `webp` в data-url;
   - внешние вложения принимаются только по `https`;
   - локальные картинки разрешены только из `assets`;
   - SVG/HTML/javascript/data другого типа не проходят.

3. Добавлена защита NOWPayments IPN от повторной обработки:
   - каждый payment/payout callback получает fingerprint;
   - повторный полностью одинаковый callback возвращает `duplicate: true`;
   - журнал последних 500 IPN хранится в `app_settings.data.nowpaymentsIpnEvents`.

4. Добавлена защита выводов от дублей:
   - вывод магазина, владельца и пользователя получает `idempotencyKey` и `requestSignature`;
   - повтор одного и того же вывода в короткое окно возвращает существующую заявку;
   - это защищает от двойного клика и повторной отправки формы.

5. Подготовлена SQL-схема для следующего этапа миграции:
   - `orders`;
   - `wallet_deposits`;
   - `wallet_withdrawals`;
   - `ledger_entries`;
   - `payment_ipn_events`.

6. Новые пользовательские сессии теперь сохраняют источник:
   - IP;
   - user-agent.

7. Подтверждено, что заблокированные пользователи уже отсекаются:
   - при обычном логине;
   - при Telegram-логине;
   - при запросах с существующей сессией через `userFromRequest`.

## Что уже было сделано в проекте до этого прохода

- Есть security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP.
- CORS ограничен основными доменами проекта и onion-ссылками.
- Админский вход имеет отдельный rate limit и HMAC-token.
- Пароли пользователей и админов магазина хэшируются через bcrypt.
- NOWPayments IPN подпись проверяется через `x-nowpayments-sig`, если задан `NOWPAYMENTS_IPN_SECRET`.
- Выводы магазина считаются по ledger и удерживают деньги, если заказ в активном диспуте.

## Остаточные риски

1. Нужна миграция критичных сущностей из `app_settings.data` в отдельные таблицы:
   - `orders`
   - `walletDeposits`
   - `walletWithdrawals`
   - `ownerLedger`
   - `storeLedger`
   - `exchangers`
   - `reviews`

2. Нужны транзакции/locks для балансов и выводов.
   Сейчас добавлена защита от дублей на уровне текущего JSON-state, но полная защита от параллельных гонок требует переноса денег в SQL-таблицы и атомарных операций.

3. Нужна строгая server-side модель ролей для всех admin/store endpoints.
   Сейчас часть прав уже проверяется, но аудит должен пройти по каждому маршруту отдельно.

4. Нужна отдельная таблица audit logs с неизменяемыми событиями.
   Логи в JSON-state легче потерять при конфликте сохранения.

5. Нужна проверка реальной настройки NOWPayments:
   - Mass Payouts включены;
   - аккаунт NOWPayments approved;
   - outbound IP Render добавлены в whitelist;
   - `NOWPAYMENTS_IPN_SECRET` совпадает в Render и NOWPayments.

6. Нужна отдельная проверка Telegram webhooks:
   - webhook secret включен;
   - старые токены удалены из чатов/истории;
   - все mirror bots пишут в общую базу.

## Деплой и rollback

1. Перед деплоем:
   - проверить `SUPABASE_URL`;
   - проверить `SUPABASE_SERVICE_ROLE_KEY`;
   - проверить `NOWPAYMENTS_IPN_SECRET`;
   - проверить `NOWPAYMENTS_PAYOUTS_ENABLED`.

2. Деплой:
   - push в GitHub;
   - Render сам пересоберет сервис.

3. Smoke test после деплоя:
   - открыть `/api/config`;
   - войти в админку владельца;
   - отправить сообщение в общий чат;
   - создать тестовое личное сообщение;
   - проверить, что payout/withdrawal создается один раз.

4. Rollback:
   - в Render выбрать предыдущий successful deploy;
   - либо откатить Git commit и снова push.
