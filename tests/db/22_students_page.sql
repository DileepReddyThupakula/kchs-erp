-- Students list one page at a time (public.students_page): paging, search, filters, sorting, and the scope rule. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000001', 'admin@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000002', 'rec@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000003', 'ct@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000004', 'sub@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000005', 'none@sp.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1d000000-0000-4000-ff00-000000000001', '00000000-0000-4000-ff00-000000000001', 'admin',   'SP-ADM', 'Sp Admin'),
  ('1d000000-0000-4000-ff00-000000000002', '00000000-0000-4000-ff00-000000000002', 'teacher', 'SP-REC', 'Sp Records'),
  ('1d000000-0000-4000-ff00-000000000003', '00000000-0000-4000-ff00-000000000003', 'teacher', 'SP-CT',  'Sp Class teacher'),
  ('1d000000-0000-4000-ff00-000000000004', '00000000-0000-4000-ff00-000000000004', 'teacher', 'SP-SUB', 'Sp Subject teacher'),
  ('1d000000-0000-4000-ff00-000000000005', '00000000-0000-4000-ff00-000000000005', 'teacher', 'SP-NON', 'Sp Nobody');
insert into public.staff_permissions (staff_id, duty) values ('1d000000-0000-4000-ff00-000000000002', 'student_records');
insert into public.academic_years (id, name, start_date, end_date) values ('2d000000-0000-4000-ff00-000000000001', 'SP-2087', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3a100000-0000-4000-ff00-000000000001', 'SP C1', 941), ('3a100000-0000-4000-ff00-000000000002', 'SP C2', 942);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3b100000-0000-4000-ff00-000000000001', '2d000000-0000-4000-ff00-000000000001', '3a100000-0000-4000-ff00-000000000001', 'A', '1d000000-0000-4000-ff00-000000000003'),
  ('3b100000-0000-4000-ff00-000000000002', '2d000000-0000-4000-ff00-000000000001', '3a100000-0000-4000-ff00-000000000002', 'A', null);
insert into public.subjects (id, name, code) values ('5c100000-0000-4000-ff00-000000000001', 'SP Maths', 'SPM');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('1d000000-0000-4000-ff00-000000000004', '3b100000-0000-4000-ff00-000000000002', '5c100000-0000-4000-ff00-000000000001');
-- 6 students in C1-A, 4 in C2-A, 1 not enrolled, 1 left
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date, status) values
  ('56000000-0000-4000-ff00-000000000001', 'SP-01', 'Aarav Sp',   'male',   '2075-01-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000002', 'SP-02', 'Bhavya Sp',  'female', '2075-02-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000003', 'SP-03', 'Charan Sp',  'male',   '2075-03-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000004', 'SP-04', 'Deepika Sp', 'female', '2075-04-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000005', 'SP-05', 'Esha Sp',    'female', '2075-05-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000006', 'SP-06', 'Farhan Sp',  'male',   '2075-06-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000007', 'SP-07', 'Gita Sp',    'female', '2075-07-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000008', 'SP-08', 'Hari Sp',    'male',   '2075-08-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000009', 'SP-09', 'Isha Sp',    'female', '2075-09-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000010', 'SP-10', 'Jai Sp',     'male',   '2075-10-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000011', 'SP-11', 'Kiran 100%_x','male',  '2075-11-01', '2020-06-01', 'active'),
  ('56000000-0000-4000-ff00-000000000012', 'SP-12', 'Lalitha Sp', 'female', '2075-12-01', '2020-06-01', 'left');
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no)
select ('56000000-0000-4000-ff00-0000000000' || lpad(n::text, 2, '0'))::uuid, '2d000000-0000-4000-ff00-000000000001',
       case when n <= 6 then '3b100000-0000-4000-ff00-000000000001'::uuid else '3b100000-0000-4000-ff00-000000000002'::uuid end,
       case when n <= 6 then n else n - 6 end
  from generate_series(1, 10) n;
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values ('56000000-0000-4000-ff00-000000000012', '2d000000-0000-4000-ff00-000000000001', '3b100000-0000-4000-ff00-000000000002', 5);
-- Aarav has a guardian with a phone; Bhavya has documents + gov data
insert into public.guardians (id, full_name, phone) values ('57000000-0000-4000-ff00-000000000001', 'Ramesh Sp', '9876500001');
insert into public.student_guardians (student_id, guardian_id, relation, is_primary) values ('56000000-0000-4000-ff00-000000000001', '57000000-0000-4000-ff00-000000000001', 'father', true);
insert into public.student_documents (student_id, doc_type, file_path, file_name, mime_type, size_bytes)
select '56000000-0000-4000-ff00-000000000002', t.code, 'x/' || t.code, t.code || '.pdf', 'application/pdf', 10 from public.student_document_types t where t.required and t.is_active;
insert into public.student_profiles (student_id, details) values ('56000000-0000-4000-ff00-000000000002', '{"nationality": "Indian"}');

create function pg_temp.pg(p_args text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute 'select public.students_page(''2d000000-0000-4000-ff00-000000000001'', ' || p_args || ')' into r;
  return r;
end $$;
create function pg_temp.names(p jsonb) returns text language sql as $$ select coalesce(string_agg(x ->> 'full_name', ',' order by o), '') from jsonb_array_elements(p -> 'rows') with ordinality t(x, o) $$;

-- ================= Admin
select pg_temp.login_as('00000000-0000-4000-ff00-000000000001');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp''') ->> 'total')::int$$, 12, 'search "Sp": all 12 of the fixture students');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_limit => 5') ->> 'total')::int$$, 12, 'a page of 5 still reports the total of 12');
select pg_temp.counts($$select jsonb_array_length(pg_temp.pg('p_q => ''Sp'', p_limit => 5') -> 'rows')$$, 5, '... with 5 rows');
select pg_temp.counts($$select case when pg_temp.names(pg_temp.pg('p_q => ''Sp'', p_limit => 5')) = 'Aarav Sp,Bhavya Sp,Charan Sp,Deepika Sp,Esha Sp' then 1 else 0 end$$, 1, 'page 1 is the first five by name');
select pg_temp.counts($$select case when pg_temp.names(pg_temp.pg('p_q => ''Sp'', p_limit => 5, p_offset => 5')) = 'Farhan Sp,Gita Sp,Hari Sp,Isha Sp,Jai Sp' then 1 else 0 end$$, 1, 'page 2 is the next five (no overlap)');
select pg_temp.counts($$select jsonb_array_length(pg_temp.pg('p_q => ''Sp'', p_limit => 5, p_offset => 10') -> 'rows')$$, 2, 'page 3 has the last two');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_limit => 5, p_offset => 100') ->> 'total')::int$$, 12, 'past the end: no rows, total still 12');
select pg_temp.counts($$select case when pg_temp.names(pg_temp.pg('p_q => ''Sp'', p_sort => ''name'', p_dir => ''desc'', p_limit => 2')) = 'Lalitha Sp,Kiran 100%_x' then 1 else 0 end$$, 1, 'sort by name, descending');
select pg_temp.counts($$select case when pg_temp.names(pg_temp.pg('p_q => ''Sp'', p_sort => ''adm'', p_dir => ''desc'', p_limit => 1')) = 'Lalitha Sp' then 1 else 0 end$$, 1, 'sort by admission number, descending');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''SP-0''') ->> 'total')::int$$, 9, 'search by admission number prefix (SP-01..SP-09)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''9876500001''') ->> 'total')::int$$, 1, 'search by a guardian''s phone finds the student');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''ramesh sp''') ->> 'total')::int$$, 1, 'search by a guardian''s name (any case)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''100%_x''') ->> 'total')::int$$, 1, 'a % or _ in the search is taken literally');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''%''') ->> 'total')::int$$, 1, 'a lone % matches only names that contain a percent sign');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_class => ''3a100000-0000-4000-ff00-000000000001''') ->> 'total')::int$$, 6, 'filter: class C1');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_section => ''3b100000-0000-4000-ff00-000000000002''') ->> 'total')::int$$, 5, 'filter: section C2-A (4 active + 1 left)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_status => ''active''') ->> 'total')::int$$, 11, 'filter: status active');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_status => ''left''') ->> 'total')::int$$, 1, 'filter: status left');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_enrol => ''none''') ->> 'total')::int$$, 1, 'filter: not enrolled this year (Kiran has no enrolment... and Lalitha is enrolled)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_docs => ''missing''') ->> 'total')::int$$, 11, 'filter: documents missing (everyone but Bhavya)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_docs => ''complete''') ->> 'total')::int$$, 1, 'filter: documents complete (Bhavya)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_gov => ''missing''') ->> 'total')::int$$, 12, 'filter: government fields missing (every fixture student lacks some)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_gov => ''complete''') ->> 'total')::int$$, 0, 'filter: government fields complete (none)');
select pg_temp.counts($$select (x ->> 'missingDocsCount')::int from jsonb_array_elements(pg_temp.pg('p_q => ''Aarav''') -> 'rows') x$$, (select count(*) from public.student_document_types where required and is_active), 'a list row counts the missing documents');
select pg_temp.counts($$select jsonb_array_length(x -> 'missingDocs') from jsonb_array_elements(pg_temp.pg('p_q => ''Aarav'', p_full => true') -> 'rows') x$$, (select count(*) from public.student_document_types where required and is_active), 'an export row lists their names');
select pg_temp.counts($$select count(*) from jsonb_array_elements(pg_temp.pg('p_q => ''Aarav'', p_full => true') -> 'rows') x where x ? 'details' and x ? 'masked'$$, 1, 'Admin export rows (p_full) carry government fields and masked IDs');
select pg_temp.counts($$select count(*) from jsonb_array_elements(pg_temp.pg('p_q => ''Aarav''') -> 'rows') x where x ? 'details' or x ? 'masked'$$, 0, 'but the ordinary list page leaves them out (lighter page)');
select pg_temp.counts($$select jsonb_array_length(pg_temp.pg('p_ids => array[''56000000-0000-4000-ff00-000000000003''::uuid, ''56000000-0000-4000-ff00-000000000004''::uuid]') -> 'rows')$$, 2, 'p_ids: the page for chosen students');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_mine => true') ->> 'total')::int$$, 0, 'mine mode for a person with no sections: nothing');
-- the same filters combined
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_class => ''3a100000-0000-4000-ff00-000000000001'', p_docs => ''missing'', p_status => ''active''') ->> 'total')::int$$, 5, 'class C1 + documents missing + active = 5');

-- ================= student_records duty: same extras
select pg_temp.login_as('00000000-0000-4000-ff00-000000000002');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp''') ->> 'total')::int$$, 12, 'student_records duty: sees all');
select pg_temp.counts($$select count(*) from jsonb_array_elements(pg_temp.pg('p_q => ''Aarav'', p_full => true') -> 'rows') x where x ? 'details'$$, 1, 'and gets the government fields when exporting');

-- ================= class teacher: only their section, never the extras
select pg_temp.login_as('00000000-0000-4000-ff00-000000000003');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp''') ->> 'total')::int$$, 6, 'class teacher: only the 6 students of their section');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Kiran''') ->> 'total')::int$$, 0, 'cannot find another section''s student by name');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_section => ''3b100000-0000-4000-ff00-000000000002''') ->> 'total')::int$$, 0, 'nor by asking for the other section');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_enrol => ''none''') ->> 'total')::int$$, 0, 'nor the not-enrolled list');
select pg_temp.counts($$select count(*) from jsonb_array_elements(pg_temp.pg('p_q => ''Aarav'', p_full => true') -> 'rows') x where x ? 'details' or x ? 'masked' or x ? 'missingDocs' or x ? 'missingGov' or x ? 'missingDocsCount' or x ? 'missingGovCount'$$, 0, 'no government fields, masked IDs or document gaps for a teacher (even asking for the full rows)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_docs => ''missing''') ->> 'total')::int$$, 6, 'the documents filter is ignored for a teacher (no hidden-data probing)');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_mine => true') ->> 'total')::int$$, 6, 'mine mode: the same 6');
-- ================= subject teacher
select pg_temp.login_as('00000000-0000-4000-ff00-000000000004');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp'', p_status => ''active''') ->> 'total')::int$$, 4, 'subject teacher: the 4 active students of the section they teach');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Aarav''') ->> 'total')::int$$, 0, 'not the other section''s students');
-- ================= nobody
select pg_temp.login_as('00000000-0000-4000-ff00-000000000005');
select pg_temp.counts($$select (pg_temp.pg('p_q => ''Sp''') ->> 'total')::int$$, 0, 'an unrelated teacher sees nothing');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.students_page('2d000000-0000-4000-ff00-000000000001')$$, 'anonymous cannot call it');
