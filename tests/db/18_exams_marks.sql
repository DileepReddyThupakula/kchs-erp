-- Exams & marks: scheme, automatic calculation, absent / not applicable, lock, teacher scope (R18), report card access. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000001', 'admin@em.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000002', 'duty@em.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000003', 'maths@em.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000004', 'ct@em.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000005', 'other@em.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000006', 'eng@em.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1a000000-0000-4000-fc00-000000000001', '00000000-0000-4000-fc00-000000000001', 'admin',   'EM-ADM', 'Em Admin'),
  ('1a000000-0000-4000-fc00-000000000002', '00000000-0000-4000-fc00-000000000002', 'teacher', 'EM-DUT', 'Em Marks duty'),
  ('1a000000-0000-4000-fc00-000000000003', '00000000-0000-4000-fc00-000000000003', 'teacher', 'EM-MTH', 'Em Maths teacher of A'),
  ('1a000000-0000-4000-fc00-000000000004', '00000000-0000-4000-fc00-000000000004', 'teacher', 'EM-CT',  'Em Class teacher of A'),
  ('1a000000-0000-4000-fc00-000000000005', '00000000-0000-4000-fc00-000000000005', 'teacher', 'EM-OTH', 'Em Unrelated'),
  ('1a000000-0000-4000-fc00-000000000006', '00000000-0000-4000-fc00-000000000006', 'teacher', 'EM-ENG', 'Em English + Art teacher of A');
insert into public.staff_permissions (staff_id, duty) values ('1a000000-0000-4000-fc00-000000000002', 'all_class_marks');
insert into public.academic_years (id, name, start_date, end_date) values ('2a000000-0000-4000-fc00-000000000001', 'EM-2088', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3a000000-0000-4000-fc00-000000000001', 'EM C1', 931), ('3a000000-0000-4000-fc00-000000000002', 'EM C2', 932);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3b000000-0000-4000-fc00-000000000001', '2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', 'A', '1a000000-0000-4000-fc00-000000000004'),
  ('3b000000-0000-4000-fc00-000000000002', '2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000002', 'A', '1a000000-0000-4000-fc00-000000000005');
insert into public.subjects (id, name, code, type) values
  ('5a000000-0000-4000-fc00-000000000001', 'EM Maths', 'EMM', 'scholastic'),
  ('5a000000-0000-4000-fc00-000000000002', 'EM English', 'EME', 'scholastic'),
  ('5a000000-0000-4000-fc00-000000000003', 'EM Art', 'EMA', 'co_scholastic'),
  ('5a000000-0000-4000-fc00-000000000004', 'EM Rhymes', 'EMR', 'scholastic');
insert into public.class_subjects (academic_year_id, class_id, subject_id, sort_order) values
  ('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', '5a000000-0000-4000-fc00-000000000001', 1),
  ('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', '5a000000-0000-4000-fc00-000000000002', 2),
  ('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', '5a000000-0000-4000-fc00-000000000003', 3),
  ('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000002', '5a000000-0000-4000-fc00-000000000004', 1),
  ('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000002', '5a000000-0000-4000-fc00-000000000003', 2);
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1a000000-0000-4000-fc00-000000000003', '3b000000-0000-4000-fc00-000000000001', '5a000000-0000-4000-fc00-000000000001'),
  ('1a000000-0000-4000-fc00-000000000006', '3b000000-0000-4000-fc00-000000000001', '5a000000-0000-4000-fc00-000000000002'),
  ('1a000000-0000-4000-fc00-000000000006', '3b000000-0000-4000-fc00-000000000001', '5a000000-0000-4000-fc00-000000000003'),
  ('1a000000-0000-4000-fc00-000000000005', '3b000000-0000-4000-fc00-000000000002', '5a000000-0000-4000-fc00-000000000004');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('55000000-0000-4000-fc00-000000000001', 'EM-1', 'Em One', 'male', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-fc00-000000000002', 'EM-2', 'Em Two', 'female', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-fc00-000000000003', 'EM-3', 'Em Three', 'male', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-fc00-000000000004', 'EM-4', 'Em Four', 'female', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-fc00-000000000005', 'EM-5', 'Em Five', 'male', '2075-01-01', '2020-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) values
  ('55000000-0000-4000-fc00-000000000001', '2a000000-0000-4000-fc00-000000000001', '3b000000-0000-4000-fc00-000000000001'),
  ('55000000-0000-4000-fc00-000000000002', '2a000000-0000-4000-fc00-000000000001', '3b000000-0000-4000-fc00-000000000001'),
  ('55000000-0000-4000-fc00-000000000003', '2a000000-0000-4000-fc00-000000000001', '3b000000-0000-4000-fc00-000000000001'),
  ('55000000-0000-4000-fc00-000000000004', '2a000000-0000-4000-fc00-000000000001', '3b000000-0000-4000-fc00-000000000001'),
  ('55000000-0000-4000-fc00-000000000005', '2a000000-0000-4000-fc00-000000000001', '3b000000-0000-4000-fc00-000000000002');

-- helpers: C1 component / group ids by name, one-mark saves
create function pg_temp.comp(p_name text) returns uuid language sql as $$ select id from public.exam_components where class_id = '3a000000-0000-4000-fc00-000000000001' and name = p_name $$;
create function pg_temp.grp(p_name text) returns uuid language sql as $$ select id from public.result_groups where class_id = '3a000000-0000-4000-fc00-000000000001' and name = p_name $$;
create function pg_temp.st(n integer) returns uuid language sql as $$ select ('55000000-0000-4000-fc00-00000000000' || n)::uuid $$;
create function pg_temp.sb(n integer) returns uuid language sql as $$ select ('5a000000-0000-4000-fc00-00000000000' || n)::uuid $$;
-- save one student's mark: status 'marked' with marks, or 'absent' / 'na'
create function pg_temp.mk(p_comp text, p_subj integer, p_student integer, p_status text, p_marks numeric default null) returns integer language sql as $$
  select public.save_marks(pg_temp.comp(p_comp), '3b000000-0000-4000-fc00-000000000001', pg_temp.sb(p_subj),
    jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(p_student), 'status', p_status, 'marks', p_marks)))
$$;
grant execute on function pg_temp.comp(text), pg_temp.grp(text), pg_temp.st(integer), pg_temp.sb(integer), pg_temp.mk(text, integer, integer, text, numeric) to authenticated;
create function pg_temp.res(p_group text, p_student integer, p_subj integer) returns table (scored numeric, max_marks numeric, pct numeric, grade text, grade_point numeric, passed boolean, has_absent boolean, missing integer, locked boolean)
language sql as $$
  select r.scored, r.max_marks, r.pct, r.grade, r.grade_point, r.passed, r.has_absent, r.missing, r.locked from public.subject_results r
  where r.group_id = pg_temp.grp(p_group) and r.student_id = pg_temp.st(p_student) and r.subject_id = pg_temp.sb(p_subj)
$$;
grant execute on function pg_temp.res(text, integer, integer) to authenticated;

-- ================================================================ scheme: Admin only
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.throws($$select public.apply_default_scheme('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001')$$, 'teacher: cannot set up the scheme', '42501');
select pg_temp.throws($$select public.save_exam_component('{"name":"X","max_marks":10}')$$, 'teacher: cannot create an exam', '42501');
select pg_temp.throws($$select public.save_grade_bands('[{"grade":"A","min_pct":0,"max_pct":100,"grade_point":10}]')$$, 'teacher: cannot change the grading scale', '42501');
select pg_temp.throws($$select public.set_pass_mark('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', pg_temp.sb(1), 20)$$, 'teacher: cannot set a pass mark', '42501');
select pg_temp.throws($$select public.lock_result_group(gen_random_uuid())$$, 'teacher: cannot lock', '42501');
select pg_temp.throws($$select public.save_remark_bank('[]')$$, 'teacher: cannot edit the remark bank', '42501');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002');
select pg_temp.throws($$select public.apply_default_scheme('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001')$$, 'marks duty: cannot set up the scheme (Admin only)', '42501');
select pg_temp.throws($$select public.lock_exam_component(gen_random_uuid())$$, 'marks duty: cannot lock', '42501');
select pg_temp.throws($$insert into public.marks (academic_year_id, class_id, section_id, student_id, component_id, subject_id, status, marks) values ('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', '3b000000-0000-4000-fc00-000000000001', pg_temp.st(1), gen_random_uuid(), pg_temp.sb(1), 'marked', 5)$$, 'direct insert into marks is refused', '42501');

select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.lives($$select public.set_class_mode('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000002', 'grades')$$, 'Admin: C2 uses grades');
select pg_temp.lives($$select public.apply_default_scheme('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001')$$, 'Admin: applies the starting scheme to C1');
select pg_temp.lives($$select public.apply_default_scheme('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000002')$$, 'Admin: and to the grades class C2');
select pg_temp.throws($$select public.apply_default_scheme('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001')$$, 'applying twice is refused', '23514');
select pg_temp.counts($$select count(*) from public.exam_components where class_id = '3a000000-0000-4000-fc00-000000000001'$$, 6, 'C1 has FA1 FA2 SA1 FA3 FA4 SA2');
select pg_temp.counts($$select count(*) from public.exam_components where class_id = '3a000000-0000-4000-fc00-000000000002'$$, 0, 'the grades class has no exam components');
select pg_temp.counts($$select count(*) from public.result_groups where class_id = '3a000000-0000-4000-fc00-000000000001'$$, 5, 'C1 has Term 1 FA, Term 1, Term 2 FA, Term 2, Final');
select pg_temp.counts($$select count(*) from public.result_groups where class_id = '3a000000-0000-4000-fc00-000000000002' and kind = 'term'$$, 2, 'the grades class has two empty terms');
select pg_temp.throws($$select public.save_exam_component('{"id":null,"academic_year_id":"2a000000-0000-4000-fc00-000000000001","class_id":"3a000000-0000-4000-fc00-000000000001","name":"FA1","max_marks":10}')$$, 'duplicate exam name in a class is refused', '23514');
select pg_temp.throws($$select public.save_exam_component('{"academic_year_id":"2a000000-0000-4000-fc00-000000000001","class_id":"3a000000-0000-4000-fc00-000000000001","name":"Zero","max_marks":0}')$$, 'maximum marks must be above 0', '23514');
select pg_temp.throws($$select public.save_result_group(jsonb_build_object('id', pg_temp.grp('Term 1'), 'name', 'Term 1', 'members', jsonb_build_array(jsonb_build_object('child_group_id', pg_temp.grp('Final')))))$$, 'a group cannot contain a group built from it (no cycles)', '23514');
select pg_temp.throws($$select public.save_result_group(jsonb_build_object('academic_year_id', '2a000000-0000-4000-fc00-000000000001', 'class_id', '3a000000-0000-4000-fc00-000000000001', 'name', 'Bad', 'method', 'best_n'))$$, 'best-of needs a number', '23514');
select pg_temp.throws($$select public.delete_exam_component(pg_temp.comp('FA1'))$$, 'an exam used in a group cannot be deleted', '23514');

-- ================================================================ who may enter marks (R18)
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');   -- Maths teacher of A
select pg_temp.lives($$select pg_temp.mk('FA1', 1, 1, 'marked', 18)$$, 'Maths teacher: enters Maths FA1 for A');
select pg_temp.throws($$select pg_temp.mk('FA1', 2, 1, 'marked', 10)$$, 'Maths teacher: cannot enter English marks', '42501');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000004');   -- class teacher of A, teaches nothing
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 2, 'marked', 10)$$, 'class teacher (no subject): cannot enter marks', '42501');
select pg_temp.counts($$select count(*) from public.marks$$, 0, 'class teacher: sees no marks of subjects they do not teach');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000005');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 2, 'marked', 10)$$, 'unrelated teacher: cannot enter marks (they cannot even see the exam)');
select pg_temp.counts($$select count(*) from public.marks$$, 0, 'unrelated teacher: sees no marks');
select pg_temp.counts($$select count(*) from public.exam_components$$, 0, 'unrelated teacher: sees no exam scheme of another class');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000006');   -- English + Art teacher
select pg_temp.counts($$select count(*) from public.marks$$, 0, 'English teacher: does not see Maths marks');
select pg_temp.counts($$select count(*) from public.exam_components where class_id = '3a000000-0000-4000-fc00-000000000001'$$, 6, 'English teacher: sees the scheme of their class');

-- ================================================================ validation
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 2, 'marked', 21)$$, 'marks above the maximum are refused', '23514');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 2, 'marked', -1)$$, 'negative marks are refused', '23514');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 2, 'marked', 12.25)$$, 'more than one decimal is refused', '23514');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 2, 'marked', null)$$, 'a blank mark is refused (choose Absent or N/A instead)', '23514');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 5, 'marked', 10)$$, 'a student of another section is refused', '23514');
select pg_temp.throws($$select pg_temp.mk('FA1', 3, 2, 'marked', 10)$$, 'a co-scholastic subject has no marks', '42501');
select pg_temp.lives($$select pg_temp.mk('FA1', 1, 2, 'marked', 20.5 - 0.5)$$, 'a mark equal to the maximum is fine');

-- ================================================================ automatic calculation (Term 1 = FA avg scaled to 20 + SA1 out of 80)
select pg_temp.lives($$select pg_temp.mk('FA2', 1, 1, 'marked', 14)$$, 'student 1 Maths FA2 = 14');
select pg_temp.lives($$select pg_temp.mk('SA1', 1, 1, 'marked', 60)$$, 'student 1 Maths SA1 = 60');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 1, 1) r where r.scored = 76 and r.max_marks = 100 and r.pct = 76 and r.grade = 'B1' and r.grade_point = 8 and r.passed and r.missing = 0$$, 1, 'Term 1 Maths: (18+14)/2 = 16, + 60 = 76 of 100, B1, grade point 8, pass');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1 FA', 1, 1) r where r.scored = 16 and r.max_marks = 20$$, 1, 'the FA part: average 16 of 20');
select pg_temp.counts($$select count(*) from pg_temp.res('Final', 1, 1) r where r.scored = 76 and r.max_marks = 100 and r.missing > 0$$, 1, 'Final: Term 2 is not entered, so it is LEFT OUT (never counted as 0): 76 of 100, flagged incomplete');
select pg_temp.lives($$select pg_temp.mk('FA1', 1, 2, 'marked', 20)$$, 'student 2 FA1 = 20');
select pg_temp.lives($$select pg_temp.mk('FA2', 1, 2, 'marked', 20)$$, 'FA2 = 20');
select pg_temp.lives($$select pg_temp.mk('SA1', 1, 2, 'marked', 80)$$, 'SA1 = 80');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 2, 1) r where r.scored = 100 and r.grade = 'A1' and r.grade_point = 10$$, 1, 'full marks: 100, A1, grade point 10');
-- absent counts as 0, never typed
select pg_temp.lives($$select pg_temp.mk('FA1', 1, 3, 'absent')$$, 'student 3 FA1 absent');
select pg_temp.lives($$select pg_temp.mk('FA2', 1, 3, 'marked', 10)$$, 'FA2 = 10');
select pg_temp.lives($$select pg_temp.mk('SA1', 1, 3, 'marked', 30)$$, 'SA1 = 30');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 3, 1) r where r.scored = 35 and r.pct = 35 and r.grade = 'D' and r.passed and r.has_absent$$, 1, 'absent = 0 for the total: (0+10)/2 = 5, + 30 = 35: exactly the pass mark passes, flagged has_absent');
select pg_temp.counts($$select count(*) from public.marks where student_id = pg_temp.st(3) and status = 'absent' and marks is null$$, 1, 'an absent row stores no number (never a typed zero)');
-- not applicable is left out of the marks AND the maximum
select pg_temp.lives($$select pg_temp.mk('FA1', 1, 4, 'na')$$, 'student 4 FA1 not applicable');
select pg_temp.lives($$select pg_temp.mk('FA2', 1, 4, 'marked', 12)$$, 'FA2 = 12');
select pg_temp.lives($$select pg_temp.mk('SA1', 1, 4, 'marked', 20)$$, 'SA1 = 20');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1 FA', 4, 1) r where r.scored = 12 and r.max_marks = 20$$, 1, 'N/A removes FA1: the FA part is just FA2 = 12 of 20');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 4, 1) r where r.scored = 32 and r.pct = 32 and r.grade = 'E' and not r.passed$$, 1, 'Term 1 = 32, E, fail');

-- a second subject and the student's overall result
select pg_temp.login_as('00000000-0000-4000-fc00-000000000006');
select pg_temp.lives($$select pg_temp.mk('FA1', 2, 1, 'marked', 10)$$, 'English teacher: English FA1 = 10');
select pg_temp.lives($$select pg_temp.mk('FA2', 2, 1, 'marked', 10)$$, 'English FA2 = 10');
select pg_temp.lives($$select pg_temp.mk('SA1', 2, 1, 'marked', 40)$$, 'English SA1 = 40');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.counts($$select count(*) from public.student_results r where r.group_id = pg_temp.grp('Term 1') and r.student_id = pg_temp.st(1) and r.scored = 126 and r.max_marks = 200 and r.pct = 63 and r.grade = 'B2' and r.result = 'pass' and r.subjects_count = 2$$, 1, 'student 1 overall: 76 + 50 = 126 of 200 = 63%, B2, pass');
select pg_temp.counts($$select count(*) from public.student_results r where r.group_id = pg_temp.grp('Term 1') and r.student_id = pg_temp.st(2) and r.result = 'incomplete'$$, 1, 'student 2: English not entered yet, so the result is incomplete (not pass)');
select pg_temp.counts($$select count(*) from public.student_results r where r.group_id = pg_temp.grp('Term 1') and r.student_id = pg_temp.st(4) and r.result = 'incomplete'$$, 1, 'student 4: incomplete too');
-- pass marks per subject and class
select pg_temp.lives($$select public.set_pass_mark('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', pg_temp.sb(2), 60)$$, 'Admin: English pass mark 60%');
select pg_temp.counts($$select count(*) from public.student_results r where r.group_id = pg_temp.grp('Term 1') and r.student_id = pg_temp.st(1) and r.result = 'fail' and r.failed_count = 1$$, 1, 'one failed subject makes the term result Fail');
select pg_temp.lives($$select public.set_pass_mark('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', pg_temp.sb(2), null)$$, 'back to the default 35%');
select pg_temp.counts($$select count(*) from public.student_results r where r.group_id = pg_temp.grp('Term 1') and r.student_id = pg_temp.st(1) and r.result = 'pass'$$, 1, 'passes again');
-- maximum override for one subject
select pg_temp.lives($$select public.set_subject_max(pg_temp.comp('SA1'), pg_temp.sb(2), 50)$$, 'Admin: English SA1 is out of 50');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 1, 2) r where r.scored = 50 and r.max_marks = 70 and round(r.pct, 2) = 71.43 and r.grade = 'B1'$$, 1, 'English Term 1 = 10 + 40 of 20 + 50 = 71.43%, B1');
select pg_temp.throws($$select public.set_subject_max(pg_temp.comp('SA1'), pg_temp.sb(2), 30)$$, 'an override below marks already entered is refused', '23514');
select pg_temp.lives($$select public.set_subject_max(pg_temp.comp('SA1'), pg_temp.sb(2), null)$$, 'override removed');
-- best of N
select pg_temp.lives($$select public.save_result_group(jsonb_build_object('academic_year_id', '2a000000-0000-4000-fc00-000000000001', 'class_id', '3a000000-0000-4000-fc00-000000000001', 'name', 'Best FA', 'method', 'best_n', 'best_n', 1,
   'members', jsonb_build_array(jsonb_build_object('component_id', pg_temp.comp('FA1')), jsonb_build_object('component_id', pg_temp.comp('FA2')))))$$, 'Admin: a "best 1 of FA1, FA2" group');
select pg_temp.counts($$select count(*) from pg_temp.res('Best FA', 1, 1) r where r.scored = 18 and r.max_marks = 20$$, 1, 'best of N takes the better exam (18 of 20)');
-- the calculation is stored so the screen can show it
select pg_temp.counts($$select count(*) from public.subject_result_calc(pg_temp.st(1), pg_temp.grp('Term 1'), pg_temp.sb(1)) c where jsonb_array_length(c -> 'calc' -> 'steps') = 2 and c -> 'calc' ->> 'method' = 'sum'$$, 1, 'Admin: the calculation steps are stored for display');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.throws($$select calc from public.subject_results$$, 'a teacher cannot read the calculation steps', '42501');
select pg_temp.throws($$select * from public.subject_result_calc(pg_temp.st(1), pg_temp.grp('Term 1'), pg_temp.sb(1))$$, 'nor call the Admin function', '42501');
select pg_temp.counts($$select count(*) from public.subject_results where subject_id = pg_temp.sb(1)$$, 16, 'but still reads the totals of their subject (4 results x 4 students)');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002');
select pg_temp.throws($$select * from public.subject_result_calc(pg_temp.st(1), pg_temp.grp('Term 1'), pg_temp.sb(1))$$, 'the marks duty cannot either (Admin only)', '42501');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');

-- ================================================================ reading: teachers see only their subject
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.counts($$select count(*) from public.subject_results where subject_id <> pg_temp.sb(1)$$, 0, 'Maths teacher: only Maths results');
select pg_temp.counts($$select count(*) from public.student_results$$, 0, 'Maths teacher: no overall results (they show other subjects)');
select pg_temp.counts($$select count(*) from public.marks where subject_id = pg_temp.sb(1)$$, 12, 'Maths teacher: sees the Maths marks they entered');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002');
select pg_temp.counts($$select count(*) from public.student_results where group_id = pg_temp.grp('Term 1')$$, 4, 'marks duty: sees every student result');

-- ================================================================ locking
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
-- pending marks block the lock; Absent and Not applicable count as entered
select pg_temp.throws($$select public.lock_result_group(pg_temp.grp('Term 1'))$$, 'Admin: cannot lock Term 1 while marks are not entered', '23514');
select pg_temp.throws($$select public.lock_exam_component(pg_temp.comp('FA1'))$$, 'nor lock one exam with marks missing', '23514');
select pg_temp.counts($$select coalesce(sum(pending), 0) from public.exam_pending(pg_temp.comp('FA1'))$$, 3, 'the lock screen lists what is missing: English FA1 for 3 students (Maths is complete)');
select pg_temp.counts($$select count(*) from public.exam_pending(pg_temp.comp('FA1')) where subject_id = pg_temp.sb(2)$$, 1, '...all of it under English in section A');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000006');
select pg_temp.lives($$select pg_temp.mk(c, 2, n, 'na') from (values ('FA1'), ('FA2'), ('SA1')) a(c), (values (2), (3), (4)) b(n)$$, 'English teacher: marks the other students Not applicable for English');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.counts($$select coalesce(sum(pending), 0) from public.exam_pending(pg_temp.comp('FA1'))$$, 0, 'N/A counts as entered: nothing pending');
select pg_temp.lives($$select public.lock_exam_component(pg_temp.comp('FA1'))$$, 'one exam can be locked on its own when complete');
select pg_temp.lives($$select public.unlock_exam_component(pg_temp.comp('FA1'), 'locked it just to test')$$, 'and unlocked again');
select pg_temp.lives($$select public.lock_result_group(pg_temp.grp('Term 1'))$$, 'Admin: locks Term 1');
select pg_temp.counts($$select count(*) from public.exam_components where class_id = '3a000000-0000-4000-fc00-000000000001' and locked_at is not null and name in ('FA1', 'FA2', 'SA1')$$, 3, 'its exams are locked');
select pg_temp.counts($$select count(*) from public.exam_components where class_id = '3a000000-0000-4000-fc00-000000000001' and locked_at is not null and name in ('FA3', 'FA4', 'SA2')$$, 0, 'Term 2 exams are not');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 1, 'marked', 5)$$, 'Admin cannot change a locked mark either', '23514');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002');
select pg_temp.throws($$select pg_temp.mk('FA1', 1, 1, 'marked', 5)$$, 'duty: cannot change a locked mark', '23514');
select pg_temp.throws($$select public.clear_mark(pg_temp.comp('FA1'), pg_temp.st(1), pg_temp.sb(1))$$, 'duty: cannot clear a locked mark', '23514');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.throws($$select pg_temp.mk('SA1', 1, 1, 'marked', 5)$$, 'teacher: cannot change a locked mark', '23514');
select pg_temp.affects($$update public.marks set marks = 1$$, 0, 'a direct update of marks changes nothing');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.throws($$select public.save_exam_component(jsonb_build_object('id', pg_temp.comp('FA1'), 'name', 'FA1', 'max_marks', 25))$$, 'a locked exam cannot be edited', '23514');
select pg_temp.throws($$select public.set_pass_mark('2a000000-0000-4000-fc00-000000000001', '3a000000-0000-4000-fc00-000000000001', pg_temp.sb(1), 50)$$, 'pass marks cannot change while the class has locked exams', '23514');
select pg_temp.throws($$select public.delete_result_group(pg_temp.grp('Term 1'))$$, 'a locked result cannot be deleted', '23514');
select pg_temp.counts($$select count(*) from public.subject_results where group_id = pg_temp.grp('Term 1') and locked$$, 5, 'locked results are flagged');
-- a new grading scale does not rewrite locked results
select pg_temp.lives($$select public.save_grade_bands('[{"grade":"X","min_pct":0,"max_pct":100,"grade_point":1,"is_fail":false}]')$$, 'Admin: replaces the grading scale');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 1, 1) r where r.grade = 'B1'$$, 1, 'locked result keeps its grade (snapshot)');
select pg_temp.throws($$select public.save_grade_bands('[{"grade":"A","min_pct":10,"max_pct":100,"grade_point":10}]')$$, 'the scale must start at 0%', '23514');
select pg_temp.throws($$select public.save_grade_bands('[{"grade":"A","min_pct":0,"max_pct":50,"grade_point":10},{"grade":"B","min_pct":0,"max_pct":100,"grade_point":9}]')$$, 'two grades cannot start at the same percentage', '23514');
select pg_temp.lives($$select public.save_grade_bands('[{"grade":"A1","min_pct":91,"max_pct":100,"grade_point":10},{"grade":"A2","min_pct":81,"max_pct":90,"grade_point":9},{"grade":"B1","min_pct":71,"max_pct":80,"grade_point":8},{"grade":"B2","min_pct":61,"max_pct":70,"grade_point":7},{"grade":"C1","min_pct":51,"max_pct":60,"grade_point":6},{"grade":"C2","min_pct":41,"max_pct":50,"grade_point":5},{"grade":"D","min_pct":35,"max_pct":40,"grade_point":4},{"grade":"E","min_pct":0,"max_pct":34,"grade_point":0,"is_fail":true}]')$$, 'the school scale is back');
-- unlock
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002');
select pg_temp.throws($$select public.unlock_exam_component(pg_temp.comp('FA1'), 'please')$$, 'duty: cannot unlock', '42501');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.throws($$select public.unlock_exam_component(pg_temp.comp('FA1'), '')$$, 'unlocking needs a reason', '23514');
select pg_temp.lives($$select public.unlock_exam_component(pg_temp.comp('FA1'), 'Correcting a mark entry error')$$, 'Admin: unlocks FA1 with a reason');
select pg_temp.counts($$select count(*) from public.result_groups where name in ('Term 1', 'Final') and class_id = '3a000000-0000-4000-fc00-000000000001' and locked_at is not null$$, 0, 'results built from it are unlocked too');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.lives($$select pg_temp.mk('FA1', 1, 1, 'marked', 20)$$, 'teacher: can change FA1 after unlock');
select pg_temp.throws($$select pg_temp.mk('SA1', 1, 1, 'marked', 70)$$, 'but SA1 is still locked', '23514');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 1, 1) r where r.scored = 77 and not r.locked$$, 1, 'results recalculated automatically: (20+14)/2 = 17 + 60 = 77');
select pg_temp.lives($$select public.lock_result_group(pg_temp.grp('Term 1'))$$, 'locks again');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'marks' and action = 'update' and old_data ->> 'marks' = '18.00' and new_data ->> 'marks' = '20.00'), 'the mark change is audit-logged with old and new values');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'exam_components' and action = 'update' and new_data ->> 'lock_note' = 'Correcting a mark entry error'), 'the unlock and its reason are audit-logged');

-- ================================================================ a mark not entered is never counted as 0; results refresh after a change
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.lives($$select pg_temp.mk('FA3', 1, 1, 'marked', 14)$$, 'Maths teacher: Term 2 FA3 = 14 for student 1');
select pg_temp.lives($$select pg_temp.mk('SA2', 1, 1, 'marked', 70)$$, 'SA2 = 70 (FA4 is not entered)');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 2', 1, 1) r where r.scored = 84 and r.max_marks = 100 and r.missing = 1$$, 1, 'Term 2: FA4 is LEFT OUT, not counted as 0: (14) + 70 = 84 of 100, one exam missing');
select pg_temp.lives($$select pg_temp.mk('FA3', 1, 1, 'marked', 2)$$, 'student 1 FA3 is changed to 2');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 2', 1, 1) r where r.scored = 72 and r.max_marks = 100$$, 1, 'the Term 2 result is refreshed straight away: 2 + 70 = 72');
select pg_temp.counts($$select count(*) from pg_temp.res('Term 1', 1, 1) r where r.scored = 77$$, 1, 'and Term 1 (which does not contain FA3) is untouched');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.counts($$select count(*) from public.student_results r where r.group_id = pg_temp.grp('Term 2') and r.student_id = pg_temp.st(1) and r.result = 'incomplete'$$, 1, 'the overall Term 2 result says Incomplete (never Pass or Fail) while an exam is not entered');

-- ================================================================ grades, remarks, modes
select pg_temp.login_as('00000000-0000-4000-fc00-000000000006');   -- teaches Art in A
select pg_temp.lives($$select public.save_grades(pg_temp.grp('Term 2'), '3b000000-0000-4000-fc00-000000000001', pg_temp.sb(3), jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(1), 'grade', 'A', 'remark', 'Neat work')))$$, 'Art teacher: co-scholastic grade for Term 2');
select pg_temp.throws($$select public.save_grades(pg_temp.grp('Term 1'), '3b000000-0000-4000-fc00-000000000001', pg_temp.sb(3), jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(1), 'grade', 'B')))$$, 'a locked term refuses grades', '23514');
select pg_temp.throws($$select public.save_grades(pg_temp.grp('Term 2'), '3b000000-0000-4000-fc00-000000000001', pg_temp.sb(2), jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(1), 'grade', 'A')))$$, 'a scholastic subject is not graded with letters in a marks class', '23514');
select pg_temp.throws($$select public.save_grades(pg_temp.grp('Term 2'), '3b000000-0000-4000-fc00-000000000001', pg_temp.sb(3), jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(1), 'grade', 'Z')))$$, 'an unknown grade is refused', '23514');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.throws($$select public.save_grades(pg_temp.grp('Term 2'), '3b000000-0000-4000-fc00-000000000001', pg_temp.sb(3), jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(2), 'grade', 'A')))$$, 'the Maths teacher cannot grade Art', '42501');
select pg_temp.counts($$select count(*) from public.grade_entries$$, 0, 'and cannot see the Art grades');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000004');   -- class teacher of A
select pg_temp.lives($$select public.save_report_remark(pg_temp.grp('Term 2'), pg_temp.st(1), (select id from public.remark_bank order by sort_order limit 1), null, null)$$, 'class teacher: picks a standard remark');
select pg_temp.counts($$select count(*) from public.report_remarks where remark_te is not null and bank_id is not null$$, 1, 'the Telugu comes from the bank (nothing is machine-translated)');
select pg_temp.lives($$select public.save_report_remark(pg_temp.grp('Term 2'), pg_temp.st(2), null, 'Needs regular practice.', 'క్రమం తప్పకుండా సాధన అవసరం.')$$, 'class teacher: types their own English and Telugu');
select pg_temp.throws($$select public.save_report_remark(pg_temp.grp('Term 1'), pg_temp.st(1), null, 'Too late', null)$$, 'a locked term refuses remarks', '23514');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.throws($$select public.save_report_remark(pg_temp.grp('Term 2'), pg_temp.st(1), null, 'Not my class', null)$$, 'a subject teacher who is not class teacher cannot write remarks', '42501');
-- grade-mode class
select pg_temp.login_as('00000000-0000-4000-fc00-000000000005');   -- class teacher of C2-A, teaches Rhymes
select pg_temp.throws($$select public.save_marks((select id from public.exam_components limit 1), '3b000000-0000-4000-fc00-000000000002', pg_temp.sb(4), '[]')$$, 'marks are refused for a grades class', '23514');
select pg_temp.lives($$select public.save_grades((select id from public.result_groups where class_id = '3a000000-0000-4000-fc00-000000000002' and name = 'Term 1'), '3b000000-0000-4000-fc00-000000000002', pg_temp.sb(4), jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(5), 'grade', 'B', 'remark', 'Sings well')))$$, 'grade class: a grade and remark for a subject');
select pg_temp.throws($$select public.save_grades((select id from public.result_groups where class_id = '3a000000-0000-4000-fc00-000000000002' and name = 'Term 1'), '3b000000-0000-4000-fc00-000000000002', pg_temp.sb(4), jsonb_build_array(jsonb_build_object('student_id', pg_temp.st(5), 'remark', 'only text')))$$, 'a grades class needs a grade', '23514');

-- ================================================================ report cards
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.throws($$select public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1'))$$, 'a subject teacher cannot open a report card', '42501');
select pg_temp.throws($$select * from public.class_result_list('3b000000-0000-4000-fc00-000000000001', pg_temp.grp('Term 1'))$$, 'nor the class list', '42501');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000005');
select pg_temp.throws($$select public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1'))$$, 'an unrelated teacher cannot (the term is not even visible to them)');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000004');
select pg_temp.throws($$select public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 2'))$$, 'the class teacher cannot open a card of an unlocked term', '23514');
select pg_temp.throws($$select public.report_card_data(pg_temp.st(5), pg_temp.grp('Term 1'))$$, 'nor a student of another class', '23514');
select pg_temp.counts($$select (public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1')) -> 'total' ->> 'scored')::numeric$$, 127, 'the class teacher gets their own student''s card (all subjects): 77 + 50');
select pg_temp.counts($$select jsonb_array_length(public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1')) -> 'subjects')$$, 2, 'the card lists both marks subjects');
select pg_temp.counts($$select jsonb_array_length(public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1')) -> 'children')$$, 1, 'the card also gives the groups a result is built from (Term 1 FA)');
select pg_temp.counts($$select jsonb_array_length(public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1')) -> 'components')$$, 3, 'and the three exams under it (FA1, FA2, SA1)');
select pg_temp.counts($$select count(*) from public.class_result_list('3b000000-0000-4000-fc00-000000000001', pg_temp.grp('Term 1'))$$, 4, 'the class teacher sees their class list');
select pg_temp.counts($$select case when (public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1'), true) ->> 'duplicate')::boolean then 1 else 0 end$$, 0, 'first print is not a duplicate');
select pg_temp.counts($$select case when (public.report_card_data(pg_temp.st(1), pg_temp.grp('Term 1'), true) ->> 'duplicate')::boolean then 1 else 0 end$$, 1, 'a reprint says Duplicate');
select pg_temp.counts($$select printed from public.class_result_list('3b000000-0000-4000-fc00-000000000001', pg_temp.grp('Term 1')) where student_id = pg_temp.st(1)$$, 2, 'the list counts the prints');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
select pg_temp.counts($$select count(*) from public.report_card_prints where student_id = pg_temp.st(1)$$, 2, 'Admin reads the print log');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'report_card_prints' and action = 'insert'), 'every print is audit-logged');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002');
select pg_temp.counts($$select count(*) from public.report_card_prints where student_id = pg_temp.st(1)$$, 0, 'the marks duty does not read the print log (Admin only)');
select pg_temp.lives($$select public.report_card_data(pg_temp.st(2), pg_temp.grp('Term 1'))$$, 'the marks duty can open any card of a locked term');

-- ================================================================ the annual (Final) card carries the latest term's co-scholastic grade and remark
select pg_temp.logout();
update public.result_groups set locked_at = now() where id = pg_temp.grp('Final') and class_id = '3a000000-0000-4000-fc00-000000000001';
select pg_temp.login_as('00000000-0000-4000-fc00-000000000004');   -- class teacher of A
select pg_temp.counts($$select count(*) from jsonb_array_elements(public.report_card_data(pg_temp.st(1), pg_temp.grp('Final')) -> 'co_scholastic') e where e ->> 'grade' = 'A'$$, 1, 'Final card: the co-scholastic grade is the one entered for Term 2');
select pg_temp.counts($$select case when public.report_card_data(pg_temp.st(1), pg_temp.grp('Final')) -> 'remark' is not null and (public.report_card_data(pg_temp.st(1), pg_temp.grp('Final')) -> 'remark') <> 'null'::jsonb then 1 else 0 end$$, 1, 'Final card: carries the class teacher''s Term 2 remark');
select pg_temp.counts($$select case when (public.report_card_data(pg_temp.st(4), pg_temp.grp('Final')) -> 'remark') = 'null'::jsonb then 1 else 0 end$$, 1, 'Final card: a student with no remark has none (nothing invented)');
