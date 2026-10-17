# KCHS ERP

School ERP for **Krishna Chaitanya High School**, Yerraguntla (YSR Kadapa, Andhra Pradesh; AP State Board; Nursery to Class 10).
A Next.js 15 web app (installable as a PWA) on a Supabase (Postgres) database.

- **Staff logins only:** Admin and Teachers (with extra duties the Admin grants). Students and parents are data records, **not** users: there are no parent logins.
- **Modules built so far:** students, fees, timetable, attendance and leave, notices and diary (English and Telugu), exams and marks with report cards, plus performance and security work.
- Every rule about who may see what is enforced in the database (row-level security), then again in the app. Decisions are recorded in [DECISIONS.md](DECISIONS.md).

## Set up

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
npm run dev                    # http://localhost:3000
```

`.env.local` (never committed) needs, from the Supabase dashboard:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (**server only**, never in browser code) |
| `DATABASE_URL` | Connect → Session pooler (includes the database password) |
| `DEMO_USER_PASSWORD` | any password; given to the demo logins |
| `GEMINI_API_KEY` | Google AI Studio (optional: automatic Telugu translation, server only) |

Database changes are the files in `supabase/migrations/`; apply one with `npm run db:apply -- <file>`. Use the **development** project for all of this.

## Demo data (all dummy, wipeable)

```bash
npm run seed:demo           # staff logins, sections, subjects
npm run seed:demo-students  # ~60 dummy students
npm run seed:demo-bulk      # top up to 439 students (the school's real strength)
npm run seed:demo-exams     # exams and marks for Classes 6 to 10
```
Each has a matching `wipe:` script that removes only the demo rows.

## Tests

```bash
npm test                    # database + API tests, then UI tests
TEST_TODAY=2026-10-17 npm test   # pretend "today" is a Saturday (also try ...-18 Sunday, ...-19 Monday)
npm run test:db -- <part of a file name>   # a subset
```
Database tests run inside transactions that are always rolled back. API tests sign in as the demo users. Run the suite on a Saturday, a Sunday and a Monday clock before finishing a module.

## Real student data must never be committed

Never put real student or parent data (names, admission numbers, Aadhaar or other IDs, phones, addresses, photos, marks, fee records), exports of it, or any key or password into this repository. The demo data is generated and flagged `is_demo`. Real data goes in only through the app, after a security review, and only into the production database. `.env.local`, spreadsheets, CSV and PDF files are git-ignored on purpose; do not force-add them.
