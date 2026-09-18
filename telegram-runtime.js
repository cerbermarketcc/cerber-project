import crypto from "node:crypto";

export function telegramWebhookSecretValue(value) {
  const secret = String(value || "").trim();
  if (!secret || /^[A-Za-z0-9_-]{1,256}$/.test(secret)) return secret;
  // Telegram restricts header secrets, unlike bot tokens and general passwords.
  return crypto.createHash("sha256").update(secret).digest("hex");
}

const retryableMethods = new Set(["setWebhook", "getWebhookInfo", "getMe", "setMyCommands"]);

export async function telegramRequest(token, method, payload = {}, options = {}) {
  if (!token) throw new Error("Telegram bot token is not configured");
  const fetcher = options.fetch || fetch;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
      });
      const body = await response.json();
      if (!response.ok || body.ok !== true) {
        const error = new Error(body.description || `Telegram ${method} error`);
        error.status = Number(body.error_code || response.status);
        error.retryAfter = Number(body.parameters?.retry_after || 0);
        throw error;
      }
      return body;
    } catch (error) {
      const transient = !error.status || error.status === 429 || error.status >= 500;
      if (!retryableMethods.has(method) || !transient || attempt >= 2) throw error;
      await sleep(Math.max(1000 * (2 ** attempt), (error.retryAfter || 0) * 1000));
    }
  }
}

export function existingOwnedMirror(mirrors, token, ownerTelegramId, reservedTokens = []) {
  const botId = String(token).split(":")[0];
  if (reservedTokens.some((reserved) => reserved && String(reserved).split(":")[0] === botId)) {
    throw new Error("Нельзя подключить служебного бота как зеркало. Создайте отдельного бота в BotFather.");
  }
  const existing = mirrors.find((mirror) => String(mirror.botId || String(mirror.token || "").split(":")[0]) === botId);
  if (existing && String(existing.ownerTelegramId || existing.ownerChatId || existing.chatId) !== String(ownerTelegramId)) {
    throw new Error("Это зеркало уже привязано к другому владельцу.");
  }
  if (existing && (existing.blocked || existing.active === false || existing.verified === false)) {
    throw new Error("Это зеркало отключено администратором.");
  }
  return existing;
}

export function findAdminMirror(bots, input) {
  const id = String(input.id || "");
  if (id) return bots.find((bot) => bot.id === id || bot.webhookId === id);
  if (input.chatId) return bots.find((bot) => bot.chatId === String(input.chatId));
  return undefined;
}
