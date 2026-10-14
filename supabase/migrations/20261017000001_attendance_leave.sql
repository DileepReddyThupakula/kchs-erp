-- =====================================================================
-- Module: Attendance (students, two sessions a day) + staff leave and
-- staff attendance.   Part 1 - database.
--
--  * Writes go ONLY through checked functions (mark_attendance,
--    mark_staff_attendance, decide_leave, cancel_leave). The tables have no
--    insert / update / delete policy for signed-in users, so direct access
--    cannot bypass the rules.
--  * Who marks a session comes from the Timetable module (session markers:
--    substitute -> scheduled teacher -> class teacher).
--  * Counting: Present and Late = attended; Absent and Leave = not attended.
--    Each session is half a day. VERIFY with the school (DECISIONS.md AT3).
-- =====================================================================

alter table public.school_settings
  add column low_attendance_pct smallint not null default 75 check (low_attendance_pct between 1 and 100);

-- ---------------------------------------------------------------------
-- Who marks a session (no scope check; used inside the checked functions)
-- ---------------------------------------------------------------------
create function app.session_resolve(p_section uuid, p_date date)
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
  s       text;
  p       integer;
begin
  select * into sec from public.sections where id = p_section;
  if not found or not app.is_school_day(sec.academic_year_id, p_date) then
    return;
  end if;
  sched := app.schedule_for(sec.class_id, wd);
  if sched is null then
    return;
  end if;
  select min(b.period_no) into p_morn from public.bell_periods b where b.schedule_id = sched and b.kind = 'teaching';
  select min(b.end_time) into lunch_end from public.bell_periods b where b.schedule_id = sched and b.kind = 'lunch';
  if lunch_end is not null then
    select min(b.period_no) into p_aft from public.bell_periods b
    where b.schedule_id = sched and b.kind = 'teaching' and b.start_time >= lunch_end;
  end if;
  for s, p in
    select 'morning', p_morn where p_morn is not null
    union all
    select 'afternoon', p_aft where p_aft is not null
  loop
    who := null;
    src := null;
    select x.substitute_teacher_id into who from public.timetable_substitutions x
    where x.section_id = p_section and x.sub_date = p_date and x.period_no = p;
    if who is not null then
      src := 'substitute';
    else
      select e.teacher_id into who from public.timetable_entries e
      where e.section_id = p_section and e.weekday = wd and e.period_no = p;
      if who is not null then
        src := 'scheduled';
      end if;
    end if;
    if who is null then
      who := sec.class_teacher_id;
      src := case when who is null then 'none' else 'class_teacher' end;
    end if;
    session := s;
    period_no := p;
    staff_id := who;
    source := src;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Student attendance
-- ---------------------------------------------------------------------
create table public.attendance_sessions (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  section_id       uuid not null references public.sections (id) on delete cascade,
  att_date         date not null,
  session          text not null check (session in ('morning', 'afternoon')),
  period_no        smallint,
  assigned_to      uuid references public.staff (id) on delete set null,  -- marker at the time
  marked_by        uuid references public.staff (id) on delete set null,
  marked_at        timestamptz not null default now(),
  kind             text not null check (kind in ('regular', 'substitute', 'correction')),
  status           text not null default 'marked' check (status in ('marked')),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (section_id, att_date, session)
);
create index attendance_sessions_date_idx on public.attendance_sessions (att_date);
create index attendance_sessions_assigned_idx on public.attendance_sessions (assigned_to);
create index attendance_sessions_marked_idx on public.attendance_sessions (marked_by);
create index attendance_sessions_year_idx on public.attendance_sessions (academic_year_id);
select app.attach_std_triggers('public.attendance_sessions');

create table public.student_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  att_date   date not null,
  session    text not null check (session in ('morning', 'afternoon')),
  status     text not null check (status in ('present', 'absent', 'late', 'leave')),
  note       text,
  marked_by  uuid references public.staff (id) on delete set null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (session_id, student_id),
  unique (student_id, att_date, session)
);
create index student_attendance_date_idx on public.student_attendance (att_date);
create index student_attendance_marked_idx on public.student_attendance (marked_by);
select app.attach_std_triggers('public.student_attendance');

-- date and session always come from the session row
create function app.student_attendance_before() returns trigger
language plpgsql set search_path = '' as $$
declare s public.attendance_sessions;
begin
  select * into s from public.attendance_sessions where id = new.session_id;
  new.att_date := s.att_date;
  new.session := s.session;
  return new;
end $$;
create trigger student_attendance_before before insert on public.student_attendance
  for each row execute function app.student_attendance_before();

-- one row per student, date, session -> daily status
create view public.attendance_daily with (security_invoker = true) as
select student_id, att_date,
       max(status) filter (where session = 'morning')   as morning,
       max(status) filter (where session = 'afternoon') as afternoon,
       count(*)::integer as sessions_marked,
       (count(*) filter (where status in ('present', 'late')))::integer as sessions_attended,
       case
         when count(*) = 2 and count(*) filter (where status in ('present', 'late')) = 2 then 'present'
         when count(*) = 2 and count(*) filter (where status in ('present', 'late')) = 0 then 'absent'
         when count(*) = 2 and max(status) filter (where session = 'morning') in ('present', 'late') then 'morning_only'
         when count(*) = 2 then 'afternoon_only'
         when count(*) filter (where status in ('present', 'late')) = 1 then 'one_session_present'
         else 'one_session_absent'
       end as day_status
from public.student_attendance
group by student_id, att_date;
grant select on public.attendance_daily to authenticated;

-- ---------------------------------------------------------------------
-- mark_attendance: the only way to write student attendance
-- p_entries: [{"student_id": "...", "status": "present|absent|late|leave", "note": "..."}]
-- ---------------------------------------------------------------------
create function public.mark_attendance(p_section uuid, p_date date, p_session text, p_entries jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me       uuid := app.current_staff_id();
  any_sec  boolean := public.has_duty('all_class_attendance');
  today    date := app.today_ist();
  sec      public.sections;
  res      record;
  sid      uuid;
  old_by   uuid;
  existed  boolean := false;
  v_kind   text;
  e        jsonb;
  stu      uuid;
  stat     text;
  expected uuid[];
  given    uuid[] := '{}';
begin
  if me is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_session not in ('morning', 'afternoon') then
    raise exception 'Session must be morning or afternoon' using errcode = '23514';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Nothing to save' using errcode = '23514';
  end if;
  select * into sec from public.sections where id = p_section;
  if not found then
    raise exception 'Unknown section' using errcode = '23514';
  end if;
  if p_date > today then
    raise exception 'Attendance cannot be marked for a future date' using errcode = '23514';
  end if;
  if not app.is_school_day(sec.academic_year_id, p_date) then
    raise exception 'No attendance on Sundays, 2nd Saturdays, holidays or outside the academic year' using errcode = '23514';
  end if;
  select * into res from app.session_resolve(p_section, p_date) r where r.session = p_session;
  if not found then
    raise exception 'This section has no % session on that day', p_session using errcode = '23514';
  end if;
  if not any_sec then
    if p_date <> today then
      raise exception 'You can mark attendance only for today' using errcode = '42501';
    end if;
    if res.staff_id is distinct from me then
      raise exception 'This session is not assigned to you' using errcode = '42501';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('att:' || p_section || ':' || p_date || ':' || p_session, 0));

  select id, marked_by into sid, old_by from public.attendance_sessions
  where section_id = p_section and att_date = p_date and session = p_session;
  existed := found;

  if res.staff_id = me and p_date = today then
    v_kind := case when res.source = 'substitute' then 'substitute' else 'regular' end;
  else
    v_kind := 'correction';
  end if;
  if existed and old_by is distinct from me then
    v_kind := 'correction';
  end if;

  -- students who can be marked: active, enrolled in this section that year, admitted by that date
  select coalesce(array_agg(s.id), '{}') into expected
  from public.student_enrollments en
  join public.students s on s.id = en.student_id
  where en.section_id = p_section and en.academic_year_id = sec.academic_year_id
    and en.status = 'active' and s.status = 'active' and s.admission_date <= p_date;

  for e in select * from jsonb_array_elements(p_entries) loop
    stu := (e ->> 'student_id')::uuid;
    stat := e ->> 'status';
    if stat is null or stat not in ('present', 'absent', 'late', 'leave') then
      raise exception 'Status must be present, absent, late or leave' using errcode = '23514';
    end if;
    if not (stu = any (expected)) then
      raise exception 'A student in the list is not in this section on that date' using errcode = '23514';
    end if;
    given := given || stu;
  end loop;
  if not existed and not (expected <@ given) then
    raise exception 'Mark every student in the section (% of % given)', cardinality(given), cardinality(expected) using errcode = '23514';
  end if;

  if existed then
    update public.attendance_sessions
       set marked_by = me, marked_at = now(), kind = v_kind, assigned_to = res.staff_id, period_no = res.period_no
     where id = sid;
  else
    insert into public.attendance_sessions (academic_year_id, section_id, att_date, session, period_no, assigned_to, marked_by, kind, is_demo)
    values (sec.academic_year_id, p_section, p_date, p_session, res.period_no, res.staff_id, me, v_kind, false)
    returning id into sid;
  end if;

  for e in select * from jsonb_array_elements(p_entries) loop
    insert into public.student_attendance (session_id, student_id, status, note, marked_by)
    values (sid, (e ->> 'student_id')::uuid, e ->> 'status', nullif(trim(e ->> 'note'), ''), me)
    on conflict (session_id, student_id)
    do update set status = excluded.status, note = excluded.note, marked_by = excluded.marked_by;
  end loop;
  return sid;
end $$;
revoke execute on function public.mark_attendance(uuid, date, text, jsonb) from public, anon;
grant execute on function public.mark_attendance(uuid, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Sessions waiting for the signed-in teacher (today by default)
-- ---------------------------------------------------------------------
create function public.my_attendance_sessions(p_date date default null)
returns table (section_id uuid, section_label text, session text, period_no integer, source text, marked boolean, marked_kind text)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := app.current_staff_id();
  d  date := coalesce(p_date, app.today_ist());
begin
  if me is null then
    return;
  end if;
  return query
  select sec.id, c.name || ' – ' || sec.name, r.session, r.period_no, r.source,
         (a.id is not null), a.kind
  from public.sections sec
  join public.classes c on c.id = sec.class_id
  join public.academic_years y on y.id = sec.academic_year_id and d between y.start_date and y.end_date
  cross join lateral app.session_resolve(sec.id, d) r
  left join public.attendance_sessions a on a.section_id = sec.id and a.att_date = d and a.session = r.session
  where r.staff_id = me
  order by c.sort_order, sec.name, r.session desc;   -- morning before afternoon
end $$;
revoke execute on function public.my_attendance_sessions(date) from public, anon;
grant execute on function public.my_attendance_sessions(date) to authenticated;

-- ---------------------------------------------------------------------
-- Sessions not yet marked on a date (Admin / all_class_attendance duty)
-- ---------------------------------------------------------------------
create function public.unmarked_sessions(p_date date default null)
returns table (section_id uuid, section_label text, session text, period_no integer, staff_id uuid, staff_name text, source text)
language plpgsql stable security definer set search_path = '' as $$
declare
  d date := coalesce(p_date, app.today_ist());
begin
  if not public.has_duty('all_class_attendance') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select sec.id, c.name || ' – ' || sec.name, r.session, r.period_no, r.staff_id, st.full_name, r.source
  from public.sections sec
  join public.classes c on c.id = sec.class_id
  join public.academic_years y on y.id = sec.academic_year_id and d between y.start_date and y.end_date
  cross join lateral app.session_resolve(sec.id, d) r
  left join public.staff st on st.id = r.staff_id
  where not exists (select 1 from public.attendance_sessions a where a.section_id = sec.id and a.att_date = d and a.session = r.session)
    and exists (select 1 from public.student_enrollments en where en.section_id = sec.id and en.status = 'active')
  order by c.sort_order, sec.name, r.session desc;
end $$;
revoke execute on function public.unmarked_sessions(date) from public, anon;
grant execute on function public.unmarked_sessions(date) to authenticated;

-- ---------------------------------------------------------------------
-- Daily summary per section and session (office / duty; a class teacher
-- gets their own section)
-- ---------------------------------------------------------------------
create function public.daily_attendance_summary(p_date date)
returns table (section_id uuid, section_label text, session text, marked boolean, marked_by_name text, kind text,
               present integer, late integer, absent integer, on_leave integer, total integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := app.current_staff_id();
  any_sec boolean := public.has_duty('all_class_attendance');
begin
  if me is null then
    return;
  end if;
  return query
  select sec.id, c.name || ' – ' || sec.name, s.session, (a.id is not null), st.full_name, a.kind,
         (count(sa.id) filter (where sa.status = 'present'))::integer,
         (count(sa.id) filter (where sa.status = 'late'))::integer,
         (count(sa.id) filter (where sa.status = 'absent'))::integer,
         (count(sa.id) filter (where sa.status = 'leave'))::integer,
         count(sa.id)::integer
  from public.sections sec
  join public.classes c on c.id = sec.class_id
  join public.academic_years y on y.id = sec.academic_year_id and p_date between y.start_date and y.end_date
  cross join (values ('morning'), ('afternoon')) s(session)
  left join public.attendance_sessions a on a.section_id = sec.id and a.att_date = p_date and a.session = s.session
  left join public.staff st on st.id = a.marked_by
  left join public.student_attendance sa on sa.session_id = a.id
  where (any_sec or sec.class_teacher_id = me)
    and (a.id is not null or exists (select 1 from app.session_resolve(sec.id, p_date) r where r.session = s.session))
  group by sec.id, c.name, c.sort_order, sec.name, s.session, a.id, st.full_name, a.kind
  order by c.sort_order, sec.name, s.session desc;
end $$;
revoke execute on function public.daily_attendance_summary(date) from public, anon;
grant execute on function public.daily_attendance_summary(date) to authenticated;

-- ---------------------------------------------------------------------
-- Percentages (security invoker: only rows the caller may see are counted)
-- ---------------------------------------------------------------------
create function public.attendance_summary(p_student uuid, p_from date, p_to date)
returns table (sessions_marked integer, sessions_attended integer, pct numeric, full_days integer, half_days integer, absent_days integer)
language sql stable set search_path = '' as $$
  select coalesce(sum(d.sessions_marked), 0)::integer,
         coalesce(sum(d.sessions_attended), 0)::integer,
         case when coalesce(sum(d.sessions_marked), 0) = 0 then null
              else round(100.0 * sum(d.sessions_attended) / sum(d.sessions_marked), 1) end,
         (count(*) filter (where d.day_status = 'present'))::integer,
         (count(*) filter (where d.day_status in ('morning_only', 'afternoon_only')))::integer,
         (count(*) filter (where d.day_status = 'absent'))::integer
  from public.attendance_daily d
  where d.student_id = p_student and d.att_date between p_from and p_to
$$;
grant execute on function public.attendance_summary(uuid, date, date) to authenticated;

create function public.section_attendance(p_section uuid, p_from date, p_to date)
returns table (student_id uuid, admission_no text, full_name text, roll_no integer,
               sessions_marked integer, sessions_attended integer, pct numeric, full_days integer, half_days integer, absent_days integer)
language sql stable set search_path = '' as $$
  select s.id, s.admission_no, s.full_name, en.roll_no,
         coalesce(sum(d.sessions_marked), 0)::integer,
         coalesce(sum(d.sessions_attended), 0)::integer,
         case when coalesce(sum(d.sessions_marked), 0) = 0 then null
              else round(100.0 * sum(d.sessions_attended) / sum(d.sessions_marked), 1) end,
         (count(d.att_date) filter (where d.day_status = 'present'))::integer,
         (count(d.att_date) filter (where d.day_status in ('morning_only', 'afternoon_only')))::integer,
         (count(d.att_date) filter (where d.day_status = 'absent'))::integer
  from public.student_enrollments en
  join public.students s on s.id = en.student_id
  left join public.attendance_daily d on d.student_id = s.id and d.att_date between p_from and p_to
  where en.section_id = p_section and en.status = 'active' and s.status = 'active'
  group by s.id, s.admission_no, s.full_name, en.roll_no
  order by en.roll_no nulls last, s.full_name
$$;
grant execute on function public.section_attendance(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Staff leave
-- ---------------------------------------------------------------------
create table public.leave_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (length(trim(name)) >= 2),
  default_days numeric(5, 1) check (default_days is null or default_days >= 0),  -- null = unlimited
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid
);
select app.attach_std_triggers('public.leave_types');
insert into public.leave_types (name, sort_order) values ('Casual', 1), ('Sick', 2), ('Other', 3);

-- per-person yearly allowance that replaces the type's default (null = unlimited)
create table public.leave_balances (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references public.staff (id) on delete cascade,
  leave_type_id    uuid not null references public.leave_types (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  allowance_days   numeric(5, 1) check (allowance_days is null or allowance_days >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (staff_id, leave_type_id, academic_year_id)
);
create index leave_balances_type_idx on public.leave_balances (leave_type_id);
create index leave_balances_year_idx on public.leave_balances (academic_year_id);
select app.attach_std_triggers('public.leave_balances');

-- working days between two dates (not Sundays / non-working days, 2nd Saturdays, holidays)
create function app.leave_days(p_from date, p_to date) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from generate_series(p_from, p_to, interval '1 day') g(d), public.school_settings s
  where s.id = 1
    and extract(isodow from g.d)::smallint = any (s.working_days)
    and not (s.second_saturday_holiday and extract(isodow from g.d) = 6 and extract(day from g.d) between 8 and 14)
    and not exists (select 1 from public.holidays h where h.date = g.d::date)
$$;

create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.staff (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  from_date     date not null,
  to_date       date not null,
  days          integer not null default 0,
  reason        text not null check (length(trim(reason)) >= 3),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by    uuid references public.staff (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  check (to_date >= from_date)
);
create index leave_requests_staff_idx on public.leave_requests (staff_id, from_date);
create index leave_requests_status_idx on public.leave_requests (status);
create index leave_requests_type_idx on public.leave_requests (leave_type_id);
create index leave_requests_decided_idx on public.leave_requests (decided_by);
select app.attach_std_triggers('public.leave_requests');

create function app.leave_request_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if tg_op = 'INSERT' then
    new.days := app.leave_days(new.from_date, new.to_date);
    if new.days < 1 then
      raise exception 'These dates have no working days (Sundays and holidays are not counted)' using errcode = '23514';
    end if;
    if not exists (select 1 from public.leave_types where id = new.leave_type_id and is_active) then
      raise exception 'Choose an active leave type' using errcode = '23514';
    end if;
    select count(*) into n from public.leave_requests o
    where o.staff_id = new.staff_id and o.status in ('pending', 'approved')
      and o.from_date <= new.to_date and new.from_date <= o.to_date;
    if n > 0 then
      raise exception 'You already have a leave request that overlaps these dates' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger leave_request_before before insert on public.leave_requests
  for each row execute function app.leave_request_before();

-- allowance, used and pending days of a staff member for an academic year
create function public.leave_balance(p_staff uuid, p_year uuid)
returns table (leave_type_id uuid, leave_type text, allowance numeric, used numeric, pending numeric, remaining numeric)
language sql stable set search_path = '' as $$
  select t.id, t.name,
         coalesce((select b.allowance_days from public.leave_balances b
                   where b.staff_id = p_staff and b.leave_type_id = t.id and b.academic_year_id = p_year), t.default_days) as allowance,
         coalesce(sum(r.days) filter (where r.status = 'approved'), 0)::numeric as used,
         coalesce(sum(r.days) filter (where r.status = 'pending'), 0)::numeric as pending,
         case when coalesce((select b.allowance_days from public.leave_balances b
                             where b.staff_id = p_staff and b.leave_type_id = t.id and b.academic_year_id = p_year), t.default_days) is null
              then null
              else coalesce((select b.allowance_days from public.leave_balances b
                             where b.staff_id = p_staff and b.leave_type_id = t.id and b.academic_year_id = p_year), t.default_days)
                   - coalesce(sum(r.days) filter (where r.status = 'approved'), 0) end as remaining
  from public.leave_types t
  left join public.academic_years y on y.id = p_year
  left join public.leave_requests r on r.leave_type_id = t.id and r.staff_id = p_staff
       and r.from_date between y.start_date and y.end_date
  where t.is_active
  group by t.id, t.name, t.default_days, t.sort_order
  order by t.sort_order
$$;
grant execute on function public.leave_balance(uuid, uuid) to authenticated;

-- Admin approves / rejects (rejecting needs a note); approving respects the balance
create function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r   public.leave_requests;
  y   uuid;
  allowance numeric;
  used numeric;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found then
    raise exception 'Unknown leave request' using errcode = '23514';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request has already been %', r.status using errcode = '23514';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Give a short note when rejecting a request' using errcode = '23514';
  end if;
  if p_approve then
    select id into y from public.academic_years where r.from_date between start_date and end_date order by start_date desc limit 1;
    select coalesce((select b.allowance_days from public.leave_balances b
                     where b.staff_id = r.staff_id and b.leave_type_id = r.leave_type_id and b.academic_year_id = y),
                    (select default_days from public.leave_types where id = r.leave_type_id))
      into allowance;
    if allowance is not null then
      select coalesce(sum(days), 0) into used from public.leave_requests o
      where o.staff_id = r.staff_id and o.leave_type_id = r.leave_type_id and o.status = 'approved'
        and o.id <> r.id and y is not null
        and o.from_date between (select start_date from public.academic_years where id = y) and (select end_date from public.academic_years where id = y);
      if used + r.days > allowance then
        raise exception 'Not enough leave balance: % day(s) left, % requested', allowance - used, r.days using errcode = '23514';
      end if;
    end if;
  end if;
  update public.leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = app.current_staff_id(), decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_id;
end $$;
revoke execute on function public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;

-- the applicant may withdraw a request that is still pending
create function public.cancel_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or (r.staff_id is distinct from app.current_staff_id() and not app.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'Only a pending request can be cancelled' using errcode = '23514';
  end if;
  update public.leave_requests set status = 'cancelled' where id = p_id;
end $$;
revoke execute on function public.cancel_leave(uuid) from public, anon;
grant execute on function public.cancel_leave(uuid) to authenticated;

-- approved leave on a date and the periods it leaves uncovered (for Substitutions)
create function public.approved_leave_periods(p_date date)
returns table (staff_id uuid, staff_name text, leave_type text, section_id uuid, section_label text, period_no integer, covered boolean)
language plpgsql stable security definer set search_path = '' as $$
declare wd integer := extract(isodow from p_date);
begin
  if not public.has_duty('timetable_edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select r.staff_id, st.full_name, t.name, e.section_id, c.name || ' – ' || sec.name, e.period_no::integer,
         exists (select 1 from public.timetable_substitutions s
                 where s.sub_date = p_date and s.section_id = e.section_id and s.period_no = e.period_no)
  from public.leave_requests r
  join public.staff st on st.id = r.staff_id
  join public.leave_types t on t.id = r.leave_type_id
  join public.timetable_entries e on e.teacher_id = r.staff_id and e.weekday = wd
  join public.sections sec on sec.id = e.section_id
  join public.classes c on c.id = sec.class_id
  join public.academic_years y on y.id = e.academic_year_id and p_date between y.start_date and y.end_date
  where r.status = 'approved' and p_date between r.from_date and r.to_date
  order by st.full_name, e.period_no, c.sort_order;
end $$;
revoke execute on function public.approved_leave_periods(date) from public, anon;
grant execute on function public.approved_leave_periods(date) to authenticated;

-- ---------------------------------------------------------------------
-- Staff attendance (Admin marks; a teacher sees only their own record)
-- ---------------------------------------------------------------------
create table public.staff_attendance (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff (id) on delete cascade,
  att_date   date not null,
  status     text not null check (status in ('present', 'absent', 'late', 'on_leave')),
  note       text,
  marked_by  uuid references public.staff (id) on delete set null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (staff_id, att_date)
);
create index staff_attendance_date_idx on public.staff_attendance (att_date);
create index staff_attendance_marked_idx on public.staff_attendance (marked_by);
select app.attach_std_triggers('public.staff_attendance');

-- the day's sheet: saved status, else "on leave" when approved leave covers the day
create function public.staff_attendance_sheet(p_date date)
returns table (staff_id uuid, full_name text, employee_code text, designation text, status text, prefilled boolean, note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select s.id, s.full_name, s.employee_code, s.designation,
         coalesce(a.status,
                  case when exists (select 1 from public.leave_requests r
                                    where r.staff_id = s.id and r.status = 'approved' and p_date between r.from_date and r.to_date)
                       then 'on_leave' end),
         (a.id is null and exists (select 1 from public.leave_requests r
                                   where r.staff_id = s.id and r.status = 'approved' and p_date between r.from_date and r.to_date)),
         a.note
  from public.staff s
  left join public.staff_attendance a on a.staff_id = s.id and a.att_date = p_date
  where s.status = 'active'
  order by s.full_name;
end $$;
revoke execute on function public.staff_attendance_sheet(date) from public, anon;
grant execute on function public.staff_attendance_sheet(date) to authenticated;

-- p_rows: [{"staff_id": "...", "status": "present|absent|late|on_leave", "note": "..."}]
create function public.mark_staff_attendance(p_date date, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e jsonb;
  n integer := 0;
  y uuid;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_date > app.today_ist() then
    raise exception 'Attendance cannot be marked for a future date' using errcode = '23514';
  end if;
  select id into y from public.academic_years where p_date between start_date and end_date order by start_date desc limit 1;
  if y is null or not app.is_school_day(y, p_date) then
    raise exception 'No attendance on Sundays, 2nd Saturdays, holidays or outside the academic year' using errcode = '23514';
  end if;
  for e in select * from jsonb_array_elements(p_rows) loop
    if (e ->> 'status') not in ('present', 'absent', 'late', 'on_leave') then
      raise exception 'Status must be present, absent, late or on leave' using errcode = '23514';
    end if;
    insert into public.staff_attendance (staff_id, att_date, status, note, marked_by)
    values ((e ->> 'staff_id')::uuid, p_date, e ->> 'status', nullif(trim(e ->> 'note'), ''), app.current_staff_id())
    on conflict (staff_id, att_date)
    do update set status = excluded.status, note = excluded.note, marked_by = excluded.marked_by;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.mark_staff_attendance(date, jsonb) from public, anon;
grant execute on function public.mark_staff_attendance(date, jsonb) to authenticated;

-- monthly staff report: counts per person (invoker: a teacher gets only themselves)
create function public.staff_attendance_month(p_month date)
returns table (staff_id uuid, full_name text, present integer, late integer, absent integer, on_leave integer)
language sql stable set search_path = '' as $$
  select s.id, s.full_name,
         (count(a.id) filter (where a.status = 'present'))::integer,
         (count(a.id) filter (where a.status = 'late'))::integer,
         (count(a.id) filter (where a.status = 'absent'))::integer,
         (count(a.id) filter (where a.status = 'on_leave'))::integer
  from public.staff s
  left join public.staff_attendance a on a.staff_id = s.id
       and a.att_date >= date_trunc('month', p_month)::date and a.att_date < (date_trunc('month', p_month) + interval '1 month')::date
  where s.status = 'active' and (app.is_admin() or s.id = app.current_staff_id())
  group by s.id, s.full_name
  order by s.full_name
$$;
grant execute on function public.staff_attendance_month(date) to authenticated;

-- leave taken (approved days) per person and type in a date range
create function public.leave_taken(p_from date, p_to date)
returns table (staff_id uuid, full_name text, leave_type text, days integer)
language sql stable set search_path = '' as $$
  select r.staff_id, s.full_name, t.name, sum(r.days)::integer
  from public.leave_requests r
  join public.staff s on s.id = r.staff_id
  join public.leave_types t on t.id = r.leave_type_id
  where r.status = 'approved' and r.from_date <= p_to and r.to_date >= p_from
    and (app.is_admin() or r.staff_id = app.current_staff_id())
  group by r.staff_id, s.full_name, t.name
  order by s.full_name, t.name
$$;
grant execute on function public.leave_taken(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.attendance_sessions enable row level security;
alter table public.student_attendance enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.staff_attendance enable row level security;

-- sessions: office/duty see all; a teacher sees sessions assigned to them, marked by them,
-- or (class teacher) both sessions of their own section. Read only: writes use mark_attendance().
create policy as_select on public.attendance_sessions for select to authenticated
  using ((select public.has_duty('all_class_attendance'))
         or assigned_to = (select app.current_staff_id())
         or marked_by = (select app.current_staff_id())
         or app.is_class_teacher(section_id));
create policy sa_select on public.student_attendance for select to authenticated
  using (session_id in (select id from public.attendance_sessions));

create policy lt_select on public.leave_types for select to authenticated using ((select app.is_staff_user()));
create policy lt_insert on public.leave_types for insert to authenticated with check ((select app.is_admin()));
create policy lt_update on public.leave_types for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy lt_delete on public.leave_types for delete to authenticated using ((select app.is_admin()));

create policy lb_select on public.leave_balances for select to authenticated
  using ((select app.is_admin()) or staff_id = (select app.current_staff_id()));
create policy lb_insert on public.leave_balances for insert to authenticated with check ((select app.is_admin()));
create policy lb_update on public.leave_balances for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy lb_delete on public.leave_balances for delete to authenticated using ((select app.is_admin()));

-- leave requests: own + Admin read; anyone applies for themselves (Admin for anyone), always pending
create policy lr_select on public.leave_requests for select to authenticated
  using ((select app.is_admin()) or staff_id = (select app.current_staff_id()));
create policy lr_insert on public.leave_requests for insert to authenticated
  with check (status = 'pending' and decided_by is null and decided_at is null
              and ((select app.is_admin()) or staff_id = (select app.current_staff_id())));

create policy satt_select on public.staff_attendance for select to authenticated
  using ((select app.is_admin()) or staff_id = (select app.current_staff_id()));

grant select on public.attendance_sessions, public.student_attendance, public.staff_attendance to authenticated;
grant select, insert, update, delete on public.leave_types, public.leave_balances to authenticated;
grant select, insert on public.leave_requests to authenticated;
