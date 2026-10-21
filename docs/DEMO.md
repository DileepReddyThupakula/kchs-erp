# The public demo site (for your portfolio and resume)

A **second Vercel project** built from this repo, pointing at the **development** Supabase project, which holds only dummy data. It is not the real school site (`kchs-erp.vercel.app`) and never touches production.

**What a visitor sees:** "Sample School" with a generic logo, a label "Demo with dummy data only", and on the sign-in page a "Try the demo" box: four roles (Admin, Teacher, Fee office, Front office), one click fills the login, the password is shown in the box (it is public on purpose).

**What is switched off in the demo:** every file upload (photos, documents, notice attachments, fee QR, logo; also blocked in the database for the demo logins), changing passwords, roles, duties, login IDs, deactivating staff, school settings. Translation keys are not set, so nothing can cost money. Search engines are told not to index it. It will not start if it sees the production project anywhere (build and start stop with "Demo site refused to start").

## One-time set-up in Vercel (your clicks)
1. vercel.com → **Add New → Project** → import `DileepReddyThupakula/kchs-erp` (allow access to the private repo if asked).
2. **Project name:** `kchs-erp-demo` (the address will be `kchs-erp-demo.vercel.app`). Leave Framework = Next.js and the build settings as they are.
3. Open **Environment Variables** and add exactly these names, **for Production only** (untick Preview and Development). Values come from your `.env.local` (the DEVELOPMENT project) unless stated:

| Name | Value | Sensitive |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `true` | no |
| `NEXT_PUBLIC_DEMO_PASSWORD` | the value of `DEMO_USER_PASSWORD` in `.env.local` | no (public on purpose) |
| `NEXT_PUBLIC_SUPABASE_URL` | the DEV project address (`.env.local`) | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the DEV anon key (`.env.local`) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | the DEV service key (`.env.local`) | **yes, Sensitive** |
| `LOGIN_KEY_SECRET` | a NEW long random value just for the demo: run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste the result; never reuse the dev or production one | **yes, Sensitive** |

   Do **not** add `DATABASE_URL`, any translation key (`GEMINI_*`, `AZURE_*`, `GOOGLE_*`, `TRANSLATION_PROVIDER`), or anything from `.env.kchs-production`. No production value may be in this project.
4. Click **Deploy**. (The repo's `vercel.json` puts the functions in Mumbai.)
5. **Settings → Deployment Protection:** make sure the production address opens **without a Vercel login** (test it in a private window). Recruiters must not hit a login wall.
6. **Supabase dev project → Authentication → Sign In / Providers:** switch **off** "Allow new users to sign up". The demo logins already exist and are not affected; this stops strangers creating accounts with the public anon key.
7. Smoke test on the live address: open the sign-in page (shows "Sample School" and the demo box), click **Teacher** → **Sign in** (dashboard loads, label at the bottom); sign in as **Admin**, open Staff → a person → "Set new password" (shows the "turned off in the demo" message); try to add a student photo (same message).
8. Put `https://kchs-erp-demo.vercel.app` on your portfolio and resume. (Not the production address.)

## Keeping the demo tidy
Run **`npm run demo:reset`** on your Mac (it refuses anywhere but the dev project) weekly and before you share the link. It re-creates the dummy data where missing, resets the demo exams and notices, sets every demo login's password to `DEMO_USER_PASSWORD`, and sets the school identity back to Sample School (no logo, phone, address, email, website, registration numbers, fictional UPI payee). It cannot delete fee receipts (gap-free numbers), so receipts a visitor creates stay; if you change `DEMO_USER_PASSWORD`, change `NEXT_PUBLIC_DEMO_PASSWORD` in Vercel to match and redeploy.

Known limits, said plainly: the demo logins end with `@demo.kchs.test` (the project's short name, not the school's name); ten wrong passwords on one login ID lock it for up to 15 minutes (a visitor can lock a demo login for others: wait it out); the development database is shared with your testing, so run the tests, not the demo reset, in quiet hours.
