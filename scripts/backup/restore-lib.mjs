// Reading a backup and putting it into a database. Used by the restore script and by the restore drill.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { decrypt, readTar } from "./lib.mjs";

const collect = async (it) => { const out = []; for await (const c of it) out.push(c); return Buffer.concat(out); };

/** Decrypts a database backup and returns its parts in memory. */
export async function readDbBackup(file, privateKey, publicKey) {
  const p = decrypt(file, privateKey, publicKey);
  const parts = {};
  await readTar(p.stdout, async (name, _size, chunks) => { parts[name] = await collect(chunks); });
  const code = await new Promise((r) => p.on("close", r));
  if (code !== 0 || !parts["manifest.json"]) throw new Error("The backup could not be opened. Wrong private key or passphrase, or the file is damaged.");
  return { manifest: JSON.parse(parts["manifest.json"].toString()), app: parts["app.dump"], data: parts["auth-storage-data.dump"], shape: parts["auth-storage-shape.dump"] };
}

export function run(cmd, args, { env, input } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => resolve({ code: 127, out, err: String(e.message) }));
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.on("error", () => {});
    p.stdin.end(input ?? undefined);
  });
}

/** pg_restore from memory. `skip` lists table-of-contents words to leave out (e.g. TRIGGER). Returns the error lines (a few are expected, see the drill). */
export async function pgRestore(buffer, env, extra = [], skip = []) {
  let list = [];
  if (skip.length) {
    const l = await run("pg_restore", ["-l"], { env, input: buffer });
    list = l.out.split("\n").map((x) => (skip.some((t) => new RegExp(`^\\d+; \\d+ \\d+ ${t} `).test(x)) ? ";" + x : x));
  }
  const args = ["--no-owner", ...extra];
  let tmp = null;
  if (skip.length) { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kchs-toc-")); const lf = path.join(tmp, "toc.list"); fs.writeFileSync(lf, list.join("\n")); args.push("-L", lf); }   // only names, no data
  try {
    const r = await run("pg_restore", [...args, "-d", env.PGDATABASE], { env, input: buffer });
    // "schema public already exists" is normal: every Supabase database has it
    return { code: r.code, errors: r.err.split("\n").filter((x) => /error/i.test(x) && !/schema "public" already exists|errors ignored on restore/.test(x)) };
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * Puts a database backup into `env`'s database.
 *  scratch = true : an empty throw-away database: first creates the Supabase roles and the auth / storage tables it needs.
 *  scratch = false: a NEW Supabase project (those already exist).
 * Order matters: login accounts first (staff rows point at them), then the school's tables.
 */
export async function restoreDb(parts, env, { scratch }) {
  const log = [];
  if (scratch) {
    for (const r of ["anon", "authenticated", "service_role", "authenticator", "supabase_auth_admin", "supabase_storage_admin", "dashboard_user", "supabase_admin"])
      await run("psql", ["-qc", `create role ${r} nologin`], { env });
    // what a Supabase project already has and the school's database relies on (only for the throw-away copy; a new Supabase project has all of it)
    await run("psql", ["-qc", `
      create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions;
      create extension if not exists pgcrypto schema extensions; create extension if not exists "uuid-ossp" schema extensions;
      create type storage.buckettype as enum ('STANDARD', 'ANALYTICS', 'VECTOR');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;
      create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '')::text $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;`], { env });
    // first only the tables: the storage ACCESS RULES (policies) call the school's own functions and use its own types (public.staff_duty, the app schema),
    // which do not exist yet, so they are left out here and restored in the last step. Any message left here is therefore a real one.
    const s = await pgRestore(parts.shape, env, [], ["TRIGGER", "POLICY"]);
    log.push({ step: "structure of the login and file-list tables", ...s });
  }
  const d = await pgRestore(parts.data, env, scratch ? ["--data-only", "--disable-triggers"] : ["--data-only"]);
  log.push({ step: "login accounts and the stored-file list", ...d });
  const a = await pgRestore(parts.app, env, []);
  log.push({ step: "the school's tables, functions, rules and permissions", ...a });
  // the file-storage rules (who may open which bucket) use the school's own functions, so they go in last; "already exists" for the tables is normal
  const r = await pgRestore(parts.shape, env, ["--schema-only"], ["TRIGGER"]);
  r.errors = r.errors.filter((e) => !/already exists|multiple primary keys/.test(e));
  log.push({ step: "the file-storage access rules", ...r });
  return log;
}

export const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
