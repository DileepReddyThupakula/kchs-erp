-- Speed helpers: the once-per-query lists give the same answer as the old per-row checks; notice_read_counts matches notice_readers. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000001', 'admin@pf.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000002', 'ct@pf.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000003', 'sub@pf.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000004', 'none@pf.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1b000000-0000-4000-fd00-000000000001', '00000000-0000-4000-fd00-000000000001', 'admin',   'PF-ADM', 'Pf Admin'),
  ('1b000000-0000-4000-fd00-000000000002', '00000000-0000-4000-fd00-000000000002', 'teacher', 'PF-CT',  'Pf Class teacher'),
  ('1b000000-0000-4000-fd00-000000000003', '00000000-0000-4000-fd00-000000000003', 'teacher', 'PF-SUB', 'Pf Subject teacher'),
  ('1b000000-0000-4000-fd00-000000000004', '00000000-0000-4000-fd00-000000000004', 'teacher', 'PF-NON', 'Pf Nobody');
insert into public.academic_years (id, name, start_date, end_date) values ('2b000000-0000-4000-fd00-000000000001', 'PF-2089', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3c000000-0000-4000-fd00-000000000001', 'PF C1', 921);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3d000000-0000-4000-fd00-000000000001', '2b000000-0000-4000-fd00-000000000001', '3c000000-0000-4000-fd00-000000000001', 'A', '1b000000-0000-4000-fd00-000000000002'),
  ('3d000000-0000-4000-fd00-000000000002', '2b000000-0000-4000-fd00-000000000001', '3c000000-0000-4000-fd00-000000000001', 'B', null);
insert into public.subjects (id, name, code) values ('5b000000-0000-4000-fd00-000000000001', 'PF Maths', 'PFM');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('1b000000-0000-4000-fd00-000000000003', '3d000000-0000-4000-fd00-000000000002', '5b000000-0000-4000-fd00-000000000001');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('55000000-0000-4000-fd00-000000000001', 'PF-1', 'Pf One', 'male', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-fd00-000000000002', 'PF-2', 'Pf Two', 'female', '2075-01-01', '2020-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) values
  ('55000000-0000-4000-fd00-000000000001', '2b000000-0000-4000-fd00-000000000001', '3d000000-0000-4000-fd00-000000000001'),
  ('55000000-0000-4000-fd00-000000000002', '2b000000-0000-4000-fd00-000000000001', '3d000000-0000-4000-fd00-000000000002');

-- the lists
select pg_temp.login_as('00000000-0000-4000-fd00-000000000002');   -- class teacher of A
select pg_temp.counts($$select cardinality(app.my_section_ids())$$, 1, 'class teacher: one section in the list');
select pg_temp.counts($$select cardinality(app.my_class_teacher_section_ids())$$, 1, 'and it is one they are class teacher of');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'PF-%'$$, 1, 'class teacher: sees only the student of their section');
select pg_temp.counts($$select count(*) from public.students where id = any (app.my_student_ids()) and admission_no like 'PF-%'$$, 1, 'my_student_ids is that one student');
select pg_temp.login_as('00000000-0000-4000-fd00-000000000003');   -- subject teacher of B
select pg_temp.counts($$select cardinality(app.my_section_ids())$$, 1, 'subject teacher: one section');
select pg_temp.counts($$select cardinality(app.my_class_teacher_section_ids())$$, 0, 'not a class teacher');
select pg_temp.counts($$select cardinality(app.my_pair_keys())$$, 1, 'one (section, subject) pair');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'PF-%'$$, 1, 'subject teacher: sees the other student only');
select pg_temp.counts($$select count(*) from public.student_enrollments where student_id in ('55000000-0000-4000-fd00-000000000001', '55000000-0000-4000-fd00-000000000002')$$, 1, 'and only their section''s enrolment');
select pg_temp.login_as('00000000-0000-4000-fd00-000000000004');   -- nobody
select pg_temp.counts($$select count(*) from public.students where admission_no like 'PF-%'$$, 0, 'unrelated teacher: no students');
select pg_temp.counts($$select cardinality(app.my_section_ids()) + cardinality(app.my_pair_keys())$$, 0, 'and empty lists');
select pg_temp.login_as('00000000-0000-4000-fd00-000000000001');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'PF-%'$$, 2, 'Admin: sees both');
select pg_temp.counts($$select case when app.sees_all_students() then 1 else 0 end$$, 1, 'Admin: sees_all_students');
select pg_temp.login_as(null);
select pg_temp.throws($$select count(*) from public.students$$, 'not signed in: nothing', '42501');

-- notice read counts agree with the per-notice function
select pg_temp.login_as('00000000-0000-4000-fd00-000000000001');
select public.publish_notice(public.save_notice('{"title":"Count me","body":"Counting notice","audience":"all"}'));
select public.mark_notice_read((select id from public.notices where title = 'Count me'));
select pg_temp.counts($$select read_count from public.notice_read_counts() where notice_id = (select id from public.notices where title = 'Count me')$$, 1, 'one reader');
select pg_temp.counts($$select (select count(*) from public.notice_readers(n.id)) - total from public.notice_read_counts() r join public.notices n on n.id = r.notice_id where n.title = 'Count me'$$, 0, 'total matches notice_readers');
select pg_temp.login_as('00000000-0000-4000-fd00-000000000002');
select pg_temp.throws($$select * from public.notice_read_counts()$$, 'a teacher cannot read read counts (Admin only)', '42501');
