-- Students Part 2: save_student() (atomic) and export_student_ids() (Admin).
update public.school_settings set mediums = '{English,Telugu}' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-e000-000000000001', 'admin@save.test');
select pg_temp.fixture_user('00000000-0000-4000-e000-000000000002', 'records@save.test');
select pg_temp.fixture_user('00000000-0000-4000-e000-000000000003', 't1@save.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('14000000-0000-4000-e000-000000000001', '00000000-0000-4000-e000-000000000001', 'admin',   'SAVE-ADM', 'Save Admin'),
  ('14000000-0000-4000-e000-000000000002', '00000000-0000-4000-e000-000000000002', 'teacher', 'SAVE-REC', 'Save Records'),
  ('14000000-0000-4000-e000-000000000003', '00000000-0000-4000-e000-000000000003', 'teacher', 'SAVE-T1',  'Save T1');
insert into public.staff_permissions (staff_id, duty) values ('14000000-0000-4000-e000-000000000002', 'student_records');
insert into public.academic_years (id, name, start_date, end_date) values ('24000000-0000-4000-e000-000000000001', 'SAVE-2070-71', '2070-04-01', '2071-03-31');
insert into public.classes (id, name, sort_order) values ('38000000-0000-4000-e000-000000000001', 'SAVE Class', 971);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('39000000-0000-4000-e000-000000000001', '24000000-0000-4000-e000-000000000001', '38000000-0000-4000-e000-000000000001', 'A', '14000000-0000-4000-e000-000000000003'),
  ('39000000-0000-4000-e000-000000000002', '24000000-0000-4000-e000-000000000001', '38000000-0000-4000-e000-000000000001', 'B', null);

-- ---------- student_records: full save in one call ----------
select pg_temp.login_as('00000000-0000-4000-e000-000000000002');
select pg_temp.lives($$select public.save_student('{
  "student": {"admission_no": "save-001", "full_name": "Save Ravi", "gender": "male", "date_of_birth": "2014-02-03", "address": "Main Road"},
  "enrollment": {"academic_year_id": "24000000-0000-4000-e000-000000000001", "section_id": "39000000-0000-4000-e000-000000000001", "roll_no": 3},
  "guardians": [{"relation": "father", "full_name": "Save Father", "phone": "9000099999", "is_primary": true},
                {"relation": "mother", "full_name": "Save Mother", "phone": "9000088888"}],
  "details": {"religion": "Hindu", "caste_category": "BC-B"},
  "secure": {"aadhaar_no": "9999 1111 2222"}
}'::jsonb)$$, 'student_records: saves student + enrolment + guardians + details + Aadhaar in one call');
select pg_temp.counts($$select count(*) from public.students where admission_no = 'SAVE-001' and status = 'active'$$, 1, 'admission number normalised (upper case), status active');
select pg_temp.counts($$select count(*) from public.student_enrollments e join public.students s on s.id = e.student_id where s.admission_no = 'SAVE-001' and e.roll_no = 3$$, 1, 'enrolment saved with roll number');
select pg_temp.counts($$select count(*) from public.student_guardians sg join public.students s on s.id = sg.student_id where s.admission_no = 'SAVE-001'$$, 2, 'two guardians linked');
select pg_temp.counts($$select count(*) from public.student_guardians sg join public.students s on s.id = sg.student_id where s.admission_no = 'SAVE-001' and sg.is_primary$$, 1, 'exactly one primary guardian');
select pg_temp.counts($$select count(*) from public.student_secure_values v join public.students s on s.id = v.student_id where s.admission_no = 'SAVE-001' and v.value_last4 = '2222'$$, 1, 'Aadhaar stored encrypted, masked last 4');

-- sibling shares guardians
select pg_temp.lives($$select public.save_student('{
  "student": {"admission_no": "SAVE-002", "full_name": "Save Rani", "gender": "female", "date_of_birth": "2016-04-05"},
  "enrollment": {"academic_year_id": "24000000-0000-4000-e000-000000000001", "section_id": "39000000-0000-4000-e000-000000000002"},
  "sibling_admission_no": "save-001"
}'::jsonb)$$, 'student_records: adds a sibling by admission number');
select pg_temp.counts($$select count(distinct sg.guardian_id) from public.student_guardians sg join public.students s on s.id = sg.student_id where s.admission_no in ('SAVE-001','SAVE-002')$$, 2, 'siblings share the same 2 guardian records');
select pg_temp.throws($$select public.save_student('{"student": {"admission_no": "SAVE-003", "full_name": "Save X", "gender": "male", "date_of_birth": "2016-04-05"}, "sibling_admission_no": "NOPE-1"}'::jsonb)$$, 'unknown sibling admission number is rejected', '23503');

-- atomic: a bad field rolls back everything
select pg_temp.throws($$select public.save_student('{
  "student": {"admission_no": "SAVE-004", "full_name": "Save Bad", "gender": "male", "date_of_birth": "2015-01-01"},
  "guardians": [{"relation": "father", "full_name": "Save Bad Father", "phone": "9000077777"}],
  "details": {"religion": "Martian"}
}'::jsonb)$$, 'invalid government field rejects the whole save', '23514');
select pg_temp.counts($$select count(*) from public.students where admission_no = 'SAVE-004'$$, 0, 'nothing saved after a failed save (no half student)');
select pg_temp.counts($$select count(*) from public.guardians where full_name = 'Save Bad Father'$$, 0, 'no orphan guardian after a failed save');
select pg_temp.throws($$select public.save_student('{"student": {"admission_no": "SAVE-001", "full_name": "Dup", "gender": "male", "date_of_birth": "2015-01-01"}}'::jsonb)$$, 'duplicate admission number is rejected (safe import retry)', '23505');

-- update + section change; status can't be set through save
select pg_temp.lives($$select public.save_student(jsonb_build_object(
  'id', (select id from public.students where admission_no = 'SAVE-001'),
  'student', '{"full_name": "Save Ravi Kumar", "gender": "male", "date_of_birth": "2014-02-03", "status": "left"}'::jsonb,
  'enrollment', '{"academic_year_id": "24000000-0000-4000-e000-000000000001", "section_id": "39000000-0000-4000-e000-000000000002", "roll_no": 9}'::jsonb))$$, 'student_records: edits a student and moves section');
select pg_temp.counts($$select count(*) from public.students where admission_no = 'SAVE-001' and full_name = 'Save Ravi Kumar' and status = 'active'$$, 1, 'save never changes status');
select pg_temp.counts($$select count(*) from public.student_enrollments e join public.students s on s.id = e.student_id where s.admission_no = 'SAVE-001'$$, 1, 'still one enrolment per year after a section change');
select pg_temp.throws($$select * from public.export_student_ids(array(select id from public.students where admission_no like 'SAVE-%'))$$, 'student_records: cannot bulk-export IDs', '42501');

-- ---------- other teacher ----------
select pg_temp.login_as('00000000-0000-4000-e000-000000000003');
select pg_temp.throws($$select public.save_student('{"student": {"admission_no": "SAVE-009", "full_name": "Save T", "gender": "male", "date_of_birth": "2015-01-01"}}'::jsonb)$$, 'teacher without student_records: cannot save students', '42501');
select pg_temp.throws($$select * from public.export_student_ids(array(select id from public.students))$$, 'teacher: cannot bulk-export IDs', '42501');

-- ---------- admin bulk export ----------
select pg_temp.login_as('00000000-0000-4000-e000-000000000001');
select pg_temp.counts($$select count(*) from public.export_student_ids(array(select id from public.students where admission_no like 'SAVE-%')) where value = '999911112222'$$, 1, 'admin: bulk export returns full IDs');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'student.ids_exported' and actor_role = 'admin'$$, 1, 'bulk export is audit-logged once');
select pg_temp.counts($$select count(*) from public.audit_logs where details::text like '%999911112222%' or new_data::text like '%999911112222%'$$, 0, 'no full ID in the audit log');
