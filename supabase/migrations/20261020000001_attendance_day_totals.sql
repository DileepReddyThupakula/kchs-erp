-- =====================================================================
-- Attendance day totals (working days / days present / days absent) for
-- records and transfer certificates.
--
--  Working day  = Monday-Saturday (per School settings) that is not a
--                 holiday or a 2nd Saturday and lies inside the academic year.
--                 For one student the range is clipped to their enrolment:
--                 from the admission date, up to the leaving date, and never
--                 beyond today.
--  Present days = 0.5 for every attended session (Present or Late).
--  Absent days  = only days where BOTH sessions are marked: 1 minus the
--                 present part of that day.
--  Unmarked sessions are counted separately (2 per working day minus marked
--  sessions), so a figure with unmarked sessions is known to be incomplete.
--
--  Who may ask: Admin and the all_class_attendance duty (everyone), and a
--  teacher for students of the sections they teach (class teacher or
--  subject teacher). Nobody else gets any row.
-- =====================================================================

-- core: figures for the students of one section over a date range
create function app.section_day_totals(p_section uuid, p_from date, p_to date, p_only uuid default null)
returns table (student_id uuid, admission_no text, full_name text, roll_no integer,
               from_date date, to_date date,
               working_days numeric, present_days numeric, absent_days numeric,
               marked_sessions integer, unmarked_sessions integer, pct numeric)
language sql stable security definer set search_path = '' as $$
  with sec as (select id, academic_year_id from public.sections where id = p_section),
  wdays as (
    select g::date as d
    from generate_series(p_from, p_to, interval '1 day') g, sec
    where app.is_school_day(sec.academic_year_id, g::date)
  ),
  st as (
    select s.id as student_id, s.admission_no, s.full_name, en.roll_no,
           greatest(p_from, s.admission_date) as f,
           least(p_to, app.today_ist(),
                 case when s.status <> 'active' and s.status_date is not null then s.status_date else p_to end) as t
    from public.student_enrollments en
    join public.students s on s.id = en.student_id
    where en.section_id = p_section and (p_only is null or s.id = p_only)
  ),
  per as (
    select st.student_id, wd.d,
           (select count(*) from public.student_attendance a where a.student_id = st.student_id and a.att_date = wd.d) as marked,
           (select count(*) from public.student_attendance a where a.student_id = st.student_id and a.att_date = wd.d
                and a.status in ('present', 'late')) as att
    from st join wdays wd on wd.d between st.f and st.t
  ),
  agg as (
    select student_id,
           count(*) as wd_n,
           coalesce(sum(att), 0) * 0.5 as present,
           coalesce(sum(case when marked = 2 then 1 - 0.5 * att end), 0) as absent,
           coalesce(sum(marked), 0)::integer as marked_n
    from per group by student_id
  )
  select st.student_id, st.admission_no, st.full_name, st.roll_no, st.f, st.t,
         coalesce(agg.wd_n, 0)::numeric,
         coalesce(agg.present, 0)::numeric,
         coalesce(agg.absent, 0)::numeric,
         coalesce(agg.marked_n, 0),
         (2 * coalesce(agg.wd_n, 0) - coalesce(agg.marked_n, 0))::integer,
         case when coalesce(agg.wd_n, 0) = 0 then null else round(100.0 * agg.present / agg.wd_n, 1) end
  from st left join agg using (student_id)
  order by st.roll_no nulls last, st.full_name
$$;
revoke execute on function app.section_day_totals(uuid, date, date, uuid) from public, anon, authenticated;

-- a section and a date range (all students)
create function public.section_day_totals(p_section uuid, p_from date, p_to date)
returns table (student_id uuid, admission_no text, full_name text, roll_no integer,
               from_date date, to_date date,
               working_days numeric, present_days numeric, absent_days numeric,
               marked_sessions integer, unmarked_sessions integer, pct numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff_user() or p_to < p_from then
    return;
  end if;
  if not (public.has_duty('all_class_attendance') or app.teaches_section(p_section)) then
    return;
  end if;
  return query select * from app.section_day_totals(p_section, p_from, p_to);
end $$;
revoke execute on function public.section_day_totals(uuid, date, date) from public, anon;
grant execute on function public.section_day_totals(uuid, date, date) to authenticated;

-- a section and one month (any date inside the month)
create function public.section_month_day_totals(p_section uuid, p_month date)
returns table (student_id uuid, admission_no text, full_name text, roll_no integer,
               from_date date, to_date date,
               working_days numeric, present_days numeric, absent_days numeric,
               marked_sessions integer, unmarked_sessions integer, pct numeric)
language sql stable set search_path = '' as $$
  select * from public.section_day_totals(p_section, date_trunc('month', p_month)::date,
                                          (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date)
$$;
revoke execute on function public.section_month_day_totals(uuid, date) from public, anon;
grant execute on function public.section_month_day_totals(uuid, date) to authenticated;

-- one student and a date range (all their enrolments the range touches)
create function public.student_day_totals(p_student uuid, p_from date, p_to date)
returns table (student_id uuid, from_date date, to_date date,
               working_days numeric, present_days numeric, absent_days numeric,
               marked_sessions integer, unmarked_sessions integer, pct numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  allowed boolean;
  sid     uuid;
  f       date;
  t       date;
  wd      numeric := 0;
  pr      numeric := 0;
  ab      numeric := 0;
  mk      integer := 0;
  r       record;
begin
  if not app.is_staff_user() or p_to < p_from then
    return;
  end if;
  allowed := public.has_duty('all_class_attendance')
             or exists (select 1 from public.student_enrollments en where en.student_id = p_student and app.teaches_section(en.section_id));
  if not allowed then
    return;
  end if;
  -- one enrolment per academic year: add the years up (a range can span two)
  for sid in
    select en.section_id from public.student_enrollments en
    join public.sections sc on sc.id = en.section_id
    join public.academic_years y on y.id = sc.academic_year_id
    where en.student_id = p_student and y.start_date <= p_to and y.end_date >= p_from
    order by y.start_date
  loop
    for r in
      select * from app.section_day_totals(
        sid,
        greatest(p_from, (select y.start_date from public.sections sc join public.academic_years y on y.id = sc.academic_year_id where sc.id = sid)),
        least(p_to, (select y.end_date from public.sections sc join public.academic_years y on y.id = sc.academic_year_id where sc.id = sid)),
        p_student)
    loop
      f := least(coalesce(f, r.from_date), r.from_date);
      t := greatest(coalesce(t, r.to_date), r.to_date);
      wd := wd + r.working_days;
      pr := pr + r.present_days;
      ab := ab + r.absent_days;
      mk := mk + r.marked_sessions;
    end loop;
  end loop;
  if f is null then
    return;
  end if;
  student_id := p_student;
  from_date := f;
  to_date := t;
  working_days := wd;
  present_days := pr;
  absent_days := ab;
  marked_sessions := mk;
  unmarked_sessions := (2 * wd - mk)::integer;
  pct := case when wd = 0 then null else round(100.0 * pr / wd, 1) end;
  return next;
end $$;
revoke execute on function public.student_day_totals(uuid, date, date) from public, anon;
grant execute on function public.student_day_totals(uuid, date, date) to authenticated;
