// Uploads a logo to the "branding" bucket and sets it as the School settings
// logo (same result as Settings → Logo → Upload). Optionally sets the motto.
//   npm run brand:set-logo -- public/brand/krishna-logo-original.png "Learn · Grow · Excel"
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("set-logo.mjs");

const [file, motto] = process.argv.slice(2);
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!file || !url || !key) {
  console.error("Usage: npm run brand:set-logo -- <image> [motto]   (needs Supabase URL + service key in .env.local)");
  process.exit(2);
}
const types = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const contentType = types[extname(file).toLowerCase()];
if (!contentType) throw new Error("Use a PNG, JPG, WEBP or SVG image");

const db = createClient(url, key, { auth: { persistSession: false } });
const path = `logo-${Date.now()}${extname(file).toLowerCase()}`;
const { error: upErr } = await db.storage.from("branding").upload(path, readFileSync(file), { contentType });
if (upErr) throw upErr;

const { data: current, error: readErr } = await db.from("school_settings").select("extra").eq("id", 1).single();
if (readErr) throw readErr;
const patch = { logo_path: path };
if (motto) patch.extra = { ...(current.extra ?? {}), motto };
const { error } = await db.from("school_settings").update(patch).eq("id", 1);
if (error) throw error;
console.log(`Logo set: branding/${path}${motto ? ` · motto: ${motto}` : ""}`);
