import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { telegramWebhookSecretValue, telegramRequest, existingOwnedMirror, findAdminMirror } from "../telegram-runtime.js";

test("webhook secrets preserve valid values and encode unsupported characters consistently", () => {
  assert.equal(telegramWebhookSecretValue(" abc_DEF-123 "), "abc_DEF-123");
  assert.equal(telegramWebhookSecretValue(""), "");
  for (const secret of ["123:secret", "secret with spaces", "a".repeat(257)]) {
    const normalized = telegramWebhookSecretValue(secret);
    assert.match(normalized, /^[a-f0-9]{64}$/);
    assert.equal(telegramWebhookSecretValue(secret), normalized);
  }
});

test("webhook setup honors Telegram retry_after and retries a transient failure", async () => {
  const delays = [];
  let calls = 0;
  const result = await telegramRequest("fake", "setWebhook", {}, {
    fetch: async () => ({ ok: ++calls > 1, status: calls === 1 ? 429 : 200,
      json: async () => calls === 1 ? { ok: false, error_code: 429, parameters: { retry_after: 2 } } : { ok: true, result: true } }),
    sleep: async (ms) => delays.push(ms)
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
});

test("invalid credentials are not retried; message sends are never blindly repeated", async () => {
  for (const [method, status] of [["setWebhook", 401], ["sendMessage", 500]]) {
    let calls = 0;
    await assert.rejects(telegramRequest("fake", method, {}, {
      fetch: async () => { calls++; return { ok: false, status, json: async () => ({ ok: false }) }; },
      sleep: async () => assert.fail("must not sleep")
    }));
    assert.equal(calls, 1);
  }
});

test("a client can own multiple mirrors without replacing an earlier bot", () => {
  const first = { token: "10:old", chatId: "7", ownerTelegramId: "7" };
  assert.equal(existingOwnedMirror([first], "11:new", "7"), undefined);
  assert.equal(existingOwnedMirror([first], "10:rotated", "7"), first);
  assert.throws(() => existingOwnedMirror([first], "10:old", "8"));
  assert.throws(() => existingOwnedMirror([], "10:rotated", "7", ["10:main"]));
  assert.throws(() => existingOwnedMirror([{ ...first, blocked: true }], "10:old", "7"));
});

test("admin actions target the selected mirror, not the first missing token field", () => {
  const bots = [{ id: "first", chatId: "7" }, { id: "second", chatId: "7" }];
  assert.equal(findAdminMirror(bots, { id: "second" }), bots[1]);
  assert.equal(findAdminMirror(bots, { id: "missing", chatId: "7" }), undefined);
  assert.equal(findAdminMirror(bots, {}), undefined);
});

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const mirrorHandler = source.slice(source.indexOf("async function handleBotMirrorCommand("), source.indexOf("async function handleTelegramMessage("));
const adminCollector = source.slice(source.indexOf("function adminCollectMirrorBots("), source.indexOf("function adminAudienceUsers("));

function mirrorHarness(failSave = false) {
  const state = { mirrorBots: [], chat: { loginKey: "client", login: "Client", linkedAt: 100 } };
  const events = [];
  let saved;
  const context = vm.createContext({
    crypto, console: { log() {}, error() {} }, process: { env: {} },
    telegramWebhookSecret: "test-secret", telegramBotToken: "99:main", siteNotifyBotToken: "", proverkaBotToken: "",
    existingOwnedMirror, telegramChatState: () => state.chat,
    botMirrorOnlyKeyboard: () => ({}), botMirrorCreatedKeyboard: () => ({}), botHtml: String,
    mirrorWebhookId: token => token.split(":")[0], mirrorWebhookUrl: token => `https://example.test/${token.split(":")[0]}`,
    telegramTokenApi: async (token, method) => {
      if (method === "getMe") return { result: { id: Number(token.split(":")[0]), username: "mirror" + token.split(":")[0] } };
      if (method === "getWebhookInfo") return { result: { url: `https://example.test/${token.split(":")[0]}` } };
      return { ok: true };
    },
    saveSettingsState: async value => { if (failSave) throw new Error("database unavailable"); saved = structuredClone(value); events.push("saved"); },
    appendAdminLog: async () => {}, maskSecret: () => "***", sanitizeErrorForLog: error => ({ message: error.message }),
    botSendMessage: async (_state, _chatId, text) => events.push(text)
  });
  vm.runInContext(mirrorHandler + "\n" + adminCollector, context);
  return { state, events, context, saved: () => saved,
    create: token => context.handleBotMirrorCommand(state, 7, { from: { id: 7, username: "client_tg", first_name: "Client" } }, token) };
}

test("mirror creation persists two bots with creator details before success and exposes both to owner admin", async () => {
  const h = mirrorHarness();
  await h.create("10:" + "a".repeat(25));
  await h.create("11:" + "b".repeat(25));
  assert.equal(h.saved().mirrorBots.length, 2);
  assert.equal(h.events[0], "saved");
  assert.match(h.events[1], /Зеркало сохранено/);
  const bots = h.context.adminCollectMirrorBots(h.saved());
  assert.equal(bots.length, 2);
  for (const bot of bots) {
    assert.equal(bot.createdByLogin, "Client");
    assert.equal(bot.createdByTelegram, "@client_tg");
    assert.equal(bot.createdByTelegramId, "7");
    assert.ok(bot.createdAt > 0);
    assert.equal(bot.webhookOk, true);
    assert.equal(bot.token, undefined);
  }
});

test("failed database save does not tell the customer the mirror was saved", async () => {
  const h = mirrorHarness(true);
  await h.create("10:" + "a".repeat(25));
  assert.equal(h.saved(), undefined);
  assert.equal(h.events.some(text => /Зеркало сохранено/.test(text)), false);
});

test("links bot answers start and bot-addressed start and resets pending token input", async () => {
  const fn = source.slice(source.indexOf("async function handleTelegramMirrorOnlyMessage("), source.indexOf("function findMirrorBotByWebhookId("));
  const chat = { pendingMirrorToken: true };
  const replies = [];
  const context = vm.createContext({ telegramChatState: () => chat, botMenuTextKey: text => text,
    telegramLinkCodeFromMessage: () => "", botMirrorHelpText: () => "help", botMirrorOnlyKeyboard: () => ({}),
    botSendMessage: async (_state, id, text) => replies.push([id, text]) });
  vm.runInContext(fn, context);
  for (const text of ["/start", "/start@cerberlinksbot"]) {
    await context.handleTelegramMirrorOnlyMessage({}, { chat: { id: 7 }, text });
  }
  assert.deepEqual(replies, [[7, "help"], [7, "help"]]);
  assert.equal(chat.pendingMirrorToken, false);
});

test("startup retries a failed webhook and refuses to overwrite the links bot with an auxiliary role", async () => {
  const fn = source.slice(source.indexOf("function startTelegramWebhookSetup("), source.indexOf("async function telegramTokenApi("));
  const statuses = {};
  const scheduled = [];
  const context = vm.createContext({
    telegramBotToken: "99:main", siteNotifyBotToken: "99:main", proverkaBotToken: "",
    process: { env: {} }, telegramWebhookSetupStatus: statuses,
    console: { log() {}, error() {} }, sanitizeErrorForLog: error => ({ message: error.message }),
    setTimeout: (fn, delay) => { scheduled.push({ fn, delay }); return { unref() {} }; },
    telegramTokenApi: async (_token, method) => ({ result: method === "getMe" ? { username: "cerberlinksbot" } : { url: "https://example.test/webhook" } })
  });
  vm.runInContext(fn, context);
  let attempts = 0;
  const setup = async () => { if (++attempts === 1) throw new Error("temporary failure"); };
  context.startTelegramWebhookSetup("links", "99:main", setup, "https://example.test/webhook");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(statuses.links.status, "retrying");
  assert.equal(scheduled.length, 1);
  await scheduled[0].fn();
  assert.equal(statuses.links.status, "configured");
  assert.equal(statuses.links.username, "cerberlinksbot");
  context.startTelegramWebhookSetup("notifications", "99:main", () => assert.fail("must not overwrite"), "https://example.test/other");
  assert.equal(statuses.notifications.status, "configuration_error");
});
