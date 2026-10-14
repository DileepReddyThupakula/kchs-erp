-- =====================================================================
-- Module: Timetable (Part 1 - database)
--   Bell schedules + periods, per-class / per-weekday schedule assignment,
--   weekly timetable entries, dated substitutions, the session-marker
--   function attendance will use, weekly-period counts, "my week".
--   DEFAULT TIMINGS ARE PLACEHOLDERS: VERIFY against the real school
--   timings (all editable by Admin / timetable_edit duty).
--
--   Who may do what
--     Admin + teacher with the timetable_edit duty: create / change / delete
--       bell schedules, entries, substitutions.
--     Any other teacher: reads bell times (reference data) and ONLY their
--       own periods (entries where they are the teacher, substitutions that
--       involve them). Never another teacher's periods.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bell schedules
-- ---------------------------------------------------------------------
create table public.bell_schedules (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) >= 2),
  note       text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create unique index bell_schedules_one_default on public.bell_schedules ((true)) where is_default;
select app.attach_std_triggers('public.bell_schedules');

-- A new default replaces the old one; the default can never be removed or unset.
create function app.bell_default_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default then
      raise exception 'The default bell schedule cannot be deleted. Make another schedule the default first.' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_default and not new.is_default and pg_trigger_depth() = 1 then
    raise exception 'Choose another schedule as the default instead of unsetting this one.' using errcode = '23514';
  end if;
  if new.is_default then
    update public.bell_schedules set is_default = false where is_default and id <> new.id;
  end if;
  return new;
end $$;
create trigger bell_default_guard before insert or update or delete on public.bell_schedules
  for each row execute function app.bell_default_guard();

create table public.bell_periods (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.bell_schedules (id) on delete cascade,
  seq         smallint not null check (seq between 1 and 40),
  kind        text not null check (kind in ('teaching', 'break', 'lunch')),
  period_no   smallint check (period_no between 1 and 15),
  label       text,
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  check (end_time > start_time),
  check ((kind = 'teaching') = (period_no is not null)),
  unique (schedule_id, seq) deferrable initially deferred,
  unique (schedule_id, period_no) deferrable initially deferred
);
create index bell_periods_schedule_idx on public.bell_periods (schedule_id);
select app.attach_std_triggers('public.bell_periods');

-- Times of one schedule never overlap; teaching periods are numbered 1..n
-- without gaps. Checked at commit so several rows can be edited together.
create function app.check_bell_period() returns trigger
language plpgsql set search_path = '' as $$
declare
  sid uuid := coalesce(new.schedule_id, old.schedule_id);
  n   integer;
  mx  integer;
begin
  if new.id is not null and exists (select 1 from public.bell_periods where id = new.id)
     and exists (select 1 from public.bell_periods o
                 where o.schedule_id = new.schedule_id and o.id <> new.id
                   and o.start_time < new.end_time and new.start_time < o.end_time) then
    raise exception 'Bell times overlap in this schedule' using errcode = '23P01';
  end if;
  select count(period_no), coalesce(max(period_no), 0) into n, mx from public.bell_periods where schedule_id = sid;
  if n <> mx then
    raise exception 'Teaching periods must be numbered 1, 2, 3... without gaps' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger bell_period_check after insert or update or delete on public.bell_periods
  deferrable initially deferred for each row execute function app.check_bell_period();

-- Which schedule a class follows on a weekday (1 = Monday ... 7 = Sunday).
-- No row = the default schedule.
create table public.class_bell_schedules (
  class_id    uuid not null references public.classes (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),
  schedule_id uuid not null references public.bell_schedules (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  primary key (class_id, weekday)
);
create index class_bell_schedules_schedule_idx on public.class_bell_schedules (schedule_id);
select app.attach_std_triggers('public.class_bell_schedules');

create function app.schedule_for(p_class uuid, p_weekday integer) returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    (select c.schedule_id from public.class_bell_schedules c where c.class_id = p_class and c.weekday = p_weekday),
    (select b.id from public.bell_schedules b where b.is_default))
$$;

-- ---------------------------------------------------------------------
-- Timetable entries (the weekly pattern for a section)
-- ---------------------------------------------------------------------
create table public.timetable_entries (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  weekday          smallint not null check (weekday between 1 and 7),
  period_no        smallint not null check (period_no between 1 and 15),
  subject_id       uuid references public.subjects (id) on delete restrict,
  activity         text check (activity is null or length(trim(activity)) between 2 and 40),
  teacher_id       uuid references public.staff (id) on delete cascade,
  room             text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  -- a period is either a subject period or an activity (Games, Library, Free...)
  check ((subject_id is null) = (activity is not null)),
  -- a subject period always has its teacher
  check (subject_id is null or teacher_id is not null),
  -- one entry per section / weekday / period
  unique (section_id, weekday, period_no),
  -- subject + teacher must be an existing assignment for that section
  -- (not checked when subject_id is null: activities need no assignment)
  foreign key (section_id, subject_id, teacher_id)
    references public.teacher_assignments (section_id, subject_id, staff_id) on delete cascade
);
-- a teacher is in one place per weekday + period (concurrency-safe)
create unique index timetable_entries_teacher_slot
  on public.timetable_entries (academic_year_id, teacher_id, weekday, period_no) where teacher_id is not null;
create index timetable_entries_teacher_idx on public.timetable_entries (teacher_id);
create index timetable_entries_subject_idx on public.timetable_entries (subject_id);
select app.attach_std_triggers('public.timetable_entries');

-- Substitutions for one date
create table public.timetable_substitutions (
  id                    uuid primary key default gen_random_uuid(),
  sub_date              date not null,
  section_id            uuid not null references public.sections (id) on delete cascade,
  period_no             smallint not null check (period_no between 1 and 15),
  original_teacher_id   uuid not null references public.staff (id) on delete cascade,
  substitute_teacher_id uuid not null references public.staff (id) on delete cascade,
  reason                text,
  entered_by            uuid references public.staff (id) on delete set null,
  is_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,
  check (substitute_teacher_id <> original_teacher_id),
  unique (sub_date, section_id, period_no),
  unique (sub_date, substitute_teacher_id, period_no)
);
create index timetable_subs_original_idx on public.timetable_substitutions (original_teacher_id);
create index timetable_subs_section_idx on public.timetable_substitutions (section_id);
create index timetable_subs_entered_idx on public.timetable_substitutions (entered_by);
select app.attach_std_triggers('public.timetable_substitutions');

-- ---------------------------------------------------------------------
-- Calendar helper: is this a school day for that academic year?
-- (working weekday, not a listed holiday, not the 2nd Saturday when that
--  is a holiday, inside the academic year)
-- ---------------------------------------------------------------------
create function app.is_school_day(p_year uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.academic_years y, public.school_settings s
    where y.id = p_year and s.id = 1
      and p_date between y.start_date and y.end_date
      and extract(isodow from p_date)::smallint = any (s.working_days)
      and not (s.second_saturday_holiday and extract(isodow from p_date) = 6 and extract(day from p_date) between 8 and 14)
      and not exists (select 1 from public.holidays h where h.academic_year_id = y.id and h.date = p_date))
$$;

-- ---------------------------------------------------------------------
-- Entry rules (friendly messages; the unique indexes stay as the last guard)
-- ---------------------------------------------------------------------
create function app.timetable_entry_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sec     public.sections;
  wdays   smallint[];
  sched   uuid;
  clash   text;
  subdate date;
begin
  if auth.uid() is not null and not public.has_duty('timetable_edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into sec from public.sections where id = new.section_id;
  new.academic_year_id := sec.academic_year_id;

  select working_days into wdays from public.school_settings where id = 1;
  if not (new.weekday = any (wdays)) then
    raise exception 'That weekday is not a working day' using errcode = '23514';
  end if;

  sched := app.schedule_for(sec.class_id, new.weekday);
  if not exists (select 1 from public.bell_periods p where p.schedule_id = sched and p.kind = 'teaching' and p.period_no = new.period_no) then
    raise exception 'Period % does not exist in this class''s bell schedule for that day', new.period_no using errcode = '23514';
  end if;

  if new.teacher_id is not null then
    if not exists (select 1 from public.staff where id = new.teacher_id and status = 'active') then
      raise exception 'That teacher is not active' using errcode = '23514';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('tt:' || new.teacher_id || ':' || new.weekday || ':' || new.period_no, 0));
    select c.name || ' ' || s.name into clash
    from public.timetable_entries e
    join public.sections s on s.id = e.section_id
    join public.classes c on c.id = s.class_id
    where e.academic_year_id = new.academic_year_id and e.teacher_id = new.teacher_id
      and e.weekday = new.weekday and e.period_no = new.period_no and e.id <> new.id
    limit 1;
    if clash is not null then
      raise exception 'That teacher is already teaching % in period % on this weekday', clash, new.period_no using errcode = '23505';
    end if;
    select sub_date into subdate from public.timetable_substitutions
    where substitute_teacher_id = new.teacher_id and period_no = new.period_no
      and sub_date >= app.today_ist() and extract(isodow from sub_date) = new.weekday
    order by sub_date limit 1;
    if subdate is not null then
      raise exception 'That teacher is already substituting in period % on % (remove that substitution first)', new.period_no, subdate using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger timetable_entry_before before insert or update on public.timetable_entries
  for each row execute function app.timetable_entry_before();

-- Changing or removing a period that still has upcoming substitutions would
-- leave them pointing at nothing.
create function app.timetable_entry_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);   -- removed by a cascade (section / assignment / staff removed)
  end if;
  if exists (select 1 from public.timetable_substitutions s
             where s.section_id = old.section_id and s.period_no = old.period_no
               and s.sub_date >= app.today_ist() and extract(isodow from s.sub_date) = old.weekday)
     and (tg_op = 'DELETE'
          or new.section_id is distinct from old.section_id or new.weekday is distinct from old.weekday
          or new.period_no is distinct from old.period_no or new.teacher_id is distinct from old.teacher_id) then
    raise exception 'This period has upcoming substitutions. Remove them first.' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger timetable_entry_guard before update or delete on public.timetable_entries
  for each row execute function app.timetable_entry_guard();

-- ---------------------------------------------------------------------
-- Substitution rules
-- ---------------------------------------------------------------------
create function app.timetable_sub_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sec    public.sections;
  e      public.timetable_entries;
  wd     smallint := extract(isodow from new.sub_date);
  clash  text;
begin
  if auth.uid() is not null and not public.has_duty('timetable_edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into sec from public.sections where id = new.section_id;
  if not app.is_school_day(sec.academic_year_id, new.sub_date) then
    raise exception 'That date is a holiday or not a school day' using errcode = '23514';
  end if;
  select * into e from public.timetable_entries
  where section_id = new.section_id and weekday = wd and period_no = new.period_no;
  if not found or e.teacher_id is null then
    raise exception 'There is no teacher scheduled in that period to substitute' using errcode = '23514';
  end if;
  new.original_teacher_id := e.teacher_id;
  if new.entered_by is null then
    new.entered_by := app.current_staff_id();
  end if;
  if not exists (select 1 from public.staff where id = new.substitute_teacher_id and status = 'active') then
    raise exception 'That teacher is not active' using errcode = '23514';
  end if;
  if new.substitute_teacher_id = new.original_teacher_id then
    raise exception 'The substitute must be a different teacher' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tt:' || new.substitute_teacher_id || ':' || wd || ':' || new.period_no, 0));
  -- busy with their own class that period (unless they are themselves covered)
  select c.name || ' ' || s.name into clash
  from public.timetable_entries x
  join public.sections s on s.id = x.section_id
  join public.classes c on c.id = s.class_id
  where x.teacher_id = new.substitute_teacher_id and x.weekday = wd and x.period_no = new.period_no
    and x.academic_year_id = sec.academic_year_id
    and not exists (select 1 from public.timetable_substitutions o
                    where o.sub_date = new.sub_date and o.section_id = x.section_id and o.period_no = x.period_no
                      and o.id is distinct from new.id)
  limit 1;
  if clash is not null then
    raise exception 'That teacher is teaching % in period % that day', clash, new.period_no using errcode = '23505';
  end if;
  if exists (select 1 from public.timetable_substitutions o
             where o.sub_date = new.sub_date and o.period_no = new.period_no
               and o.substitute_teacher_id = new.substitute_teacher_id and o.id is distinct from new.id) then
    raise exception 'That teacher is already substituting in another class that period' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger timetable_sub_before before insert or update on public.timetable_substitutions
  for each row execute function app.timetable_sub_before();

-- ---------------------------------------------------------------------
-- Who marks a session? (attendance uses this)
--   morning   = first teaching period of that day's schedule
--   afternoon = first teaching period after the lunch break
--   order: substitute for that date -> scheduled teacher -> class teacher
--   nothing on holidays, Sundays, non-working days or outside the year.
-- ---------------------------------------------------------------------
create function public.session_markers(p_section uuid, p_date date)
returns table (session text, period_no integer, staff_id uuid, source text)
language plpgsql stable security definer set search_path = '' as $$
declare
  sec     public.sections;
  wd      integer := extract(isodow from p_date);
  sched   uuid;
  lunch_end time;
  p_morn  integer;
  p_aft   integer;
  who     uuid;
  src     text;
begin
  if not app.is_staff_user() then
    return;
  end if;
  select * into sec from public.sections where id = p_section;
  if not found then
    return;
  end if;
  -- scope: office, section-level duty, a teacher of the section, or its substitute that day
  if not (app.is_office() or app.has_section_duty() or app.teaches_section(p_section)
          or exists (select 1 from public.timetable_substitutions s
                     where s.section_id = p_section and s.sub_date = p_date and s.substitute_teacher_id = app.current_staff_id())) then
    return;
  end if;
  if not app.is_school_day(sec.academic_year_id, p_date) then
    return;
  end if;
  sched := app.schedule_for(sec.class_id, wd);
  if sched is null then
    return;
  end if;
  select min(p.period_no) into p_morn from public.bell_periods p where p.schedule_id = sched and p.kind = 'teaching';
  select min(p.end_time) into lunch_end from public.bell_periods p where p.schedule_id = sched and p.kind = 'lunch';
  if lunch_end is not null then
    select min(p.period_no) into p_aft from public.bell_periods p
    where p.schedule_id = sched and p.kind = 'teaching' and p.start_time >= lunch_end;
  end if;

  for session, period_no in
    select 'morning', p_morn where p_morn is not null
    union all
    select 'afternoon', p_aft where p_aft is not null
  loop
    who := null;
    src := null;
    select s.substitute_teacher_id into who from public.timetable_substitutions s
    where s.section_id = p_section and s.sub_date = p_date and s.period_no = session_markers.period_no;
    if who is not null then
      src := 'substitute';
    else
      select e.teacher_id into who from public.timetable_entries e
      where e.section_id = p_section and e.weekday = wd and e.period_no = session_markers.period_no;
      if who is not null then
        src := 'scheduled';
      end if;
    end if;
    if who is null then
      who := sec.class_teacher_id;
      src := case when who is null then 'none' else 'class_teacher' end;
    end if;
    staff_id := who;
    source := src;
    return next;
  end loop;
end $$;
revoke execute on function public.session_markers(uuid, date) from public, anon;
grant execute on function public.session_markers(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Teachers who are free for a substitution (timetable editors only)
-- ---------------------------------------------------------------------
create function public.free_teachers(p_date date, p_period integer, p_exclude uuid default null)
returns table (id uuid, full_name text, employee_code text, periods_that_day integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  wd integer := extract(isodow from p_date);
begin
  if not public.has_duty('timetable_edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select s.id, s.full_name, s.employee_code,
         (select count(*)::integer from public.timetable_entries e where e.teacher_id = s.id and e.weekday = wd
            and not exists (select 1 from public.timetable_substitutions o
                            where o.sub_date = p_date and o.section_id = e.section_id and o.period_no = e.period_no))
  from public.staff s
  where s.status = 'active'
    and (exists (select 1 from public.teacher_assignments a where a.staff_id = s.id)
         or exists (select 1 from public.sections c where c.class_teacher_id = s.id))
    and s.id is distinct from p_exclude
    and not exists (select 1 from public.timetable_entries e
                    where e.teacher_id = s.id and e.weekday = wd and e.period_no = p_period
                      and not exists (select 1 from public.timetable_substitutions o
                                      where o.sub_date = p_date and o.section_id = e.section_id and o.period_no = e.period_no))
    and not exists (select 1 from public.timetable_substitutions o
                    where o.sub_date = p_date and o.period_no = p_period and o.substitute_teacher_id = s.id)
  order by s.full_name;
end $$;
revoke execute on function public.free_teachers(date, integer, uuid) from public, anon;
grant execute on function public.free_teachers(date, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A teacher's own week (My timetable + dashboard "Today"): only their own
-- periods, including periods they cover and periods they were relieved of.
-- ---------------------------------------------------------------------
create function public.my_week(p_week_start date)
returns table (on_date date, weekday integer, period_no integer, kind text, section_id uuid, section_label text,
               subject_name text, activity text, room text, start_time time, end_time time, other_name text, reason text)
language sql stable security definer set search_path = '' as $$
  with me as (select app.current_staff_id() as id),
  days as (
    select d::date as on_date, extract(isodow from d)::integer as wd
    from generate_series(p_week_start, p_week_start + 6, interval '1 day') d
  ),
  own as (
    select d.on_date, d.wd, e.period_no, e.section_id, e.subject_id, e.activity, e.room,
           case when sub.id is not null then 'substituted_out' else 'regular' end as kind,
           sub.substitute_teacher_id as other_id, sub.reason
    from days d
    join public.timetable_entries e on e.weekday = d.wd
    join public.academic_years y on y.id = e.academic_year_id and d.on_date between y.start_date and y.end_date
    left join public.timetable_substitutions sub
           on sub.sub_date = d.on_date and sub.section_id = e.section_id and sub.period_no = e.period_no
    where e.teacher_id = (select id from me)
  ),
  cover as (
    select d.on_date, d.wd, s.period_no, s.section_id, e.subject_id, e.activity, e.room,
           'substitute_in'::text as kind, s.original_teacher_id as other_id, s.reason
    from days d
    join public.timetable_substitutions s on s.sub_date = d.on_date
    left join public.timetable_entries e
           on e.section_id = s.section_id and e.weekday = d.wd and e.period_no = s.period_no
    where s.substitute_teacher_id = (select id from me)
  ),
  u as (select * from own union all select * from cover)
  select u.on_date, u.wd, u.period_no::integer, u.kind, u.section_id,
         c.name || ' – ' || sec.name, su.name, u.activity, u.room,
         bp.start_time, bp.end_time, o.full_name, u.reason
  from u
  join public.sections sec on sec.id = u.section_id
  join public.classes c on c.id = sec.class_id
  left join public.subjects su on su.id = u.subject_id
  left join public.staff o on o.id = u.other_id
  left join public.bell_periods bp
         on bp.schedule_id = app.schedule_for(sec.class_id, u.wd) and bp.kind = 'teaching' and bp.period_no = u.period_no
  where app.is_staff_user()
  order by u.on_date, u.period_no
$$;
revoke execute on function public.my_week(date) from public, anon;
grant execute on function public.my_week(date) to authenticated;

-- ---------------------------------------------------------------------
-- Weekly periods scheduled vs the assignment's periods_per_week target
-- ---------------------------------------------------------------------
create view public.timetable_period_counts with (security_invoker = true) as
select a.id as assignment_id, a.section_id, a.subject_id, a.staff_id,
       a.periods_per_week as target,
       count(e.id)::integer as scheduled,
       case when a.periods_per_week is null then null else count(e.id)::integer - a.periods_per_week end as difference,
       case when a.periods_per_week is null then 'no_target'
            when count(e.id) > a.periods_per_week then 'over'
            when count(e.id) < a.periods_per_week then 'under'
            else 'ok' end as status
from public.teacher_assignments a
left join public.timetable_entries e
       on e.section_id = a.section_id and e.subject_id = a.subject_id and e.teacher_id = a.staff_id
group by a.id;
grant select on public.timetable_period_counts to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.bell_schedules enable row level security;
alter table public.bell_periods enable row level security;
alter table public.class_bell_schedules enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.timetable_substitutions enable row level security;

-- bell times are reference data: every staff user reads, editors write
create policy bs_select on public.bell_schedules for select to authenticated using ((select app.is_staff_user()));
create policy bs_insert on public.bell_schedules for insert to authenticated with check ((select public.has_duty('timetable_edit')));
create policy bs_update on public.bell_schedules for update to authenticated
  using ((select public.has_duty('timetable_edit'))) with check ((select public.has_duty('timetable_edit')));
create policy bs_delete on public.bell_schedules for delete to authenticated using ((select public.has_duty('timetable_edit')));

create policy bp_select on public.bell_periods for select to authenticated using ((select app.is_staff_user()));
create policy bp_insert on public.bell_periods for insert to authenticated with check ((select public.has_duty('timetable_edit')));
create policy bp_update on public.bell_periods for update to authenticated
  using ((select public.has_duty('timetable_edit'))) with check ((select public.has_duty('timetable_edit')));
create policy bp_delete on public.bell_periods for delete to authenticated using ((select public.has_duty('timetable_edit')));

create policy cbs_select on public.class_bell_schedules for select to authenticated using ((select app.is_staff_user()));
create policy cbs_insert on public.class_bell_schedules for insert to authenticated with check ((select public.has_duty('timetable_edit')));
create policy cbs_update on public.class_bell_schedules for update to authenticated
  using ((select public.has_duty('timetable_edit'))) with check ((select public.has_duty('timetable_edit')));
create policy cbs_delete on public.class_bell_schedules for delete to authenticated using ((select public.has_duty('timetable_edit')));

-- entries: editors see all; any other teacher only the periods they teach
create policy tte_select on public.timetable_entries for select to authenticated
  using ((select public.has_duty('timetable_edit')) or teacher_id = (select app.current_staff_id()));
create policy tte_insert on public.timetable_entries for insert to authenticated with check ((select public.has_duty('timetable_edit')));
create policy tte_update on public.timetable_entries for update to authenticated
  using ((select public.has_duty('timetable_edit'))) with check ((select public.has_duty('timetable_edit')));
create policy tte_delete on public.timetable_entries for delete to authenticated using ((select public.has_duty('timetable_edit')));

create policy tts_select on public.timetable_substitutions for select to authenticated
  using ((select public.has_duty('timetable_edit'))
         or original_teacher_id = (select app.current_staff_id())
         or substitute_teacher_id = (select app.current_staff_id()));
create policy tts_insert on public.timetable_substitutions for insert to authenticated with check ((select public.has_duty('timetable_edit')));
create policy tts_update on public.timetable_substitutions for update to authenticated
  using ((select public.has_duty('timetable_edit'))) with check ((select public.has_duty('timetable_edit')));
create policy tts_delete on public.timetable_substitutions for delete to authenticated using ((select public.has_duty('timetable_edit')));

grant select, insert, update, delete on public.bell_schedules, public.bell_periods, public.class_bell_schedules,
  public.timetable_entries, public.timetable_substitutions to authenticated;
grant execute on function app.schedule_for(uuid, integer), app.is_school_day(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Default bell schedule (VERIFY against our real school timings)
-- ---------------------------------------------------------------------
with s as (
  insert into public.bell_schedules (name, note, is_default)
  values ('Regular day', 'Default timings - VERIFY against the real school timings', true)
  returning id
)
insert into public.bell_periods (schedule_id, seq, kind, period_no, label, start_time, end_time)
select s.id, v.seq, v.kind, v.pno, v.label, v.st::time, v.et::time
from s, (values
  (1,  'teaching', 1, 'Period 1',    '09:00', '09:40'),
  (2,  'teaching', 2, 'Period 2',    '09:40', '10:20'),
  (3,  'break',    null, 'Short break', '10:20', '10:35'),
  (4,  'teaching', 3, 'Period 3',    '10:35', '11:15'),
  (5,  'teaching', 4, 'Period 4',    '11:15', '11:55'),
  (6,  'lunch',    null, 'Lunch',    '11:55', '12:40'),
  (7,  'teaching', 5, 'Period 5',    '12:40', '13:20'),
  (8,  'teaching', 6, 'Period 6',    '13:20', '14:00'),
  (9,  'break',    null, 'Short break', '14:00', '14:10'),
  (10, 'teaching', 7, 'Period 7',    '14:10', '14:50'),
  (11, 'teaching', 8, 'Period 8',    '14:50', '15:30')
) as v(seq, kind, pno, label, st, et);
