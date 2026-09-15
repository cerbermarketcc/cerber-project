import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import bcrypt from "bcryptjs";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const route = source.slice(source.indexOf('app.post("/api/auth/password"'), source.indexOf('app.post("/api/auth/logout"'));

async function request(user, body, databaseError = null) {
  let handler;
  let saved;
  let target;
  let failure;
  const response = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  vm.runInNewContext(route, {
    app: { post: (_path, callback) => { handler = callback; } },
    userFromRequest: async () => user,
    assertClientRateLimit() {},
    auditSecurityEvent() {},
    Buffer, bcrypt,
    supabase: { from(table) {
      assert.equal(table, "profiles");
      return { update(value) { saved = value; return { async eq(column, key) {
        target = [column, key]; return { error: databaseError };
      } }; } };
    } }
  });
  await handler({ body }, response, error => { failure = error; });
  return { response, saved, target, failure };
}

test("password change requires a customer session and rejects invalid passwords", async () => {
  assert.equal((await request(null, { newPassword: "new-password123" })).response.code, 401);
  assert.equal((await request({ role: "admin" }, { newPassword: "new-password123" })).response.code, 403);
  for (const newPassword of [null, 42, "short", "я".repeat(37)]) {
    const result = await request({ role: "user", login_key: "alice" }, { newPassword });
    assert.equal(result.response.code, 400);
    assert.equal(result.saved, undefined);
  }
});

test("password change hashes the new password and only updates the signed-in account", async () => {
  const result = await request({ role: "user", login: "alice", login_key: "alice" }, { newPassword: "new-password123", login: "bob" });
  assert.equal(result.response.body.ok, true);
  assert.deepEqual(result.target, ["login_key", "alice"]);
  assert.equal(await bcrypt.compare("new-password123", result.saved.password_hash), true);
  assert.equal(await bcrypt.compare("old-password123", result.saved.password_hash), false);
});

test("a failed password database write is not reported as success", async () => {
  const error = new Error("database unavailable");
  const result = await request({ role: "user", login_key: "alice" }, { newPassword: "new-password123" }, error);
  assert.equal(result.failure, error);
  assert.equal(result.response.body, undefined);
});
