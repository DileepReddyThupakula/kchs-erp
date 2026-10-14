# Decisions log

Everything here is a default or assumption I chose. Each item can be changed later. Most are
**admin settings, not code**. Items marked **⚠ VERIFY** need checking against your school's
official documents before go-live.

Last updated: 2026-10-12 (Module 1 + design pass + permission model v2)

---

## 1. Defaults you approved ("use default")

| # | Topic | Default | Where to change |
|---|---|---|---|
| D1 | Academic year | April 1 – March 31 (e.g. "2026-27") | Setup → Academic years |
| D2 | Fee heads | **Answered (F-section):** Tuition, Exam, Books + any custom head. **Transport is disabled** (no school buses). | Fees → Fee setup |
| D3 | Fee installments | **Answered (F-section):** One-time, Monthly, Custom plans; due on the 10th. | Fees → Fee setup |
| D4 | Report card format | One page per term: school header + logo, student details, scholastic marks table (each exam + total + grade), co-scholastic grades, attendance (working days / present incl. half days), class teacher remarks, result, signatures (class teacher, principal, parent) | Settings → Report card layout |

## 2. Your instructions turned into rules

| # | Rule |
|---|---|
| R1 | Board: **Andhra Pradesh State Board**. Classes Nursery → Class 10. |
| R2 | Every section has a **medium**. The list of mediums (default: English, Telugu) is in Settings, not code. |
| R3 | Exam names are fully admin-managed per academic year and class. Seeded defaults: **FA1, FA2, SA1, FA3, FA4, SA2**. All of them are editable or deletable. |
| R4 | Working days Mon–Sat. The **2nd Saturday of every month** is generated automatically as a holiday when an academic year is created. Admin adds other holidays. Default 8 periods/day (editable). |
| R5 | Student attendance is taken in **2 sessions** (morning, afternoon). Daily value: both = 1 day, one session = 0.5 day (half day), none = absent. |
| R6 | Aadhaar and other government ID numbers are encrypted at rest and shown masked (last 4 digits). Only Admin and Computer Staff can see the full number. They are never in the audit log (stored as `[REDACTED]`) or default exports. Only Admin can run the government data export. |
| R7 | Hosted Supabase dev project **`kchs-erp-dev`** (Mumbai, Free plan, $0/month), created 2026-10-11. The older project `kchs-school` (an earlier website/ERP build with its own data) was **left untouched and re-paused**. I ask before any command that creates or changes anything in Supabase. |
| R8 | School: **Krishna Chaitanya High School**, Yerraguntla, YSR Kadapa District, Andhra Pradesh. Curriculum: AP State. Classes Nursery–Class 10. Seeded as **real configuration** (`supabase/seed/school_config.sql`), not demo data. |
| R9 | **Medium is unconfirmed:** sections may have no medium. The Settings list (English, Telugu) is editable. |
| R10 | **No school buses:** the Transport fee head and transport fields are left out. |
| R11 | **Parent Aadhaar and the mother's bank account are NOT stored** until you confirm with the education office. If added later, they will be custom fields that are encrypted and **Admin-only**. |
| R12 | Real student records only after the security review. All student data in the demo set is dummy data. |
| R13 | **Permission model v2 (2026-10-12).** Two active roles: **Admin** (the owner, controls everything) and **Teacher**. `computer_staff` stays in the database for the future but nobody can assign it and the UI hides it. Teachers gain office work only through **duties** granted by Admin (`staff_permissions`; `has_duty()` in RLS and the same check in server code). All duties are off by default. Each grant and revoke is audit-logged. |
| R14 | Duties: `student_records`, `fee_collection`, `all_class_attendance`, `all_class_marks`, `notices_diary`, `timetable_edit`, `certificates_idcards`, `government_ids_view`. A duty gives exactly what the old Computer Staff role had for that module, nothing more. Without duties a teacher sees only their own classes and subjects. |
| R15 | **Always Admin-only:** users and duties, school settings, staff records, grading scale, teacher assignments, fee setup, locking/unlocking exams, cancelling receipts, deleting anything, audit log, government data export, staff leave approval. |
| R16 | Sections 2026-27: **one section "A" per class, English medium** (13 sections). Address: **Vempalli Road, Yerraguntla**. |
| R17 | **Plan additions:** certificates (TC, bonafide, study) and ID card printing go into **Module 2** (Students). Staff leave tracking goes into **Module 4** (Attendance). |
| R18 | **STANDING RULE: teacher scope. Every module must follow it, in RLS and in screens.** A teacher's sections are those where they are the class teacher or have any teacher assignment. A teacher may read only: those sections (and their class names), the subjects they personally teach there, their own assignments, the class teacher's name of their own sections, and (from Module 2) the students of those sections. A class teacher sees all students of their section but only the subjects they teach. School settings, academic years and holidays stay readable. **A duty overrides scope only for its own module** (e.g. fee_collection may look up any student for fees). Admin sees everything. Each module must add DB tests and an API test (`tests/api/`) proving a teacher cannot read outside their scope. Pages must call `requireCapability` / `requireTeacher` before loading data; blocked addresses show `/not-allowed`. |
| R19 | Teacher menu: Dashboard, My classes, My timetable (coming in Module 3), Holiday list, plus pages their duties allow. School setup pages (academic years, classes & sections, subjects, teacher assignments), Staff and School settings are **Admin-only**. |
| R20 | **Students (Module 2A, Part 1).** Students are never hard-deleted (no delete for anyone signed in); status `active / left / tc_issued / passed_out` and enrolment status are changed **only by Admin**. Teachers with `student_records` add, edit and import (incl. entering IDs, which they then see masked) but can't delete or change status. Section-wide duties (e.g. fee_collection) can look up any student's basic record only. Other teachers see only students enrolled in their own sections: name, admission no, class, roll no, guardian phone/address (plus gender, DOB, photo; see V4). Never government fields or IDs. |
| R21 | **Encrypted IDs:** Aadhaar, ration card number and UDID are encrypted at rest (pgcrypto; random key generated inside Supabase Vault, never in code). The UI shows masked values (last 4). Full value only via `reveal_student_secure_values()`: Admin, or `government_ids_view` for students the teacher can already see. Every reveal is audit-logged (field names only). The audit log stores `[REDACTED]` + last 4. Parent Aadhaar and bank details are not stored. |

## 3. Technical choices (mine)

| # | Choice | Why |
|---|---|---|
| T1 | **Module order adjusted:** (1) Foundation + Staff + School setup → (2) Students → (3) Timetable → (4) Attendance → (5) Fees → (6) Exams & marks → (7) Notices → (8) Reports → (9) Audit log screens | Sections need staff (class teacher), and attendance needs the timetable to know who marks each session. The audit log *mechanism* exists from module 1, so every change is logged from day one. |
| T2 | One school per database: settings are a single row | Simpler. Multi-branch is not in scope. |
| T3 | Role helpers live in a private `app` schema that the API does not expose | Supabase security recommendation |
| T4 | Students and staff are never hard-deleted. Their status changes instead (left / TC issued / inactive). | Keeps history and government records intact |
| T5 | The system blocks removing or demoting the **last active Admin** | Prevents lock-out |
| T6 | `staff_directory` view shows only name/designation/department of colleagues to all staff (teachers need it for timetables). Full staff records stay restricted. | Teachers can't see colleagues' phone/address/DOB |
| T7 | Permission tests are SQL files in `tests/db/`, run with `npm run test:db`. Each file runs in a transaction that is always rolled back, so tests never leave data behind. | Tests prove the database rules themselves |
| T8 | Demo logins use emails ending in `@demo.kchs.test`; `npm run seed:wipe` removes them and all demo data | Easy to tell demo data from real data |
| T9 | Afternoon attendance session = the teacher of the first period **after the period marked "lunch"** in the bell schedule | Lunch is identified explicitly, not guessed |
| T10 | Colleague names come from a `staff_directory()` function (name/designation/department only) rather than a view | The Supabase security advisor flags definer views |
| T11 | Supabase advisor warnings accepted on purpose: `public_branding()` callable before sign-in (school name and logo only, for the login page); `log_event()` and `staff_directory()` callable by signed-in staff | They expose nothing sensitive |
| T12 | The last-Admin guard applies to signed-in users only. Trusted scripts (seed:wipe, SQL editor) can remove demo admins. | Otherwise wiping demo data would be blocked |
| T13 | Seeds are split: `seed:school` (real config incl. sections, kept), `seed:demo` (dummy staff, 4 demo logins, duties, class teachers, subject assignments), `seed:wipe -- --yes` (removes demo rows only) | Real configuration survives a demo wipe |
| T14 | The dormant `computer_staff` role keeps its old Phase-1 access in RLS (= every duty), so the original tests still apply. Revisit if it's ever re-enabled. | Doesn't weaken existing tests |
| T15 | Teacher assignments: a teacher with `timetable_edit` can see all assignments (needed to build timetables); others see only sections they teach | Closest match to "old Computer Staff access for that module" |
| T16 | Duties can't be edited in place (revoke + grant only); `granted_by` / `granted_at` are always set by the database | Clean audit trail |
| T17 | Demo logins: `admin@`, `office@` (a **teacher** with fee_collection + student_records), `teacher1@`, `teacher2@` `demo.kchs.test` | Lets you test duties |
| T18 | Tests create their own mediums inside the rolled-back transaction | Tests no longer depend on live Settings |
| T19 | A second dev server (e.g. Claude's preview) uses its own build folder via `NEXT_DIST_DIR` | Never clobbers your `npm run dev` |
| T20 | Login motto is stored in `school_settings.extra.motto`, editable in Settings. The login page reads it server-side with a fixed single-field query until `public_branding()` returns it (planned for the Module 2 migration). | No database change in the design pass |
| T21 | Section-level duties (all except `government_ids_view`) let a teacher read every section, class and subject, because every duty module needs that reference data. Only `timetable_edit` also shows all teacher assignments. "My classes" and the teacher dashboard always filter to the teacher's own sections, even with duties. |
| T22 | `npm run test:db` also runs read-only API tests (`tests/api/*.mjs`) that sign in as demo users through Supabase, the same path the screens use. |
| T23 | **Site map = single source of truth** (`src/lib/site-map.ts`): every page's name, path, icon, menu group (Admin / Teacher), who may open it (Admin / all teachers / a duty), module and status. The sidebar, placeholder pages (shared component via a catch-all route) and the Admin Roadmap read it. When a module is built: add its real page file and flip `status` to `"built"`. Placeholders check permissions before rendering (otherwise `/not-allowed`). | One place to change |
| T24 | Government fields live in `student_field_definitions` (49 rows: label, group, type, options, pattern, required-for-government, sensitive). Values go in `student_profiles.details` (validated by a database trigger against the definitions); sensitive ones go in `student_secure_values` (encrypted). **New optional fields = a new row, no rebuild.** A new sensitive field is Admin-only unless `reveal_with_duty` is set. | Flexible, no code changes for new fields |
| T25 | Core student columns: admission no (auto `prefix + 0001` if blank), name, gender, DOB, admission date, address, village/town, district, pincode, photo, status. Class/section/roll live in `student_enrollments` (one per year; history kept). Parents/guardians in `guardians` + `student_guardians` (siblings share a guardian row). | — |
| T26 | Private storage: `student-photos` (teachers can see photos of their own students) and `student-documents` (Admin + student_records only). Path `<student_id>/<file>`. Downloads use short-lived signed links created server-side. Required document types: birth certificate, Aadhaar copy (editable). | — |
| T27 | Large migrations are applied with `npm run db:apply -- <file>` (one transaction, recorded in Supabase's migration history). Demo students: `npm run seed:demo-students` / `npm run wipe:demo-students -- --yes` (only `is_demo` rows; `seed:wipe` also runs it). | — |
| T28 | **Student screens (Part 2).** Students list (Admin + student_records): search name/admission no/phone; filters class, section, status, missing documents, missing required government fields, not enrolled; bulk Change section and Export selected; Export with a field picker (IDs always masked). "My students" (every teacher): own sections only, basic fields. Long add/edit form on its own page with jump links and a sticky Save bar; fields come from the definitions. Profile tabs: Overview, Family & siblings, Government details, Documents, Enrolment history, plus Attendance / Fees / Marks reserved. | — |
| T29 | `save_student()` saves core + enrolment + guardians + government fields + IDs **atomically**, used by both the form and the import. The import validates every row first, saves nothing until confirmed, skips admission numbers that already exist (safe re-run), and offers an error report to fix and re-upload. Import requires an admission number on every row. | No half-saved students |
| T30 | Government export (Admin): UDISE-style column order, IDs masked unless Admin ticks "full IDs" and confirms; every export is audit-logged (`export`, plus `student.ids_exported` for full IDs). Full IDs on the profile: "Reveal" (Admin / government_ids_view), shown for 60 s, logged. Documents open via 60-second signed links; each opening is logged. | — |
| T31 | Forms submit through a handler instead of the form `action` prop, because React 19 clears all typed values after an action runs, even when validation fails. | Long forms keep their values on errors |

## 4. ⚠ VERIFY before go-live

| # | Item | What I seeded |
|---|---|---|
| V1 | **Grading scale.** Check it against your school's official AP scale (it has been revised more than once, and pass marks differ for some subjects, e.g. Hindi). | A1 91–100 (GP 10), A2 81–90 (9), B1 71–80 (8), B2 61–70 (7), C1 51–60 (6), C2 41–50 (5), D 35–40 (4), E 0–34 (fail). Fully editable in Exams → Grading scale. |
| V2 | **Government student fields.** Check them against the current UDISE+ Student Data Capture Format and the AP Child Info form. | See section 5 |
| V3 | Exam weightage (how FA/SA combine into the final result) | Not decided yet. I'll ask in the Exams module. |
| V4 | **Student fields I'm unsure about. Please check:** (a) height/weight and PEN set as optional (PEN is issued by UDISE+ later); (b) AP caste categories OC/BC-A…BC-E/SC/ST and caste/sub-caste as free text; (c) the 21 RPwD impairment names; (d) language options Telugu/English/Hindi/Urdu/Sanskrit/Other; (e) Child ID has no format check; (f) identification mark 2 optional; (g) "Facilities received" without Transport/Escort (no buses); (h) ✅ Decided 2026-10-12: teachers **may see the DOB** (and gender, photo) of their own students. | Field definitions (editable by Admin) |
| S1 | **Subject list. VERIFY against our textbook list.** | Telugu, Hindi, English, Mathematics, Environmental Studies, Physical Science, Biological Science, Social Studies, General Awareness, Rhymes & Stories, Drawing |
| S2 | **Subjects per class. VERIFY against our textbook list.** | Nursery–UKG: English, Telugu, Mathematics, General Awareness, Rhymes & Stories, Drawing · Classes 1–2: Telugu, English, Mathematics · Classes 3–5: + EVS · Classes 6–10: Telugu, Hindi, English, Mathematics, Physical Science, Biological Science, Social Studies |
| S3 | **Co-scholastic areas (all classes). VERIFY against our textbook list.** | Art & Cultural Education, Work & Computer Education, Physical & Health Education, Value Education & Life Skills |

All of S1–S3 can be changed by the Admin in Setup → Subjects (add, rename, deactivate, re-link per class).

## 4b. Waiting on you

| # | Question | Blocks |
|---|---|---|
| ~~P1~~ | ~~Sections per class~~ **Answered:** A only, English (R16) | — |
| P2 | School details still blank: UDISE code, recognition details, email, website, logo, phone numbers. The dashboard reminds the Admin. | Nothing (fill in any time in Settings) |
| ~~P3~~ | ~~Fees questions~~ **Answered 2026-10-12** (F-section) | — |

## 4c. Real reference figures (stored in `supabase/seed/school_reference.json`)

- **Annual tuition (₹):** Nursery 8,250 · LKG 8,800 · UKG 8,800 · Class 1 9,350 · Class 2 9,900 · Class 3 10,450 · Class 4 10,450 · Class 5 11,000 · Class 6 11,550 · Class 7 12,100 · Class 8 13,200 · Class 9 15,400 · Class 10 20,000. These load into the fee tables in the Fees module.
- **Class strength (reference only, no student rows created):** Nursery 46, LKG 36, UKG 30, Class 1 32, Class 2 31, Class 3 28, Class 4 23, Class 5 16, Class 6 37, Class 7 46, Class 8 37, Class 9 40, Class 10 37. Total 439.
- **Staff:** 19 teachers and 1 ayah. The demo set mirrors these counts with dummy names.

## 5. Government student data: fields included

Sources: UDISE+ Student Data Capture Format (General, Enrolment and Facility profiles), AP Child Info
/ Student Info services, and the AP admission register / TC. Fields not listed here can be added
from the admin "custom fields" screen without code changes.

🔒 = encrypted at rest, masked in the UI, never logged, excluded from default exports.

**A. Identity**
1. Student name (as in school records)
2. Student name as per Aadhaar
3. Gender
4. Date of birth
5. 🔒 Aadhaar number
6. AP Child ID / Student ID (Child Info)
7. UDISE+ PEN (Permanent Education Number)
8. APAAR ID
9. Nationality
10. Blood group
11. Height (cm)
12. Weight (kg)
13. Identification mark 1
14. Identification mark 2

**B. Social profile**

15. Social category (UDISE): General / SC / ST / OBC
16. Caste category (AP): OC / BC-A / BC-B / BC-C / BC-D / BC-E / SC / ST
17. Caste
18. Sub-caste
19. Religion
20. Minority group (Y/N)
21. Mother tongue
22. BPL beneficiary (Y/N)
23. Antyodaya (AAY) beneficiary (Y/N)
24. Ration / rice card number
25. EWS / disadvantaged group (Y/N)
26. Annual family income

**C. Disability (CWSN)**

27. Child with special needs (Y/N)
28. Impairment type (RPwD Act categories)
29. Disability percentage
30. UDID / disability certificate number
31. Screened for SLD / ASD / ADHD
32. CWSN facilities received

**D. Parents / guardian**

33. Father: name, occupation, education, mobile. ~~Aadhaar~~: not stored (R11)
34. Mother: name, occupation, education, mobile. ~~Aadhaar~~: not stored (R11)
35. Guardian (if different): name, relation, mobile
36. Address
37. Pincode
38. Primary mobile
39. Alternate mobile
40. Email
41. ~~Mother's bank account~~: not stored (R11). Can be added later as an encrypted, Admin-only custom field.

**E. Enrolment**

42. Admission number
43. Admission date
44. Class, section, medium, roll number
45. Languages studied (1st / 2nd / 3rd)
46. Admitted under RTE 12(1)(c) (Y/N)
47. Status in previous year (same school / other school / Anganwadi-ECCE / not in school)
48. Class studied in previous year
49. Previous school name
50. Previous school UDISE code
51. TC number and TC date
52. Previous year result and % marks
53. Previous year days attended
54. Out-of-school child mainstreamed (Y/N)

**F. Facilities & other (UDISE Facility profile)**

55. Facilities received: free textbooks, uniform, transport, escort, hostel, bicycle, mid-day meal
56. Gifted / talented (Y/N)
57. Participated in competitions / Olympiads
58. NCC / NSS / Scouts & Guides
59. Can use digital devices (Y/N)
60. Internet access at home (Y/N)

Parent Aadhaar and the bank account were answered: not stored for now (R11).

## 6. Brand & design (design pass, 2026-10-11)

| # | Decision |
|---|---|
| B1 | Colours sampled from the logo: navy `#011a37`, gold `#e6a924`, cream `#fcf6ea`, peacock green `#177f16`; full scales in `src/app/globals.css` (single source). Warning amber, error red. |
| B2 | Contrast checked (WCAG AA) for every text and background pair used. Gold on white is 2.1:1, so gold is never used as text on white. |
| B3 | Role colours: Admin gold, Computer Staff navy (hidden), Teacher peacock green. |
| B4 | Fonts: Noto Sans + Noto Sans Telugu (Telugu names), Cinzel for the school name only. |
| B5 | Logo sits on a white circular badge with a gold ring on dark areas (artwork unchanged). Icons and favicons are generated by `npm run brand:icons`. The UI logo comes from School settings, with the bundled copy as a fallback. |
| B6 | **Design system (Job 1, 2026-10-12):** one reusable `DataTable` (search, filter chips, sorting, pagination, row selection + bulk bar, column show/hide remembered per browser, skeleton, CSV/Excel export of the filtered or selected rows); `PageHeader` with breadcrumbs, description, actions and a filter bar; editing in right-side drawers with grouped sections and a sticky Save/Cancel bar; confirmation dialogs (native `<dialog>`) for destructive actions; `StatusChip`. |
| B7 | **Every export is written to the audit log** (`action = export`, table, row count, format, filters). Excel files are made in the browser (`write-excel-file`, loaded only on export); CSV has a UTF-8 BOM so Telugu opens correctly in Excel. |
| B8 | Teacher assignments page: Admin edits; teachers see a read-only "My classes & subjects" view of their own sections (scope rule). The `/staff/new` page was replaced by the Add drawer (`/staff?new=1`). |

## 7. Fees (Module: Fees, Part 1, 2026-10-12)

| # | Decision |
|---|---|
| F1 | Monthly due day: **10th**, editable by Admin per plan (per year) and per installment. |
| F2 | **No late fee.** Reserved for later without a rebuild: `fee_heads.late_fee_rule`, `fee_receipt_items.fine_paise`. |
| F3 | Exam: **one-time** plan, amount **₹0 until Admin enters it** per class. Admin can create any custom head with any plan. |
| F4 | Books: **₹0 until Admin enters it** per class, one-time. |
| F5 | Mid-year joiners: **monthly plans charge from the joining month** (the annual amount is split over 12 months and only the remaining months are charged). One-time/custom plans are generated in full, and Admin reduces them with a **fixed concession + reason** (audit-logged). |
| F6 | **Default plans (my default, you didn't answer this one):** Tuition = Monthly, Exam = One-time, Books = One-time. Admin can change the default per class and override per student. |
| F7 | Money is integer **paise** everywhere. Equal monthly split: remainder in the **last** installment. Percentage plans: each share rounded down, remainder in the last. Percent concession: rounded down per installment. Fixed concession: taken from the **last** installment backwards. A concession never exceeds the unpaid part of a due. |
| F8 | Receipt numbers: `<prefix><financial year>/<0001>` (e.g. RCPT-2026-27/0001), per April–March financial year of the receipt date, **gap-free and unique even with simultaneous saves** (tested with 8 parallel connections). Receipts are never deleted; Admin cancels with a reason, dues go back to unpaid, the number stays visible as cancelled. |
| F9 | Payments go to the **oldest due first**, or to the dues chosen (oldest first among them). Paying more than is due is blocked. Only Admin can date a receipt other than today. Non-cash payments need a reference number. The collector is recorded on every receipt. |
| F10 | Dues are generated automatically on enrolment and whenever the fee structure, a student's plan, admission date or class changes. Regeneration never duplicates and never removes or reduces paid dues. On a plan change, unpaid dues of the old plan are voided (kept for history) and the rest of the annual amount moves to the new plan. |
| F11 | Access: Admin everything. **fee_collection** duty: read all fee data, collect, print. No changes to setup, amounts, plans, concessions; no cancelling. **Everyone else: no fee data at all**, even class teachers (RLS + API tests). |
| F12 | Demo: `npm run seed:demo-fees` / `npm run wipe:demo-fees -- --yes` (removes demo receipts, overrides, concessions and the demo "Three terms" plan, resets the receipt counter to the last real receipt). Real fee setup (tuition from `school_reference.json`) is kept. |
| F13 | **Special fees (campaigns):** each one gets its own fee head and its own plan (one-time with a due date, or custom installments by %). Amount: one for all, or per class. Who pays: all active students of the year, chosen classes, chosen sections or chosen students; the member list is stored, so later joiners are added only by Admin. "Apply existing concessions" is a choice at creation (default: no). Regular dues regeneration never touches special-fee dues. |
| F14 | Editing a special fee (amount / class amounts / one-time due date) changes **unpaid dues only**; part-paid and paid dues keep their amount and date. Cancelling voids unpaid dues only; paid dues and receipts stay; the head is deactivated. Only Admin, through functions (no direct writes); all audit-logged. |
| F15 | **Miscellaneous receipt** (Admin): any active fee head except a special-fee head, optional student or a payer name, same gap-free number series (tested with simultaneous saves), `kind = misc`, no due. Cancelled like any receipt. |
| F16 | **Fee screens (Part 2).** Fee setup (Admin) has four tabs: Amounts per class, Fee heads, Plans & schedules (per-installment due dates; custom plans by %), Special fees. Changes update unpaid dues only. "Recalculate dues" rebuilds a year safely. Concessions (Admin) per student, one head or all, with a reason. |
| F17 | **Receipt printout = print page, not a generated PDF file.** `/print/receipt/<id>` is a clean A4/A5 page (logo, school name and address, number, date, student, class, items, amount in words, mode and reference, collected by); the browser's "Save as PDF" makes the file. Reason: Telugu names and the logo print correctly this way. Originals (straight after collecting) say "Original"; every reprint says **Duplicate copy** and is audit-logged. Cancelled receipts print with a CANCELLED watermark. No refund-policy wording is printed (you haven't given one). |
| F18 | **Double-click protection** on Collect fee and Miscellaneous receipt: the button locks at once, and the server returns the receipt just made if the identical payment (same student, amount, mode, reference) arrives within 15 seconds, instead of creating a second one. |
| F19 | Collect fee: search by name, admission number or phone; tick dues to pay only those (otherwise oldest first); amount can be partial but never above what is due; Admin also sees "Miscellaneous receipt" (pick or create a fee head). |
| F20 | **Fee reports** is a new page under Fees (Admin + fee_collection duty): daily collection or any date range, totals by payment mode, fee head (special fees marked) and day, with the receipts list and Excel/CSV export. Cancelled receipts are listed but not counted. |
| F21 | The student profile **Fees tab** shows only to Admin and the fee_collection duty (dues across years, receipts, Collect button); other teachers don't see the tab. |
| T32 | **DataTable must never loop** (bug 2026-10-12: /fees/setup froze, "Maximum update depth exceeded"). Cause: an omitted `filters` prop defaulted to a new `[]` every render, so memo/effect chains re-ran and the selection clean-up always set a new Set. Fix: module-level default constants; effects keyed on primitive strings (visible-row ids, default-hidden columns); the selection clean-up returns the same state when nothing was removed. Guard: `tests/ui/data-table.test.tsx` (run with `npm run test:ui`; `npm test` runs database + UI tests). If that test ever hangs instead of failing, that is the same bug. | Unstable caller props can't freeze a page |
| F22 | **Payment modes (2026-10-14):** Cash, UPI, Cheque, Bank transfer. Only a **cheque needs its number**. UPI and bank-transfer references are optional. Admin can switch on **"Require reference for UPI"** (Fee setup → Payment QR, default off). The old "every non-cash needs a reference" database rule was removed and its test updated to the new rule. |
| F23 | **School UPI / QR (Admin only, in the database too):** UPI ID, payee name, optional uploaded QR image (private bucket). Fee-duty teachers can read it to show the QR but never change it. Every change is audit-logged with the UPI ID partly masked (`ab***@bank`); the row keeps who changed it last and when. On Collect fee (UPI mode), "Show QR" makes a `upi://pay` QR **in the browser** for the exact amount (payee, INR, note "Fee <admission no>"); no outside service. Without a UPI ID it shows the uploaded image (parent types the amount); with neither it says "Ask the Admin to set the school QR in Fee setup". |
| F24 | **UPI confirmation:** saving a UPI payment needs a tick "I have seen the payment in the bank / UPI app", enforced in the screen and again on the server. The system cannot check the bank, and says so. |
| F25 | **Collect fee opens on a class-wise list**: students with pending dues, largest balance first; class, section and Pending / Overdue only / All students pickers; summary of students owing and total outstanding for the selection; Collect button per row. After saving a receipt you return to the list with the same class selected and a Print button. The daily collection report keeps UPI in its own card and row so it can be matched with the bank statement. |

## F26 — Fee receipt redesign (no database change)
- One `Receipt` component (`src/components/fees/receipt.tsx`) is used on the receipt page, the print view and the Collect fee success screen. Letterhead values (logo, name, address, phone, UDISE, recognition no.) come from School settings; empty ones are not printed.
- Print layouts: A4 two copies (Parent copy / Office copy, default), A4 single, A5. Black-and-white safe: no information is carried by colour only. Signature lines stay blank (no stored signature printed); no refund/policy wording.
- Stamps: PAID (original), DUPLICATE (reprints, still audit-logged), CANCELLED + date. Misc receipts show description, payer, and a "Misc" mark.
- "Balance still due after this payment" = what the student owes now plus what later valid receipts took off, so a reprint shows the balance as it was.
- Tuition line text now reads "Tuition, Jun 2026" (was "Tuition – Jun 2026").

## TT — Timetable module (Part 1: database)
All defaults below are placeholders: **VERIFY against our real school timings**. Admin (or a teacher with the `timetable_edit` duty) can change every one of them.
- **TT1 Calendar:** Monday–Saturday working (from School settings), 2nd Saturday a holiday (holidays table + School settings flag), 8 periods a day.
- **TT2 Default bell schedule "Regular day":** P1 9:00–9:40, P2 9:40–10:20, short break 10:20–10:35, P3 10:35–11:15, P4 11:15–11:55, lunch 11:55–12:40, P5 12:40–1:20, P6 1:20–2:00, short break 2:00–2:10, P7 2:10–2:50, P8 2:50–3:30. Saturday uses the same schedule by default.
- **TT3 More than one schedule:** any number of bell schedules; a class follows the default unless Admin assigns another schedule to that class for a weekday (e.g. shorter day for Nursery–UKG, half-day Saturday). One schedule is always the default and cannot be deleted. Teaching periods are numbered 1..n without gaps; times in one schedule cannot overlap.
- **TT4 Session markers:** morning session = teacher of the day's first teaching period; afternoon session = teacher of the first teaching period after lunch (P5 by default; a schedule with no lunch has no afternoon session). Order: substitute for that date, then the scheduled teacher, then the section's class teacher. Holidays, Sundays, non-working days and dates outside the year have no sessions. `session_markers(section, date)` is what Attendance will call.
- **TT5 Rules in the database:** one entry per section/weekday/period; a teacher is in one section per weekday/period (also vs. upcoming substitutions, and a substitute cannot be busy); subject + teacher must be an existing teaching assignment for that section; activities (Games, Library, Free) need no teacher; periods must exist in that class's schedule for that weekday; no substitutions on holidays; a period with upcoming substitutions cannot be changed or removed until they are removed.
- **TT6 Scope:** Admin and `timetable_edit` duty see/edit all; any other teacher reads only periods where they are the teacher (and substitutions involving them), plus bell times (reference data). Their weekly view comes from `my_week()`, which returns only their own periods. The list of free teachers for a substitution is available to editors only.
- **TT7 Weekly targets:** each assignment's `periods_per_week` is the target; `timetable_period_counts` reports scheduled, difference and over/under/ok/no_target.
- **TT8 Demo data:** `npm run seed:demo-timetable` builds a conflict-free week for all 13 sections (Games ×2, Library ×2, rest Free) and sets missing demo weekly targets; `npm run wipe:demo-timetable -- --yes` removes only demo timetable rows (bell schedules kept).

## TT (Part 2: screens)
- **TT9 Pages:** Class timetable (`/timetable`), Teacher timetable (`/timetable/teachers`, view-only), Substitutions, Bell schedule: Admin and the `timetable_edit` duty only. My timetable (`/my/timetable`) and the "Today" strip on a teacher's dashboard show only that teacher's own periods (via `my_week()`); periods they cover show "Covering", periods they were relieved of show "Relieved".
- **TT10 Class grid:** click a period to pick subject + teacher from the section's teacher assignments only (a teacher already booked elsewhere is shown disabled with the class that holds them); live "x of target" count; warnings for short/over/empty periods; copy a day to other days (a copied period whose teacher is busy is left empty and reported).
- **TT11 Substitutions:** choose a date, then the absent teacher (or a class and period); only teachers free in that period are offered. Nothing is deducted for leave yet (no leave module until Attendance & leave).
- **TT12 Print / export:** class and teacher timetables print on A4 landscape with the school letterhead; Excel export on the grids. A teacher can print only their own timetable.
- **TT13 Demo:** the demo office teacher (`office@demo.kchs.test`) now also holds the `timetable_edit` duty, so the timetable editor view can be tried without Admin.

## AT — Attendance and staff leave (Part 1: database)
- **AT1 Sessions:** two a day. The marker is whoever `session_markers()` gives (substitute, then scheduled teacher, then class teacher). A teacher marks only their own assigned sessions and only for today; Admin and the `all_class_attendance` duty mark or correct any section, session and date up to today. Nobody marks a future date or a Sunday / 2nd Saturday / holiday.
- **AT2 Record:** each session stores who it was assigned to, who marked it, when, and its kind (regular / substitute / correction). Student rows are unique per student, date and session; every change is audit-logged with old and new values. The first save must cover every active student in the section; later saves may send only the changed students.
- **AT3 Counting — VERIFY with the school:** Present and Late count as attended; Absent and Leave count as not attended; each session is half a day. Percentage = attended sessions / marked sessions. Daily status: present (both), morning only, afternoon only, absent (neither).
- **AT4 Who sees what:** Admin/duty see all; a teacher sees sessions assigned to them or marked by them; a class teacher sees both sessions of their own section (read only). Writes only through `mark_attendance()`; there is no direct write access to the tables.
- **AT5 Low-attendance threshold:** `school_settings.low_attendance_pct`, default 75, Admin editable.
- **AT6 Leave:** types Casual / Sick / Other (Admin edits). Anyone applies for themselves (Admin for anyone); Admin approves or rejects (rejecting needs a note); a pending request can be cancelled by its applicant. Days count working days only (not Sundays, 2nd Saturdays, holidays). Yearly allowance: type default (unlimited if empty) with an optional personal override; approval is blocked when it would exceed the balance. Approved leave lists the uncovered periods for timetable editors (`approved_leave_periods`).
- **AT7 Staff attendance:** Admin marks (Present, Absent, Late, On leave; approved leave pre-fills "On leave"); a teacher sees only their own record; monthly staff report and leave-taken report.
- **AT8 Demo:** `npm run seed:demo-attendance` (about two weeks, both sessions, some missed sessions and corrections, 7 leave requests, staff attendance); `npm run wipe:demo-attendance -- --yes` removes only demo attendance and demo leave. Today is left unmarked on purpose.
