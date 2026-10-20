# Production project `kchs-erp-prod`: what is done, what you must set, what comes next

Project id `zxgvxtwtdevlezciymjf` (Mumbai, Free plan). The database was built from the 56 migration files only and is **empty**: no students, no staff, no logins, no demo data. The only rows are the app's reference data (grade bands, descriptive grades, remark bank, leave types, bell schedule, student form fields and document types, fee heads, certificate and ID-card templates and settings) and 99 automatic "inserted" lines in the audit log that the migrations wrote for those rows.
Production-only values live in `.env.kchs-production` (never in `.env.local`, GitHub or Vercel). Tools reach production only with `--production`.

## A. Set these in the Supabase dashboard (I cannot read or change them from here)
Dashboard layout changes from time to time: use the search box at the top if a name differs. Tick each box when done.

**Authentication**
- [ ] **Turn OFF public sign-up** ("Allow new users to sign up" / "Disable sign-ups"). It is **ON right now** (the project's public settings say `disable_signup: false`). Staff are created only by the Admin. *Most important.*
- [ ] **Minimum password length: 10** (the app already requires 10 and 72 at most when the Admin sets a password; this protects the other doors).
- [ ] **Leaked-password protection: ON** if the plan allows (it is a Pro-plan feature; on Free it stays off, so the app's 10-character rule is the only guard).
- [ ] **Session / JWT expiry**: leave the default 1 hour (3600 s) unless you decide otherwise; read the current value on the page and write it here: ________. Do not set it above 1 hour.
- [ ] **Rate limits** (Authentication → Rate limits): read the sign-in and token limits; write them here: ________. Lower the sign-in limit if it is high (the app has no limit of its own).
- [ ] **Site URL** and **Redirect URLs** (Authentication → URL configuration): the real address of the app once the domain exists; remove any `localhost` entry from production.
- [ ] **Email**: confirm "Confirm email" is ON; the app sends no email, so no SMTP is needed.
- [ ] **Other sign-in methods**: only Email is on (checked). Leave phone, anonymous and all social providers OFF.
- [ ] Optional later: Authentication → Attack protection (CAPTCHA). It needs a code change in the app; not done.

**Data API / Settings**
- [ ] Settings → Data API: **exposed schemas = `public` only** (the `app` schema must not be listed). Tables are not auto-exposed (you unticked it): this is fine because the migrations grant what the app needs; I compared every grant with dev and they are identical.
- [ ] Settings → Database → **SSL enforcement ON** (if offered).
- [ ] Settings → API keys: the **service_role key stays only on the server** (hosting variable, never in the browser, never in GitHub). If it was ever pasted anywhere else, reset it.
- [ ] Billing: the organization stays on **Free ($0)**; check no add-on was switched on by the create form.
- [ ] Storage: nothing to set; the 6 buckets and their rules came with the migrations (checked identical to dev).

## B. What I checked on production (all matched dev)
84 tables in `public` + `app` (88 with the login and file tables), row-level security on every one, 172 rules on the school's tables + 20 on file storage, 316 functions (same code), 187 triggers, every table, column, function and schema permission, default permissions, the 6 buckets (private/public, size and type limits), extensions, and the same answers from the public API for a signed-out visitor. The audit log refuses edit, delete and truncate (even by the owner) and refuses inserts from every API role. Advisor-style counts equal dev. *The Supabase advisor tool cannot see this project from here (no permission), so the dashboard's Security advisor (Advisors page) should be opened once by you: expect the same notes as dev (3 tables with no policy on purpose, the privileged-function notes, leaked-password protection).*

## C. What happens next (in this order; each is a separate task)
1. **First Admin account**: a one-time script on your Mac (asks for the email and a password; forces a password change at first sign-in). Nothing is created until you ask.
2. **First production backup** with the real keys: `npm run backup:db -- --production` (goes to `~/KCHS-Backups/production`), then `restore:check`.
3. **Hosting (Vercel)**: variables for production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), and the translation key if used. Region of the functions: Mumbai (`bom1`). Do not put dev values in the production environment.
4. **Domain** and HTTPS; then put it in Supabase Site URL (section A) and re-test the security headers (CSP) on the real address.
5. **Keep-alive**: change the GitHub variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the production project; watch it for a week.
6. **School set-up by the Admin**: school details, classes and sections, subjects, fee structure. Only then real students (R12: after the security review).

## D. Added later: login IDs, and dev is one migration ahead (2026-10-31)
- **Production is one migration behind dev** until go-live: `20261031000005_login_id.sql` (mobile number / username sign-in, the login-ID table, the lock). It has NOT been applied to production. When you say so, run: `npm run db:apply -- --all --production` (it asks you to type the last 4 letters of the project id). Then re-run the production comparison (tables will be 85 instead of 84).
- **Before deploying the app to production, make a `LOGIN_KEY_SECRET`** (long random value, different from dev) and put it in the hosting variables and in `.env.kchs-production`. Without it sign-in refuses to work.
- **Emergency Admin password reset** (only if the Admin has forgotten the password and nobody else can reset it): `npm run reset-admin-password -- --production` on your Mac. It asks for the project name, the Admin's login ID, and the new password twice (hidden). The Admin must then choose a new password at once.
- **The first Admin script (to be built) will recommend a real email** for the Admin.
- **File name:** the production settings file is `.env.kchs-production` (not `.env.production.local`: Next.js loads that name by itself). `npm run build` refuses to run if the unsafe name exists.

## E. GO-LIVE ORDER (final; each step only after the one before is done)
Tick each box. Names of settings only: values are never written here.

1. **[ ] Production database up to date.** `npm run db:apply -- --all --production --dry-run` shows exactly one file, `20261031000005_login_id.sql` (56 -> 57); you type APPLY in the chat; then it is applied and compared with dev. *(Status: dry run done and shown; waiting for your APPLY.)*
2. **[ ] Supabase dashboard settings** (section A above): sign-up OFF, minimum password length 10, rate limits read and noted, session expiry noted, leaked-password protection if the plan allows, only the Email provider on.
3. **[ ] Vercel project settings and variables** (sections F and G below), **Production environment only**.
4. **[ ] Deploy** the `main` branch to Production (the repo's `vercel.json` pins the server functions to Mumbai, `bom1`). Open the first deployment's logs and check the function region says Mumbai. Do NOT sign in yet.
5. **[ ] Domain**: add it in Vercel (Settings, Domains), set the DNS records Vercel shows, wait for HTTPS ("Valid Configuration").
6. **[ ] Supabase Site URL**: Authentication, URL configuration: Site URL = the real domain (https), Redirect URLs = the same domain only; remove any `localhost` entry.
7. **[ ] First Admin** (you, on your Mac, last on purpose so no unused login waits around): `npm run create-first-admin -- --production`. It asks for the project name (`kchs-erp-prod`), your full name, a login ID (**a real email is recommended**), the password twice (hidden). It refuses if an Admin already exists.
8. **[ ] Smoke test on the real domain**: (a) the sign-in page shows the school name and logo; (b) sign in as the new Admin with the password you typed; (c) you are sent to "Choose your own password": set your real one; (d) the dashboard loads; (e) Settings opens and saves a harmless change; (f) the audit log shows your sign-in and the password change, and your mobile number (if any) is masked; (g) sign out, then try a wrong password once: the same generic message; (h) public sign-up is closed: the address `https://<project>.supabase.co/auth/v1/signup` with the public key answers "signups not allowed" (ask me to test it); (i) the security headers are present (ask me to check).
9. **[ ] First backup**: `npm run backup:db -- --production` and `npm run restore:check` with your real key (docs/BACKUP.md); copy to Google Drive and the external drive.
10. **[ ] Keep-alive**: set the GitHub variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` to production; watch it for a week.
11. **[ ] Only then** the school set-up by the Admin, and real students (after the security review, R12).

## F. Vercel project `kchs-website`: settings to check or change
*I could not read this project (the Vercel connection has no access: error 403), so I cannot say which names it holds today. Open Vercel, project `kchs-website`, and check each line. Names only.*
- **Settings, Git**: connected repository is `DileepReddyThupakula/kchs-erp` (private), Production Branch is `main`. If `kchs-website` is a different, older site, create a NEW project for the ERP instead of reusing it.
- **Settings, General**: Framework Preset = Next.js; Root Directory = empty (the repo root); Build Command and Output Directory = default (do not override: the build runs the safety check automatically); Node.js version = 20.x or 22.x.
- **Settings, Functions**: Function Region = Mumbai (bom1). The repo's `vercel.json` already asks for `bom1`; if the plan does not allow it, the deployment shows an error and you set it here (decision PF6).
- **Settings, Environment Variables**, scope: **Production only** (untick Preview and Development on every line). **Delete** these names if they exist (they must never reach hosting): `DATABASE_URL`, `DEMO_USER_PASSWORD`, `KCHS_TRACE`, `NEXT_DIST_DIR`. **Replace** (do not keep the dev value) these names if they exist: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and any of `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, `AZURE_TRANSLATOR_ENDPOINT`, `GOOGLE_TRANSLATE_API_KEY`, `TRANSLATION_PROVIDER` that hold values from development. Any other name not in section G: remove it unless you know why it is there.
- **Preview and Development environments get NO production secrets.** Leave Preview and Development empty for every name in section G. (A preview then cannot sign in: that is intended. If you want previews to work, give them the DEVELOPMENT project's values, never production's.)
- **Settings, Deployment Protection**: turn on Vercel Authentication for Preview deployments, so nobody outside can open a preview.
- **Settings, Domains**: only the real domain (plus the automatic `.vercel.app` address).

## G. Hosting variable NAMES for Production (values from `.env.kchs-production` and the dashboards; never pasted into chat or the repo)
| Name | Needed | Sensitive in Vercel |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | no (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | no (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (server only) | **yes: mark Sensitive** |
| `LOGIN_KEY_SECRET` | yes (sign-in refuses without it) | **yes: mark Sensitive** |
| `TRANSLATION_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, `AZURE_TRANSLATOR_ENDPOINT`, `GOOGLE_TRANSLATE_API_KEY` | only the ones for the translation service you choose | keys: **yes, Sensitive** |
Not to be set in hosting: `DATABASE_URL`, `DEMO_USER_PASSWORD`, `KCHS_ENV`, `KCHS_TRACE`, `NEXT_DIST_DIR`. (Sensitive variables cannot be read back later: keep the values in `.env.kchs-production` and on paper.)
