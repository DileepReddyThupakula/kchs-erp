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
