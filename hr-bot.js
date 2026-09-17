export const defaultHrUsername = "HRcerber";

export function hrUsername(value) {
  const match = /^@([A-Za-z][A-Za-z0-9_]{4,31})$/.exec(String(value || "").trim());
  return match ? match[1] : "";
}

export function hrBotUpdate(current = {}, update = {}, now = Date.now()) {
  const message = update.message;
  if (!Number.isSafeInteger(update.update_id) || !message || message.chat?.type !== "private" || message.from?.is_bot) return null;
  const id = String(message.chat.id);
  if (!/^\d+$/.test(id) || String(message.from?.id) !== id) return null;
  const recent = Array.isArray(current.recent) ? current.recent : [];
  if (recent.includes(update.update_id)) return null;
  const pending = Object.fromEntries(Object.entries(current.pending || {}).filter(([, time]) => now - time < 15 * 60 * 1000));
  const state = { ...current, username: hrUsername(`@${current.username || ""}`) || defaultHrUsername, pending, recent: [...recent, update.update_id].slice(-256) };
  const text = String(message.text || "").trim();
  let reply;
  if (text === "/cancel") {
    delete pending[id];
    reply = "Изменение отменено.";
  } else if (text === "Сменить юзер на сайте" || /^\/change(?:@\w+)?$/.test(text)) {
    if (Object.keys(pending).length >= 1000 && !pending[id]) reply = "Попробуйте немного позже.";
    else { pending[id] = now; reply = "Отправьте новый Telegram username начиная с @. Например: @HRcerber\nОтмена: /cancel"; }
  } else if (pending[id] && !text.startsWith("/")) {
    const username = hrUsername(text);
    if (!username) reply = "Нужен username вида @HRcerber: 5–32 символа, латинские буквы, цифры и _. Начинается с буквы.";
    else {
      state.username = username;
      state.updatedAt = now;
      delete pending[id];
      reply = `Контакт изменён на @${username}.\nhttps://cerber.cc/hr`;
    }
  } else {
    reply = `Контакт на сайте: @${state.username}\nhttps://cerber.cc/hr\nНажмите «Сменить юзер на сайте», чтобы изменить его.`;
  }
  return { state, reply: { method: "sendMessage", chat_id: message.chat.id, text: reply, reply_markup: { keyboard: [[{ text: "Сменить юзер на сайте" }]], resize_keyboard: true } } };
}
