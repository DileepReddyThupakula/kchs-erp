-- =====================================================================
--  Exams & marks (Module 6)
--
--  A fully editable exam scheme per academic year and class:
--    exam components (FA1, SA1 ... any name, with a maximum)
--      -> result groups (terms / the final result) that combine components or other
--         groups by sum, average or best-of-N, optionally scaled to a maximum
--      -> pass marks per subject and class, grading scale, class mode (marks / grades / remarks).
--  Marks are entered through checked functions only. Totals, percentage, grade,
--  grade point and pass/fail are calculated BY THE DATABASE whenever a mark or the
--  scheme changes; nobody types them.
--
--  Absent = scores 0 (shown AB, never a typed zero). Not applicable = left out of
--  both the marks and the maximum. Locked exams cannot change, even by Admin, until
--  Admin unlocks them (with a reason). Teacher scope (R18) applies everywhere.
-- =====================================================================

alter table public.school_settings add column default_pass_percent numeric(5,2) not null default 35 check (default_pass_percent between 0 and 100);

-- ---------------------------------------------------------------------
-- Reference lists (VERIFY the scale against the school's official AP scale)
-- ---------------------------------------------------------------------
create table public.grade_bands (
  id          uuid primary key default gen_random_uuid(),
  grade       text not null unique check (length(trim(grade)) between 1 and 6),
  min_pct     numeric(5,2) not null check (min_pct between 0 and 100),
  max_pct     numeric(5,2) not null check (max_pct between 0 and 100),
  grade_point numeric(4,1) not null check (grade_point >= 0),
  is_fail     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  unique (min_pct),
  check (max_pct >= min_pct)
);
select app.attach_std_triggers('public.grade_bands');
insert into public.grade_bands (grade, min_pct, max_pct, grade_point, is_fail) values
  ('A1', 91, 100, 10, false), ('A2', 81, 90, 9, false), ('B1', 71, 80, 8, false), ('B2', 61, 70, 7, false),
  ('C1', 51, 60, 6, false), ('C2', 41, 50, 5, false), ('D', 35, 40, 4, false), ('E', 0, 34, 0, true);

-- co-scholastic / descriptive grades (editable)
create table public.descriptive_grades (
  code       text primary key check (length(trim(code)) between 1 and 6),
  label      text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
select app.attach_std_triggers('public.descriptive_grades');
insert into public.descriptive_grades (code, label, sort_order) values
  ('A', 'Excellent', 1), ('B', 'Very good', 2), ('C', 'Good', 3), ('D', 'Satisfactory', 4), ('E', 'Needs improvement', 5);

-- standard class-teacher remarks, English + Telugu (Telugu must be VERIFIED by a Telugu speaker).
-- Student remarks are never machine-translated: the Telugu comes from here or is typed.
create table public.remark_bank (
  id          uuid primary key default gen_random_uuid(),
  text_en     text not null check (length(trim(text_en)) >= 3),
  text_te     text,
  te_verified boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
select app.attach_std_triggers('public.remark_bank');
insert into public.remark_bank (text_en, text_te, sort_order) values
  ('Excellent performance. Keep it up.', 'అద్భుతమైన ప్రదర్శన. ఇలాగే కొనసాగించండి.', 1),
  ('Good progress. Can do even better with more practice.', 'మంచి పురోగతి. మరింత సాధనతో ఇంకా బాగా చేయగలరు.', 2),
  ('Regular and attentive in class.', 'తరగతిలో క్రమం తప్పకుండా శ్రద్ధగా ఉంటారు.', 3),
  ('Needs more practice and regular homework.', 'మరింత సాధన మరియు క్రమమైన ఇంటి పని అవసరం.', 4),
  ('Needs to improve in studies. Parents are requested to meet the class teacher.', 'చదువులో మెరుగుపడాలి. తల్లిదండ్రులు క్లాస్ టీచర్‌ను కలవగలరు.', 5);

-- ---------------------------------------------------------------------
-- The exam scheme (per academic year and class)
-- ---------------------------------------------------------------------
create table public.exam_class_modes (
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  mode             text not null check (mode in ('marks', 'grades', 'remarks')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  primary key (academic_year_id, class_id)
);
select app.attach_std_triggers('public.exam_class_modes');

create table public.exam_components (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 40),
  max_marks        numeric(6,2) not null check (max_marks > 0),
  sort_order       integer not null default 0,
  locked_at        timestamptz,
  locked_by        uuid references public.staff (id) on delete set null,
  lock_note        text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (academic_year_id, class_id, name),
  unique (id, academic_year_id, class_id)
);
create index exam_components_class_idx on public.exam_components (class_id);
create index exam_components_locked_by_idx on public.exam_components (locked_by);
select app.attach_std_triggers('public.exam_components');

-- a different maximum for one subject in one component (e.g. Drawing out of 50)
create table public.exam_subject_max (
  component_id uuid not null references public.exam_components (id) on delete cascade,
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  max_marks    numeric(6,2) not null check (max_marks > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid,
  primary key (component_id, subject_id)
);
create index exam_subject_max_subject_idx on public.exam_subject_max (subject_id);
select app.attach_std_triggers('public.exam_subject_max');

create table public.result_groups (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 40),
  kind             text not null default 'part' check (kind in ('part', 'term', 'final')),
  method           text not null default 'sum' check (method in ('sum', 'average', 'best_n')),
  best_n           integer check (best_n is null or best_n >= 1),
  scale_to         numeric(6,2) check (scale_to is null or scale_to > 0),
  start_date       date,
  end_date         date,
  sort_order       integer not null default 0,
  locked_at        timestamptz,
  locked_by        uuid references public.staff (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (academic_year_id, class_id, name),
  check ((method = 'best_n') = (best_n is not null)),
  check (start_date is null or end_date is null or end_date >= start_date)
);
create index result_groups_class_idx on public.result_groups (class_id);
create index result_groups_locked_by_idx on public.result_groups (locked_by);
select app.attach_std_triggers('public.result_groups');

create table public.result_group_members (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.result_groups (id) on delete cascade,
  component_id   uuid references public.exam_components (id) on delete restrict,
  child_group_id uuid references public.result_groups (id) on delete restrict,
  scale_to       numeric(6,2) check (scale_to is null or scale_to > 0),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  check (num_nonnulls(component_id, child_group_id) = 1),
  unique (group_id, component_id),
  unique (group_id, child_group_id)
);
create index result_group_members_component_idx on public.result_group_members (component_id);
create index result_group_members_child_idx on public.result_group_members (child_group_id);
select app.attach_std_triggers('public.result_group_members');

create table public.subject_pass_marks (
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id) on delete cascade,
  pass_percent     numeric(5,2) not null check (pass_percent between 0 and 100),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  primary key (academic_year_id, class_id, subject_id)
);
create index subject_pass_marks_subject_idx on public.subject_pass_marks (subject_id);
create index subject_pass_marks_class_idx on public.subject_pass_marks (class_id);
select app.attach_std_triggers('public.subject_pass_marks');

-- ---------------------------------------------------------------------
-- Marks (entered) and results (calculated by the database only)
-- ---------------------------------------------------------------------
create table public.marks (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  component_id     uuid not null references public.exam_components (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id) on delete restrict,
  status           text not null default 'marked' check (status in ('marked', 'absent', 'na')),
  marks            numeric(6,2) check (marks is null or marks >= 0),
  entered_by       uuid references public.staff (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (student_id, component_id, subject_id),
  check ((status = 'marked') = (marks is not null))
);
create index marks_class_idx on public.marks (class_id);
create index marks_section_subject_idx on public.marks (section_id, subject_id);
create index marks_component_idx on public.marks (component_id);
create index marks_subject_idx on public.marks (subject_id);
create index marks_year_idx on public.marks (academic_year_id);
create index marks_entered_by_idx on public.marks (entered_by);
select app.attach_std_triggers('public.marks');

create table public.subject_results (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  group_id         uuid not null references public.result_groups (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id) on delete restrict,
  scored           numeric(10,2) not null,
  max_marks        numeric(10,2) not null,
  pct              numeric(8,4) not null,
  grade            text,
  grade_point      numeric(4,1),
  pass_percent     numeric(5,2) not null,
  passed           boolean not null,
  has_absent       boolean not null default false,
  missing          integer not null default 0,
  locked           boolean not null default false,
  calc             jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  unique (student_id, group_id, subject_id)
);
create index subject_results_group_idx on public.subject_results (group_id);
create index subject_results_section_subject_idx on public.subject_results (section_id, subject_id);
create index subject_results_subject_idx on public.subject_results (subject_id);
create index subject_results_class_idx on public.subject_results (class_id);
create index subject_results_year_idx on public.subject_results (academic_year_id);

create table public.student_results (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  group_id         uuid not null references public.result_groups (id) on delete cascade,
  scored           numeric(10,2) not null,
  max_marks        numeric(10,2) not null,
  pct              numeric(8,4) not null,
  grade            text,
  grade_point      numeric(4,2),
  result           text not null check (result in ('pass', 'fail', 'incomplete')),
  subjects_count   integer not null,
  failed_count     integer not null,
  locked           boolean not null default false,
  updated_at       timestamptz not null default now(),
  unique (student_id, group_id)
);
create index student_results_group_idx on public.student_results (group_id);
create index student_results_section_idx on public.student_results (section_id);
create index student_results_class_idx on public.student_results (class_id);
create index student_results_year_idx on public.student_results (academic_year_id);

-- grades / remarks entered per term: co-scholastic subjects, and every subject of grade/remark classes
create table public.grade_entries (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  group_id         uuid not null references public.result_groups (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id) on delete restrict,
  grade            text references public.descriptive_grades (code) on update cascade,
  remark           text check (remark is null or length(trim(remark)) >= 1),
  entered_by       uuid references public.staff (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (student_id, group_id, subject_id),
  check (grade is not null or remark is not null)
);
create index grade_entries_group_idx on public.grade_entries (group_id);
create index grade_entries_section_subject_idx on public.grade_entries (section_id, subject_id);
create index grade_entries_subject_idx on public.grade_entries (subject_id);
create index grade_entries_class_idx on public.grade_entries (class_id);
create index grade_entries_grade_idx on public.grade_entries (grade);
create index grade_entries_entered_by_idx on public.grade_entries (entered_by);
select app.attach_std_triggers('public.grade_entries');

create table public.report_remarks (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  group_id         uuid not null references public.result_groups (id) on delete cascade,
  bank_id          uuid references public.remark_bank (id) on delete set null,
  remark_en        text not null check (length(trim(remark_en)) >= 2),
  remark_te        text,
  entered_by       uuid references public.staff (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (student_id, group_id)
);
create index report_remarks_group_idx on public.report_remarks (group_id);
create index report_remarks_section_idx on public.report_remarks (section_id);
create index report_remarks_class_idx on public.report_remarks (class_id);
create index report_remarks_bank_idx on public.report_remarks (bank_id);
create index report_remarks_entered_by_idx on public.report_remarks (entered_by);
select app.attach_std_triggers('public.report_remarks');

create table public.report_card_prints (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  group_id   uuid not null references public.result_groups (id) on delete cascade,
  section_id uuid references public.sections (id) on delete set null,
  printed_by uuid references public.staff (id) on delete set null,
  printed_at timestamptz not null default now(),
  duplicate  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index report_card_prints_student_idx on public.report_card_prints (student_id, group_id);
create index report_card_prints_group_idx on public.report_card_prints (group_id);
create index report_card_prints_section_idx on public.report_card_prints (section_id);
create index report_card_prints_by_idx on public.report_card_prints (printed_by);
select app.attach_std_triggers('public.report_card_prints');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create function app.require_marks_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

-- may the signed-in person enter marks / grades for this section and subject?
--   Admin and the all_class_marks duty: any; a teacher: only a (section, subject) assigned to them (R18)
create function app.marks_writer(p_section uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_staff_user() and (
    public.has_duty('all_class_marks')
    or exists (select 1 from public.teacher_assignments a
               where a.staff_id = app.current_staff_id() and a.section_id = p_section and a.subject_id = p_subject))
$$;

-- may read the marks of this (section, subject)?  same rule
create function app.marks_reader(p_section uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.marks_writer(p_section, p_subject)
$$;

create function app.class_mode(p_year uuid, p_class uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.mode from public.exam_class_modes m where m.academic_year_id = p_year and m.class_id = p_class),
    case when exists (select 1 from public.classes c where c.id = p_class and lower(c.name) in ('nursery', 'lkg', 'ukg')) then 'grades' else 'marks' end)
$$;

create function app.default_pass_percent() returns numeric
language sql stable security definer set search_path = '' as $$
  select default_pass_percent from public.school_settings where id = 1
$$;

create function app.pass_percent(p_year uuid, p_class uuid, p_subject uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select pass_percent from public.subject_pass_marks where academic_year_id = p_year and class_id = p_class and subject_id = p_subject),
                  app.default_pass_percent())
$$;

create function app.grade_for(p_pct numeric) returns table (grade text, grade_point numeric, is_fail boolean)
language sql stable security definer set search_path = '' as $$
  select b.grade, b.grade_point, b.is_fail from public.grade_bands b where b.min_pct <= greatest(p_pct, 0) order by b.min_pct desc limit 1
$$;

-- the maximum for one subject in one component (override, else the component's)
create function app.component_max(p_component uuid, p_subject uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.max_marks from public.exam_subject_max o where o.component_id = p_component and o.subject_id = p_subject),
                  (select c.max_marks from public.exam_components c where c.id = p_component))
$$;

-- every component under a group (through child groups)
create function app.group_components(p_group uuid) returns table (component_id uuid)
language sql stable security definer set search_path = '' as $$
  with recursive g(id) as (
    select p_group
    union
    select m.child_group_id from public.result_group_members m join g on g.id = m.group_id where m.child_group_id is not null
  )
  select distinct m.component_id from public.result_group_members m join g on g.id = m.group_id where m.component_id is not null
$$;

create function app.group_tree(p_group uuid) returns table (group_id uuid)
language sql stable security definer set search_path = '' as $$
  with recursive g(id) as (
    select p_group
    union
    select m.child_group_id from public.result_group_members m join g on g.id = m.group_id where m.child_group_id is not null
  )
  select id from g
$$;

-- the groups that contain this group or component (so unlocking one part unlocks what is built from it)
create function app.group_ancestors(p_group uuid) returns table (group_id uuid)
language sql stable security definer set search_path = '' as $$
  with recursive g(id) as (
    select p_group
    union
    select m.group_id from public.result_group_members m join g on g.id = m.child_group_id
  )
  select id from g
$$;

-- ---------------------------------------------------------------------
-- The calculation. app.eval_group returns jsonb:
--   {v, mx, absent, missing, entered, steps[]} (v / mx null when everything is Not applicable)
-- ---------------------------------------------------------------------
create function app.eval_group(p_group uuid, p_student uuid, p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g        public.result_groups;
  m        record;
  c        public.exam_components;
  mk       public.marks;
  r        jsonb;
  items    jsonb := '[]'::jsonb;
  it       jsonb;
  v        numeric;
  mx       numeric;
  absent   boolean := false;
  missing  integer := 0;
  entered  integer := 0;
  n        integer;
  tot_v    numeric := 0;
  tot_mx   numeric := 0;
  taken    integer := 0;
  taken_ords bigint[];
  st       text;
  lbl      text;
begin
  select * into g from public.result_groups where id = p_group;
  if not found then
    return null;
  end if;
  for m in select * from public.result_group_members where group_id = p_group order by sort_order, created_at loop
    if m.component_id is not null then
      select * into c from public.exam_components where id = m.component_id;
      mx := app.component_max(c.id, p_subject);
      lbl := c.name;
      select * into mk from public.marks where student_id = p_student and component_id = c.id and subject_id = p_subject;
      if not found then
        st := 'missing'; v := 0; missing := missing + 1;
      elsif mk.status = 'na' then
        items := items || jsonb_build_object('label', lbl, 'status', 'na', 'v', null, 'mx', null);
        continue;
      elsif mk.status = 'absent' then
        st := 'absent'; v := 0; absent := true; entered := entered + 1;
      else
        st := 'marked'; v := mk.marks; entered := entered + 1;
      end if;
      it := jsonb_build_object('label', lbl, 'status', st, 'raw', v, 'raw_max', mx);
    else
      r := app.eval_group(m.child_group_id, p_student, p_subject);
      select name into lbl from public.result_groups where id = m.child_group_id;
      if r is null or r -> 'mx' is null or r ->> 'mx' is null then
        items := items || jsonb_build_object('label', lbl, 'status', 'na', 'v', null, 'mx', null);
        continue;
      end if;
      v := (r ->> 'v')::numeric;
      mx := (r ->> 'mx')::numeric;
      missing := missing + (r ->> 'missing')::int;
      entered := entered + (r ->> 'entered')::int;
      if (r ->> 'absent')::boolean then absent := true; end if;
      st := 'group';
      it := jsonb_build_object('label', lbl, 'status', st, 'raw', v, 'raw_max', mx, 'steps', r -> 'steps', 'method', r ->> 'method');
    end if;
    if m.scale_to is not null and mx > 0 then
      v := round(v / mx * m.scale_to, 2);
      mx := m.scale_to;
      it := it || jsonb_build_object('scaled_to', m.scale_to);
    end if;
    it := it || jsonb_build_object('v', v, 'mx', mx);
    items := items || it;
  end loop;

  -- combine
  select count(*) into n from jsonb_array_elements(items) e where e ->> 'status' <> 'na';
  if n = 0 then
    return jsonb_build_object('v', null, 'mx', null, 'absent', absent, 'missing', missing, 'entered', entered, 'steps', items, 'method', g.method);
  end if;
  if g.method = 'sum' then
    select coalesce(sum((e ->> 'v')::numeric), 0), coalesce(sum((e ->> 'mx')::numeric), 0) into tot_v, tot_mx
      from jsonb_array_elements(items) e where e ->> 'status' <> 'na';
  elsif g.method = 'average' then
    select round(coalesce(sum((e ->> 'v')::numeric), 0) / n, 2), round(coalesce(sum((e ->> 'mx')::numeric), 0) / n, 2) into tot_v, tot_mx
      from jsonb_array_elements(items) e where e ->> 'status' <> 'na';
  else
    -- best N by percentage; remember which ones were taken
    select array_agg(q.ord) into taken_ords from (
      select ord, row_number() over (order by pc desc nulls last, ord) as rk
      from (select t.ord, (t.e ->> 'v')::numeric / nullif((t.e ->> 'mx')::numeric, 0) as pc
            from jsonb_array_elements(items) with ordinality as t(e, ord) where t.e ->> 'status' <> 'na') z
    ) q where q.rk <= g.best_n;
    select coalesce(sum((t.e ->> 'v')::numeric), 0), coalesce(sum((t.e ->> 'mx')::numeric), 0), count(*) into tot_v, tot_mx, taken
      from jsonb_array_elements(items) with ordinality as t(e, ord) where t.ord = any (taken_ords);
    select jsonb_agg(case when t.e ->> 'status' = 'na' then t.e else t.e || jsonb_build_object('taken', t.ord = any (taken_ords)) end order by t.ord) into items
      from jsonb_array_elements(items) with ordinality as t(e, ord);
  end if;
  if g.scale_to is not null and tot_mx > 0 then
    tot_v := round(tot_v / tot_mx * g.scale_to, 2);
    tot_mx := g.scale_to;
  end if;
  return jsonb_build_object('v', tot_v, 'mx', tot_mx, 'absent', absent, 'missing', missing, 'entered', entered, 'steps', items,
                            'method', g.method, 'best_n', g.best_n, 'scale_to', g.scale_to);
end $$;
revoke execute on function app.eval_group(uuid, uuid, uuid) from public, anon, authenticated;

-- recalculate one student's results for one subject (all groups of the class)
create function app.recalc_student_subject(p_student uuid, p_year uuid, p_class uuid, p_section uuid, p_subject uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g        record;
  r        jsonb;
  v        numeric;
  mx       numeric;
  pct      numeric;
  gr       record;
  pp       numeric := app.pass_percent(p_year, p_class, p_subject);
  was_lock boolean;
begin
  for g in select id, locked_at from public.result_groups where academic_year_id = p_year and class_id = p_class loop
    select locked into was_lock from public.subject_results where student_id = p_student and group_id = g.id and subject_id = p_subject;
    if coalesce(was_lock, false) and g.locked_at is not null then
      continue; -- a locked result is a snapshot
    end if;
    r := app.eval_group(g.id, p_student, p_subject);
    if r is null or r ->> 'mx' is null or (r ->> 'entered')::int = 0 then
      delete from public.subject_results where student_id = p_student and group_id = g.id and subject_id = p_subject;
      continue;
    end if;
    v := (r ->> 'v')::numeric;
    mx := (r ->> 'mx')::numeric;
    pct := case when mx > 0 then v / mx * 100 else 0 end;
    select * into gr from app.grade_for(pct);
    insert into public.subject_results (academic_year_id, class_id, section_id, student_id, group_id, subject_id, scored, max_marks, pct, grade, grade_point,
                                        pass_percent, passed, has_absent, missing, locked, calc, updated_at)
    values (p_year, p_class, p_section, p_student, g.id, p_subject, v, mx, round(pct, 4), gr.grade, gr.grade_point, pp, pct >= pp,
            (r ->> 'absent')::boolean, (r ->> 'missing')::int, g.locked_at is not null, r, now())
    on conflict (student_id, group_id, subject_id) do update
      set section_id = excluded.section_id, scored = excluded.scored, max_marks = excluded.max_marks, pct = excluded.pct, grade = excluded.grade,
          grade_point = excluded.grade_point, pass_percent = excluded.pass_percent, passed = excluded.passed, has_absent = excluded.has_absent,
          missing = excluded.missing, locked = excluded.locked, calc = excluded.calc, updated_at = now();
  end loop;
  perform app.recalc_student_totals(p_student, p_year, p_class, p_section);
end $$;
revoke execute on function app.recalc_student_subject(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- the student's overall result per group, from the subject results (scholastic subjects only)
create function app.recalc_student_totals(p_student uuid, p_year uuid, p_class uuid, p_section uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g       record;
  t       record;
  expect  integer;
  pct     numeric;
  gr      record;
  res     text;
begin
  select count(*) into expect from public.class_subjects cs join public.subjects s on s.id = cs.subject_id
   where cs.academic_year_id = p_year and cs.class_id = p_class and s.type = 'scholastic' and not cs.is_optional;
  for g in select id, locked_at from public.result_groups where academic_year_id = p_year and class_id = p_class loop
    if exists (select 1 from public.student_results x where x.student_id = p_student and x.group_id = g.id and x.locked) and g.locked_at is not null then
      continue;
    end if;
    select count(*) as n, coalesce(sum(r.scored), 0) as sc, coalesce(sum(r.max_marks), 0) as mx,
           count(*) filter (where not r.passed) as failed, count(*) filter (where r.missing > 0) as incomplete,
           avg(r.grade_point) as gp
      into t
    from public.subject_results r join public.subjects s on s.id = r.subject_id
    where r.student_id = p_student and r.group_id = g.id and s.type = 'scholastic';
    if t.n = 0 then
      delete from public.student_results where student_id = p_student and group_id = g.id;
      continue;
    end if;
    pct := case when t.mx > 0 then t.sc / t.mx * 100 else 0 end;
    select * into gr from app.grade_for(pct);
    res := case when t.incomplete > 0 or t.n < expect then 'incomplete' when t.failed > 0 then 'fail' else 'pass' end;
    insert into public.student_results (academic_year_id, class_id, section_id, student_id, group_id, scored, max_marks, pct, grade, grade_point, result,
                                        subjects_count, failed_count, locked, updated_at)
    values (p_year, p_class, p_section, p_student, g.id, t.sc, t.mx, round(pct, 4), gr.grade, round(t.gp, 2), res, t.n, t.failed, g.locked_at is not null, now())
    on conflict (student_id, group_id) do update
      set section_id = excluded.section_id, scored = excluded.scored, max_marks = excluded.max_marks, pct = excluded.pct, grade = excluded.grade,
          grade_point = excluded.grade_point, result = excluded.result, subjects_count = excluded.subjects_count, failed_count = excluded.failed_count,
          locked = excluded.locked, updated_at = now();
  end loop;
end $$;
revoke execute on function app.recalc_student_totals(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- recalculate every student of a class (after the scheme, pass marks or the scale changed)
create function app.recalc_class(p_year uuid, p_class uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  for s in
    select distinct m.student_id, m.section_id, m.subject_id from public.marks m where m.academic_year_id = p_year and m.class_id = p_class
  loop
    perform app.recalc_student_subject(s.student_id, p_year, p_class, s.section_id, s.subject_id);
  end loop;
end $$;
revoke execute on function app.recalc_class(uuid, uuid) from public, anon, authenticated;

-- results of groups that have lost all their marks must disappear too: handled in recalc_student_subject (delete when nothing entered)

-- marks: refuse changes to a locked exam from ANY path, then recalculate
create function app.marks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare comp uuid := coalesce(new.component_id, old.component_id);
begin
  if exists (select 1 from public.exam_components where id = comp and locked_at is not null) then
    raise exception 'This exam is locked. Admin must unlock it before marks can change.' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger marks_guard before insert or update or delete on public.marks for each row execute function app.marks_guard();

create function app.marks_recalc() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.marks := coalesce(new, old);
begin
  perform app.recalc_student_subject(r.student_id, r.academic_year_id, r.class_id, r.section_id, r.subject_id);
  return null;
end $$;
create trigger marks_recalc after insert or update or delete on public.marks for each row execute function app.marks_recalc();

-- ---------------------------------------------------------------------
-- Admin: the scheme
-- ---------------------------------------------------------------------
create function app.class_locked(p_year uuid, p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exam_components where academic_year_id = p_year and class_id = p_class and locked_at is not null)
      or exists (select 1 from public.result_groups where academic_year_id = p_year and class_id = p_class and locked_at is not null)
$$;

-- p: {id?, academic_year_id, class_id, name, max_marks, sort_order?}
create function public.save_exam_component(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid  uuid := nullif(p ->> 'id', '')::uuid;
  yid  uuid := nullif(p ->> 'academic_year_id', '')::uuid;
  kid  uuid := nullif(p ->> 'class_id', '')::uuid;
  nm   text := trim(coalesce(p ->> 'name', ''));
  mx   numeric := nullif(p ->> 'max_marks', '')::numeric;
  so   integer := coalesce(nullif(p ->> 'sort_order', '')::int, 0);
  old  public.exam_components;
begin
  perform app.require_marks_admin();
  if length(nm) < 1 then raise exception 'Give the exam a name' using errcode = '23514'; end if;
  if mx is null or mx <= 0 then raise exception 'The maximum marks must be more than 0' using errcode = '23514'; end if;
  if cid is null then
    if yid is null or kid is null then raise exception 'Choose the year and class' using errcode = '23514'; end if;
    insert into public.exam_components (academic_year_id, class_id, name, max_marks, sort_order) values (yid, kid, nm, mx, so) returning id into cid;
  else
    select * into old from public.exam_components where id = cid for update;
    if not found then raise exception 'Unknown exam' using errcode = '23514'; end if;
    if old.locked_at is not null then raise exception 'This exam is locked. Unlock it before changing it.' using errcode = '23514'; end if;
    update public.exam_components set name = nm, max_marks = mx, sort_order = so where id = cid;
    perform app.recalc_class(old.academic_year_id, old.class_id);
  end if;
  return cid;
exception when unique_violation then
  raise exception 'This class already has an exam called %', nm using errcode = '23514';
end $$;
revoke execute on function public.save_exam_component(jsonb) from public, anon;
grant execute on function public.save_exam_component(jsonb) to authenticated;

create function public.delete_exam_component(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.exam_components;
begin
  perform app.require_marks_admin();
  select * into c from public.exam_components where id = p_id for update;
  if not found then raise exception 'Unknown exam' using errcode = '23514'; end if;
  if c.locked_at is not null then raise exception 'This exam is locked. Unlock it first.' using errcode = '23514'; end if;
  if exists (select 1 from public.marks where component_id = p_id) then
    raise exception 'Marks have been entered for this exam. They must be removed before the exam is deleted.' using errcode = '23514';
  end if;
  if exists (select 1 from public.result_group_members where component_id = p_id) then
    raise exception 'This exam is used in a result group. Take it out of the group first.' using errcode = '23514';
  end if;
  delete from public.exam_components where id = p_id;
end $$;
revoke execute on function public.delete_exam_component(uuid) from public, anon;
grant execute on function public.delete_exam_component(uuid) to authenticated;

-- a different maximum for one subject (null = back to the component's maximum)
create function public.set_subject_max(p_component uuid, p_subject uuid, p_max numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.exam_components;
begin
  perform app.require_marks_admin();
  select * into c from public.exam_components where id = p_component;
  if not found then raise exception 'Unknown exam' using errcode = '23514'; end if;
  if c.locked_at is not null then raise exception 'This exam is locked. Unlock it before changing it.' using errcode = '23514'; end if;
  if p_max is null then
    delete from public.exam_subject_max where component_id = p_component and subject_id = p_subject;
  else
    if p_max <= 0 then raise exception 'The maximum marks must be more than 0' using errcode = '23514'; end if;
    if exists (select 1 from public.marks m where m.component_id = p_component and m.subject_id = p_subject and m.marks > p_max) then
      raise exception 'Some marks already entered are above that maximum' using errcode = '23514';
    end if;
    insert into public.exam_subject_max (component_id, subject_id, max_marks) values (p_component, p_subject, p_max)
    on conflict (component_id, subject_id) do update set max_marks = excluded.max_marks;
  end if;
  perform app.recalc_class(c.academic_year_id, c.class_id);
end $$;
revoke execute on function public.set_subject_max(uuid, uuid, numeric) from public, anon;
grant execute on function public.set_subject_max(uuid, uuid, numeric) to authenticated;

-- p: {id?, academic_year_id, class_id, name, kind, method, best_n?, scale_to?, start_date?, end_date?, sort_order?,
--     members: [{component_id | child_group_id, scale_to?}]}
create function public.save_result_group(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  gid  uuid := nullif(p ->> 'id', '')::uuid;
  yid  uuid := nullif(p ->> 'academic_year_id', '')::uuid;
  kid  uuid := nullif(p ->> 'class_id', '')::uuid;
  nm   text := trim(coalesce(p ->> 'name', ''));
  mth  text := coalesce(nullif(p ->> 'method', ''), 'sum');
  bn   integer := nullif(p ->> 'best_n', '')::int;
  old  public.result_groups;
  it   jsonb;
  i    integer := 0;
  comp uuid;
  chd  uuid;
begin
  perform app.require_marks_admin();
  if length(nm) < 1 then raise exception 'Give the group a name' using errcode = '23514'; end if;
  if mth not in ('sum', 'average', 'best_n') then raise exception 'Unknown rule' using errcode = '23514'; end if;
  if mth = 'best_n' and (bn is null or bn < 1) then raise exception 'Best-of needs a number' using errcode = '23514'; end if;
  if mth <> 'best_n' then bn := null; end if;
  if gid is null then
    if yid is null or kid is null then raise exception 'Choose the year and class' using errcode = '23514'; end if;
    insert into public.result_groups (academic_year_id, class_id, name, kind, method, best_n, scale_to, start_date, end_date, sort_order)
    values (yid, kid, nm, coalesce(nullif(p ->> 'kind', ''), 'part'), mth, bn, nullif(p ->> 'scale_to', '')::numeric,
            nullif(p ->> 'start_date', '')::date, nullif(p ->> 'end_date', '')::date, coalesce(nullif(p ->> 'sort_order', '')::int, 0))
    returning id into gid;
  else
    select * into old from public.result_groups where id = gid for update;
    if not found then raise exception 'Unknown group' using errcode = '23514'; end if;
    if old.locked_at is not null then raise exception 'This result is locked. Unlock it before changing it.' using errcode = '23514'; end if;
    yid := old.academic_year_id; kid := old.class_id;
    update public.result_groups
       set name = nm, kind = coalesce(nullif(p ->> 'kind', ''), old.kind), method = mth, best_n = bn, scale_to = nullif(p ->> 'scale_to', '')::numeric,
           start_date = nullif(p ->> 'start_date', '')::date, end_date = nullif(p ->> 'end_date', '')::date,
           sort_order = coalesce(nullif(p ->> 'sort_order', '')::int, old.sort_order)
     where id = gid;
  end if;
  if p ? 'members' then
    delete from public.result_group_members where group_id = gid;
    for it in select * from jsonb_array_elements(coalesce(p -> 'members', '[]'::jsonb)) loop
      comp := nullif(it ->> 'component_id', '')::uuid;
      chd := nullif(it ->> 'child_group_id', '')::uuid;
      if num_nonnulls(comp, chd) <> 1 then raise exception 'Each item is an exam or another group' using errcode = '23514'; end if;
      if comp is not null and not exists (select 1 from public.exam_components where id = comp and academic_year_id = yid and class_id = kid) then
        raise exception 'That exam belongs to a different class or year' using errcode = '23514';
      end if;
      if chd is not null then
        if not exists (select 1 from public.result_groups where id = chd and academic_year_id = yid and class_id = kid) then
          raise exception 'That group belongs to a different class or year' using errcode = '23514';
        end if;
        if exists (select 1 from app.group_tree(chd) t where t.group_id = gid) then
          raise exception 'A group cannot contain itself' using errcode = '23514';
        end if;
      end if;
      insert into public.result_group_members (group_id, component_id, child_group_id, scale_to, sort_order)
      values (gid, comp, chd, nullif(it ->> 'scale_to', '')::numeric, i);
      i := i + 1;
    end loop;
  end if;
  perform app.recalc_class(yid, kid);
  return gid;
exception when unique_violation then
  raise exception 'This class already has a group called %', nm using errcode = '23514';
end $$;
revoke execute on function public.save_result_group(jsonb) from public, anon;
grant execute on function public.save_result_group(jsonb) to authenticated;

create function public.delete_result_group(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.result_groups;
begin
  perform app.require_marks_admin();
  select * into g from public.result_groups where id = p_id for update;
  if not found then raise exception 'Unknown group' using errcode = '23514'; end if;
  if g.locked_at is not null then raise exception 'This result is locked. Unlock it first.' using errcode = '23514'; end if;
  if exists (select 1 from public.result_group_members where child_group_id = p_id) then
    raise exception 'This group is part of another group. Take it out first.' using errcode = '23514';
  end if;
  if exists (select 1 from public.grade_entries where group_id = p_id) or exists (select 1 from public.report_remarks where group_id = p_id) then
    raise exception 'Grades or remarks have been entered for this group.' using errcode = '23514';
  end if;
  delete from public.result_groups where id = p_id;
end $$;
revoke execute on function public.delete_result_group(uuid) from public, anon;
grant execute on function public.delete_result_group(uuid) to authenticated;

create function public.set_pass_mark(p_year uuid, p_class uuid, p_subject uuid, p_percent numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_marks_admin();
  if app.class_locked(p_year, p_class) then
    raise exception 'Some exams of this class are locked. Unlock them before changing pass marks.' using errcode = '23514';
  end if;
  if p_percent is null then
    delete from public.subject_pass_marks where academic_year_id = p_year and class_id = p_class and subject_id = p_subject;
  else
    if p_percent < 0 or p_percent > 100 then raise exception 'The pass mark is a percentage from 0 to 100' using errcode = '23514'; end if;
    insert into public.subject_pass_marks (academic_year_id, class_id, subject_id, pass_percent) values (p_year, p_class, p_subject, p_percent)
    on conflict (academic_year_id, class_id, subject_id) do update set pass_percent = excluded.pass_percent;
  end if;
  perform app.recalc_class(p_year, p_class);
end $$;
revoke execute on function public.set_pass_mark(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.set_pass_mark(uuid, uuid, uuid, numeric) to authenticated;

create function public.set_class_mode(p_year uuid, p_class uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_marks_admin();
  if p_mode not in ('marks', 'grades', 'remarks') then raise exception 'Choose marks, grades or remarks' using errcode = '23514'; end if;
  if app.class_locked(p_year, p_class) then
    raise exception 'Some exams of this class are locked. Unlock them first.' using errcode = '23514';
  end if;
  insert into public.exam_class_modes (academic_year_id, class_id, mode) values (p_year, p_class, p_mode)
  on conflict (academic_year_id, class_id) do update set mode = excluded.mode;
end $$;
revoke execute on function public.set_class_mode(uuid, uuid, text) from public, anon;
grant execute on function public.set_class_mode(uuid, uuid, text) to authenticated;

-- grading scale: replace the whole list. p: [{grade, min_pct, max_pct, grade_point, is_fail}]
create function public.save_grade_bands(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare it jsonb; prev numeric := -1; first boolean := true; mn numeric;
begin
  perform app.require_marks_admin();
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    raise exception 'The grading scale needs at least one grade' using errcode = '23514';
  end if;
  -- the lowest band must start at 0 so every percentage gets a grade; starts must be distinct
  if (select min((e ->> 'min_pct')::numeric) from jsonb_array_elements(p) e) <> 0 then
    raise exception 'The lowest grade must start at 0%%' using errcode = '23514';
  end if;
  if (select count(distinct e ->> 'min_pct') from jsonb_array_elements(p) e) <> jsonb_array_length(p) then
    raise exception 'Two grades start at the same percentage' using errcode = '23514';
  end if;
  delete from public.grade_bands;
  for it in select * from jsonb_array_elements(p) loop
    insert into public.grade_bands (grade, min_pct, max_pct, grade_point, is_fail)
    values (trim(it ->> 'grade'), (it ->> 'min_pct')::numeric, (it ->> 'max_pct')::numeric, (it ->> 'grade_point')::numeric, coalesce((it ->> 'is_fail')::boolean, false));
  end loop;
  -- unlocked results get the new grades; locked results keep theirs (snapshot)
  perform app.recalc_class(y.academic_year_id, y.class_id) from (select distinct academic_year_id, class_id from public.marks) y;
end $$;
revoke execute on function public.save_grade_bands(jsonb) from public, anon;
grant execute on function public.save_grade_bands(jsonb) to authenticated;

create function public.save_descriptive_grades(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare it jsonb; i integer := 0;
begin
  perform app.require_marks_admin();
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    raise exception 'The list needs at least one grade' using errcode = '23514';
  end if;
  if exists (select 1 from public.grade_entries ge where ge.grade is not null and not exists (select 1 from jsonb_array_elements(p) e where e ->> 'code' = ge.grade)) then
    raise exception 'A grade that is already in use cannot be removed' using errcode = '23514';
  end if;
  for it in select * from jsonb_array_elements(p) loop
    i := i + 1;
    insert into public.descriptive_grades (code, label, sort_order) values (trim(it ->> 'code'), trim(it ->> 'label'), i)
    on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;
  end loop;
  delete from public.descriptive_grades d where not exists (select 1 from jsonb_array_elements(p) e where e ->> 'code' = d.code);
end $$;
revoke execute on function public.save_descriptive_grades(jsonb) from public, anon;
grant execute on function public.save_descriptive_grades(jsonb) to authenticated;

-- remark bank: replace-all. p: [{id?, text_en, text_te?, te_verified?}]
create function public.save_remark_bank(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare it jsonb; i integer := 0; rid uuid; keep uuid[] := '{}';
begin
  perform app.require_marks_admin();
  for it in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    i := i + 1;
    rid := nullif(it ->> 'id', '')::uuid;
    if rid is null then
      insert into public.remark_bank (text_en, text_te, te_verified, sort_order) values (trim(it ->> 'text_en'), nullif(trim(coalesce(it ->> 'text_te', '')), ''), coalesce((it ->> 'te_verified')::boolean, false), i) returning id into rid;
    else
      update public.remark_bank set text_en = trim(it ->> 'text_en'), text_te = nullif(trim(coalesce(it ->> 'text_te', '')), ''), te_verified = coalesce((it ->> 'te_verified')::boolean, false), sort_order = i, is_active = true where id = rid;
    end if;
    keep := keep || rid;
  end loop;
  update public.remark_bank set is_active = false where id <> all (keep);
end $$;
revoke execute on function public.save_remark_bank(jsonb) from public, anon;
grant execute on function public.save_remark_bank(jsonb) to authenticated;

-- the starting scheme (VERIFY): FA1-FA4 out of 20, SA1 and SA2 out of 80;
-- each term = FA (the average of its two FAs, scaled to 20) + SA = 100; final = the two terms = 200.
-- Grade / remark classes (Nursery to UKG by default) get empty Term 1 and Term 2 groups only.
create function public.apply_default_scheme(p_year uuid, p_class uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  y    public.academic_years;
  mid  date;
  fa1 uuid; fa2 uuid; fa3 uuid; fa4 uuid; sa1 uuid; sa2 uuid;
  t1fa uuid; t2fa uuid; t1 uuid; t2 uuid;
begin
  perform app.require_marks_admin();
  select * into y from public.academic_years where id = p_year;
  if not found then raise exception 'Unknown academic year' using errcode = '23514'; end if;
  if exists (select 1 from public.exam_components where academic_year_id = p_year and class_id = p_class)
     or exists (select 1 from public.result_groups where academic_year_id = p_year and class_id = p_class) then
    raise exception 'This class already has an exam scheme. Edit it instead.' using errcode = '23514';
  end if;
  mid := (y.start_date + interval '6 months' - interval '1 day')::date;
  if app.class_mode(p_year, p_class) <> 'marks' then
    insert into public.result_groups (academic_year_id, class_id, name, kind, start_date, end_date, sort_order) values
      (p_year, p_class, 'Term 1', 'term', y.start_date, mid, 1), (p_year, p_class, 'Term 2', 'term', mid + 1, y.end_date, 2);
    return;
  end if;
  insert into public.exam_components (academic_year_id, class_id, name, max_marks, sort_order) values (p_year, p_class, 'FA1', 20, 1) returning id into fa1;
  insert into public.exam_components (academic_year_id, class_id, name, max_marks, sort_order) values (p_year, p_class, 'FA2', 20, 2) returning id into fa2;
  insert into public.exam_components (academic_year_id, class_id, name, max_marks, sort_order) values (p_year, p_class, 'SA1', 80, 3) returning id into sa1;
  insert into public.exam_components (academic_year_id, class_id, name, max_marks, sort_order) values (p_year, p_class, 'FA3', 20, 4) returning id into fa3;
  insert into public.exam_components (academic_year_id, class_id, name, max_marks, sort_order) values (p_year, p_class, 'FA4', 20, 5) returning id into fa4;
  insert into public.exam_components (academic_year_id, class_id, name, max_marks, sort_order) values (p_year, p_class, 'SA2', 80, 6) returning id into sa2;
  t1fa := public.save_result_group(jsonb_build_object('academic_year_id', p_year, 'class_id', p_class, 'name', 'Term 1 FA', 'kind', 'part', 'method', 'average', 'scale_to', 20, 'sort_order', 1,
            'members', jsonb_build_array(jsonb_build_object('component_id', fa1), jsonb_build_object('component_id', fa2))));
  t1 := public.save_result_group(jsonb_build_object('academic_year_id', p_year, 'class_id', p_class, 'name', 'Term 1', 'kind', 'term', 'method', 'sum', 'sort_order', 2,
            'start_date', y.start_date, 'end_date', mid, 'members', jsonb_build_array(jsonb_build_object('child_group_id', t1fa), jsonb_build_object('component_id', sa1))));
  t2fa := public.save_result_group(jsonb_build_object('academic_year_id', p_year, 'class_id', p_class, 'name', 'Term 2 FA', 'kind', 'part', 'method', 'average', 'scale_to', 20, 'sort_order', 3,
            'members', jsonb_build_array(jsonb_build_object('component_id', fa3), jsonb_build_object('component_id', fa4))));
  t2 := public.save_result_group(jsonb_build_object('academic_year_id', p_year, 'class_id', p_class, 'name', 'Term 2', 'kind', 'term', 'method', 'sum', 'sort_order', 4,
            'start_date', mid + 1, 'end_date', y.end_date, 'members', jsonb_build_array(jsonb_build_object('child_group_id', t2fa), jsonb_build_object('component_id', sa2))));
  perform public.save_result_group(jsonb_build_object('academic_year_id', p_year, 'class_id', p_class, 'name', 'Final', 'kind', 'final', 'method', 'sum', 'sort_order', 5,
            'members', jsonb_build_array(jsonb_build_object('child_group_id', t1), jsonb_build_object('child_group_id', t2))));
end $$;
revoke execute on function public.apply_default_scheme(uuid, uuid) from public, anon;
grant execute on function public.apply_default_scheme(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Lock / unlock (Admin only). Locked = nobody changes marks or results, not even Admin, until unlocked.
-- ---------------------------------------------------------------------
-- marks still "not entered" for an exam: every active student of the class x every compulsory marks subject,
-- minus the rows that exist. Absent (AB) and Not applicable (N/A) rows count as entered.
create function app.pending_marks(p_component uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.exam_components c
  join public.sections s on s.class_id = c.class_id and s.academic_year_id = c.academic_year_id
  join public.student_enrollments e on e.section_id = s.id and e.academic_year_id = c.academic_year_id and e.status = 'active'
  join public.class_subjects cs on cs.academic_year_id = c.academic_year_id and cs.class_id = c.class_id and not cs.is_optional
  join public.subjects sb on sb.id = cs.subject_id and sb.type = 'scholastic'
  where c.id = p_component
    and not exists (select 1 from public.marks m where m.student_id = e.student_id and m.component_id = c.id and m.subject_id = cs.subject_id)
$$;
revoke execute on function app.pending_marks(uuid) from public, anon, authenticated;

-- which (section, subject) still have pending marks (Admin and the marks duty, for the lock screen)
create function public.exam_pending(p_component uuid) returns table (section_id uuid, subject_id uuid, pending integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff_user() or not public.has_duty('all_class_marks') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select s.id, cs.subject_id, count(*)::int
  from public.exam_components c
  join public.sections s on s.class_id = c.class_id and s.academic_year_id = c.academic_year_id
  join public.student_enrollments e on e.section_id = s.id and e.academic_year_id = c.academic_year_id and e.status = 'active'
  join public.class_subjects cs on cs.academic_year_id = c.academic_year_id and cs.class_id = c.class_id and not cs.is_optional
  join public.subjects sb on sb.id = cs.subject_id and sb.type = 'scholastic'
  where c.id = p_component
    and not exists (select 1 from public.marks m where m.student_id = e.student_id and m.component_id = c.id and m.subject_id = cs.subject_id)
  group by s.id, cs.subject_id;
end $$;
revoke execute on function public.exam_pending(uuid) from public, anon;
grant execute on function public.exam_pending(uuid) to authenticated;

create function public.lock_result_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.result_groups; me uuid := app.current_staff_id(); pend bigint;
begin
  perform app.require_marks_admin();
  select * into g from public.result_groups where id = p_group for update;
  if not found then raise exception 'Unknown group' using errcode = '23514'; end if;
  select coalesce(sum(app.pending_marks(c.component_id)), 0) into pend from app.group_components(p_group) c where not exists (select 1 from public.exam_components x where x.id = c.component_id and x.locked_at is not null);
  if pend > 0 then
    raise exception '% marks are not entered yet. Enter marks, Absent or Not applicable for everyone before locking.', pend using errcode = '23514';
  end if;
  update public.exam_components set locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, me)
   where id in (select component_id from app.group_components(p_group));
  update public.result_groups set locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, me)
   where id in (select group_id from app.group_tree(p_group));
  -- refresh the locked flag on stored results, then calculate whatever is missing
  update public.subject_results set locked = true where group_id in (select group_id from app.group_tree(p_group));
  update public.student_results set locked = true where group_id in (select group_id from app.group_tree(p_group));
end $$;
revoke execute on function public.lock_result_group(uuid) from public, anon;
grant execute on function public.lock_result_group(uuid) to authenticated;

create function public.lock_exam_component(p_component uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pend integer;
begin
  perform app.require_marks_admin();
  if not exists (select 1 from public.exam_components where id = p_component) then raise exception 'Unknown exam' using errcode = '23514'; end if;
  pend := app.pending_marks(p_component);
  if pend > 0 and not exists (select 1 from public.exam_components where id = p_component and locked_at is not null) then
    raise exception '% marks are not entered yet. Enter marks, Absent or Not applicable for everyone before locking.', pend using errcode = '23514';
  end if;
  update public.exam_components set locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, app.current_staff_id()) where id = p_component;
end $$;
revoke execute on function public.lock_exam_component(uuid) from public, anon;
grant execute on function public.lock_exam_component(uuid) to authenticated;

-- unlock a component: it and every group built from it become editable again
create function public.unlock_exam_component(p_component uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.exam_components;
begin
  perform app.require_marks_admin();
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for unlocking' using errcode = '23514'; end if;
  select * into c from public.exam_components where id = p_component for update;
  if not found then raise exception 'Unknown exam' using errcode = '23514'; end if;
  update public.exam_components set locked_at = null, locked_by = null, lock_note = trim(p_reason) where id = p_component;
  update public.result_groups set locked_at = null, locked_by = null
   where id in (select a.group_id from public.result_group_members m, lateral app.group_ancestors(m.group_id) a where m.component_id = p_component);
  update public.subject_results set locked = false where group_id in (select a.group_id from public.result_group_members m, lateral app.group_ancestors(m.group_id) a where m.component_id = p_component);
  update public.student_results set locked = false where group_id in (select a.group_id from public.result_group_members m, lateral app.group_ancestors(m.group_id) a where m.component_id = p_component);
  perform app.recalc_class(c.academic_year_id, c.class_id);
end $$;
revoke execute on function public.unlock_exam_component(uuid, text) from public, anon;
grant execute on function public.unlock_exam_component(uuid, text) to authenticated;

create function public.unlock_result_group(p_group uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.result_groups;
begin
  perform app.require_marks_admin();
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for unlocking' using errcode = '23514'; end if;
  select * into g from public.result_groups where id = p_group for update;
  if not found then raise exception 'Unknown group' using errcode = '23514'; end if;
  update public.exam_components set locked_at = null, locked_by = null, lock_note = trim(p_reason) where id in (select component_id from app.group_components(p_group));
  update public.result_groups set locked_at = null, locked_by = null
   where id in (select group_id from app.group_tree(p_group)) or id in (select group_id from app.group_ancestors(p_group));
  update public.subject_results set locked = false where group_id in (select group_id from app.group_tree(p_group)) or group_id in (select group_id from app.group_ancestors(p_group));
  update public.student_results set locked = false where group_id in (select group_id from app.group_tree(p_group)) or group_id in (select group_id from app.group_ancestors(p_group));
  perform app.recalc_class(g.academic_year_id, g.class_id);
end $$;
revoke execute on function public.unlock_result_group(uuid, text) from public, anon;
grant execute on function public.unlock_result_group(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Entering marks, grades and remarks
-- ---------------------------------------------------------------------
-- p_rows: [{student_id, status: 'marked'|'absent'|'na', marks?}]. All-or-nothing.
create function public.save_marks(p_component uuid, p_section uuid, p_subject uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c    public.exam_components;
  sec  public.sections;
  it   jsonb;
  sid  uuid;
  st   text;
  mk   numeric;
  mx   numeric;
  n    integer := 0;
  me   uuid := app.current_staff_id();
begin
  if not app.is_staff_user() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into c from public.exam_components where id = p_component;
  select * into sec from public.sections where id = p_section;
  if c.id is null or sec.id is null then raise exception 'Unknown exam or section' using errcode = '23514'; end if;
  if not app.marks_writer(p_section, p_subject) then raise exception 'not allowed' using errcode = '42501'; end if;
  if sec.class_id <> c.class_id or sec.academic_year_id <> c.academic_year_id then
    raise exception 'That exam does not belong to this section''s class' using errcode = '23514';
  end if;
  if app.class_mode(c.academic_year_id, c.class_id) <> 'marks' then
    raise exception 'This class uses grades or remarks, not marks' using errcode = '23514';
  end if;
  if c.locked_at is not null then
    raise exception 'This exam is locked. Admin must unlock it before marks can change.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.subjects s where s.id = p_subject and s.type = 'scholastic')
     or not exists (select 1 from public.class_subjects cs where cs.academic_year_id = c.academic_year_id and cs.class_id = c.class_id and cs.subject_id = p_subject) then
    raise exception 'That subject has no marks in this class' using errcode = '23514';
  end if;
  mx := app.component_max(p_component, p_subject);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'No marks to save' using errcode = '23514'; end if;
  for it in select * from jsonb_array_elements(p_rows) loop
    sid := (it ->> 'student_id')::uuid;
    st := coalesce(nullif(it ->> 'status', ''), 'marked');
    if st not in ('marked', 'absent', 'na') then raise exception 'Unknown mark type' using errcode = '23514'; end if;
    if not exists (select 1 from public.student_enrollments e where e.student_id = sid and e.section_id = p_section and e.academic_year_id = c.academic_year_id) then
      raise exception 'A student is not in this section' using errcode = '23514';
    end if;
    if st = 'marked' then
      mk := nullif(it ->> 'marks', '')::numeric;
      if mk is null then raise exception 'Enter the marks, or choose Absent or Not applicable' using errcode = '23514'; end if;
      if mk < 0 or mk > mx then raise exception 'Marks must be between 0 and %', mx using errcode = '23514';
      end if;
      if round(mk, 1) <> mk then raise exception 'Marks can have one decimal place at most' using errcode = '23514'; end if;
    else
      mk := null;
    end if;
    insert into public.marks (academic_year_id, class_id, section_id, student_id, component_id, subject_id, status, marks, entered_by)
    values (c.academic_year_id, c.class_id, p_section, sid, p_component, p_subject, st, mk, me)
    on conflict (student_id, component_id, subject_id) do update set status = excluded.status, marks = excluded.marks, entered_by = excluded.entered_by, section_id = excluded.section_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.save_marks(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_marks(uuid, uuid, uuid, jsonb) to authenticated;

-- clear one mark (back to "not entered")
create function public.clear_mark(p_component uuid, p_student uuid, p_subject uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.marks;
begin
  select * into m from public.marks where component_id = p_component and student_id = p_student and subject_id = p_subject;
  if not found then return; end if;
  if not app.marks_writer(m.section_id, m.subject_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.marks where id = m.id; -- the guard refuses when the exam is locked
end $$;
revoke execute on function public.clear_mark(uuid, uuid, uuid) from public, anon;
grant execute on function public.clear_mark(uuid, uuid, uuid) to authenticated;

-- term grades / remarks. p_rows: [{student_id, grade?, remark?}]
create function public.save_grades(p_group uuid, p_section uuid, p_subject uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  g    public.result_groups;
  sec  public.sections;
  sub  public.subjects;
  it   jsonb;
  sid  uuid;
  gr   text;
  rm   text;
  n    integer := 0;
  mode text;
begin
  if not app.is_staff_user() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.result_groups where id = p_group;
  select * into sec from public.sections where id = p_section;
  select * into sub from public.subjects where id = p_subject;
  if g.id is null or sec.id is null or sub.id is null then raise exception 'Unknown group, section or subject' using errcode = '23514'; end if;
  if not app.marks_writer(p_section, p_subject) then raise exception 'not allowed' using errcode = '42501'; end if;
  if g.kind <> 'term' or g.class_id <> sec.class_id or g.academic_year_id <> sec.academic_year_id then
    raise exception 'Choose a term of this class' using errcode = '23514';
  end if;
  if g.locked_at is not null then raise exception 'This term is locked. Admin must unlock it first.' using errcode = '23514'; end if;
  mode := app.class_mode(g.academic_year_id, g.class_id);
  if mode = 'marks' and sub.type <> 'co_scholastic' then
    raise exception 'This subject is graded with marks, not grades' using errcode = '23514';
  end if;
  if not exists (select 1 from public.class_subjects cs where cs.academic_year_id = g.academic_year_id and cs.class_id = g.class_id and cs.subject_id = p_subject) then
    raise exception 'That subject is not taught in this class' using errcode = '23514';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    sid := (it ->> 'student_id')::uuid;
    gr := nullif(trim(coalesce(it ->> 'grade', '')), '');
    rm := nullif(trim(coalesce(it ->> 'remark', '')), '');
    if not exists (select 1 from public.student_enrollments e where e.student_id = sid and e.section_id = p_section and e.academic_year_id = g.academic_year_id) then
      raise exception 'A student is not in this section' using errcode = '23514';
    end if;
    if gr is null and rm is null then
      delete from public.grade_entries where student_id = sid and group_id = p_group and subject_id = p_subject;
      continue;
    end if;
    if gr is not null and not exists (select 1 from public.descriptive_grades d where d.code = gr) then
      raise exception 'Unknown grade %', gr using errcode = '23514';
    end if;
    if mode = 'grades' and gr is null then raise exception 'Choose a grade for every student' using errcode = '23514'; end if;
    insert into public.grade_entries (academic_year_id, class_id, section_id, student_id, group_id, subject_id, grade, remark, entered_by)
    values (g.academic_year_id, g.class_id, p_section, sid, p_group, p_subject, gr, rm, app.current_staff_id())
    on conflict (student_id, group_id, subject_id) do update set grade = excluded.grade, remark = excluded.remark, entered_by = excluded.entered_by, section_id = excluded.section_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.save_grades(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_grades(uuid, uuid, uuid, jsonb) to authenticated;

-- class teacher's remark for a term: from the remark bank or typed. Telugu from the bank or typed: never machine-translated.
create function public.save_report_remark(p_group uuid, p_student uuid, p_bank uuid, p_en text, p_te text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g    public.result_groups;
  en   public.student_enrollments;
  sec  public.sections;
  b    public.remark_bank;
  v_en text := nullif(trim(coalesce(p_en, '')), '');
  v_te text := nullif(trim(coalesce(p_te, '')), '');
begin
  if not app.is_staff_user() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.result_groups where id = p_group;
  if g.id is null then raise exception 'Unknown group' using errcode = '23514'; end if;
  select * into en from public.student_enrollments where student_id = p_student and academic_year_id = g.academic_year_id;
  if en.id is null then raise exception 'That student is not enrolled this year' using errcode = '23514'; end if;
  select * into sec from public.sections where id = en.section_id;
  if sec.class_id <> g.class_id then raise exception 'That term belongs to another class' using errcode = '23514'; end if;
  if not (public.has_duty('all_class_marks') or app.is_class_teacher(sec.id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if g.kind <> 'term' then raise exception 'Choose a term' using errcode = '23514'; end if;
  if g.locked_at is not null then raise exception 'This term is locked. Admin must unlock it first.' using errcode = '23514'; end if;
  if p_bank is not null then
    select * into b from public.remark_bank where id = p_bank and is_active;
    if b.id is null then raise exception 'Unknown standard remark' using errcode = '23514'; end if;
    v_en := coalesce(v_en, b.text_en);
    v_te := coalesce(v_te, b.text_te);
  end if;
  if v_en is null then
    delete from public.report_remarks where student_id = p_student and group_id = p_group;
    return;
  end if;
  insert into public.report_remarks (academic_year_id, class_id, section_id, student_id, group_id, bank_id, remark_en, remark_te, entered_by)
  values (g.academic_year_id, g.class_id, sec.id, p_student, p_group, p_bank, v_en, v_te, app.current_staff_id())
  on conflict (student_id, group_id) do update set bank_id = excluded.bank_id, remark_en = excluded.remark_en, remark_te = excluded.remark_te,
    entered_by = excluded.entered_by, section_id = excluded.section_id;
end $$;
revoke execute on function public.save_report_remark(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.save_report_remark(uuid, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Report card data (one student, one term or the final). Admin, the all_class_marks duty,
-- or the class teacher of the student's section (the one exception to "only subjects you teach":
-- a card shows every subject, and only through this function). Needs the group to be LOCKED.
-- p_log = true records the print; "duplicate" is true from the second print on.
-- ---------------------------------------------------------------------
create function public.report_card_data(p_student uuid, p_group uuid, p_log boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g     public.result_groups;
  en    public.student_enrollments;
  sec   public.sections;
  st    public.students;
  cls   public.classes;
  yr    public.academic_years;
  mode  text;
  comps jsonb;
  subs  jsonb;
  cosc  jsonb;
  tot   public.student_results;
  rem   public.report_remarks;
  dup   boolean := false;
begin
  if not app.is_staff_user() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.result_groups where id = p_group;
  if g.id is null then raise exception 'Unknown result' using errcode = '23514'; end if;
  select * into en from public.student_enrollments where student_id = p_student and academic_year_id = g.academic_year_id;
  if en.id is null then raise exception 'That student is not enrolled this year' using errcode = '23514'; end if;
  select * into sec from public.sections where id = en.section_id;
  if sec.class_id <> g.class_id then raise exception 'That result belongs to another class' using errcode = '23514'; end if;
  if not (public.has_duty('all_class_marks') or app.is_class_teacher(sec.id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if g.locked_at is null then raise exception 'Report cards can be printed only after the exam is locked' using errcode = '23514'; end if;
  select * into st from public.students where id = p_student;
  select * into cls from public.classes where id = sec.class_id;
  select * into yr from public.academic_years where id = g.academic_year_id;
  mode := app.class_mode(g.academic_year_id, g.class_id);

  -- the exams under this result, in order (with their maximum)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'max', c.max_marks) order by c.sort_order, c.name), '[]'::jsonb) into comps
    from public.exam_components c where c.id in (select component_id from app.group_components(p_group));

  -- scholastic subjects: marks per exam, group total, grade, pass
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order), '[]'::jsonb) into subs from (
    select s.id as subject_id, s.name, s.name_te, cs.sort_order,
           (select jsonb_object_agg(m.component_id::text, jsonb_build_object('status', m.status, 'marks', m.marks))
              from public.marks m where m.student_id = p_student and m.subject_id = s.id and m.component_id in (select component_id from app.group_components(p_group))) as marks,
           r.scored, r.max_marks, r.pct, r.grade, r.grade_point, r.passed, r.pass_percent, r.has_absent, r.missing, r.calc
    from public.class_subjects cs join public.subjects s on s.id = cs.subject_id
    left join public.subject_results r on r.student_id = p_student and r.group_id = p_group and r.subject_id = s.id
    where cs.academic_year_id = g.academic_year_id and cs.class_id = g.class_id and s.type = 'scholastic' and mode = 'marks'
  ) x;

  -- grades / remarks per subject (co-scholastic; every subject in grade / remark classes)
  select coalesce(jsonb_agg(jsonb_build_object('subject_id', s.id, 'name', s.name, 'name_te', s.name_te, 'grade', ge.grade, 'grade_label', d.label, 'remark', ge.remark) order by cs.sort_order), '[]'::jsonb) into cosc
    from public.class_subjects cs join public.subjects s on s.id = cs.subject_id
    left join public.grade_entries ge on ge.student_id = p_student and ge.group_id = p_group and ge.subject_id = s.id
    left join public.descriptive_grades d on d.code = ge.grade
    where cs.academic_year_id = g.academic_year_id and cs.class_id = g.class_id and (s.type = 'co_scholastic' or mode <> 'marks');

  select * into tot from public.student_results where student_id = p_student and group_id = p_group;
  select * into rem from public.report_remarks where student_id = p_student and group_id = p_group;

  if p_log then
    select exists (select 1 from public.report_card_prints where student_id = p_student and group_id = p_group) into dup;
    insert into public.report_card_prints (student_id, group_id, section_id, printed_by, duplicate) values (p_student, p_group, sec.id, app.current_staff_id(), dup);
  end if;

  return jsonb_build_object(
    'duplicate', dup,
    'mode', mode,
    'year', yr.name,
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'start_date', g.start_date, 'end_date', g.end_date, 'method', g.method),
    'student', jsonb_build_object('id', st.id, 'name', st.full_name, 'admission_no', st.admission_no, 'roll_no', en.roll_no, 'class', cls.name, 'section', sec.name),
    'components', comps,
    'subjects', subs,
    'co_scholastic', cosc,
    'total', case when tot.id is null then null else jsonb_build_object('scored', tot.scored, 'max', tot.max_marks, 'pct', tot.pct, 'grade', tot.grade, 'grade_point', tot.grade_point, 'result', tot.result, 'failed', tot.failed_count) end,
    'remark', case when rem.id is null then null else jsonb_build_object('en', rem.remark_en, 'te', rem.remark_te) end);
end $$;
revoke execute on function public.report_card_data(uuid, uuid, boolean) from public, anon;
grant execute on function public.report_card_data(uuid, uuid, boolean) to authenticated;

-- the class teacher's / duty's list for printing: each student of a section with the term result (no subject detail)
create function public.class_result_list(p_section uuid, p_group uuid)
returns table (student_id uuid, full_name text, roll_no integer, scored numeric, max_marks numeric, pct numeric, grade text, result text, printed integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff_user() or not (public.has_duty('all_class_marks') or app.is_class_teacher(p_section)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select s.id, s.full_name, e.roll_no, r.scored, r.max_marks, r.pct, r.grade, r.result,
         (select count(*)::int from public.report_card_prints pr where pr.student_id = s.id and pr.group_id = p_group)
  from public.student_enrollments e
  join public.students s on s.id = e.student_id
  join public.result_groups g on g.id = p_group and g.academic_year_id = e.academic_year_id
  left join public.student_results r on r.student_id = s.id and r.group_id = p_group
  where e.section_id = p_section and e.status = 'active'
  order by e.roll_no nulls last, s.full_name;
end $$;
revoke execute on function public.class_result_list(uuid, uuid) from public, anon;
grant execute on function public.class_result_list(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS: read only. Writes only through the functions above.
-- ---------------------------------------------------------------------
alter table public.grade_bands enable row level security;
alter table public.descriptive_grades enable row level security;
alter table public.remark_bank enable row level security;
alter table public.exam_class_modes enable row level security;
alter table public.exam_components enable row level security;
alter table public.exam_subject_max enable row level security;
alter table public.result_groups enable row level security;
alter table public.result_group_members enable row level security;
alter table public.subject_pass_marks enable row level security;
alter table public.marks enable row level security;
alter table public.subject_results enable row level security;
alter table public.student_results enable row level security;
alter table public.grade_entries enable row level security;
alter table public.report_remarks enable row level security;
alter table public.report_card_prints enable row level security;

-- reference lists: every signed-in staff member
create policy gb_select on public.grade_bands for select to authenticated using ((select app.is_staff_user()));
create policy dg_select on public.descriptive_grades for select to authenticated using ((select app.is_staff_user()));
create policy rb_select on public.remark_bank for select to authenticated using ((select app.is_staff_user()));
create policy ecm_select on public.exam_class_modes for select to authenticated using ((select app.is_staff_user()));

-- the scheme: Admin, the marks duty, and teachers of that class
create function app.scheme_visible(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_staff_user() and (app.is_admin() or public.has_duty('all_class_marks') or app.teaches_class(p_class))
$$;
grant execute on function app.scheme_visible(uuid) to authenticated;
create policy ec_select on public.exam_components for select to authenticated using (app.scheme_visible(class_id));
create policy rg_select on public.result_groups for select to authenticated using (app.scheme_visible(class_id));
create policy esm_select on public.exam_subject_max for select to authenticated
  using (exists (select 1 from public.exam_components c where c.id = component_id and app.scheme_visible(c.class_id)));
create policy rgm_select on public.result_group_members for select to authenticated
  using (exists (select 1 from public.result_groups g where g.id = group_id and app.scheme_visible(g.class_id)));
create policy spm_select on public.subject_pass_marks for select to authenticated using (app.scheme_visible(class_id));

-- marks, subject results and grades: only for a (section, subject) the person may enter (R18)
create policy mk_select on public.marks for select to authenticated using (app.marks_reader(section_id, subject_id));
create policy sr_select on public.subject_results for select to authenticated using (app.marks_reader(section_id, subject_id));
create policy ge_select on public.grade_entries for select to authenticated using (app.marks_reader(section_id, subject_id));
-- totals across subjects and remarks: Admin and the marks duty (a class teacher uses class_result_list / report_card_data)
create policy str_select on public.student_results for select to authenticated using ((select public.has_duty('all_class_marks')));
create policy rr_select on public.report_remarks for select to authenticated using ((select public.has_duty('all_class_marks')) or app.is_class_teacher(section_id));
create policy rcp_select on public.report_card_prints for select to authenticated using ((select app.is_admin()));

grant select on public.grade_bands, public.descriptive_grades, public.remark_bank, public.exam_class_modes, public.exam_components,
  public.exam_subject_max, public.result_groups, public.result_group_members, public.subject_pass_marks, public.marks,
  public.subject_results, public.student_results, public.grade_entries, public.report_remarks, public.report_card_prints to authenticated;
grant execute on function app.marks_writer(uuid, uuid), app.marks_reader(uuid, uuid), app.class_mode(uuid, uuid), app.class_locked(uuid, uuid) to authenticated;

-- subjects: Telugu name is already on subjects; the card shows it (VERIFY)
