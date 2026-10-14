-- Attendance day totals: working days, present days, absent days, unmarked sessions, permissions. Rolled back.
update public.school_settings set working_days = '{1,2,3,4,5,6}', second_saturday_holiday = false where id = 1;

-- A Monday well in the past; Mon..Sat = d0..d0+5, Sunday = d0+6
create function pg_temp.d0() returns date language sql as $$ select date_trunc('week', app.today_ist() - 60)::date $$;

select pg_temp.fixture_user('00000000-0000-4000-f600-000000000001', 'admin@dt.test');
select pg_temp.fixture_user('00000000-0000-4000-f600-000000000002', 'duty@dt.test');
select pg_temp.fixture_user('00000000-0000-4000-f600-000000000003', 'ct@dt.test');
select pg_temp.fixture_user('00000000-0000-4000-f600-000000000004', 'other@dt.test');
select pg_temp.fixture_user('00000000-0000-4000-f600-000000000005', 'subj@dt.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1a000000-0000-4000-f600-000000000001', '00000000-0000-4000-f600-000000000001', 'admin',   'DT-ADM', 'Dt Admin'),
  ('1a000000-0000-4000-f600-000000000002', '00000000-0000-4000-f600-000000000002', 'teacher', 'DT-DUT', 'Dt Duty'),
  ('1a000000-0000-4000-f600-000000000003', '00000000-0000-4000-f600-000000000003', 'teacher', 'DT-CT',  'Dt Class teacher of A'),
  ('1a000000-0000-4000-f600-000000000004', '00000000-0000-4000-f600-000000000004', 'teacher', 'DT-OTH', 'Dt Other'),
  ('1a000000-0000-4000-f600-000000000005', '00000000-0000-4000-f600-000000000005', 'teacher', 'DT-SUB', 'Dt Subject teacher of A');
insert into public.staff_permissions (staff_id, duty) values ('1a000000-0000-4000-f600-000000000002', 'all_class_attendance');
insert into public.academic_years (id, name, start_date, end_date) values
  ('2a000000-0000-4000-f600-000000000001', 'DT-YEAR', app.today_ist() - 130, app.today_ist() + 200);
insert into public.classes (id, name, sort_order) values ('3c000000-0000-4000-f600-000000000001', 'DT C1', 991);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3d000000-0000-4000-f600-000000000001', '2a000000-0000-4000-f600-000000000001', '3c000000-0000-4000-f600-000000000001', 'A', '1a000000-0000-4000-f600-000000000003'),
  ('3d000000-0000-4000-f600-000000000002', '2a000000-0000-4000-f600-000000000001', '3c000000-0000-4000-f600-000000000001', 'B', null);
insert into public.subjects (id, name, code) values ('5b000000-0000-4000-f600-000000000001', 'DT Maths', 'DTM');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1a000000-0000-4000-f600-000000000005', '3d000000-0000-4000-f600-000000000001', '5b000000-0000-4000-f600-000000000001');
-- Wednesday of that week is a holiday
insert into public.holidays (academic_year_id, date, name) values ('2a000000-0000-4000-f600-000000000001', pg_temp.d0() + 2, 'DT Holiday');

insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date, status, status_date) values
  ('55000000-0000-4000-f600-000000000001', 'DT-1', 'Dt Full',      'male',   '2075-01-01', '2020-06-01', 'active', null),
  ('55000000-0000-4000-f600-000000000002', 'DT-2', 'Dt Half',      'female', '2075-01-01', '2020-06-01', 'active', null),
  ('55000000-0000-4000-f600-000000000003', 'DT-3', 'Dt Late',      'male',   '2075-01-01', '2020-06-01', 'active', null),
  ('55000000-0000-4000-f600-000000000004', 'DT-4', 'Dt Unmarked',  'female', '2075-01-01', '2020-06-01', 'active', null),
  ('55000000-0000-4000-f600-000000000005', 'DT-5', 'Dt Joined',    'male',   '2075-01-01', date_trunc('week', app.today_ist() - 60)::date + 3, 'active', null),
  ('55000000-0000-4000-f600-000000000006', 'DT-6', 'Dt Left',      'female', '2075-01-01', '2020-06-01', 'left', date_trunc('week', app.today_ist() - 60)::date + 1),
  ('55000000-0000-4000-f600-000000000007', 'DT-7', 'Dt B student', 'male',   '2075-01-01', '2020-06-01', 'active', null);
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no)
select ('55000000-0000-4000-f600-00000000000' || n)::uuid, '2a000000-0000-4000-f600-000000000001',
       case when n = 7 then '3d000000-0000-4000-f600-000000000002'::uuid else '3d000000-0000-4000-f600-000000000001'::uuid end, n
from generate_series(1, 7) n;

-- fixture helper: one session per date + session, rows given as (student, status)
create function pg_temp.mark(p_date date, p_session text, p_students uuid[], p_status text[]) returns void language plpgsql as $$
declare sid uuid;
begin
  select id into sid from public.attendance_sessions where section_id = '3d000000-0000-4000-f600-000000000001' and att_date = p_date and session = p_session;
  if sid is null then
    insert into public.attendance_sessions (academic_year_id, section_id, att_date, session, kind)
    values ('2a000000-0000-4000-f600-000000000001', '3d000000-0000-4000-f600-000000000001', p_date, p_session, 'regular') returning id into sid;
  end if;
  for i in 1 .. array_length(p_students, 1) loop
    insert into public.student_attendance (session_id, student_id, status) values (sid, p_students[i], p_status[i]);
  end loop;
end $$;

do $$
declare
  s1 uuid := '55000000-0000-4000-f600-000000000001'; s2 uuid := '55000000-0000-4000-f600-000000000002';
  s3 uuid := '55000000-0000-4000-f600-000000000003'; s4 uuid := '55000000-0000-4000-f600-000000000004';
  s5 uuid := '55000000-0000-4000-f600-000000000005'; s6 uuid := '55000000-0000-4000-f600-000000000006';
  d date; sess text; k int := 0;
begin
  -- Mon, Tue, Thu, Fri, Sat (Wed is a holiday)
  foreach d in array array[pg_temp.d0(), pg_temp.d0() + 1, pg_temp.d0() + 3, pg_temp.d0() + 4, pg_temp.d0() + 5] loop
    foreach sess in array array['morning', 'afternoon'] loop
      perform pg_temp.mark(d, sess,
        array[s1, s2, s3, s4, s5, s6],
        array[
          'present',                                                                   -- s1 always present
          case when d = pg_temp.d0() and sess = 'morning' then 'present' else 'absent' end,   -- s2 half day Monday only
          case when d = pg_temp.d0() and sess = 'morning' then 'late' else 'present' end,     -- s3 late counts as present
          case when d = pg_temp.d0() and k < 2 then 'present' else 'absent' end,              -- s4 (unused detail)
          'present',
          'present']);
    end loop;
  end loop;
end $$;
-- s4 had ALL sessions marked above; make it incomplete: drop its rows except Monday both + Tuesday morning
delete from public.student_attendance where student_id = '55000000-0000-4000-f600-000000000004'
  and not (att_date = pg_temp.d0() or (att_date = pg_temp.d0() + 1 and session = 'morning'));

-- =====================================================================
-- Figures (as Admin)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f600-000000000001');
select pg_temp.ok((select working_days = 5 and present_days = 5 and absent_days = 0 and pct = 100.0 and unmarked_sessions = 0
  from public.student_day_totals('55000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)), 'whole days: 5 working days (holiday and Sunday excluded), 5 present, 100.0%');
select pg_temp.ok((select working_days = 5 and present_days = 0.5 and absent_days = 4.5 and pct = 10.0
  from public.student_day_totals('55000000-0000-4000-f600-000000000002', pg_temp.d0(), pg_temp.d0() + 6)), 'half day: 0.5 present, 4.5 absent, 10.0%');
select pg_temp.ok((select present_days = 5 and absent_days = 0
  from public.student_day_totals('55000000-0000-4000-f600-000000000003', pg_temp.d0(), pg_temp.d0() + 6)), 'Late counts as present');
select pg_temp.ok((select working_days = 5 and marked_sessions = 3 and unmarked_sessions = 7
  from public.student_day_totals('55000000-0000-4000-f600-000000000004', pg_temp.d0(), pg_temp.d0() + 6)), 'unmarked sessions are counted and flagged (7 of 10)');
select pg_temp.ok((select absent_days = 0 and present_days = 1
  from public.student_day_totals('55000000-0000-4000-f600-000000000004', pg_temp.d0(), pg_temp.d0() + 6)), 'absent days count only days where both sessions are marked; present counts every attended session');
select pg_temp.ok((select working_days = 3 and from_date = pg_temp.d0() + 3
  from public.student_day_totals('55000000-0000-4000-f600-000000000005', pg_temp.d0(), pg_temp.d0() + 6)), 'student who joined mid-week: working days only from the admission date (3)');
select pg_temp.ok((select working_days = 2 and to_date = pg_temp.d0() + 1
  from public.student_day_totals('55000000-0000-4000-f600-000000000006', pg_temp.d0(), pg_temp.d0() + 6)), 'student who left: working days only up to the leaving date (2)');
select pg_temp.ok((select working_days = 0 and pct is null
  from public.student_day_totals('55000000-0000-4000-f600-000000000001', pg_temp.d0() + 6, pg_temp.d0() + 6)), 'a Sunday alone has no working days (no percentage)');
select pg_temp.ok((select working_days = 0
  from public.student_day_totals('55000000-0000-4000-f600-000000000001', pg_temp.d0() + 2, pg_temp.d0() + 2)), 'a holiday alone has no working days');
select pg_temp.ok((select working_days = 4 from public.student_day_totals('55000000-0000-4000-f600-000000000001', pg_temp.d0() + 1, pg_temp.d0() + 5)), 'a mid-week range: Tue Thu Fri Sat = 4');

-- 2nd Saturday excluded when the school setting is on
select pg_temp.ok((select working_days = 1 from public.student_day_totals('55000000-0000-4000-f600-000000000001',
  (date_trunc('month', app.today_ist() - 40)::date + ((6 - extract(isodow from date_trunc('month', app.today_ist() - 40))::int + 7) % 7) + 7),
  (date_trunc('month', app.today_ist() - 40)::date + ((6 - extract(isodow from date_trunc('month', app.today_ist() - 40))::int + 7) % 7) + 7))),
  '2nd Saturday counts as a working day while the setting is off (control)');
select pg_temp.logout();
update public.school_settings set second_saturday_holiday = true where id = 1;
select pg_temp.login_as('00000000-0000-4000-f600-000000000001');
select pg_temp.ok((select working_days = 0 from public.student_day_totals('55000000-0000-4000-f600-000000000001',
  (date_trunc('month', app.today_ist() - 40)::date + ((6 - extract(isodow from date_trunc('month', app.today_ist() - 40))::int + 7) % 7) + 7),
  (date_trunc('month', app.today_ist() - 40)::date + ((6 - extract(isodow from date_trunc('month', app.today_ist() - 40))::int + 7) % 7) + 7))),
  '2nd Saturday is excluded from working days when it is a holiday');
select pg_temp.logout();
update public.school_settings set second_saturday_holiday = false where id = 1;
select pg_temp.login_as('00000000-0000-4000-f600-000000000001');

-- a range spanning two months: working days = Mon-Sat days in the range minus the holiday
select pg_temp.ok((select working_days = (select count(*) from generate_series(date_trunc('month', pg_temp.d0() + 31)::date - 4, date_trunc('month', pg_temp.d0() + 31)::date + 4, interval '1 day') g
                                          where extract(isodow from g) < 7 and g::date <> pg_temp.d0() + 2 and g::date <= app.today_ist() and g::date >= app.today_ist() - 130)
  from public.student_day_totals('55000000-0000-4000-f600-000000000001', date_trunc('month', pg_temp.d0() + 31)::date - 4, date_trunc('month', pg_temp.d0() + 31)::date + 4)),
  'a range spanning two months counts every Mon-Sat day inside the academic year');

-- section functions
select pg_temp.ok((select count(*) = 6 from public.section_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)), 'section range: one row per student of the section');
select pg_temp.ok((select sum(present_days) = 5 + 0.5 + 5 + 1 + 3 + 2 from public.section_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)), 'section range: present days add up per student');
select pg_temp.ok((select count(*) = 6 and bool_and(from_date <= to_date) and max(present_days) >= 5
  from public.section_month_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0() + 1)), 'section month: all students, figures cover the whole month');

-- =====================================================================
-- Permissions
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f600-000000000002');   -- duty teacher
select pg_temp.counts($$select count(*) from public.student_day_totals('55000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 1, 'duty teacher: sees any student');
select pg_temp.counts($$select count(*) from public.section_day_totals('3d000000-0000-4000-f600-000000000002', pg_temp.d0(), pg_temp.d0() + 6)$$, 1, 'duty teacher: sees any section');
select pg_temp.login_as('00000000-0000-4000-f600-000000000003');   -- class teacher of A
select pg_temp.counts($$select count(*) from public.section_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 6, 'class teacher: sees their own section');
select pg_temp.counts($$select count(*) from public.section_day_totals('3d000000-0000-4000-f600-000000000002', pg_temp.d0(), pg_temp.d0() + 6)$$, 0, 'class teacher: sees nothing of another section');
select pg_temp.counts($$select count(*) from public.student_day_totals('55000000-0000-4000-f600-000000000007', pg_temp.d0(), pg_temp.d0() + 6)$$, 0, 'class teacher: no totals for a student of another section');
select pg_temp.counts($$select count(*) from public.student_day_totals('55000000-0000-4000-f600-000000000002', pg_temp.d0(), pg_temp.d0() + 6)$$, 1, 'class teacher: totals for their own student');
select pg_temp.login_as('00000000-0000-4000-f600-000000000005');   -- subject teacher of A
select pg_temp.counts($$select count(*) from public.section_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 6, 'subject teacher: sees the section they teach');
select pg_temp.login_as('00000000-0000-4000-f600-000000000004');   -- unrelated teacher
select pg_temp.counts($$select count(*) from public.section_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 0, 'other teacher: sees nothing');
select pg_temp.counts($$select count(*) from public.student_day_totals('55000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 0, 'other teacher: no student totals');
select pg_temp.counts($$select count(*) from public.section_month_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0())$$, 0, 'other teacher: no month totals');
select pg_temp.login_as(null);
select pg_temp.throws($$select * from public.student_day_totals('55000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 'anonymous: refused', '42501');
select pg_temp.login_as('00000000-0000-4000-f600-000000000004');
select pg_temp.throws($$select * from app.section_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 'direct call of the unchecked core function is refused', '42501');
-- revoked duty
select pg_temp.login_as('00000000-0000-4000-f600-000000000001');
delete from public.staff_permissions where staff_id = '1a000000-0000-4000-f600-000000000002';
select pg_temp.login_as('00000000-0000-4000-f600-000000000002');
select pg_temp.counts($$select count(*) from public.section_day_totals('3d000000-0000-4000-f600-000000000001', pg_temp.d0(), pg_temp.d0() + 6)$$, 0, 'revoked duty: sees nothing');
