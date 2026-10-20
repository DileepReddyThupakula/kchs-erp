// npm run backup:keygen : makes the key pair ONCE. The public key encrypts backups; the private key (with a passphrase) opens them.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DEFAULT_KEYS, die, requireOpenssl } from "./lib.mjs";

requireOpenssl();
const dir = process.env.BACKUP_KEYS_DIR || DEFAULT_KEYS;
const priv = path.join(dir, "private-key.pem");
const pub = path.join(dir, "public-key.pem");
if (fs.existsSync(priv) || fs.existsSync(pub)) die(`A key already exists in ${dir}. Never make a second pair by accident: backups made with one pair cannot be opened with another.`);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
console.log("\nYou will now be asked to choose a PASSPHRASE for the private key (twice). Use a long sentence you will remember.\nWithout the passphrase AND the private key file, nobody (including you) can open the backups.\n");
const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:4096", "-sha256", "-days", "36500", "-aes256", "-keyout", priv, "-out", pub, "-subj", "/CN=KCHS school backup"], { stdio: "inherit" });
if (r.status !== 0) { fs.rmSync(priv, { force: true }); fs.rmSync(pub, { force: true }); die("The key was not made."); }
fs.chmodSync(priv, 0o600);
console.log(`
Done. Two files are in ${dir}:
  public-key.pem   keep it here; the backup scripts use it (it is safe: it can only LOCK backups)
  private-key.pem  THE MASTER KEY. Do this now, before anything else:
     1. copy it to two USB sticks (and write the passphrase on paper, in a different place)
     2. check each copy opens (docs/BACKUP.md, step 1)
     3. then DELETE private-key.pem from this Mac. Never put it in Google Drive, email, WhatsApp or the repo.
`);
