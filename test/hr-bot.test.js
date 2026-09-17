import test from "node:test";
import assert from "node:assert/strict";
import { hrBotUpdate, hrUsername } from "../hr-bot.js";
const message = (id, text, user = 7) => ({ update_id: id, message: { chat: { id: user, type: "private" }, from: { id: user }, text } });
test("HR contact changes only after requesting a change, and survives subsequent updates", () => {
  let result = hrBotUpdate({}, message(1, "@IgnoredName"));
  assert.equal(result.state.username, "HRcerber");
  result = hrBotUpdate(result.state, message(2, "/change"));
  result = hrBotUpdate(result.state, message(3, "@NewContact"));
  assert.equal(result.state.username, "NewContact");
  assert.equal(result.state.pending[7], undefined);
  assert.equal(hrBotUpdate(result.state, message(3, "@OtherName")), null);
  assert.equal(hrBotUpdate(result.state, message(4, "/start")).state.username, "NewContact");
});
test("HR accepts any private user while isolating pending changes and validating names", () => {
  const state = hrBotUpdate({}, message(1, "/change", 12)).state;
  assert.equal(hrBotUpdate(state, message(2, "@NewContact", 15)).state.username, "HRcerber");
  assert.equal(hrBotUpdate(state, message(3, "@NewContact", 12)).state.username, "NewContact");
  for (const value of ["https://evil.example", "@abc", "@1abcde", "@<script>", "@" + "a".repeat(33)]) assert.equal(hrUsername(value), "");
});
test("HR rejects groups, replayed events and expired change prompts", () => {
  const group = message(1, "/change"); group.message.chat.type = "group";
  assert.equal(hrBotUpdate({}, group), null);
  const state = hrBotUpdate({}, message(2, "/change"), 1000).state;
  assert.equal(hrBotUpdate(state, message(3, "@NewContact"), 1000000).state.username, "HRcerber");
});
