-- REPORTS (Module 8, database part). Every report is a function that runs AS THE CALLER (security invoker), so the row-level rules
-- of the tables apply unchanged, and each one also checks who may ask for it. No report returns an Aadhaar, UDID, ration card or any
-- other ID number (only counts, names, admission numbers and class). Fee reports answer only to app.has_fee_access().

-- ---------------------------------------------------------------- strength and demographics
-- students per section (a teacher, by row-level security, only gets their own sections' numbers)
create or replace function public.report_strength(p_year uuid)
returns table (section_id uuid, class_name text, class_order integer, section_name text, active integer, boys integer, girls integer, other integer, left_school integer)
language sql stable set search_path = '' as $$
  select sec.id, c.name, c.sort_order, sec.name,
         count(s.id) filter (where s.status = 'active')::int,
         count(s.id) filter (where s.status = 'active' and s.gender = 'male')::int,
         count(s.id) filter (where s.status = 'active' and s.gender = 'female')::int,
         count(s.id) filter (where s.status = 'active' and s.gender = 'other')::int,
         count(s.id) filter (where s.status <> 'active')::int
    from public.sections sec
    join public.classes c on c.id = sec.class_id
    left join public.student_enrollments e on e.section_id = sec.id and e.academic_year_id = p_year
    left join public.students s on s.id = e.student_id
   where sec.academic_year_id = p_year
   group by sec.id, c.name, c.sort_order, sec.name
   order by c.sort_order, sec.name
$$;

-- social category / religion by class: Admin and student_records only (counts only, no names, no IDs)
create or replace function public.report_demographics(p_year uuid)
returns table (class_name text, class_order integer, social_category text, religion text, students integer)
language plpgsql stable set search_path = '' as $$
begin
  if not (app.is_admin() or public.has_duty('student_records')) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.name, c.sort_order, coalesce(nullif(pr.details ->> 'social_category', ''), 'Not recorded'), coalesce(nullif(pr.details ->> 'religion', ''), 'Not recorded'), count(*)::int
      from public.student_enrollments e
      join public.sections sec on sec.id = e.section_id
      join public.classes c on c.id = sec.class_id
      join public.students s on s.id = e.student_id and s.status = 'active'
      left join public.student_profiles pr on pr.student_id = s.id
     where e.academic_year_id = p_year
     group by c.name, c.sort_order, 3, 4
     order by c.sort_order, 3, 4;
end $$;

-- new admissions and leavers in a period, with names (a list: on screen, Excel or A4 only)
create or replace function public.report_admissions(p_year uuid, p_from date, p_to date)
returns table (kind text, student_id uuid, admission_no text, full_name text, class_name text, section_name text, on_date date, status text)
language plpgsql stable set search_path = '' as $$
begin
  if not (app.is_admin() or public.has_duty('student_records')) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select 'admitted'::text, s.id, s.admission_no, s.full_name, c.name, sec.name, s.admission_date, s.status
      from public.students s
      left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = p_year
      left join public.sections sec on sec.id = e.section_id
      left join public.classes c on c.id = sec.class_id
     where s.admission_date between p_from and p_to
    union all
    select 'left'::text, s.id, s.admission_no, s.full_name, c.name, sec.name, s.status_date, s.status
      from public.students s
      left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = p_year
      left join public.sections sec on sec.id = e.section_id
      left join public.classes c on c.id = sec.class_id
     where s.status <> 'active' and s.status_date between p_from and p_to
    order by 1, 7, 4;
end $$;

-- ---------------------------------------------------------------- fees (fee access only)
create or replace function app.require_fee_access() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app.has_fee_access() then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

-- billed / paid / due now, per class
create or replace function public.report_fee_dues_by_class(p_year uuid, p_upto date default null)
returns table (class_name text, class_order integer, students integer, billed_paise bigint, paid_paise bigint, overdue_paise bigint)
language plpgsql stable set search_path = '' as $$
declare v_upto date := coalesce(p_upto, app.today_ist());
begin
  perform app.require_fee_access();
  return query
    select c.name, c.sort_order, count(distinct d.student_id)::int,
           coalesce(sum(d.amount_paise - d.concession_paise), 0)::bigint,
           coalesce(sum(d.paid_paise), 0)::bigint,
           coalesce(sum(greatest(d.amount_paise - d.concession_paise - d.paid_paise, 0)) filter (where d.due_date <= v_upto), 0)::bigint
      from public.student_fee_dues d
      join public.student_enrollments e on e.student_id = d.student_id and e.academic_year_id = d.academic_year_id
      join public.sections sec on sec.id = e.section_id
      join public.classes c on c.id = sec.class_id
     where d.academic_year_id = p_year and d.voided_at is null
     group by c.name, c.sort_order
     order by c.sort_order;
end $$;

-- students who owe money that was due on or before a date
create or replace function public.report_fee_defaulters(p_year uuid, p_upto date default null, p_min_paise bigint default 1)
returns table (student_id uuid, admission_no text, full_name text, class_name text, section_name text, overdue_paise bigint, oldest_due date, installments integer)
language plpgsql stable set search_path = '' as $$
declare v_upto date := coalesce(p_upto, app.today_ist());
begin
  perform app.require_fee_access();
  return query
    select s.id, s.admission_no, s.full_name, c.name, sec.name,
           sum(d.amount_paise - d.concession_paise - d.paid_paise)::bigint, min(d.due_date), count(*)::int
      from public.student_fee_dues d
      join public.students s on s.id = d.student_id and s.status = 'active'
      join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = d.academic_year_id
      join public.sections sec on sec.id = e.section_id
      join public.classes c on c.id = sec.class_id
     where d.academic_year_id = p_year and d.voided_at is null and d.due_date <= v_upto and d.amount_paise - d.concession_paise - d.paid_paise > 0
     group by s.id, s.admission_no, s.full_name, c.name, c.sort_order, sec.name
    having sum(d.amount_paise - d.concession_paise - d.paid_paise) >= greatest(coalesce(p_min_paise, 1), 1)
     order by sum(d.amount_paise - d.concession_paise - d.paid_paise) desc, s.full_name;
end $$;

-- money collected per month and mode; cancelled receipts shown but not counted
create or replace function public.report_fee_collection_monthly(p_year uuid)
returns table (month date, receipts integer, collected_paise bigint, cash_paise bigint, upi_paise bigint, cheque_paise bigint, bank_paise bigint, cancelled integer, cancelled_paise bigint)
language plpgsql stable set search_path = '' as $$
declare y public.academic_years;
begin
  perform app.require_fee_access();
  select * into y from public.academic_years where id = p_year;
  return query
    select date_trunc('month', r.receipt_date)::date,
           count(*) filter (where r.status = 'valid')::int,
           coalesce(sum(r.total_paise) filter (where r.status = 'valid'), 0)::bigint,
           coalesce(sum(r.total_paise) filter (where r.status = 'valid' and r.payment_mode = 'cash'), 0)::bigint,
           coalesce(sum(r.total_paise) filter (where r.status = 'valid' and r.payment_mode = 'upi'), 0)::bigint,
           coalesce(sum(r.total_paise) filter (where r.status = 'valid' and r.payment_mode = 'cheque'), 0)::bigint,
           coalesce(sum(r.total_paise) filter (where r.status = 'valid' and r.payment_mode = 'bank_transfer'), 0)::bigint,
           count(*) filter (where r.status = 'cancelled')::int,
           coalesce(sum(r.total_paise) filter (where r.status = 'cancelled'), 0)::bigint
      from public.fee_receipts r
     where r.receipt_date between y.start_date and y.end_date
     group by 1 order by 1;
end $$;

-- concessions given, by fee head and kind
create or replace function public.report_fee_concessions(p_year uuid)
returns table (fee_head text, kind text, students integer, total_paise bigint)
language plpgsql stable set search_path = '' as $$
begin
  perform app.require_fee_access();
  return query
    select h.name, k.kind, count(distinct k.student_id)::int,
           coalesce((select sum(d.concession_paise) from public.student_fee_dues d where d.academic_year_id = p_year and d.fee_head_id = h.id and d.voided_at is null and d.student_id in (select k2.student_id from public.fee_concessions k2 where k2.academic_year_id = p_year and k2.fee_head_id = h.id and k2.kind = k.kind)), 0)::bigint
      from public.fee_concessions k
      join public.fee_heads h on h.id = k.fee_head_id
     where k.academic_year_id = p_year
     group by h.id, h.name, k.kind
     order by h.name, k.kind;
end $$;

-- ---------------------------------------------------------------- exams
-- per section: pass / fail / incomplete and grade spread of one result (Admin and the marks duty; a class teacher of their own section)
create or replace function public.report_class_results(p_group uuid)
returns table (section_id uuid, class_name text, section_name text, students integer, passed integer, failed integer, incomplete integer, avg_pct numeric, grades jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare v_all boolean := app.is_admin() or public.has_duty('all_class_marks');
begin
  -- Admin and the marks duty: every section. A class teacher: only the sections they are class teacher of. Nobody else.
  if not (v_all or cardinality(app.my_class_teacher_section_ids()) > 0) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select sec.id, c.name, sec.name, count(*)::int,
           count(*) filter (where r.result = 'pass')::int, count(*) filter (where r.result = 'fail')::int, count(*) filter (where r.result = 'incomplete')::int,
           round(avg(r.pct), 1),
           coalesce((select jsonb_object_agg(g.grade, g.n) from (select r2.grade, count(*) n from public.student_results r2 where r2.group_id = p_group and r2.section_id = sec.id and r2.grade is not null group by r2.grade) g), '{}'::jsonb)
      from public.student_results r
      join public.sections sec on sec.id = r.section_id
      join public.classes c on c.id = sec.class_id
     where r.group_id = p_group and (v_all or r.section_id = any (app.my_class_teacher_section_ids()))
     group by sec.id, c.name, c.sort_order, sec.name
     order by c.sort_order, sec.name;
end $$;

-- per section and subject: averages and pass rate (a teacher only gets their own (section, subject) pairs, by row-level security)
create or replace function public.report_subject_results(p_group uuid)
returns table (section_id uuid, class_name text, section_name text, subject_name text, students integer, passed integer, failed integer, incomplete integer, avg_pct numeric)
language sql stable set search_path = '' as $$
  select sec.id, c.name, sec.name, sub.name, count(*)::int,
         count(*) filter (where r.passed and r.missing = 0)::int,
         count(*) filter (where not r.passed and r.missing = 0)::int,
         count(*) filter (where r.missing > 0)::int,
         round(avg(r.pct), 1)
    from public.subject_results r
    join public.sections sec on sec.id = r.section_id
    join public.classes c on c.id = sec.class_id
    join public.subjects sub on sub.id = r.subject_id
   where r.group_id = p_group
   group by sec.id, c.name, c.sort_order, sec.name, sub.name
   order by c.sort_order, sec.name, sub.name
$$;

-- ---------------------------------------------------------------- staff (Admin only)
create or replace function public.report_staff_attendance(p_from date, p_to date)
returns table (staff_id uuid, full_name text, present integer, late integer, absent integer, on_leave integer, unmarked integer)
language plpgsql stable set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select s.id, s.full_name,
           count(a.id) filter (where a.status = 'present')::int, count(a.id) filter (where a.status = 'late')::int,
           count(a.id) filter (where a.status = 'absent')::int, count(a.id) filter (where a.status = 'on_leave')::int,
           ((p_to - p_from + 1) - count(a.id))::int
      from public.staff s
      left join public.staff_attendance a on a.staff_id = s.id and a.att_date between p_from and p_to
     where s.status = 'active'
     group by s.id, s.full_name
     order by s.full_name;
end $$;

-- ---------------------------------------------------------------- a teacher's own summary
create or replace function public.report_my_load(p_year uuid, p_today date default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.current_staff_id(); v_today date := coalesce(p_today, app.today_ist()); r jsonb;
begin
  if me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'periods_per_week', (select count(*) from public.timetable_entries t where t.academic_year_id = p_year and t.teacher_id = me),
    'by_weekday', coalesce((select jsonb_object_agg(w, n) from (select t.weekday w, count(*) n from public.timetable_entries t where t.academic_year_id = p_year and t.teacher_id = me group by t.weekday) x), '{}'::jsonb),
    'sections', (select count(distinct section_id) from public.teacher_assignments a where a.staff_id = me),
    'substitutions_this_month', (select count(*) from public.timetable_substitutions s where s.substitute_teacher_id = me and date_trunc('month', s.sub_date) = date_trunc('month', v_today)),
    'leave', coalesce((select jsonb_agg(jsonb_build_object('type', l.leave_type, 'days', l.days)) from public.leave_taken(date_trunc('year', v_today)::date, v_today) l where l.staff_id = me), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------- audit trail for exports and prints
create or replace function public.log_report(p_report text, p_format text, p_filters jsonb default '{}'::jsonb, p_rows integer default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff_user() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_format not in ('screen', 'csv', 'xlsx', 'print', 'pdf') then raise exception 'unknown format' using errcode = '23514'; end if;
  if p_report is null or length(p_report) > 80 then raise exception 'unknown report' using errcode = '23514'; end if;
  perform public.log_event(case when p_format = 'screen' then 'report.view' when p_format in ('print', 'pdf') then 'report.print' else 'report.export' end,
                           'reports', null, jsonb_build_object('report', p_report, 'format', p_format, 'filters', coalesce(p_filters, '{}'::jsonb), 'rows', p_rows));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.report_strength(uuid)', 'public.report_demographics(uuid)', 'public.report_admissions(uuid, date, date)',
    'public.report_fee_dues_by_class(uuid, date)', 'public.report_fee_defaulters(uuid, date, bigint)', 'public.report_fee_collection_monthly(uuid)', 'public.report_fee_concessions(uuid)',
    'public.report_class_results(uuid)', 'public.report_subject_results(uuid)', 'public.report_staff_attendance(date, date)', 'public.report_my_load(uuid, date)',
    'public.log_report(text, text, jsonb, integer)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function app.require_fee_access() to authenticated;
