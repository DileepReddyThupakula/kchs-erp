-- =====================================================================
-- Module 1: Foundation, staff & school setup
--   * role helpers (schema `app`, not exposed through the API)
--   * standard triggers: created/updated stamps + audit log (with masking)
--   * audit_logs (append-only)
--   * staff (+ staff_directory view), school_settings, academic_years,
--     holidays (auto 2nd Saturdays), classes, sections, subjects,
--     class_subjects, teacher_assignments
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated;

create type public.app_role as enum ('admin', 'computer_staff', 'teacher');

-- Nothing in this ERP is public: no anon access to any table.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------
-- Audit log (created first so every later table can use the trigger)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_user_id uuid,
  actor_role    text,
  action        text not null,          -- insert | update | delete | <event name>
  table_name    text,
  record_id     text,
  old_data      jsonb,
  new_data      jsonb,
  details       jsonb
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_time_idx on public.audit_logs (occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id);

create function app.block_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end $$;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function app.block_audit_mutation();

-- ---------------------------------------------------------------------
-- Staff (needed by every role check, so it lives in the foundation)
-- ---------------------------------------------------------------------
create table public.staff (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users (id) on delete set null,
  app_role        public.app_role,
  employee_code   text not null unique,
  full_name       text not null,
  gender          text check (gender in ('male', 'female', 'other')),
  dob             date,
  phone           text,
  email           text,
  designation     text,
  department      text,
  qualification   text,
  date_of_joining date,
  address         text,
  photo_path      text,
  status          text not null default 'active' check (status in ('active', 'inactive', 'left')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid
);

-- ---------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so they can read staff without
-- recursing through staff's own RLS policies.
-- ---------------------------------------------------------------------
create function app.current_staff_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.staff s
  where s.user_id = auth.uid() and s.status = 'active' and s.app_role is not null
$$;

create function app.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select s.app_role from public.staff s
  where s.user_id = auth.uid() and s.status = 'active'
$$;

create function app.is_staff_user() returns boolean
language sql stable set search_path = '' as $$
  select app.current_app_role() is not null
$$;

create function app.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.current_app_role() = 'admin', false)
$$;

-- Admin or Computer Staff ("office")
create function app.is_office() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.current_app_role() in ('admin', 'computer_staff'), false)
$$;

create function app.is_teacher() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.current_app_role() = 'teacher', false)
$$;

grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------
-- Standard triggers
-- ---------------------------------------------------------------------
create function app.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Trigger arguments = column names whose values must never reach the log.
create function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  col   text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'updated_by') = (v_new - 'updated_at' - 'updated_by') then
    return null; -- nothing meaningful changed
  end if;

  if tg_nargs > 0 then
    foreach col in array tg_argv loop
      if v_old ? col and v_old ->> col is not null then
        v_old := jsonb_set(v_old, array[col], '"[REDACTED]"');
      end if;
      if v_new ? col and v_new ->> col is not null then
        v_new := jsonb_set(v_new, array[col], '"[REDACTED]"');
      end if;
    end loop;
  end if;

  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), app.current_app_role()::text, lower(tg_op), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id'), v_old, v_new);
  return null;
end $$;

-- Attach stamp + audit triggers to a table; `redact` lists sensitive columns.
create function app.attach_std_triggers(tbl regclass, redact text[] default '{}')
returns void language plpgsql as $$
declare
  args text := '';
begin
  if array_length(redact, 1) > 0 then
    select string_agg(quote_literal(c), ', ') into args from unnest(redact) c;
  end if;
  execute format('create trigger stamp before insert or update on %s for each row execute function app.stamp_row()', tbl);
  execute format('create trigger audit after insert or update or delete on %s for each row execute function app.audit_row(%s)', tbl, args);
end $$;
revoke execute on function app.attach_std_triggers(regclass, text[]) from authenticated, public;

-- App-level events (logins, receipt cancellations, sensitive views...).
create function public.log_event(p_action text, p_table text default null,
                                 p_record_id text default null, p_details jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
  values (auth.uid(), app.current_app_role()::text, p_action, p_table, p_record_id, p_details);
end $$;
revoke execute on function public.log_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_event(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Staff: triggers, last-admin guard, RLS, directory view
-- ---------------------------------------------------------------------
select app.attach_std_triggers('public.staff');

create function app.guard_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.app_role = 'admin' and old.status = 'active' and old.user_id is not null
     and (tg_op = 'DELETE' or new.app_role is distinct from 'admin'
          or new.status <> 'active' or new.user_id is null)
     and not exists (select 1 from public.staff s
                     where s.id <> old.id and s.app_role = 'admin'
                       and s.status = 'active' and s.user_id is not null) then
    raise exception 'Cannot remove the last active Admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger staff_guard_last_admin
  before update or delete on public.staff
  for each row execute function app.guard_last_admin();

alter table public.staff enable row level security;
create policy staff_select on public.staff for select to authenticated
  using ((select app.is_office()) or user_id = (select auth.uid()));
create policy staff_insert on public.staff for insert to authenticated
  with check ((select app.is_admin()));
create policy staff_update on public.staff for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy staff_delete on public.staff for delete to authenticated
  using ((select app.is_admin()));

-- Names/designations of colleagues, for timetables and pickers (all roles).
create view public.staff_directory with (security_barrier) as
  select id, full_name, designation, department, status
  from public.staff
  where app.is_staff_user();
revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;

-- ---------------------------------------------------------------------
-- School settings (single row)
-- ---------------------------------------------------------------------
create table public.school_settings (
  id                        smallint primary key default 1 check (id = 1),
  name                      text not null default 'School Name',
  short_name                text,
  logo_path                 text,
  address_line1             text,
  address_line2             text,
  city                      text,
  district                  text,
  state                     text,
  pincode                   text,
  phone                     text,
  email                     text,
  website                   text,
  board                     text,
  affiliation_no            text,
  udise_code                text,
  principal_name            text,
  principal_signature_path  text,
  timezone                  text not null default 'Asia/Kolkata',
  mediums                   text[] not null default '{English,Telugu}',
  working_days              smallint[] not null default '{1,2,3,4,5,6}', -- ISO: 1=Mon .. 7=Sun
  second_saturday_holiday   boolean not null default true,
  periods_per_day           smallint not null default 8 check (periods_per_day between 1 and 15),
  admission_no_prefix       text not null default '',
  receipt_no_prefix         text not null default 'RCPT-',
  extra                     jsonb not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid,
  updated_by                uuid
);
insert into public.school_settings (id) values (1);
select app.attach_std_triggers('public.school_settings');

alter table public.school_settings enable row level security;
create policy settings_select on public.school_settings for select to authenticated
  using ((select app.is_staff_user()));
create policy settings_update on public.school_settings for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- ---------------------------------------------------------------------
-- Academic years & holidays
-- ---------------------------------------------------------------------
create table public.academic_years (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  start_date date not null,
  end_date   date not null,
  status     text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (end_date > start_date)
);
create unique index academic_years_one_current on public.academic_years (is_current) where is_current;
select app.attach_std_triggers('public.academic_years');

create table public.holidays (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  date             date not null,
  name             text not null,
  kind             text not null default 'declared' check (kind in ('second_saturday', 'declared')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (academic_year_id, date)
);
select app.attach_std_triggers('public.holidays');

-- Insert every 2nd Saturday inside the year's dates. Safe to re-run.
create function public.generate_second_saturdays(p_year_id uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  y        public.academic_years;
  m        date;
  sat2     date;
  inserted integer := 0;
begin
  select * into y from public.academic_years where id = p_year_id;
  if not found then raise exception 'academic year not found'; end if;
  m := date_trunc('month', y.start_date)::date;
  while m <= y.end_date loop
    -- first Saturday of month (ISO dow 6) + 7 days
    sat2 := m + ((6 - extract(isodow from m)::int + 7) % 7) + 7;
    if sat2 between y.start_date and y.end_date then
      insert into public.holidays (academic_year_id, date, name, kind)
      values (p_year_id, sat2, 'Second Saturday', 'second_saturday')
      on conflict (academic_year_id, date) do nothing;
      if found then inserted := inserted + 1; end if;
    end if;
    m := (m + interval '1 month')::date;
  end loop;
  return inserted;
end $$;

create function app.academic_year_after_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select second_saturday_holiday from public.school_settings where id = 1) then
    perform public.generate_second_saturdays(new.id);
  end if;
  return null;
end $$;
create trigger academic_year_second_saturdays
  after insert on public.academic_years
  for each row execute function app.academic_year_after_insert();

alter table public.academic_years enable row level security;
create policy ay_select on public.academic_years for select to authenticated using ((select app.is_staff_user()));
create policy ay_insert on public.academic_years for insert to authenticated with check ((select app.is_admin()));
create policy ay_update on public.academic_years for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy ay_delete on public.academic_years for delete to authenticated using ((select app.is_admin()));

alter table public.holidays enable row level security;
create policy hol_select on public.holidays for select to authenticated using ((select app.is_staff_user()));
create policy hol_insert on public.holidays for insert to authenticated with check ((select app.is_admin()));
create policy hol_update on public.holidays for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy hol_delete on public.holidays for delete to authenticated using ((select app.is_admin()));

-- ---------------------------------------------------------------------
-- Classes, sections, subjects
-- ---------------------------------------------------------------------
create table public.classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  short_name text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
select app.attach_std_triggers('public.classes');

create table public.sections (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id         uuid not null references public.classes (id) on delete restrict,
  name             text not null,
  medium           text,            -- null = not confirmed yet
  room             text,
  capacity         integer check (capacity is null or capacity > 0),
  class_teacher_id uuid references public.staff (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (academic_year_id, class_id, name)
);
create index sections_class_teacher_idx on public.sections (class_teacher_id);
select app.attach_std_triggers('public.sections');

-- Medium must be one of the mediums configured in settings.
create function app.check_section_medium() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.medium is not null
     and not (new.medium = any ((select mediums from public.school_settings where id = 1))) then
    raise exception 'Medium "%" is not configured in school settings', new.medium using errcode = '23514';
  end if;
  return new;
end $$;
create trigger sections_check_medium before insert or update of medium on public.sections
  for each row execute function app.check_section_medium();

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  code       text unique,
  type       text not null default 'scholastic' check (type in ('scholastic', 'co_scholastic')),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
select app.attach_std_triggers('public.subjects');

create table public.class_subjects (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id) on delete restrict,
  is_optional      boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (academic_year_id, class_id, subject_id)
);
select app.attach_std_triggers('public.class_subjects');

-- ---------------------------------------------------------------------
-- Teacher assignments: teacher <-> section <-> subject
-- (academic year comes from the section)
-- ---------------------------------------------------------------------
create table public.teacher_assignments (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references public.staff (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id) on delete restrict,
  periods_per_week smallint check (periods_per_week is null or periods_per_week >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (section_id, subject_id, staff_id)
);
create index teacher_assignments_staff_idx on public.teacher_assignments (staff_id);
select app.attach_std_triggers('public.teacher_assignments');

-- Section-level helpers used by later modules' RLS.
create function app.is_class_teacher(p_section_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sections
                 where id = p_section_id and class_teacher_id = app.current_staff_id())
$$;

create function app.teaches_section(p_section_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_class_teacher(p_section_id)
      or exists (select 1 from public.teacher_assignments
                 where section_id = p_section_id and staff_id = app.current_staff_id())
$$;

create function app.teaches_subject(p_section_id uuid, p_subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_assignments
                 where section_id = p_section_id and subject_id = p_subject_id
                   and staff_id = app.current_staff_id())
$$;
grant execute on all functions in schema app to authenticated;

-- RLS: setup tables are readable by every staff user; Admin writes.
alter table public.classes enable row level security;
create policy cls_select on public.classes for select to authenticated using ((select app.is_staff_user()));
create policy cls_insert on public.classes for insert to authenticated with check ((select app.is_admin()));
create policy cls_update on public.classes for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy cls_delete on public.classes for delete to authenticated using ((select app.is_admin()));

alter table public.sections enable row level security;
create policy sec_select on public.sections for select to authenticated using ((select app.is_staff_user()));
create policy sec_insert on public.sections for insert to authenticated with check ((select app.is_admin()));
create policy sec_update on public.sections for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy sec_delete on public.sections for delete to authenticated using ((select app.is_admin()));

alter table public.subjects enable row level security;
create policy sub_select on public.subjects for select to authenticated using ((select app.is_staff_user()));
create policy sub_insert on public.subjects for insert to authenticated with check ((select app.is_admin()));
create policy sub_update on public.subjects for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy sub_delete on public.subjects for delete to authenticated using ((select app.is_admin()));

alter table public.class_subjects enable row level security;
create policy cs_select on public.class_subjects for select to authenticated using ((select app.is_staff_user()));
create policy cs_insert on public.class_subjects for insert to authenticated with check ((select app.is_admin()));
create policy cs_update on public.class_subjects for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy cs_delete on public.class_subjects for delete to authenticated using ((select app.is_admin()));

-- Teachers see assignments of the sections they teach; office sees all.
alter table public.teacher_assignments enable row level security;
create policy ta_select on public.teacher_assignments for select to authenticated
  using ((select app.is_office()) or ((select app.is_teacher()) and app.teaches_section(section_id)));
create policy ta_insert on public.teacher_assignments for insert to authenticated with check ((select app.is_admin()));
create policy ta_update on public.teacher_assignments for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy ta_delete on public.teacher_assignments for delete to authenticated using ((select app.is_admin()));

-- Audit log: Admin reads; nobody writes directly (triggers / log_event only).
alter table public.audit_logs enable row level security;
create policy audit_select on public.audit_logs for select to authenticated using ((select app.is_admin()));

-- The signed-in user's role (null when they have no active staff record).
create function public.my_role() returns public.app_role
language sql stable set search_path = '' as $$ select app.current_app_role() $$;

-- Name + logo only, for the login page (callable before sign-in).
create function public.public_branding() returns table (name text, short_name text, logo_path text)
language sql stable security definer set search_path = '' as $$
  select name, short_name, logo_path from public.school_settings where id = 1
$$;

-- Belt and braces: strip anon from everything created above.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke execute on function public.generate_second_saturdays(uuid) from public;
grant execute on function public.generate_second_saturdays(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: school branding (logo, principal signature). Public read so
-- the logo can appear on the login page; only Admin uploads/changes.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, '{image/png,image/jpeg,image/webp,image/svg+xml}')
on conflict (id) do nothing;

create policy branding_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (select app.is_admin()));
create policy branding_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (select app.is_admin()))
  with check (bucket_id = 'branding' and (select app.is_admin()));
create policy branding_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and (select app.is_admin()));

revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.public_branding() to anon, authenticated;
revoke execute on function app.attach_std_triggers(regclass, text[]) from authenticated, public;
