-- =====================================================================
-- REAL school configuration (not demo data — kept by `seed:wipe`).
-- Idempotent: safe to re-run; never overwrites values the Admin changed.
-- Everything here is editable later in the app.
-- Source: details given by the school on 2026-10-11 (see DECISIONS.md).
-- =====================================================================

-- School details. Blank fields (UDISE, recognition, phone, email, website,
-- logo) are left for the Admin — the dashboard shows a reminder.
update public.school_settings set
  name       = case when name = 'School Name' then 'Krishna Chaitanya High School' else name end,
  short_name = coalesce(short_name, 'KCHS'),
  address_line1 = coalesce(address_line1, 'Vempalli Road'),
  city       = coalesce(city, 'Yerraguntla'),
  district   = coalesce(district, 'YSR Kadapa'),
  state      = coalesce(state, 'Andhra Pradesh'),
  board      = coalesce(board, 'Andhra Pradesh State Board')
where id = 1;

-- Academic year 2026-27 (April–March). The insert trigger generates
-- every 2nd Saturday as a holiday.
insert into public.academic_years (name, start_date, end_date, status)
values ('2026-27', '2026-04-01', '2027-03-31', 'active')
on conflict (name) do nothing;

update public.academic_years set is_current = true
where name = '2026-27'
  and not exists (select 1 from public.academic_years where is_current);

-- Classes: Nursery to Class 10.
insert into public.classes (name, short_name, sort_order) values
  ('Nursery', 'NUR', 0), ('LKG', 'LKG', 1), ('UKG', 'UKG', 2),
  ('Class 1', 'I', 3), ('Class 2', 'II', 4), ('Class 3', 'III', 5), ('Class 4', 'IV', 6),
  ('Class 5', 'V', 7), ('Class 6', 'VI', 8), ('Class 7', 'VII', 9), ('Class 8', 'VIII', 10),
  ('Class 9', 'IX', 11), ('Class 10', 'X', 12)
on conflict (name) do nothing;

-- Subjects (⚠ VERIFY against the school's textbook list — DECISIONS.md S1).
insert into public.subjects (name, code, type, sort_order) values
  ('Telugu',                       'TEL',  'scholastic',    1),
  ('Hindi',                        'HIN',  'scholastic',    2),
  ('English',                      'ENG',  'scholastic',    3),
  ('Mathematics',                  'MAT',  'scholastic',    4),
  ('Environmental Studies',        'EVS',  'scholastic',    5),
  ('Physical Science',             'PS',   'scholastic',    6),
  ('Biological Science',           'BS',   'scholastic',    7),
  ('Social Studies',               'SS',   'scholastic',    8),
  ('General Awareness',            'GA',   'scholastic',    9),
  ('Rhymes & Stories',             'RHY',  'scholastic',   10),
  ('Drawing',                      'DRW',  'scholastic',   11),
  ('Art & Cultural Education',     'ACE',  'co_scholastic', 21),
  ('Work & Computer Education',    'WCE',  'co_scholastic', 22),
  ('Physical & Health Education',  'PHE',  'co_scholastic', 23),
  ('Value Education & Life Skills','VELS', 'co_scholastic', 24)
on conflict (name) do nothing;

-- Which subjects each class studies in 2026-27 (⚠ VERIFY — DECISIONS.md S2).
with plan(class_name, codes) as (values
  ('Nursery',  '{ENG,TEL,MAT,GA,RHY,DRW}'::text[]),
  ('LKG',      '{ENG,TEL,MAT,GA,RHY,DRW}'),
  ('UKG',      '{ENG,TEL,MAT,GA,RHY,DRW}'),
  ('Class 1',  '{TEL,ENG,MAT}'),
  ('Class 2',  '{TEL,ENG,MAT}'),
  ('Class 3',  '{TEL,ENG,MAT,EVS}'),
  ('Class 4',  '{TEL,ENG,MAT,EVS}'),
  ('Class 5',  '{TEL,ENG,MAT,EVS}'),
  ('Class 6',  '{TEL,HIN,ENG,MAT,PS,BS,SS}'),
  ('Class 7',  '{TEL,HIN,ENG,MAT,PS,BS,SS}'),
  ('Class 8',  '{TEL,HIN,ENG,MAT,PS,BS,SS}'),
  ('Class 9',  '{TEL,HIN,ENG,MAT,PS,BS,SS}'),
  ('Class 10', '{TEL,HIN,ENG,MAT,PS,BS,SS}')
),
-- co-scholastic areas for every class (⚠ VERIFY — DECISIONS.md S3)
expanded as (
  select p.class_name, unnest(p.codes || '{ACE,WCE,PHE,VELS}'::text[]) as code from plan p
)
insert into public.class_subjects (academic_year_id, class_id, subject_id, sort_order)
select y.id, c.id, s.id, s.sort_order
from expanded e
join public.classes c on c.name = e.class_name
join public.subjects s on s.code = e.code
cross join (select id from public.academic_years where name = '2026-27') y
on conflict (academic_year_id, class_id, subject_id) do nothing;

-- Sections for 2026-27: one section "A" per class, English medium
-- (confirmed by the school on 2026-10-12). Class teachers are linked by the
-- demo seed until real staff are entered.
insert into public.sections (academic_year_id, class_id, name, medium)
select y.id, c.id, 'A', 'English'
from public.classes c
cross join (select id from public.academic_years where name = '2026-27') y
on conflict (academic_year_id, class_id, name) do nothing;

-- ---------------------------------------------------------------------
-- Fees 2026-27 (real config; amounts editable by Admin in Fee setup)
-- Tuition = annual amounts from school_reference.json (rupees -> paise).
-- Exam and Books are 0 until the Admin enters them. Due day: the 10th.
-- Default plans: Tuition Monthly; Exam and Books One-time (DECISIONS.md F6).
-- ---------------------------------------------------------------------
insert into public.fee_plans (academic_year_id, name, kind, due_day)
select y.id, p.name, p.kind, 10
from public.academic_years y
cross join (values ('Monthly', 'monthly'), ('One-time', 'one_time')) as p(name, kind)
where y.name = '2026-27'
on conflict (academic_year_id, name) do nothing;

with tuition(class_name, rupees) as (values
  ('Nursery', 8250), ('LKG', 8800), ('UKG', 8800), ('Class 1', 9350), ('Class 2', 9900), ('Class 3', 10450),
  ('Class 4', 10450), ('Class 5', 11000), ('Class 6', 11550), ('Class 7', 12100), ('Class 8', 13200),
  ('Class 9', 15400), ('Class 10', 20000)
)
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id)
select y.id, c.id, h.id, t.rupees::bigint * 100, p.id
from tuition t
join public.classes c on c.name = t.class_name
cross join (select id from public.academic_years where name = '2026-27') y
join public.fee_heads h on h.code = 'TUITION'
join public.fee_plans p on p.academic_year_id = y.id and p.name = 'Monthly'
on conflict (academic_year_id, class_id, fee_head_id) do nothing;

insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id)
select y.id, c.id, h.id, 0, p.id
from public.classes c
cross join (select id from public.academic_years where name = '2026-27') y
join public.fee_heads h on h.code in ('EXAM', 'BOOKS')
join public.fee_plans p on p.academic_year_id = y.id and p.name = 'One-time'
on conflict (academic_year_id, class_id, fee_head_id) do nothing;
