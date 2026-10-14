-- =====================================================================
-- Attendance: students have no "Leave" status any more.
--   Student statuses: present, absent, late.
--   Present and Late count as attended; Absent does not (half-day maths
--   unchanged). Staff leave and the "on leave" staff attendance status are
--   NOT touched.
-- =====================================================================

-- demo / test rows with the removed status become Absent first
update public.student_attendance set status = 'absent' where status = 'leave';

alter table public.student_attendance drop constraint student_attendance_status_check;
alter table public.student_attendance
  add constraint student_attendance_status_check check (status in ('present', 'absent', 'late'));

-- the marking function now refuses 'leave'
create or replace function public.mark_attendance(p_section uuid, p_date date, p_session text, p_entries jsonb)
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
    if stat is null or stat not in ('present', 'absent', 'late') then
      raise exception 'Status must be present, absent or late' using errcode = '23514';
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

-- the daily summary has no "on leave" column any more
drop function public.daily_attendance_summary(date);
create function public.daily_attendance_summary(p_date date)
returns table (section_id uuid, section_label text, session text, marked boolean, marked_by_name text, kind text,
               present integer, late integer, absent integer, total integer)
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
