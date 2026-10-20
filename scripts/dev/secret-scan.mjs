// npm run scan:secrets : fails (exit 1) if anything staged for commit looks like a secret, a key, or a backup.
//   --all   also scan every tracked file
// Hook: .githooks/pre-commit runs this before every commit (git config core.hooksPath .githooks).
import { execFileSync } from "node:child_process";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const all = process.argv.includes("--all");

// file names that must never be committed: backups, encrypted archives, keys, environment files
const BAD_NAMES = [
  /(^|\/)kchs-(db|files)-[^/]*\.enc(\.sha256|\.partial)?$/i, /\.enc(\.partial)?$/i, /\.(pem|p12|pfx|key|kchskey|keystore|jks|age)$/i, /(^|\/)id_(rsa|ed25519|ecdsa)/,
  /^(KCHS-Backups|KCHS-Backup-Keys|backups?|backup-keys)\//i, /\.dump$/i, /\.(sql\.gz|bak)$/i, /(^|\/)\.env(\.(?!example$)[^/]*)?$/,
];
const PATTERNS = [
  ["a Supabase / JWT key", /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}/],
  ["a Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["a Supabase access token", /sbp_[a-f0-9]{30,}/],
  ["a Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["a database connection string with a password", /postgres(ql)?:\/\/[^\s:@]+:[^\s@]{4,}@/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["an encrypted backup (CMS)", /-----BEGIN CM[S]-----/],
  ["a GitHub token", /\b(ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/],
  ["an AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["a Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
];

const problems = [];
const files = (all ? git("ls-files", "-z") : git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")).split("\0").filter(Boolean);
for (const f of files) for (const re of BAD_NAMES) if (re.test(f)) { problems.push(`${f}: a backup, key or environment file must never be committed`); break; }

if (all) {
  for (const f of files) {
    if (f === "package-lock.json" || /\.(png|jpe?g|webp|ico|pdf|woff2?)$/i.test(f)) continue;
    let text; try { text = git("show", `:${f}`); } catch { continue; }
    if (text.includes("\0")) continue;
    for (const [what, re] of PATTERNS) if (re.test(text)) problems.push(`${f}: looks like ${what}`);
  }
} else {
  const added = git("diff", "--cached", "-U0", "--no-color", "--", ".", ":(exclude)package-lock.json").split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  for (const [what, re] of PATTERNS) if (added.some((l) => re.test(l))) problems.push(`staged changes contain what looks like ${what}`);
}

if (problems.length) {
  console.error("\nSECRET SCAN FAILED. Nothing was committed.\n" + [...new Set(problems)].map((p) => "  - " + p).join("\n") + "\n\nUnstage it (git restore --staged <file>) and remove the secret. If a real key was exposed, replace the key.\n");
  process.exit(1);
}
console.log(`secret scan: clean (${files.length} ${all ? "tracked" : "staged"} file${files.length === 1 ? "" : "s"} checked)`);
