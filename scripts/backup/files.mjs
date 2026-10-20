// npm run backup:files : one encrypted archive of every file in the storage buckets (photos, documents, notices, diary, fee QR, logo).
// Monthly is enough. Needs the service key from .env.local (read only here; never printed). Writes only an encrypted file.
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { config, die, EncryptedFile, loadEnvHint, mb, requireOpenssl, requirePublicKey, rotate, stamp } from "./lib.mjs";

const cfg = config();
loadEnvHint();
requireOpenssl();
requirePublicKey(cfg);
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local.");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const objects = (await client.query("select bucket_id, name, coalesce((metadata->>'size')::bigint, 0) size from storage.objects where name not like '%.emptyFolderPlaceholder' order by bucket_id, name")).rows;
await client.end();

const file = new EncryptedFile(path.join(cfg.dir, `kchs-files-${stamp()}.enc`), cfg.publicKey);
const manifest = { format: 1, kind: "files", createdAt: new Date().toISOString(), files: [] };
let failed = 0, bytes = 0;
try {
  console.log(`Copying ${objects.length} files…`);
  for (const o of objects) {
    const { data, error } = await sb.storage.from(o.bucket_id).download(o.name);
    if (error || !data) { failed++; console.error(`  could not read ${o.bucket_id}/(file ${manifest.files.length + failed})`); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const entry = `files/${o.bucket_id}/${o.name}`;
    manifest.files.push({ bucket: o.bucket_id, path: o.name, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") });
    await file.entry(entry, buf);
    bytes += buf.length;
  }
  if (failed) throw new Error(`${failed} file(s) could not be downloaded, so no backup was kept. Run it again; if it keeps failing, tell your developer.`);
  await file.entry("manifest.json", Buffer.from(JSON.stringify(manifest)));   // last, so it lists exactly what is inside
  const done = await file.finish();
  const gone = rotate(cfg.dir, "files", cfg.keep);
  console.log(`\nDone: ${done.path}\n  ${manifest.files.length} files, ${mb(bytes)} of content, ${mb(done.bytes)} encrypted`);
  if (gone.length) console.log(`  removed ${gone.length} older archive(s); keeping the newest ${cfg.keep}`);
  console.log(`\nCopy the folder to Google Drive and to the external drive:\n  ${cfg.dir}`);
} catch (e) { file.abort(); die(String(e.message ?? e)); }
