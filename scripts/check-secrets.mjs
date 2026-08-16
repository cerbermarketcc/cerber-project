import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const candidates = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: root }
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const forbiddenNames = [
  /(^|\/)\.env(?:\..+)?$/i,
  /(^|\/)(?:id_rsa|id_ed25519|id_ecdsa|id_dsa)$/i,
  /\.(?:pem|key|p12|pfx|ppk|jks|keystore|ovpn|kdbx)$/i
];
const credentialPatterns = [
  ["private-key", /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/g],
  ["telegram-token", /\b\d{8,12}:[A-Za-z0-9_-]{30,60}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/g],
  ["aws-access-key", /\bAKIA[A-Z0-9]{16}\b/g],
  ["jwt-like", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g]
];
const findings = [];

for (const file of candidates) {
  const normalized = file.replaceAll("\\", "/");
  if (normalized !== ".env.example" && forbiddenNames.some((pattern) => pattern.test(normalized))) {
    findings.push({ rule: "sensitive-filename", file: normalized, line: 1 });
    continue;
  }
  let bytes;
  try {
    bytes = readFileSync(path.join(root, file));
  } catch {
    continue;
  }
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const [rule, pattern] of credentialPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ rule, file: normalized, line });
    }
  }
}

const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
for (const [index, line] of envExample.split(/\r?\n/).entries()) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match || !/(?:SECRET|PASSWORD|TOKEN|API_KEY|SERVICE_ROLE_KEY|ENCRYPTION_KEY)$/i.test(match[1])) continue;
  const value = match[2].trim();
  if (value && !/^<[^>]+>$/.test(value) && !/^(?:true|false)$/.test(value)) {
    findings.push({ rule: "unsafe-env-example", file: ".env.example", line: index + 1 });
  }
}

if (findings.length) {
  for (const finding of findings) {
    console.error(`${finding.rule}: ${finding.file}:${finding.line}`);
  }
  console.error(`Secret scan failed with ${findings.length} finding(s). Values were intentionally not printed.`);
  process.exit(1);
}

console.log(`Secret scan passed for ${candidates.length} version-control candidate files.`);
