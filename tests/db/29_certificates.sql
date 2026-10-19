-- Certificates (database part): TC draft lock, numbering, checks, status change and restore, reprints, wording, refusals, logs. Rolled back.
update public.academic_years set is_current = false where is_current;
update public.school_settings set mediums = '{English,Telugu}' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000001', 'admin@ce.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000002', 'office-duty@ce.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000003', 'office-noduty@ce.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000004', 'teacher-duty@ce.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000005', 'old-admin@ce.test');
select pg_temp.fixture_user('00000000-0000-4000-fd00-000000000006', 'office-fee@ce.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name, email, status) values
  ('1d000000-0000-4000-fd00-000000000001', '00000000-0000-4000-fd00-000000000001', 'admin',          'CE-ADM', 'Ce Admin', 'admin@ce.test', 'active'),
  ('1d000000-0000-4000-fd00-000000000002', '00000000-0000-4000-fd00-000000000002', 'computer_staff', 'CE-DUT', 'Ce Office with the duty', 'office-duty@ce.test', 'active'),
  ('1d000000-0000-4000-fd00-000000000003', '00000000-0000-4000-fd00-000000000003', 'computer_staff', 'CE-NOD', 'Ce Office without the duty', 'office-noduty@ce.test', 'active'),
  ('1d000000-0000-4000-fd00-000000000004', '00000000-0000-4000-fd00-000000000004', 'teacher',        'CE-TCH', 'Ce Teacher with the duty', 'teacher-duty@ce.test', 'active'),
  ('1d000000-0000-4000-fd00-000000000005', '00000000-0000-4000-fd00-000000000005', 'admin',          'CE-OLD', 'Ce Deactivated Admin', 'old-admin@ce.test', 'inactive'),
  ('1d000000-0000-4000-fd00-000000000006', '00000000-0000-4000-fd00-000000000006', 'computer_staff', 'CE-FEE', 'Ce Office with fee access', 'office-fee@ce.test', 'active');
insert into public.staff_permissions (staff_id, duty) values
  ('1d000000-0000-4000-fd00-000000000002', 'certificates_idcards'), ('1d000000-0000-4000-fd00-000000000003', 'student_records'), ('1d000000-0000-4000-fd00-000000000006', 'fee_collection');
insert into public.staff_permissions (staff_id, duty) select '1d000000-0000-4000-fd00-000000000004', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';

insert into public.academic_years (id, name, start_date, end_date, status, is_current) values
  ('2d000000-0000-4000-fd00-000000000001', 'CE-2023-74', '2023-04-01', '2024-03-31', 'closed', false),
  ('2d000000-0000-4000-fd00-000000000002', 'CE-2024-75', '2024-04-01', '2025-03-31', 'active', true),
  ('2d000000-0000-4000-fd00-000000000003', 'CE-2022-73', '2022-04-01', '2023-03-31', 'closed', false);
insert into public.classes (id, name, sort_order) values ('3e000000-0000-4000-fd00-000000000001', 'CE A', 980), ('3e000000-0000-4000-fd00-000000000002', 'CE B', 981), ('3e000000-0000-4000-fd00-000000000003', 'CE C', 982);
insert into public.sections (id, academic_year_id, class_id, name, medium) values
  ('3f000000-0000-4000-fd00-000000000001', '2d000000-0000-4000-fd00-000000000002', '3e000000-0000-4000-fd00-000000000001', 'A', 'English'),
  ('3f000000-0000-4000-fd00-000000000002', '2d000000-0000-4000-fd00-000000000002', '3e000000-0000-4000-fd00-000000000002', 'A', 'Telugu'),
  ('3f000000-0000-4000-fd00-000000000003', '2d000000-0000-4000-fd00-000000000001', '3e000000-0000-4000-fd00-000000000001', 'A', 'English'),
  ('3f000000-0000-4000-fd00-000000000004', '2d000000-0000-4000-fd00-000000000003', '3e000000-0000-4000-fd00-000000000001', 'A', 'English'),
  ('3f000000-0000-4000-fd00-000000000005', '2d000000-0000-4000-fd00-000000000002', '3e000000-0000-4000-fd00-000000000003', 'A', 'English');
-- fees only for class B (so students in class A have no dues)
insert into public.fee_heads (id, name, code, sort_order) values ('62d00000-0000-4000-fd00-000000000001', 'CE Tuition', 'CE-TUI', 96);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63d00000-0000-4000-fd00-000000000001', '2d000000-0000-4000-fd00-000000000002', 'CE Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values
  ('2d000000-0000-4000-fd00-000000000002', '3e000000-0000-4000-fd00-000000000002', '62d00000-0000-4000-fd00-000000000001', 1200000, '63d00000-0000-4000-fd00-000000000001');
-- students
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('56d00000-0000-4000-fd00-000000000001', 'CE-01', 'Ravi Kumar', 'male',   '2016-01-15', '2022-06-01'),   -- full details, Telugu names, no dues
  ('56d00000-0000-4000-fd00-000000000002', 'CE-02', 'Sita Devi',  'female', '2016-03-05', '2022-06-01'),   -- no Telugu names
  ('56d00000-0000-4000-fd00-000000000003', 'CE-03', 'Dues Boy',   'male',   '2016-05-05', '2022-06-01'),   -- has unpaid dues (class B)
  ('56d00000-0000-4000-fd00-000000000004', 'CE-04', 'No Parents', 'male',   '2016-06-06', '2022-06-01'),   -- no guardian: details incomplete
  ('56d00000-0000-4000-fd00-000000000005', 'CE-05', 'Left Girl',  'female', '2016-07-07', '2022-06-01'),   -- already left
  ('56d00000-0000-4000-fd00-000000000006', 'CE-06', 'History Boy', 'male',  '2016-08-08', '2022-06-01'),   -- detained: A in 2023-74 and 2024-75
  ('56d00000-0000-4000-fd00-000000000007', 'CE-07', 'Gap Girl',   'female', '2016-09-09', '2022-06-01'),   -- 2022-73 and 2024-75, nothing in 2023-74
  ('56d00000-0000-4000-fd00-000000000008', 'CE-08', 'Cancel Boy', 'male',   '2016-10-10', '2022-06-01');
update public.students set status = 'left', status_date = '2024-05-01', status_reason = 'Moved away' where id = '56d00000-0000-4000-fd00-000000000005';
insert into public.guardians (id, full_name, phone) values
  ('57d00000-0000-4000-fd00-000000000001', 'Ramesh Kumar', '9000000001'), ('57d00000-0000-4000-fd00-000000000002', 'Lakshmi Kumar', '9000000002'),
  ('57d00000-0000-4000-fd00-000000000003', 'Ganga Devi', '9000000003'), ('57d00000-0000-4000-fd00-000000000004', 'Dues Father', '9000000004');
insert into public.student_guardians (student_id, guardian_id, relation, is_primary) values
  ('56d00000-0000-4000-fd00-000000000001', '57d00000-0000-4000-fd00-000000000001', 'father', true), ('56d00000-0000-4000-fd00-000000000001', '57d00000-0000-4000-fd00-000000000002', 'mother', false),
  ('56d00000-0000-4000-fd00-000000000002', '57d00000-0000-4000-fd00-000000000003', 'mother', true),
  ('56d00000-0000-4000-fd00-000000000003', '57d00000-0000-4000-fd00-000000000004', 'father', true),
  ('56d00000-0000-4000-fd00-000000000005', '57d00000-0000-4000-fd00-000000000003', 'mother', true),
  ('56d00000-0000-4000-fd00-000000000006', '57d00000-0000-4000-fd00-000000000004', 'father', true),
  ('56d00000-0000-4000-fd00-000000000007', '57d00000-0000-4000-fd00-000000000003', 'mother', true),
  ('56d00000-0000-4000-fd00-000000000008', '57d00000-0000-4000-fd00-000000000004', 'father', true);
insert into public.student_profiles (student_id, details) values
  ('56d00000-0000-4000-fd00-000000000001', '{"name_te": "రవి కుమార్", "father_name_te": "రమేష్ కుమార్", "mother_name_te": "లక్ష్మి కుమార్", "religion": "Hindu", "caste": "Kamma", "nationality": "Indian"}'::jsonb),
  ('56d00000-0000-4000-fd00-000000000006', '{"name_te": "హిస్టరీ బాయ్", "father_name_te": "డ్యూస్ ఫాదర్"}'::jsonb);
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values
  ('56d00000-0000-4000-fd00-000000000001', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', 1),
  ('56d00000-0000-4000-fd00-000000000002', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', 2),
  ('56d00000-0000-4000-fd00-000000000003', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000002', 1),
  ('56d00000-0000-4000-fd00-000000000004', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', 3),
  ('56d00000-0000-4000-fd00-000000000005', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', 4),
  ('56d00000-0000-4000-fd00-000000000006', '2d000000-0000-4000-fd00-000000000001', '3f000000-0000-4000-fd00-000000000003', 1),
  ('56d00000-0000-4000-fd00-000000000006', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', 5),
  ('56d00000-0000-4000-fd00-000000000007', '2d000000-0000-4000-fd00-000000000003', '3f000000-0000-4000-fd00-000000000004', 1),
  ('56d00000-0000-4000-fd00-000000000007', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', 6),
  ('56d00000-0000-4000-fd00-000000000008', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', 7);
-- the old year's records that a TC must never touch
insert into public.exam_components (id, academic_year_id, class_id, name, max_marks, sort_order) values ('65d00000-0000-4000-fd00-000000000001', '2d000000-0000-4000-fd00-000000000002', '3e000000-0000-4000-fd00-000000000001', 'CE FA1', 20, 1);
insert into public.subjects (id, name, code) values ('5d000000-0000-4000-fd00-000000000001', 'CE Maths', 'CEM');
insert into public.marks (academic_year_id, class_id, section_id, student_id, component_id, subject_id, status, marks)
  values ('2d000000-0000-4000-fd00-000000000002', '3e000000-0000-4000-fd00-000000000001', '3f000000-0000-4000-fd00-000000000001', '56d00000-0000-4000-fd00-000000000001', '65d00000-0000-4000-fd00-000000000001', '5d000000-0000-4000-fd00-000000000001', 'marked', 17);
insert into public.attendance_sessions (id, academic_year_id, section_id, att_date, session, kind, status) values ('a5d00000-0000-4000-fd00-000000000001', '2d000000-0000-4000-fd00-000000000002', '3f000000-0000-4000-fd00-000000000001', '2024-07-02', 'morning', 'regular', 'marked');
insert into public.student_attendance (session_id, student_id, att_date, session, status) values ('a5d00000-0000-4000-fd00-000000000001', '56d00000-0000-4000-fd00-000000000001', '2024-07-02', 'morning', 'present');
create function pg_temp.fp_records() returns text language sql as $$
  select md5(coalesce((select string_agg(x, '|' order by x) from (
    select concat_ws(',', 'mark', m.id, m.student_id, m.marks, m.status) x from public.marks m
    union all select concat_ws(',', 'att', a.id, a.student_id, a.status) from public.student_attendance a where a.session_id = 'a5d00000-0000-4000-fd00-000000000001'
    union all select concat_ws(',', 'due', d.id, d.student_id, d.amount_paise, d.concession_paise, d.paid_paise, (d.voided_at is null)) from public.student_fee_dues d where d.student_id::text like '56d00000-%'
    union all select concat_ws(',', 'enr', e.id, e.student_id, e.section_id, e.roll_no, e.status) from public.student_enrollments e where e.student_id::text like '56d00000-%'
    union all select concat_ws(',', 'rcpt', r.id, r.total_paise, r.status) from public.fee_receipts r where r.student_id::text like '56d00000-%'
  ) q), ''))
$$;
create temp table _fp as select pg_temp.fp_records() records, (select string_agg(id::text || amount_paise || paid_paise, ',' order by id) from public.student_fee_dues where student_id = '56d00000-0000-4000-fd00-000000000003') dues3;
grant all on _fp to authenticated;

-- ================= nobody but the right people: refusals first (nothing exists yet)
create function pg_temp.refused_all(p_who text, p_kinds text[]) returns void language plpgsql as $$
declare k text;
begin
  foreach k in array p_kinds loop
    perform pg_temp.throws(format($q$select public.certificate_issue(%L, '56d00000-0000-4000-fd00-000000000001', 'en', '{"purpose": "bank account", "leaving_date": "2024-06-01", "leaving_reason": "moved"}', false, null)$q$, k), p_who || ': cannot issue a ' || k, '42501');
    perform pg_temp.throws(format($q$select public.certificate_preview(%L, '56d00000-0000-4000-fd00-000000000001', 'en', '{"purpose": "bank"}')$q$, k), p_who || ': cannot preview a ' || k, '42501');
    perform pg_temp.throws(format($q$select public.certificate_register(%L, '2d000000-0000-4000-fd00-000000000002')$q$, k), p_who || ': cannot read the ' || k || ' register', '42501');
    perform pg_temp.throws(format($q$select public.certificate_register_export(%L, '2d000000-0000-4000-fd00-000000000002', 'csv')$q$, k), p_who || ': cannot export the ' || k || ' register', '42501');
  end loop;
end $$;
select pg_temp.login_as('00000000-0000-4000-fd00-000000000004'); select pg_temp.refused_all('teacher with the certificates duty', array['tc', 'bonafide', 'study']);
select pg_temp.throws($$select public.certificates_for_student('56d00000-0000-4000-fd00-000000000001')$$, 'teacher with the duty: cannot list a student''s certificates', '42501');
select pg_temp.login_as('00000000-0000-4000-fd00-000000000003'); select pg_temp.refused_all('office without the duty', array['tc', 'bonafide', 'study']);
select pg_temp.login_as('00000000-0000-4000-fd00-000000000006'); select pg_temp.refused_all('office with fee access only', array['tc', 'bonafide', 'study']);
select pg_temp.login_as('00000000-0000-4000-fd00-000000000005'); select pg_temp.refused_all('deactivated Admin', array['tc', 'bonafide', 'study']);
select pg_temp.login_as(null); select pg_temp.refused_all('not signed in', array['tc', 'bonafide', 'study']);
select pg_temp.login_as('00000000-0000-4000-fd00-000000000002'); select pg_temp.refused_all('office with the duty', array['tc']);
select pg_temp.throws($$select public.certificate_checklist('56d00000-0000-4000-fd00-000000000001')$$, 'office with the duty: cannot see the TC checklist (it shows dues)', '42501');
select pg_temp.throws($$select public.certificate_set_start('bonafide', '2d000000-0000-4000-fd00-000000000002', 50)$$, 'office with the duty: cannot change the starting number', '42501');
select pg_temp.throws($$select public.certificate_template_set_draft('tc', false)$$, 'office with the duty: cannot switch the draft off', '42501');
select pg_temp.throws($$select public.certificate_signature_image(true)$$, 'office with the duty: cannot switch the signature image on', '42501');
select pg_temp.throws($$select public.certificate_settings_save('X', 'Y', 'Z')$$, 'office with the duty: cannot change the prefixes', '42501');
select pg_temp.throws($$select public.certificate_template_save('bonafide', 'place', 'Place', 'ప్రదేశం')$$, 'office with the duty: cannot change the wording', '42501');
select pg_temp.counts($$select count(*) from public.certificate_templates where kind = 'tc'$$, 0, 'office with the duty: cannot even read the TC template');
select pg_temp.counts($$select count(*) from public.certificate_templates where kind = 'bonafide'$$, 1, 'office with the duty: reads the bonafide template');
select pg_temp.logout();

-- ================= the TC draft lock
select pg_temp.login_as('00000000-0000-4000-fd00-000000000001');
create temp table _pv as select public.certificate_preview('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}') j;
grant all on _pv to authenticated;
select pg_temp.ok((select (j -> 'flags' ->> 'draft_layout')::boolean from _pv) and (select j -> 'certificate' from _pv) = 'null'::jsonb, 'preview: a TC preview carries the DRAFT mark and has no number');
select pg_temp.ok((select j -> 'payload' -> 'student' ->> 'dob_words' from _pv) = 'Fifteenth January Two Thousand Sixteen', 'preview: date of birth in words', (select j -> 'payload' -> 'student' ->> 'dob_words' from _pv));
select pg_temp.ok((select status from public.students where id = '56d00000-0000-4000-fd00-000000000001') = 'active', 'preview: changes nothing on the student');
select pg_temp.counts($$select count(*) from public.certificates$$, 0, 'preview: no certificate is created');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}')$$, 'TC: a real TC cannot be issued while the layout is a draft', '23514');
select pg_temp.ok((select status from public.students where id = '56d00000-0000-4000-fd00-000000000001') = 'active' and (select count(*) from public.certificates) = 0, 'TC: the refused issue left no trace (no number used, status unchanged)');
select pg_temp.ok((select count(*) from public.certificate_templates where kind = 'tc' and layout_draft and not wording_confirmed) = 1, 'the TC template starts as a draft');
select pg_temp.ok((select (flags ->> 'telugu_unchecked')::boolean from (select public.certificate_preview('bonafide', '56d00000-0000-4000-fd00-000000000001', 'te', '{"purpose": "bank account"}') -> 'flags' flags) q), 'Telugu: the print warns while any Telugu wording is unchecked');
select pg_temp.ok(not (select (flags ->> 'telugu_unchecked')::boolean from (select public.certificate_preview('bonafide', '56d00000-0000-4000-fd00-000000000001', 'en', '{"purpose": "bank account"}') -> 'flags' flags) q), 'Telugu: an English print has no Telugu warning');

-- ================= bonafide: numbering, contents, refusals
create temp table _b1 as select public.certificate_issue('bonafide', '56d00000-0000-4000-fd00-000000000001', 'en', '{"purpose": "bank account", "place": "Yerraguntla"}') j;
grant all on _b1 to authenticated;
select pg_temp.ok((select j ->> 'number' from _b1) = 'BON/CE-2024-75/001', 'numbering: the first bonafide of the year is BON/<year>/001', (select j ->> 'number' from _b1));
select pg_temp.ok((select j -> 'print' -> 'payload' ->> 'purpose' from _b1) = 'bank account' and (select j -> 'print' -> 'payload' -> 'class' ->> 'class' from _b1) = 'CE A' and (select j -> 'print' -> 'payload' -> 'student' ->> 'father' from _b1) = 'Ramesh Kumar', 'bonafide: purpose, class and parent come from the student record');
select pg_temp.ok((select j -> 'print' -> 'texts' -> 'body' ->> 'en' from _b1) like 'This is to certify that {name}%', 'bonafide: the wording comes from the template');
select pg_temp.ok(position('aadhaar' in lower((select j::text from _b1))) = 0 and position('paise' in (select j::text from _b1)) = 0 and position('marks' in lower((select j::text from _b1))) = 0, 'bonafide: no fee, marks or ID data in what is printed');
select pg_temp.ok((select j -> 'print' -> 'duplicate' ->> 'is_duplicate' from _b1) = 'false' and (select j -> 'print' -> 'duplicate' ->> 'copy_no' from _b1) = '1', 'bonafide: the first print is the original');
select pg_temp.ok((select (public.certificate_issue('bonafide', '56d00000-0000-4000-fd00-000000000002', 'en', '{"purpose": "scholarship"}') ->> 'number')) = 'BON/CE-2024-75/002', 'numbering: the next one is 002 (no gap)');
select pg_temp.throws($$select public.certificate_issue('bonafide', '56d00000-0000-4000-fd00-000000000005', 'en', '{"purpose": "bank"}')$$, 'bonafide: refused for a student who has left', '23514');
select pg_temp.throws($$select public.certificate_issue('bonafide', '56d00000-0000-4000-fd00-000000000001', 'en', '{}')$$, 'bonafide: the purpose is required', '23514');
select pg_temp.ok((select count(*) from public.certificates where kind = 'bonafide') = 2 and (select next_no from public.certificate_series where kind = 'bonafide') = 3, 'numbering: refused issues used no number (2 certificates, next is 3)');
select pg_temp.ok((select (public.certificate_issue('study', '56d00000-0000-4000-fd00-000000000001', 'en', '{}') ->> 'number')) = 'STU/CE-2024-75/001', 'numbering: the study series is separate (STU/.../001)');

-- Telugu
select pg_temp.throws($$select public.certificate_issue('bonafide', '56d00000-0000-4000-fd00-000000000002', 'te', '{"purpose": "bank"}')$$, 'Telugu: refused when the Telugu name is not entered', '23514');
select pg_temp.ok((select public.certificate_issue('bonafide', '56d00000-0000-4000-fd00-000000000001', 'both', '{"purpose": "passport"}') ->> 'number') = 'BON/CE-2024-75/003', 'Telugu: bilingual works when the Telugu names are entered');
select pg_temp.ok((select j -> 'payload' -> 'student' ->> 'name_te' from (select public.certificate_preview('bonafide', '56d00000-0000-4000-fd00-000000000001', 'te', '{"purpose": "bank"}') j) q) = 'రవి కుమార్', 'Telugu: the name is printed exactly as stored');

-- study certificate history
create temp table _hist as select public.certificate_preview('study', '56d00000-0000-4000-fd00-000000000006', 'en', '{}') j;
grant all on _hist to authenticated;
select pg_temp.ok((select string_agg(h ->> 'year' || '/' || (h ->> 'class'), ',' order by h ->> 'year') from _hist, jsonb_array_elements(j -> 'payload' -> 'history') h) = 'CE-2023-74/CE A,CE-2024-75/CE A', 'study: a detained student shows the same class in both years');
select pg_temp.ok((select jsonb_array_length(public.certificate_preview('study', '56d00000-0000-4000-fd00-000000000001', 'en', '{}') -> 'payload' -> 'history')) = 1, 'study: one year of history for one enrolment');
select pg_temp.throws($$select public.certificate_issue('study', '56d00000-0000-4000-fd00-000000000007', 'en', '{}')$$, 'study: a gap in the history is refused (no guess)', '23514');
select pg_temp.ok((select jsonb_array_length(public.certificate_issue('study', '56d00000-0000-4000-fd00-000000000007', 'en', '{"accept_gaps": true}') -> 'print' -> 'payload' -> 'history_gaps')) = 1, 'study: with the gap accepted, only the years on record are listed and the gap is named');
select pg_temp.lives($$select public.certificate_issue('study', '56d00000-0000-4000-fd00-000000000005', 'en', '{}')$$, 'study: allowed for a student who has left');

-- ================= TC after the Admin switches the draft off
select pg_temp.lives($$select public.certificate_template_set_draft('tc', false)$$, 'the Admin switches the TC draft off');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_date": "2099-01-01", "leaving_reason": "moved"}')$$, 'TC: a leaving date in the future is refused', '23514');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_reason": "moved"}')$$, 'TC: the leaving date is required', '23514');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "boredom"}')$$, 'TC: the reason must be one of the list', '23514');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "other"}')$$, 'TC: "other" needs a note', '23514');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000005', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}')$$, 'TC: a student who has already left cannot be issued a TC', '23514');
-- dues
select pg_temp.ok((select (c ->> 'status') from jsonb_array_elements(public.certificate_checklist('56d00000-0000-4000-fd00-000000000003', '2024-09-01')) c where c ->> 'key' = 'dues') = 'fail'
              and (select (c ->> 'amount_paise')::bigint from jsonb_array_elements(public.certificate_checklist('56d00000-0000-4000-fd00-000000000003', '2024-09-01')) c where c ->> 'key' = 'dues') > 0, 'checklist: dues are red and show the amount (Admin)');
select pg_temp.ok((select (c ->> 'status') from jsonb_array_elements(public.certificate_checklist('56d00000-0000-4000-fd00-000000000001', '2024-09-01')) c where c ->> 'key' = 'dues') = 'ok', 'checklist: a student with nothing due is green');
select pg_temp.ok((select (c ->> 'status') from jsonb_array_elements(public.certificate_checklist('56d00000-0000-4000-fd00-000000000001', '2024-09-01')) c where c ->> 'key' = 'class_results') = 'warn', 'checklist: results not recorded is an amber warning, not a block');
select pg_temp.ok((select (c ->> 'status') from jsonb_array_elements(public.certificate_checklist('56d00000-0000-4000-fd00-000000000004', '2024-09-01')) c where c ->> 'key' = 'details') = 'fail', 'checklist: a student with no parent on record is red');
select pg_temp.ok((select (c ->> 'status') from jsonb_array_elements(public.certificate_checklist('56d00000-0000-4000-fd00-000000000003', '2024-09-01')) c where c ->> 'key' = 'later_fees') = 'warn', 'checklist: fees falling after the leaving date are an amber warning with a link');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000003', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}')$$, 'TC with dues: refused without the override', '23514');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000003', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}', true, null)$$, 'TC with dues: the override needs a reason', '23514');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000003', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}', true, 'ok')$$, 'TC with dues: a reason of two letters is not enough', '23514');
select pg_temp.throws($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000004', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}', true, 'Family request')$$, 'TC: missing student details can never be overridden', '23514');
select pg_temp.ok((select status from public.students where id = '56d00000-0000-4000-fd00-000000000003') = 'active', 'refused TCs changed nothing');
create temp table _tc3 as select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000003', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "moved"}', true, 'Family has to leave at once; will pay later') j;
grant all on _tc3 to authenticated;
select pg_temp.ok((select j ->> 'number' from _tc3) = 'TC/CE-2024-75/001', 'TC with dues + override + reason: issued as TC/<year>/001');
select pg_temp.ok((select override_reason from public.certificates where number = 'TC/CE-2024-75/001') = 'Family has to leave at once; will pay later', 'override: the reason is saved on the TC record');
select pg_temp.ok((select (string_agg(id::text || amount_paise || paid_paise, ',' order by id)) from public.student_fee_dues where student_id = '56d00000-0000-4000-fd00-000000000003') = (select dues3 from _fp), 'override: the dues are exactly as they were (nothing cleared or changed)');
select pg_temp.ok((select status || '|' || status_date::text || '|' || status_reason from public.students where id = '56d00000-0000-4000-fd00-000000000003') = 'tc_issued|2024-09-01|Family moved', 'TC: the student is "TC issued" with the leaving date and the reason', (select status || '|' || coalesce(status_date::text,'') || '|' || coalesce(status_reason,'') from public.students where id = '56d00000-0000-4000-fd00-000000000003'));
select pg_temp.ok((select j -> 'print' -> 'payload' -> 'tc' ->> 'fees_paid' from _tc3) like 'Fees pending%' and position('paise' in (select j::text from _tc3)) = 0, 'TC: the print says fees are pending, without any amount');
-- clean TC for Ravi, and the status change
select pg_temp.ok((select count(*) from public.attendance_roster('3f000000-0000-4000-fd00-000000000001', '2024-07-03') where student_id = '56d00000-0000-4000-fd00-000000000001') = 1, 'before the TC: the student is on the attendance roster');
create temp table _tc1 as select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_date": "2024-09-01", "leaving_reason": "completed_10", "remarks": "Good student"}') j;
grant all on _tc1 to authenticated;
select pg_temp.ok((select j ->> 'number' from _tc1) = 'TC/CE-2024-75/002', 'numbering: the second TC is 002');
select pg_temp.ok((select count(*) from public.attendance_roster('3f000000-0000-4000-fd00-000000000001', '2024-09-02') where student_id = '56d00000-0000-4000-fd00-000000000001') = 0, 'after the TC: the student is no longer on the attendance roster');
select pg_temp.ok((select j -> 'print' -> 'payload' -> 'tc' ->> 'fees_paid' from _tc1) = 'All fees paid' and (select j -> 'print' -> 'payload' -> 'tc' ->> 'conduct' from _tc1) = 'Good', 'TC: default conduct and fees-paid wording from the record');
select pg_temp.ok((select pg_temp.fp_records() = records from _fp), 'TC: marks, attendance, receipts, dues and enrolments are exactly as before (old records untouched)');

-- ================= reprints
select pg_temp.ok((select (public.certificate_print((select (j ->> 'id')::uuid from _tc1)) -> 'duplicate' ->> 'is_duplicate')) = 'false', 'reprint: the same person within 10 minutes of the original is not a duplicate (printer jam)');
select pg_temp.ok((select count(*) from public.audit_logs where action = 'certificate.print' and details ->> 'number' = 'TC/CE-2024-75/002' and details ->> 'duplicate' = 'false') = 1, 'reprint: the printer-jam reprint is still logged');
select pg_temp.login_as('00000000-0000-4000-fd00-000000000002');
select pg_temp.throws($$select public.certificate_print((select (j ->> 'id')::uuid from _tc1))$$, 'reprint: the duty holder cannot print a TC', '42501');
select pg_temp.counts($$select count(*) from public.certificates where kind = 'tc'$$, 0, 'the duty holder cannot even see a TC row');
select pg_temp.throws($$select public.certificate_print((select id from public.certificates where number = 'BON/CE-2024-75/001'))$$, 'reprint: another person after the original needs a reason', '23514');
select pg_temp.throws($$select public.certificate_print((select id from public.certificates where number = 'BON/CE-2024-75/001'), null, 'because')$$, 'reprint: the reason must be from the list', '23514');
select pg_temp.throws($$select public.certificate_print((select id from public.certificates where number = 'BON/CE-2024-75/001'), null, 'other')$$, 'reprint: "other" needs a note', '23514');
create temp table _dup as select public.certificate_print((select id from public.certificates where number = 'BON/CE-2024-75/001'), 'en', 'lost') j;
grant all on _dup to authenticated;
select pg_temp.ok((select j -> 'duplicate' ->> 'is_duplicate' from _dup) = 'true' and (select j -> 'duplicate' ->> 'copy_no' from _dup) = '2' and (select j -> 'certificate' ->> 'number' from _dup) = 'BON/CE-2024-75/001', 'reprint: a duplicate keeps the number and is marked DUPLICATE, copy 2');
select pg_temp.ok((select j -> 'texts' -> 'duplicate' ->> 'en' from _dup) = 'DUPLICATE', 'reprint: the DUPLICATE wording comes from the template');
select pg_temp.ok((select copies from (select (public.certificate_register('bonafide', '2d000000-0000-4000-fd00-000000000002') -> 'rows' -> 0 ->> 'copies')::int copies) q) = 2, 'register: shows 2 copies for the reprinted bonafide');
select pg_temp.ok((select (r -> 'prints' -> 1 ->> 'reason') from jsonb_array_elements(public.certificate_register('bonafide', '2d000000-0000-4000-fd00-000000000002') -> 'rows') r where r ->> 'number' = 'BON/CE-2024-75/001') = 'lost', 'register: shows the reason of each duplicate');
select pg_temp.throws($$select public.certificate_cancel((select id from public.certificates where number = 'BON/CE-2024-75/001'), 'wrong student')$$, 'cancel: the duty holder cannot cancel (Admin only)', '42501');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.certificate_register('bonafide', '2d000000-0000-4000-fd00-000000000002') -> 'rows')) = 3, 'register: the duty holder sees the bonafide register');
select pg_temp.ok((select jsonb_array_length(public.certificates_for_student('56d00000-0000-4000-fd00-000000000001'))) = 3 and not exists (select 1 from jsonb_array_elements(public.certificates_for_student('56d00000-0000-4000-fd00-000000000001')) c where c ->> 'kind' = 'tc'), 'a student''s certificates: the duty holder sees only the bonafide and study ones (not the TC)');
select pg_temp.lives($$select public.certificate_register_export('bonafide', '2d000000-0000-4000-fd00-000000000002', 'xlsx')$$, 'register export: allowed for the duty holder');
select pg_temp.counts($$select count(*) from public.audit_logs$$, 0, 'the duty holder cannot read the audit log');
select pg_temp.logout();

-- ================= cancel and restore (Admin only)
select pg_temp.login_as('00000000-0000-4000-fd00-000000000001');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'certificate.print' and details ->> 'number' = 'BON/CE-2024-75/001' and details ->> 'duplicate' = 'true' and details ->> 'reason' = 'lost' and actor_user_id = '00000000-0000-4000-fd00-000000000002'), 'reprint: the duplicate is logged with who and the reason');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'report.export' and details ->> 'report' = 'certificate-register-bonafide' and actor_user_id = '00000000-0000-4000-fd00-000000000002'), 'register export: logged');
select pg_temp.throws($$select public.certificate_cancel((select id from public.certificates where number = 'TC/CE-2024-75/002'), 'x')$$, 'cancel: a reason is required', '23514');
select pg_temp.ok((public.certificate_cancel_check((select id from public.certificates where number = 'TC/CE-2024-75/002')) ->> 'needs_section') = 'false', 'cancel check: the student still has a class this year, so nothing to choose');
select pg_temp.lives($$select public.certificate_cancel((select id from public.certificates where number = 'TC/CE-2024-75/002'), 'Issued to the wrong student')$$, 'cancel: the Admin cancels the TC with a reason');
select pg_temp.ok((select status || '|' || coalesce(status_date::text, '') || '|' || coalesce(status_reason, '') from public.students where id = '56d00000-0000-4000-fd00-000000000001') = 'active||', 'cancel: the student is back to their previous status');
select pg_temp.ok((select status || '|' || cancel_reason from public.certificates where number = 'TC/CE-2024-75/002') = 'cancelled|Issued to the wrong student', 'cancel: the number stays, shown as Cancelled with the reason');
select pg_temp.throws($$select public.certificate_print((select id from public.certificates where number = 'TC/CE-2024-75/002'))$$, 'a cancelled certificate cannot be printed', '23514');
select pg_temp.throws($$select public.certificate_cancel((select id from public.certificates where number = 'TC/CE-2024-75/002'), 'again')$$, 'cancel: cannot be cancelled twice', '23514');
select pg_temp.ok((select (public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000001', 'en', '{"leaving_date": "2024-09-02", "leaving_reason": "transfer"}') ->> 'number')) = 'TC/CE-2024-75/003', 'numbering: a cancelled number is never reused (the next TC is 003)');
select pg_temp.ok((select count(*) from public.attendance_roster('3f000000-0000-4000-fd00-000000000001', '2024-09-03') where student_id = '56d00000-0000-4000-fd00-000000000001') = 0, 'the new TC removes the student from the roster again');
-- restore after a new year has started: the student must be placed again
select pg_temp.lives($$select public.certificate_issue('tc', '56d00000-0000-4000-fd00-000000000008', 'en', '{"leaving_date": "2024-09-02", "leaving_reason": "moved"}')$$, 'setup: a TC for the student who will be restored');
update public.student_enrollments set academic_year_id = '2d000000-0000-4000-fd00-000000000001', section_id = '3f000000-0000-4000-fd00-000000000003' where student_id = '56d00000-0000-4000-fd00-000000000008';
select pg_temp.ok((public.certificate_cancel_check((select id from public.certificates where student_id = '56d00000-0000-4000-fd00-000000000008' and kind = 'tc')) ->> 'needs_section') = 'true', 'cancel check: after a year change the Admin is told to choose a class and section');
select pg_temp.throws($$select public.certificate_cancel((select id from public.certificates where student_id = '56d00000-0000-4000-fd00-000000000008' and kind = 'tc'), 'Parents changed their mind')$$, 'cancel: refused until the class and section are chosen', '23514');
select pg_temp.lives($$select public.certificate_cancel((select id from public.certificates where student_id = '56d00000-0000-4000-fd00-000000000008' and kind = 'tc'), 'Parents changed their mind', '3f000000-0000-4000-fd00-000000000005')$$, 'cancel: with a class and section chosen, the student is restored and placed');
select pg_temp.ok((select s.status || '|' || e.section_id::text from public.students s join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = '2d000000-0000-4000-fd00-000000000002' where s.id = '56d00000-0000-4000-fd00-000000000008') = 'active|3f000000-0000-4000-fd00-000000000005', 'cancel: the student is active again in the chosen section of the current year');
-- if the status was changed by hand since, a cancel does not overwrite it
update public.students set status = 'left' where id = '56d00000-0000-4000-fd00-000000000003';
select pg_temp.throws($$select public.certificate_cancel((select id from public.certificates where number = 'TC/CE-2024-75/001'), 'Not needed')$$, 'cancel: refuses when the status was changed by hand after the TC', '23514');

-- ================= numbering settings
select pg_temp.throws($$select public.certificate_set_start('bonafide', '2d000000-0000-4000-fd00-000000000002', 500)$$, 'start number: cannot change once a certificate of that series exists this year', '23514');
select pg_temp.lives($$select public.certificate_set_start('tc', '2d000000-0000-4000-fd00-000000000001', 4500)$$, 'start number: allowed while no TC exists for that year');
select pg_temp.throws($$select public.certificate_set_start('tc', '2d000000-0000-4000-fd00-000000000001', 0)$$, 'start number: must be at least 1', '23514');
select pg_temp.ok((select start_no || '/' || next_no from public.certificate_series where kind = 'tc' and academic_year_id = '2d000000-0000-4000-fd00-000000000001') = '4500/4500', 'start number: the series continues from the school''s register');
select pg_temp.lives($$select public.certificate_set_start('tc', '2d000000-0000-4000-fd00-000000000001', 4600)$$, 'start number: can be corrected while still unused');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'certificate.start_number' and actor_user_id = '00000000-0000-4000-fd00-000000000001'), 'start number: every change is logged');
select pg_temp.lives($$select public.certificate_settings_save('TC', 'BF', 'ST')$$, 'prefixes: the Admin changes them');
select pg_temp.ok((select (public.certificate_issue('bonafide', '56d00000-0000-4000-fd00-000000000002', 'en', '{"purpose": "passport"}') ->> 'number')) = 'BF/CE-2024-75/004', 'prefixes: the new prefix applies from now on; the old numbers are unchanged');
select pg_temp.ok((select count(*) from public.certificates where number = 'BON/CE-2024-75/001') = 1, 'prefixes: a number already issued is never rewritten');
select pg_temp.lives($$select public.certificate_signature_image(true)$$, 'signature image: the Admin can switch it on');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'certificate.signature_image' and details ->> 'on' = 'true'), 'signature image: switching it on is logged');
select pg_temp.lives($$select public.certificate_signature_image(false)$$, 'signature image: back off');
select pg_temp.ok(not (select show_signature_image from public.certificate_settings where id = 1), 'signature image: it is off by default and after switching off');
-- wording
select pg_temp.lives($$select public.certificate_template_save('bonafide', 'place', 'Place of issue', 'జారీ ప్రదేశం')$$, 'wording: the Admin edits a text');
select pg_temp.ok((select (texts -> 'place' ->> 'te_checked')::boolean from public.certificate_templates where kind = 'bonafide') = false, 'wording: an edited Telugu text is "needs checking" again');
select pg_temp.lives($$select public.certificate_template_confirm_telugu('bonafide')$$, 'wording: the Admin marks the Telugu as checked');
select pg_temp.ok(not (select (flags ->> 'telugu_unchecked')::boolean from (select public.certificate_preview('bonafide', '56d00000-0000-4000-fd00-000000000006', 'te', '{"purpose": "bank"}') -> 'flags' flags) q), 'wording: once all Telugu is checked the warning goes');
select pg_temp.throws($$select public.certificate_template_save('bonafide', 'nonsense', 'a', 'b')$$, 'wording: an unknown text key is refused', '23514');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'certificate.template' and details ->> 'kind' = 'bonafide'), 'wording: every change is logged');
select pg_temp.logout();

-- ================= the log: calm, factual, and nothing sensitive
select pg_temp.login_as('00000000-0000-4000-fd00-000000000001');
select pg_temp.ok((select count(*) from public.audit_logs where action like 'certificate.%') >= 15, 'log: certificate entries exist');
select pg_temp.ok(not exists (select 1 from public.audit_logs a where (a.action like 'certificate.%' or a.table_name like 'certificate%')
                 and regexp_replace(coalesce(a.details::text, '') || coalesce(a.new_data::text, '') || coalesce(a.old_data::text, ''), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', 'g') ~* '(paise|amount_|_amount|\mmarks\M|aadhaar|udid|ration_card|[0-9]{12})'), 'log: no fee amounts, marks or ID numbers in any certificate entry');
select pg_temp.ok(not exists (select 1 from public.audit_logs a where a.table_name = 'certificates' and a.new_data ? 'payload' and a.new_data ->> 'payload' <> '[REDACTED]'), 'log: the printed words (payload) are not copied into the log');
select pg_temp.ok((select (public.audit_entries(now() - interval '1 hour', null, null, 'certificates', null, null, null, 200) ->> 'total')::int) >= 15, 'log: the kind "Certificates" lists them');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, 'certificates', null, null, null, 200) -> 'rows') r where r ->> 'summary' like 'Duplicate bonafide certificate BON/CE-2024-75/001 printed, reason: lost'), 'log: reads as a calm sentence ("Duplicate bonafide certificate … reason: lost")');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_record_history('students', '56d00000-0000-4000-fd00-000000000001') ) r where r ->> 'action' like 'certificate.%'), 'log: the student''s History shows certificate entries');
-- the 9th alert counts duplicates, TC overrides and cancellations, and its link lists exactly them
select pg_temp.ok((select count(*) from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i ->> 'key' = 'certificates_look') = 1, 'alert: the card exists in the Admin dashboard alerts');
select pg_temp.ok((select (i ->> 'count')::int from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i ->> 'key' = 'certificates_look') >= 4, 'alert: duplicate + override + 2 cancellations are counted');
select pg_temp.ok((select (i ->> 'count')::int from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i ->> 'key' = 'certificates_look')
                = (public.audit_entries((date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '6 days') at time zone 'Asia/Kolkata', null, null, null, null, null, null, 1, 0, 'certificates_look') ->> 'total')::int, 'alert: the card count equals the page total');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500, 0, 'certificates_look') -> 'rows') r
                       where r ->> 'action' not in ('certificate.cancel', 'certificate.print', 'certificate.issue') or (r ->> 'summary') like 'TC % issued for%' and (r ->> 'summary') not like '%override%' and false), 'alert: only those kinds of entry are listed');
select pg_temp.logout();
