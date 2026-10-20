// npm run backup:keygen : makes the key pair ONCE. The public key encrypts backups; the private key (locked with a passphrase) opens them.
// Uses Node's own cryptography: it works the same on every Mac (the Mac's built-in openssl is not needed).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { askSecret, DEFAULT_KEYS, die, lockPrivateKey } from "./lib.mjs";

const dir = process.env.BACKUP_KEYS_DIR || DEFAULT_KEYS;
const priv = path.join(dir, "private-key.kchskey");
const pub = path.join(dir, "public-key.pem");
if (fs.existsSync(priv) || fs.existsSync(pub)) die(`A key already exists in ${dir}. Never make a second pair by accident: backups made with one pair cannot be opened with another.`);
console.log("\nChoose a PASSPHRASE for the private key (at least 12 characters; a long sentence you will remember).\nWithout the passphrase AND the private key file, nobody (including you) can open the backups.\n");
const a = await askSecret("New passphrase: ");
if (a.length < 12) die("The passphrase must be at least 12 characters.");
if ((await askSecret("Same passphrase again: ")) !== a) die("The two passphrases are not the same. Nothing was made.");
console.log("\nMaking a 4096-bit key (a few seconds)…");
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 4096 });
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.writeFileSync(pub, publicKey.export({ type: "spki", format: "pem" }), { mode: 0o644 });
fs.writeFileSync(priv, lockPrivateKey(privateKey.export({ type: "pkcs8", format: "der" }), a), { mode: 0o600 });
console.log(`
Done. Two files are in ${dir}:
  public-key.pem        keep it here; the backup scripts use it (it is safe: it can only LOCK backups)
  private-key.kchskey   THE MASTER KEY (locked with your passphrase). Do this now, before anything else:
     1. copy it to two USB sticks (and write the passphrase on paper, kept in a different place)
     2. check each copy opens (docs/BACKUP.md, step 1)
     3. then DELETE private-key.kchskey from this Mac. Never put it in Google Drive, email, WhatsApp or the repo.
`);
