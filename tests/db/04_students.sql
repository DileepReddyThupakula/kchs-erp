-- Students module: permissions, scope rule, encrypted IDs, validation, audit.
-- Runs as postgres inside a rolled-back transaction (see scripts/test-db.mjs).

update public.school_settings set mediums = '{English,Telugu}' where id = 1;

-- ---------- users ----------
select pg_temp.fixture_user('00000000-0000-4000-d000-000000000001', 'admin@stu.test');
select pg_temp.fixture_user('00000000-0000-4000-d000-000000000002', 'records@stu.test');
select pg_temp.fixture_user('00000000-0000-4000-d000-000000000003', 'govids@stu.test');
select pg_temp.fixture_user('00000000-0000-4000-d000-000000000004', 't1@stu.test');
select pg_temp.fixture_user('00000000-0000-4000-d000-000000000005', 't2@stu.test');
select pg_temp.fixture_user('00000000-0000-4000-d000-000000000006', 'fee@stu.test');
select pg_temp.fixture_user('00000000-0000-4000-d000-000000000007', 'none@stu.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('13000000-0000-4000-d000-000000000001', '00000000-0000-4000-d000-000000000001', 'admin',   'STU-ADM', 'Stu Admin'),
  ('13000000-0000-4000-d000-000000000002', '00000000-0000-4000-d000-000000000002', 'teacher', 'STU-REC', 'Stu Records'),
  ('13000000-0000-4000-d000-000000000003', '00000000-0000-4000-d000-000000000003', 'teacher', 'STU-GOV', 'Stu GovIds (class teacher S1)'),
  ('13000000-0000-4000-d000-000000000004', '00000000-0000-4000-d000-000000000004', 'teacher', 'STU-T1',  'Stu T1 (S1)'),
  ('13000000-0000-4000-d000-000000000005', '00000000-0000-4000-d000-000000000005', 'teacher', 'STU-T2',  'Stu T2 (S2)'),
  ('13000000-0000-4000-d000-000000000006', '00000000-0000-4000-d000-000000000006', 'teacher', 'STU-FEE', 'Stu Fee'),
  ('13000000-0000-4000-d000-000000000007', '00000000-0000-4000-d000-000000000007', 'teacher', 'STU-NONE', 'Stu None');
insert into public.staff_permissions (staff_id, duty) values
  ('13000000-0000-4000-d000-000000000002', 'student_records'),
  ('13000000-0000-4000-d000-000000000003', 'government_ids_view'),
  ('13000000-0000-4000-d000-000000000006', 'fee_collection');

-- ---------- school structure ----------
insert into public.academic_years (id, name, start_date, end_date) values
  ('23000000-0000-4000-d000-000000000001', 'STU-2060-61', '2060-04-01', '2061-03-31'),
  ('23000000-0000-4000-d000-000000000002', 'STU-2061-62', '2061-04-01', '2062-03-31');
insert into public.classes (id, name, sort_order) values ('36000000-0000-4000-d000-000000000001', 'STU Class', 981);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('37000000-0000-4000-d000-000000000001', '23000000-0000-4000-d000-000000000001', '36000000-0000-4000-d000-000000000001', 'A', '13000000-0000-4000-d000-000000000003'),
  ('37000000-0000-4000-d000-000000000002', '23000000-0000-4000-d000-000000000001', '36000000-0000-4000-d000-000000000001', 'B', null),
  ('37000000-0000-4000-d000-000000000003', '23000000-0000-4000-d000-000000000002', '36000000-0000-4000-d000-000000000001', 'A', null);
insert into public.subjects (id, name) values ('43000000-0000-4000-d000-000000000001', 'STU Maths');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('13000000-0000-4000-d000-000000000004', '37000000-0000-4000-d000-000000000001', '43000000-0000-4000-d000-000000000001'),
  ('13000000-0000-4000-d000-000000000005', '37000000-0000-4000-d000-000000000002', '43000000-0000-4000-d000-000000000001');

-- ---------- students: A1, A2 in S1 (siblings, share guardian G1); B1 in S2 ----------
insert into public.students (id, admission_no, full_name, gender, date_of_birth, address) values
  ('51000000-0000-4000-d000-000000000001', 'STU-0001', 'Stu Anil',   'male',   '2012-05-01', 'Door 1, Test Street'),
  ('51000000-0000-4000-d000-000000000002', 'STU-0002', 'Stu Anitha', 'female', '2014-07-09', 'Door 1, Test Street'),
  ('51000000-0000-4000-d000-000000000003', 'STU-0003', 'Stu Bhanu',  'male',   '2012-01-15', 'Door 9, Other Street');
insert into public.guardians (id, full_name, phone, address) values
  ('52000000-0000-4000-d000-000000000001', 'Stu Father A', '9000011111', 'Door 1, Test Street'),
  ('52000000-0000-4000-d000-000000000002', 'Stu Mother B', '9000022222', 'Door 9, Other Street');
insert into public.student_guardians (student_id, guardian_id, relation, is_primary) values
  ('51000000-0000-4000-d000-000000000001', '52000000-0000-4000-d000-000000000001', 'father', true),
  ('51000000-0000-4000-d000-000000000002', '52000000-0000-4000-d000-000000000001', 'father', true),
  ('51000000-0000-4000-d000-000000000003', '52000000-0000-4000-d000-000000000002', 'mother', true);
insert into public.student_enrollments (id, student_id, academic_year_id, section_id, roll_no) values
  ('53000000-0000-4000-d000-000000000001', '51000000-0000-4000-d000-000000000001', '23000000-0000-4000-d000-000000000001', '37000000-0000-4000-d000-000000000001', 1),
  ('53000000-0000-4000-d000-000000000002', '51000000-0000-4000-d000-000000000002', '23000000-0000-4000-d000-000000000001', '37000000-0000-4000-d000-000000000001', 2),
  ('53000000-0000-4000-d000-000000000003', '51000000-0000-4000-d000-000000000003', '23000000-0000-4000-d000-000000000001', '37000000-0000-4000-d000-000000000002', 1);
insert into public.student_profiles (student_id, details) values
  ('51000000-0000-4000-d000-000000000001', '{"caste_category":"BC-D","religion":"Hindu","pen":"DEMO-PEN"}'),
  ('51000000-0000-4000-d000-000000000003', '{"social_category":"OBC"}');
select app.store_secure_value('51000000-0000-4000-d000-000000000001', 'aadhaar_no', '9999 0000 1234');
select app.store_secure_value('51000000-0000-4000-d000-000000000003', 'aadhaar_no', '999900005678');
insert into public.student_documents (student_id, doc_type, file_path, file_name, mime_type, size_bytes) values
  ('51000000-0000-4000-d000-000000000001', 'birth_certificate', '51000000-0000-4000-d000-000000000001/bc.pdf', 'bc.pdf', 'application/pdf', 1000);
insert into storage.objects (bucket_id, name) values
  ('student-photos', '51000000-0000-4000-d000-000000000001/photo.jpg'),
  ('student-photos', '51000000-0000-4000-d000-000000000003/photo.jpg'),
  ('student-documents', '51000000-0000-4000-d000-000000000001/bc.pdf');

-- ---------- encryption at rest (as owner) ----------
select pg_temp.counts($$select count(*) from public.student_secure_values where position(convert_to('999900001234', 'UTF8') in value_enc) > 0$$, 0, 'Aadhaar is encrypted at rest (no plain text in the table)');
select pg_temp.counts($$select count(*) from public.student_secure_values where student_id = '51000000-0000-4000-d000-000000000001' and length(value_enc) > 40$$, 1, 'Aadhaar is stored as ciphertext');
select pg_temp.counts($$select count(*) from public.student_secure_values where student_id = '51000000-0000-4000-d000-000000000001' and value_last4 = '1234'$$, 1, 'masked value = last 4 digits');
select pg_temp.counts($$select count(*) from public.audit_logs where new_data::text like '%999900001234%' or old_data::text like '%999900001234%' or details::text like '%999900001234%'$$, 0, 'full Aadhaar never reaches the audit log');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'student_secure_values' and new_data->>'value_enc' = '[REDACTED]' and new_data->>'value_last4' = '1234'$$, 1, 'audit log stores only the masked value');

-- =====================================================================
-- ADMIN
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-d000-000000000001');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 3, 'admin: sees all students');
select pg_temp.counts($$select count(*) from public.student_profiles where student_id in ('51000000-0000-4000-d000-000000000001','51000000-0000-4000-d000-000000000003')$$, 2, 'admin: sees government profiles');
select pg_temp.counts($$select count(*) from public.reveal_student_secure_values('51000000-0000-4000-d000-000000000001') where value = '999900001234'$$, 1, 'admin: reveals full Aadhaar');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'student.ids_revealed' and record_id = '51000000-0000-4000-d000-000000000001' and actor_role = 'admin'$$, 1, 'reveal is audit-logged (field names only)');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'student.ids_revealed' and details::text like '%9999%'$$, 0, 'reveal log contains no ID value');
select pg_temp.lives($$insert into public.students (full_name, gender, date_of_birth) values ('Stu Auto', 'female', '2015-02-02')$$, 'admin: adds a student (admission no generated)');
select pg_temp.counts($$select count(*) from public.students where full_name = 'Stu Auto' and admission_no ~ '[0-9]{4}$'$$, 1, 'admission number auto-generated when blank');
select pg_temp.affects($$update public.students set status = 'left', status_date = '2060-12-01', status_reason = 'Moved' where id = '51000000-0000-4000-d000-000000000003'$$, 1, 'admin: sets status left');
select pg_temp.affects($$update public.students set status = 'active', status_date = null, status_reason = null where id = '51000000-0000-4000-d000-000000000003'$$, 1, 'admin: sets status back to active');
select pg_temp.affects($$delete from public.students where id = '51000000-0000-4000-d000-000000000003'$$, 0, 'admin: students are never hard-deleted');
select pg_temp.lives($$select public.set_student_secure_value('51000000-0000-4000-d000-000000000002', 'aadhaar_no', '999900009999')$$, 'admin: sets Aadhaar via RPC');
select pg_temp.throws($$select public.set_student_secure_value('51000000-0000-4000-d000-000000000002', 'aadhaar_no', '12345')$$, 'Aadhaar format is validated (12 digits)', '23514');
select pg_temp.throws($$select public.set_student_secure_value('51000000-0000-4000-d000-000000000002', 'caste', 'X')$$, 'only sensitive fields go through the encrypted store', '23514');
select pg_temp.throws($$insert into public.student_secure_values (student_id, field_key, value_enc, value_last4) values ('51000000-0000-4000-d000-000000000002', 'udid_no', '\x00', '0000')$$, 'nobody writes encrypted values directly (RPC only)', '42501');
select pg_temp.throws($$select value_enc from public.student_secure_values$$, 'ciphertext column is not readable through the API, even by admin', '42501');

-- validation of government fields
select pg_temp.throws($$update public.student_profiles set details = details || '{"nonsense_field":"x"}' where student_id = '51000000-0000-4000-d000-000000000001'$$, 'unknown government field is rejected', '23514');
select pg_temp.throws($$update public.student_profiles set details = details || '{"aadhaar_no":"999900001111"}' where student_id = '51000000-0000-4000-d000-000000000001'$$, 'sensitive field cannot be stored in plain details', '23514');
select pg_temp.throws($$update public.student_profiles set details = details || '{"religion":"Martian"}' where student_id = '51000000-0000-4000-d000-000000000001'$$, 'select field only accepts allowed values', '23514');
select pg_temp.throws($$update public.student_profiles set details = details || '{"height_cm":"tall"}' where student_id = '51000000-0000-4000-d000-000000000001'$$, 'number field rejects text', '23514');
select pg_temp.lives($$update public.student_profiles set details = details || '{"facilities_received":["Uniform","Mid-day meal"],"cwsn":false}' where student_id = '51000000-0000-4000-d000-000000000001'$$, 'valid multiselect + boolean accepted');
select pg_temp.throws($$update public.student_profiles set details = details || '{"facilities_received":["Transport"]}' where student_id = '51000000-0000-4000-d000-000000000001'$$, 'transport is not an allowed facility (no school buses)', '23514');

-- enrolment rules
select pg_temp.throws($$insert into public.student_enrollments (student_id, academic_year_id, section_id) values ('51000000-0000-4000-d000-000000000001', '23000000-0000-4000-d000-000000000001', '37000000-0000-4000-d000-000000000002')$$, 'only one enrolment per student per year', '23505');
select pg_temp.throws($$insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values ('51000000-0000-4000-d000-000000000003', '23000000-0000-4000-d000-000000000002', '37000000-0000-4000-d000-000000000001', 5)$$, 'section must belong to the enrolment year', '23514');
select pg_temp.throws($$update public.student_enrollments set roll_no = 1 where id = '53000000-0000-4000-d000-000000000002'$$, 'roll numbers are unique within a section', '23505');
select pg_temp.lives($$insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values ('51000000-0000-4000-d000-000000000001', '23000000-0000-4000-d000-000000000002', '37000000-0000-4000-d000-000000000003', 1)$$, 'admin: next-year enrolment (history kept)');
select pg_temp.counts($$select count(*) from public.student_guardians where guardian_id = '52000000-0000-4000-d000-000000000001'$$, 2, 'siblings share one guardian record');

-- =====================================================================
-- TEACHER WITH student_records
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-d000-000000000002');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 3, 'student_records: sees every student');
select pg_temp.lives($$insert into public.students (admission_no, full_name, gender, date_of_birth) values ('STU-0100', 'Stu Imported', 'male', '2013-03-03')$$, 'student_records: adds a student');
select pg_temp.throws($$insert into public.students (admission_no, full_name, gender, date_of_birth, status) values ('STU-0101', 'Stu Left', 'male', '2013-03-03', 'left')$$, 'student_records: cannot add a student with a non-active status', '42501');
select pg_temp.affects($$update public.students set address = 'New address' where id = '51000000-0000-4000-d000-000000000001'$$, 1, 'student_records: edits a student');
select pg_temp.throws($$update public.students set status = 'tc_issued' where id = '51000000-0000-4000-d000-000000000001'$$, 'student_records: cannot change status', '42501');
select pg_temp.throws($$update public.students set status = 'passed_out' where id = '51000000-0000-4000-d000-000000000001'$$, 'student_records: cannot set passed_out', '42501');
select pg_temp.affects($$delete from public.students where id = '51000000-0000-4000-d000-000000000001'$$, 0, 'student_records: cannot delete a student');
select pg_temp.affects($$delete from public.guardians where id = '52000000-0000-4000-d000-000000000002'$$, 0, 'student_records: cannot delete a guardian');
select pg_temp.affects($$delete from public.student_guardians where student_id = '51000000-0000-4000-d000-000000000001'$$, 0, 'student_records: cannot delete a guardian link');
select pg_temp.affects($$delete from public.student_enrollments where id = '53000000-0000-4000-d000-000000000001'$$, 0, 'student_records: cannot delete an enrolment');
select pg_temp.affects($$update public.student_enrollments set section_id = '37000000-0000-4000-d000-000000000002', roll_no = 7 where id = '53000000-0000-4000-d000-000000000002'$$, 1, 'student_records: changes a student''s section');
select pg_temp.throws($$update public.student_enrollments set status = 'promoted' where id = '53000000-0000-4000-d000-000000000003'$$, 'student_records: cannot change enrolment status', '42501');
select pg_temp.lives($$update public.student_profiles set details = details || '{"blood_group":"O+"}' where student_id = '51000000-0000-4000-d000-000000000001'$$, 'student_records: edits government fields');
select pg_temp.lives($$select public.set_student_secure_value('51000000-0000-4000-d000-000000000003', 'aadhaar_no', '999900004321')$$, 'student_records: enters Aadhaar');
select pg_temp.counts($$select count(*) from public.student_secure_values where student_id = '51000000-0000-4000-d000-000000000003' and value_last4 = '4321'$$, 1, 'student_records: sees the masked value only');
select pg_temp.throws($$select * from public.reveal_student_secure_values('51000000-0000-4000-d000-000000000003')$$, 'student_records: cannot reveal full Aadhaar', '42501');
select pg_temp.counts($$select count(*) from public.student_documents where student_id = '51000000-0000-4000-d000-000000000001'$$, 1, 'student_records: sees documents');
select pg_temp.lives($$insert into storage.objects (bucket_id, name) values ('student-documents', '51000000-0000-4000-d000-000000000003/tc.pdf')$$, 'student_records: uploads a document file');
-- (deleting storage objects directly is refused by Supabase for everyone; deletes go through the Storage API)

-- revoke the duty: immediately back to own sections (none)
select pg_temp.login_as('00000000-0000-4000-d000-000000000001');
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '13000000-0000-4000-d000-000000000002'$$, 1, 'admin: revokes student_records');
select pg_temp.login_as('00000000-0000-4000-d000-000000000002');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 0, 'revoked student_records: sees no students (no sections)');
select pg_temp.throws($$insert into public.students (admission_no, full_name, gender, date_of_birth) values ('STU-0102', 'Stu After', 'male', '2013-03-03')$$, 'revoked student_records: cannot add students', '42501');
select pg_temp.counts($$select count(*) from public.student_secure_values$$, 0, 'revoked student_records: no masked IDs');

-- =====================================================================
-- CLASS TEACHER OF S1 WITH government_ids_view
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-d000-000000000003');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 1, 'class teacher S1: sees S1 students only (A2 moved to S2)');
select pg_temp.counts($$select count(*) from public.reveal_student_secure_values('51000000-0000-4000-d000-000000000001') where value = '999900001234'$$, 1, 'government_ids_view: reveals Aadhaar of own section''s student');
select pg_temp.throws($$select * from public.reveal_student_secure_values('51000000-0000-4000-d000-000000000003')$$, 'government_ids_view: cannot reveal a student outside own sections', '42501');
select pg_temp.counts($$select count(*) from public.student_profiles$$, 0, 'government_ids_view: no access to other government fields');
select pg_temp.affects($$update public.students set full_name = 'X' where id = '51000000-0000-4000-d000-000000000001'$$, 0, 'government_ids_view: cannot edit students');

-- =====================================================================
-- T1: subject teacher in S1, no duties (scope rule)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-d000-000000000004');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 1, 'T1: sees only students of own section (S1)');
select pg_temp.counts($$select count(*) from public.students where id = '51000000-0000-4000-d000-000000000003'$$, 0, 'T1: cannot read a student of another section, even by id');
select pg_temp.counts($$select count(*) from public.student_enrollments where section_id = '37000000-0000-4000-d000-000000000001'$$, 1, 'T1: sees roll numbers of own section');
select pg_temp.counts($$select count(*) from public.guardians where phone = '9000011111'$$, 1, 'T1: sees guardian phone/address of own students');
select pg_temp.counts($$select count(*) from public.guardians where id = '52000000-0000-4000-d000-000000000002'$$, 0, 'T1: cannot read guardians of other sections');
select pg_temp.counts($$select count(*) from public.student_profiles$$, 0, 'T1: no government fields');
select pg_temp.counts($$select count(*) from public.student_secure_values$$, 0, 'T1: no IDs, not even masked');
select pg_temp.throws($$select * from public.reveal_student_secure_values('51000000-0000-4000-d000-000000000001')$$, 'T1: cannot reveal IDs', '42501');
select pg_temp.counts($$select count(*) from public.student_documents$$, 0, 'T1: no documents');
select pg_temp.counts($$select count(*) from storage.objects where bucket_id = 'student-documents'$$, 0, 'T1: cannot read document files');
select pg_temp.counts($$select count(*) from storage.objects where bucket_id = 'student-photos' and name like '51000000-0000-4000-d000-000000000001/%'$$, 1, 'T1: can see photo of own student');
select pg_temp.counts($$select count(*) from storage.objects where bucket_id = 'student-photos' and name like '51000000-0000-4000-d000-000000000003/%'$$, 0, 'T1: cannot see photo of another section''s student');
select pg_temp.throws($$insert into public.students (admission_no, full_name, gender, date_of_birth) values ('STU-0103', 'Stu T1', 'male', '2013-03-03')$$, 'T1: cannot add students', '42501');
select pg_temp.affects($$update public.students set address = 'x' where id = '51000000-0000-4000-d000-000000000001'$$, 0, 'T1: cannot edit students');
select pg_temp.throws($$select public.set_student_secure_value('51000000-0000-4000-d000-000000000001', 'aadhaar_no', '999900000000')$$, 'T1: cannot set IDs', '42501');

-- T2: S2 (A2 and B1 are in S2 now)
select pg_temp.login_as('00000000-0000-4000-d000-000000000005');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 2, 'T2: sees only S2 students');
select pg_temp.counts($$select count(*) from public.students where id = '51000000-0000-4000-d000-000000000001'$$, 0, 'T2: cannot read S1 student');

-- =====================================================================
-- fee_collection: may look up any student (basic), nothing sensitive
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-d000-000000000006');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 4, 'fee_collection: looks up any student (fees module)');
select pg_temp.counts($$select count(*) from public.student_profiles$$, 0, 'fee_collection: no government fields');
select pg_temp.counts($$select count(*) from public.student_secure_values$$, 0, 'fee_collection: no IDs');
select pg_temp.affects($$update public.students set address = 'x' where id = '51000000-0000-4000-d000-000000000001'$$, 0, 'fee_collection: cannot edit students');

-- =====================================================================
-- teacher with no sections and no duties; anon
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-d000-000000000007');
select pg_temp.counts($$select count(*) from public.students where admission_no like 'STU-%'$$, 0, 'teacher without sections: no students');
select pg_temp.counts($$select count(*) from public.guardians where full_name like 'Stu %'$$, 0, 'teacher without sections: no guardians');
select pg_temp.counts($$select count(*) from public.student_field_definitions$$, 49, 'teachers can read field labels (no data)');

select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.students', 'anon: no access to students', '42501');
select pg_temp.throws('select count(*) from public.guardians', 'anon: no access to guardians', '42501');
select pg_temp.throws($$select * from public.reveal_student_secure_values('51000000-0000-4000-d000-000000000001')$$, 'anon: cannot reveal IDs', '42501');
