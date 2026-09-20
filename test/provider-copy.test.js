import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = server.search(new RegExp(`function ${name}\\(`));
  assert.notEqual(start, -1, `${name} must exist`);
  const next = server.slice(start + 1).search(/\n(?:async )?function [a-zA-Z]/);
  return server.slice(start, next < 0 ? server.length : start + 1 + next);
}

test("historical provider names are removed from displayed notifications and withdrawals", () => {
  const context = {
    publicImageForState: (value) => value,
    trustedContentUrl: (value) => value
  };
  vm.runInNewContext([
    "publicSiteNotification",
    "publicPaymentProviderCopy",
    "publicWithdrawalForState"
  ].map(functionSource).join("\n"), context);

  const notification = {
    id: "old-notice",
    title: "NOWPayments подтвердил выплату",
    body: "Повторите проверку в NOWPayments"
  };
  const withdrawal = {
    id: "old-withdrawal",
    payoutFailureMessage: "NOWPayments отклонил выплату",
    providerStatusCheckError: "NOWPayment API error"
  };

  const visibleNotification = context.publicSiteNotification(notification);
  const visibleWithdrawal = context.publicWithdrawalForState(withdrawal);
  assert.doesNotMatch(`${visibleNotification.title} ${visibleNotification.body}`, /NOW\s*Payments?/i);
  assert.doesNotMatch(`${visibleWithdrawal.payoutFailureMessage} ${visibleWithdrawal.providerStatusCheckError}`, /NOW\s*Payments?/i);
  assert.match(visibleNotification.body, /платёжный сервис/);
  assert.equal(notification.body, "Повторите проверку в NOWPayments");
  assert.equal(withdrawal.payoutFailureMessage, "NOWPayments отклонил выплату");
  assert.match(server, /walletWithdrawals\s*:\s*userWalletWithdrawals/);
  assert.match(server, /filter\(\(item\) => sameUser\(item\.login\)\)\.map\(publicWithdrawalForState\)/);
  assert.match(server, /siteNotifications:[^\n]*\.map\(publicSiteNotification\)/);
});
