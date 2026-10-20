# KCHS School ERP: standing rules for every session

Krishna Chaitanya High School ERP (Next.js 15 PWA + Supabase dev project `kchs-erp-dev`; never touch `kchs-school`). Staff logins only. Private GitHub repo `DileepReddyThupakula/kchs-erp`, branch `main`.

## How to work
1. **Save usage.** Keep reports short: results, anything wrong, what the owner must check. Do not repeat what the files already say.
2. **Questions for a new module go in ONE message**, each with 2-3 options explained simply and a recommended choice marked. Never one at a time.
3. **Tests:** run the full suite once per stage, on the Saturday clock only: `TEST_TODAY=2026-10-17 npm test`. Run the Sunday (`2026-10-18`) and Monday (`2026-10-19`) clocks only when the owner says it is a release check.
4. **Before every report:** a production build (`npm run build`: it refuses to run if a `.env.production*` file exists, because Next.js would load it and aim the build at the wrong project; the production settings file is `.env.kchs-production`) and the secret scan. **After any browser session:** `node --env-file=.env.local scripts/dev/check-demo-clean.mjs`.
5. **Browser-test only the roles affected by the change,** with temporary data that is removed afterwards (temporary duties, cards, certificates, years). Front the browser tab before clicking. Stop servers and delete helper scripts when done.
6. **If a command or test fails or hangs, make at most two more attempts,** use bounded commands (timeouts, `tail`, `head`), then stop and tell the owner what you found.
7. **`DECISIONS.md` is the source of truth.** Read it at the start of a session instead of re-deriving decisions. Record new decisions there in one commit.
8. **Commit and push at the end of each stage,** and confirm the repo is PRIVATE with `gh repo view --json visibility,url`. Commits are authored by the repo-level git identity already set; end every message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push only when the owner has asked for it for that stage.
9. **Never put secrets, keys or real student data** in files, logs, commits or reports. `.env.local` stays git-ignored. Demo data only until the security review is done. No Aadhaar or other government ID numbers in reports, logs, exports or cards.

## Rules that are easy to forget (details in DECISIONS.md)
- Admin, teacher and office roles only; students and parents are data, not logins. Fee data only for the Admin and office staff granted fee access, never teachers. Teacher scope (R18) applies everywhere.
- A migration is applied to dev only after its tests pass; an edited, already-applied migration file is not re-applied: add a new file. Test an unapplied migration with `TEST_PRE_MIGRATION=<file>`.
- Every new module: database first (functions, RLS, audit), then screens; a test for every permission rule at the database, API and screen level. Do not weaken an existing test.
- Reports, exports and prints are audit-logged; no WhatsApp or copy-share on any name list. Student-specific text is never sent to a translation service.
- Server actions files (`"use server"`) may export only async functions. Controlled React inputs need real typing in browser tests (setting `.value` does not update state).
