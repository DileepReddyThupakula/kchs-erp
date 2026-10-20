-- Speed pass 2 (exam, timetable and my-students pages): one-call functions give the same answers and keep the same scope rules. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-ff20-000000000001', 'admin@s2.test');
select pg_temp.fixture_user('00000000-0000-4000-ff20-000000000002', 'ct@s2.test');      -- class teacher of A, teaches Maths in A
select pg_temp.fixture_user('00000000-0000-4000-ff20-000000000003', 'sub@s2.test');     -- teaches Science in B, not a class teacher
select pg_temp.fixture_user('00000000-0000-4000-ff20-000000000004', 'duty@s2.test');    -- marks duty
select pg_temp.fixture_user('00000000-0000-4000-ff20-000000000005', 'desk@s2.test');    -- office, no marks duty
insert into public.staff (id, user_id, app_role, employee_code, full_name, status) values
  ('1b200000-0000-4000-ff20-000000000001', '00000000-0000-4000-ff20-000000000001', 'admin',          'S2-ADM', 'S2 Admin', 'active'),
  ('1b200000-0000-4000-ff20-000000000002', '00000000-0000-4000-ff20-000000000002', 'teacher',        'S2-CT',  'S2 Class teacher', 'active'),
  ('1b200000-0000-4000-ff20-000000000003', '00000000-0000-4000-ff20-000000000003', 'teacher',        'S2-SUB', 'S2 Subject teacher', 'active'),
  ('1b200000-0000-4000-ff20-000000000004', '00000000-0000-4000-ff20-000000000004', 'teacher',        'S2-DUT', 'S2 Duty', 'active'),
  ('1b200000-0000-4000-ff20-000000000005', '00000000-0000-4000-ff20-000000000005', 'computer_staff', 'S2-DSK', 'S2 Desk', 'active');
insert into public.staff_permissions (staff_id, duty) values ('1b200000-0000-4000-ff20-000000000004', 'all_class_marks'), ('1b200000-0000-4000-ff20-000000000005', 'student_records');
insert into public.academic_years (id, name, start_date, end_date) values ('2b200000-0000-4000-ff20-000000000001', 'S2-2077', '2077-04-01', '2078-03-31');
insert into public.classes (id, name, sort_order) values ('3a200000-0000-4000-ff20-000000000001', 'S2 C1', 990);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3b200000-0000-4000-ff20-000000000001', '2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001', 'A', '1b200000-0000-4000-ff20-000000000002'),
  ('3b200000-0000-4000-ff20-000000000002', '2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001', 'B', null);
insert into public.subjects (id, name, code) values ('5f200000-0000-4000-ff20-000000000001', 'S2 Maths', 'S2M'), ('5f200000-0000-4000-ff20-000000000002', 'S2 Science', 'S2S');
insert into public.class_subjects (academic_year_id, class_id, subject_id, sort_order) values
  ('2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001', '5f200000-0000-4000-ff20-000000000001', 1),
  ('2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001', '5f200000-0000-4000-ff20-000000000002', 2);
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1b200000-0000-4000-ff20-000000000002', '3b200000-0000-4000-ff20-000000000001', '5f200000-0000-4000-ff20-000000000001'),
  ('1b200000-0000-4000-ff20-000000000003', '3b200000-0000-4000-ff20-000000000002', '5f200000-0000-4000-ff20-000000000002');
insert into public.result_groups (id, academic_year_id, class_id, name, kind, sort_order) values
  ('6a200000-0000-4000-ff20-000000000001', '2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'term', 1),
  ('6a200000-0000-4000-ff20-000000000002', '2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001', 'S2 Part', 'part', 2);
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('56200000-0000-4000-ff20-000000000001', 'S2-1', 'S2 Ana', 'female', '2067-01-01', '2071-06-01'),
  ('56200000-0000-4000-ff20-000000000002', 'S2-2', 'S2 Bala', 'male', '2067-01-01', '2071-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values
  ('56200000-0000-4000-ff20-000000000001', '2b200000-0000-4000-ff20-000000000001', '3b200000-0000-4000-ff20-000000000001', 1),
  ('56200000-0000-4000-ff20-000000000002', '2b200000-0000-4000-ff20-000000000001', '3b200000-0000-4000-ff20-000000000002', 1);

-- ================= report cards
select pg_temp.login_as('00000000-0000-4000-ff20-000000000001');
create temp table _rc as select public.report_cards_page('2b200000-0000-4000-ff20-000000000001') j;
grant all on _rc to authenticated;
select pg_temp.ok((select jsonb_array_length(j -> 'sections') from _rc) = 2, 'report cards (Admin): both sections');
select pg_temp.ok((select jsonb_array_length(j -> 'groups') from _rc) = 1 and (select j -> 'group' ->> 'name' from _rc) = 'S2 Term 1', 'report cards: only terms and finals are offered (the part is not)');
select pg_temp.ok((select jsonb_array_length(j -> 'rows') from _rc) = (select count(*) from public.class_result_list((select (j -> 'section' ->> 'id')::uuid from _rc), '6a200000-0000-4000-ff20-000000000001')), 'report cards: the list equals class_result_list');
select pg_temp.ok((public.report_cards_page('2b200000-0000-4000-ff20-000000000001', '3b200000-0000-4000-ff20-000000000002') -> 'section' ->> 'name') = 'B', 'report cards (Admin): the section asked for');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000004');
select pg_temp.ok(jsonb_array_length(public.report_cards_page('2b200000-0000-4000-ff20-000000000001') -> 'sections') = 2, 'report cards (marks duty): every section');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000002');
select pg_temp.ok(jsonb_array_length(public.report_cards_page('2b200000-0000-4000-ff20-000000000001') -> 'sections') = 1
  and (public.report_cards_page('2b200000-0000-4000-ff20-000000000001', '3b200000-0000-4000-ff20-000000000002') -> 'section' ->> 'name') = 'A', 'report cards (class teacher): only their section, asking for B falls back to A');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000003');
select pg_temp.ok(jsonb_array_length(public.report_cards_page('2b200000-0000-4000-ff20-000000000001') -> 'sections') = 0
  and public.report_cards_page('2b200000-0000-4000-ff20-000000000001') -> 'rows' is null, 'report cards (subject teacher, not class teacher): nothing');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000005');
select pg_temp.ok(jsonb_array_length(public.report_cards_page('2b200000-0000-4000-ff20-000000000001') -> 'sections') = 0, 'report cards (office without marks duty): nothing');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.report_cards_page('2b200000-0000-4000-ff20-000000000001')$$, 'report cards: not signed in is refused', '42501');

-- ================= exams scheme
select pg_temp.login_as('00000000-0000-4000-ff20-000000000001');
select pg_temp.ok((public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001') ->> 'class_id') = '3a200000-0000-4000-ff20-000000000001'
  and jsonb_array_length(public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001') -> 'scheme' -> 'groups') = 2
  and jsonb_array_length(public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001', '3a200000-0000-4000-ff20-000000000001') -> 'scheme' -> 'subjects') = 2, 'scheme: the class, its two groups and its two subjects');
select pg_temp.ok((public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001') ->> 'class_id') is not null, 'scheme: no class asked for gives the first');
select pg_temp.ok((public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001') ->> 'default_pass_percent')::numeric = (select default_pass_percent from public.school_settings where id = 1), 'scheme: the default pass mark comes from the settings');
select pg_temp.ok(jsonb_array_length(public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001') -> 'bands') = (select count(*) from public.grade_bands)
  and jsonb_array_length(public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001') -> 'bank') = (select count(*) from public.remark_bank where is_active), 'scheme: grade bands and the active remark bank equal the tables');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.exams_scheme_page('2b200000-0000-4000-ff20-000000000001')$$, 'scheme: not signed in is refused', '42501');

-- ================= results report
select pg_temp.login_as('00000000-0000-4000-ff20-000000000001');
select pg_temp.ok((public.report_exams_page('2b200000-0000-4000-ff20-000000000001') -> 'names') ? 'S2 Term 1' and not ((public.report_exams_page('2b200000-0000-4000-ff20-000000000001') -> 'names') ? 'S2 Part'), 'results report: result names are terms and finals only');
select pg_temp.ok((public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'nonsense') ->> 'exam') = 'S2 Term 1', 'results report: an unknown name falls back to the first');
select pg_temp.ok((public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'sections') -> 'rows') = (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.report_class_results('6a200000-0000-4000-ff20-000000000001') r), 'results report (sections): equals report_class_results');
select pg_temp.ok((public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'subjects') -> 'rows') = (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.report_subject_results('6a200000-0000-4000-ff20-000000000001') r), 'results report (subjects): equals report_subject_results');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000002');
select pg_temp.ok((public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'sections') ->> 'sectionsOk')::boolean and not coalesce((public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'sections') ->> 'forbidden')::boolean, false), 'results report: a class teacher may see the sections tab');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000003');
select pg_temp.ok(not (public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'sections') ->> 'sectionsOk')::boolean
  and (public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'sections') ->> 'forbidden')::boolean
  and jsonb_array_length(public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'sections') -> 'rows') = 0, 'results report: a subject teacher who is not a class teacher is refused the sections tab');
select pg_temp.ok(jsonb_array_length(public.report_exams_page('2b200000-0000-4000-ff20-000000000001', 'S2 Term 1', 'subjects') -> 'rows') = 0, 'results report: a subject teacher sees no subject rows without their marks');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.report_exams_page('2b200000-0000-4000-ff20-000000000001')$$, 'results report: not signed in is refused', '42501');

-- ================= timetable
select pg_temp.login_as('00000000-0000-4000-ff20-000000000001');
create temp table _tt as select public.timetable_page('2b200000-0000-4000-ff20-000000000001') j;
grant all on _tt to authenticated;
select pg_temp.ok((select jsonb_array_length(j -> 'sections') from _tt) = 2, 'timetable: the two sections');
select pg_temp.ok((select jsonb_array_length(j -> 'assignments') from _tt) = (select count(*) from public.teacher_assignments), 'timetable: every assignment');
select pg_temp.ok((select jsonb_array_length(j -> 'teachers') from _tt) = (select count(*) from public.staff_directory() where status = 'active'), 'timetable: active staff only as teachers');
select pg_temp.ok((select jsonb_array_length(j -> 'schedules') from _tt) = (select count(*) from public.bell_schedules) and (select jsonb_array_length(j -> 'periods') from _tt) = (select count(*) from public.bell_periods), 'timetable: the bell schedules and periods');
select pg_temp.ok((select j -> 'workingDays' from _tt) = (select to_jsonb(working_days) from public.school_settings where id = 1), 'timetable: working days from the settings');
select pg_temp.ok((select j -> 'subjects' ->> '5f200000-0000-4000-ff20-000000000001' from _tt) = 'S2 Maths', 'timetable: subject names');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.timetable_page('2b200000-0000-4000-ff20-000000000001')$$, 'timetable: not signed in is refused', '42501');

-- ================= my students (the section filter)
select pg_temp.login_as('00000000-0000-4000-ff20-000000000002');
select pg_temp.ok((select string_agg(s ->> 'name', ',') from jsonb_array_elements(public.my_section_options('2b200000-0000-4000-ff20-000000000001')) s) = 'A', 'my sections (class teacher): only A');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000003');
select pg_temp.ok((select string_agg(s ->> 'name', ',') from jsonb_array_elements(public.my_section_options('2b200000-0000-4000-ff20-000000000001')) s) = 'B', 'my sections (subject teacher): only B, the one they teach');
select pg_temp.login_as('00000000-0000-4000-ff20-000000000005');
select pg_temp.ok(jsonb_array_length(public.my_section_options('2b200000-0000-4000-ff20-000000000001')) = 0, 'my sections (office): none');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.my_section_options('2b200000-0000-4000-ff20-000000000001')$$, 'my sections: not signed in is refused', '42501');
