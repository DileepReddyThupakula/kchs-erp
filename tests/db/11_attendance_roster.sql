-- attendance_roster(): only the assigned marker, the class teacher, Admin and the duty. Rolled back.
update public.school_settings set working_days = '{1,2,3,4,5,6,7}', second_saturday_holiday = false where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-f500-000000000001', 'duty@rs.test');
select pg_temp.fixture_user('00000000-0000-4000-f500-000000000002', 'sub@rs.test');
select pg_temp.fixture_user('00000000-0000-4000-f500-000000000003', 'other@rs.test');
select pg_temp.fixture_user('00000000-0000-4000-f500-000000000004', 'ct@rs.test');
select pg_temp.fixture_user('00000000-0000-4000-f500-000000000005', 'sched@rs.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('19000000-0000-4000-f500-000000000001', '00000000-0000-4000-f500-000000000001', 'teacher', 'RS-DUT', 'Rs Duty'),
  ('19000000-0000-4000-f500-000000000002', '00000000-0000-4000-f500-000000000002', 'teacher', 'RS-SUB', 'Rs Substitute'),
  ('19000000-0000-4000-f500-000000000003', '00000000-0000-4000-f500-000000000003', 'teacher', 'RS-OTH', 'Rs Other'),
  ('19000000-0000-4000-f500-000000000004', '00000000-0000-4000-f500-000000000004', 'teacher', 'RS-CT',  'Rs Class teacher'),
  ('19000000-0000-4000-f500-000000000005', '00000000-0000-4000-f500-000000000005', 'teacher', 'RS-SCH', 'Rs Scheduled');
insert into public.staff_permissions (staff_id, duty) values ('19000000-0000-4000-f500-000000000001', 'all_class_attendance');
insert into public.academic_years (id, name, start_date, end_date) values ('29000000-0000-4000-f500-000000000001', 'RS-YEAR', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3c000000-0000-4000-f500-000000000001', 'RS C1', 981);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3d000000-0000-4000-f500-000000000001', '29000000-0000-4000-f500-000000000001', '3c000000-0000-4000-f500-000000000001', 'A', '19000000-0000-4000-f500-000000000004');
insert into public.subjects (id, name, code) values ('5b000000-0000-4000-f500-000000000001', 'RS Maths', 'RSM');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('19000000-0000-4000-f500-000000000005', '3d000000-0000-4000-f500-000000000001', '5b000000-0000-4000-f500-000000000001');
insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f500-000000000001', extract(isodow from app.today_ist())::int, 1, '5b000000-0000-4000-f500-000000000001', '19000000-0000-4000-f500-000000000005');
insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (app.today_ist(), '3d000000-0000-4000-f500-000000000001', 1, '19000000-0000-4000-f500-000000000005', '19000000-0000-4000-f500-000000000002');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('55000000-0000-4000-f500-000000000001', 'RS-A1', 'Rs A1', 'male', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-f500-000000000002', 'RS-A2', 'Rs A2', 'female', '2075-01-01', app.today_ist() + 5);
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values
  ('55000000-0000-4000-f500-000000000001', '29000000-0000-4000-f500-000000000001', '3d000000-0000-4000-f500-000000000001', 1),
  ('55000000-0000-4000-f500-000000000002', '29000000-0000-4000-f500-000000000001', '3d000000-0000-4000-f500-000000000001', 2);

select pg_temp.login_as('00000000-0000-4000-f500-000000000002');   -- today's substitute
select pg_temp.ok((select count(*) = 1 and bool_and(admission_no = 'RS-A1') from public.attendance_roster('3d000000-0000-4000-f500-000000000001', app.today_ist())), 'substitute marker gets the roster of that section (students admitted by that date only)');
select pg_temp.counts($$select count(*) from public.students where id = '55000000-0000-4000-f500-000000000001'$$, 0, 'but the substitute still cannot read the students table (scope rule unchanged)');
select pg_temp.login_as('00000000-0000-4000-f500-000000000005');   -- replaced teacher
select pg_temp.throws($$select * from public.attendance_roster('3d000000-0000-4000-f500-000000000001', app.today_ist())$$, 'a teacher replaced by a substitute has no marking roster', '42501');
select pg_temp.login_as('00000000-0000-4000-f500-000000000003');
select pg_temp.throws($$select * from public.attendance_roster('3d000000-0000-4000-f500-000000000001', app.today_ist())$$, 'unrelated teacher: refused', '42501');
select pg_temp.login_as('00000000-0000-4000-f500-000000000004');   -- class teacher
select pg_temp.counts($$select count(*) from public.attendance_roster('3d000000-0000-4000-f500-000000000001', app.today_ist())$$, 1, 'class teacher: gets the roster');
select pg_temp.login_as('00000000-0000-4000-f500-000000000001');   -- duty
select pg_temp.counts($$select count(*) from public.attendance_roster('3d000000-0000-4000-f500-000000000001', app.today_ist())$$, 1, 'duty teacher: gets the roster');
select pg_temp.login_as(null);
select pg_temp.throws($$select * from public.attendance_roster('3d000000-0000-4000-f500-000000000001', app.today_ist())$$, 'anon: refused', '42501');
