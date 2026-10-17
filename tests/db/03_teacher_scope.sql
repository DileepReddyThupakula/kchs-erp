-- Teacher scope rule (DECISIONS.md R18), checked directly in the database.
-- Runs as postgres inside a rolled-back transaction (see scripts/test-db.mjs).

update public.school_settings set mediums = '{English,Telugu}' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-c000-000000000001', 'admin@scope.test');
select pg_temp.fixture_user('00000000-0000-4000-c000-000000000002', 't1@scope.test');
select pg_temp.fixture_user('00000000-0000-4000-c000-000000000003', 't2@scope.test');
select pg_temp.fixture_user('00000000-0000-4000-c000-000000000004', 't3@scope.test');
select pg_temp.fixture_user('00000000-0000-4000-c000-000000000005', 't4@scope.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('12000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000001', 'admin',   'SCOPE-ADM', 'Scope Admin'),
  ('12000000-0000-4000-c000-000000000002', '00000000-0000-4000-c000-000000000002', 'teacher', 'SCOPE-T1',  'Scope T1'),
  ('12000000-0000-4000-c000-000000000003', '00000000-0000-4000-c000-000000000003', 'teacher', 'SCOPE-T2',  'Scope T2'),
  ('12000000-0000-4000-c000-000000000004', '00000000-0000-4000-c000-000000000004', 'teacher', 'SCOPE-T3',  'Scope T3 (no classes)'),
  ('12000000-0000-4000-c000-000000000005', '00000000-0000-4000-c000-000000000005', 'computer_staff', 'SCOPE-T4',  'Scope T4 (office, fee duty)');
insert into public.staff_permissions (staff_id, duty) values ('12000000-0000-4000-c000-000000000005', 'fee_collection');

insert into public.academic_years (id, name, start_date, end_date) values
  ('22000000-0000-4000-c000-000000000001', 'SCOPE-2050-51', '2050-04-01', '2051-03-31');
insert into public.classes (id, name, sort_order) values
  ('34000000-0000-4000-c000-000000000001', 'SCOPE C1', 991),
  ('34000000-0000-4000-c000-000000000002', 'SCOPE C2', 992);
-- S1 (C1-A, class teacher T1), S2 (C1-B), S3 (C2-A, class teacher T2)
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('35000000-0000-4000-c000-000000000001', '22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000001', 'A', '12000000-0000-4000-c000-000000000002'),
  ('35000000-0000-4000-c000-000000000002', '22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000001', 'B', null),
  ('35000000-0000-4000-c000-000000000003', '22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000002', 'A', '12000000-0000-4000-c000-000000000003');
insert into public.subjects (id, name) values
  ('42000000-0000-4000-c000-000000000001', 'SCOPE Maths'),
  ('42000000-0000-4000-c000-000000000002', 'SCOPE Science'),
  ('42000000-0000-4000-c000-000000000003', 'SCOPE English');
insert into public.class_subjects (academic_year_id, class_id, subject_id) values
  ('22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000001', '42000000-0000-4000-c000-000000000001'),
  ('22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000001', '42000000-0000-4000-c000-000000000002'),
  ('22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000001', '42000000-0000-4000-c000-000000000003'),
  ('22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000002', '42000000-0000-4000-c000-000000000001'),
  ('22000000-0000-4000-c000-000000000001', '34000000-0000-4000-c000-000000000002', '42000000-0000-4000-c000-000000000003');
-- T1: Maths in S1 and S2.  T2: Science in S1 (T1's section), English in S3.
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('12000000-0000-4000-c000-000000000002', '35000000-0000-4000-c000-000000000001', '42000000-0000-4000-c000-000000000001'),
  ('12000000-0000-4000-c000-000000000002', '35000000-0000-4000-c000-000000000002', '42000000-0000-4000-c000-000000000001'),
  ('12000000-0000-4000-c000-000000000003', '35000000-0000-4000-c000-000000000001', '42000000-0000-4000-c000-000000000002'),
  ('12000000-0000-4000-c000-000000000003', '35000000-0000-4000-c000-000000000003', '42000000-0000-4000-c000-000000000003');

-- =====================================================================
-- T1: class teacher of S1, subject teacher in S2
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-c000-000000000002');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 2, 'T1: sees own 2 sections (class teacher S1 + assigned S2)');
select pg_temp.counts($$select count(*) from public.sections where id = '35000000-0000-4000-c000-000000000003'$$, 0, 'T1: cannot read another section (S3), even by id');
select pg_temp.counts($$select count(*) from public.classes where name like 'SCOPE%'$$, 1, 'T1: sees only the class name of own sections');
select pg_temp.counts($$select count(*) from public.classes where id = '34000000-0000-4000-c000-000000000002'$$, 0, 'T1: cannot read another class (C2)');
select pg_temp.counts($$select count(*) from public.subjects where name like 'SCOPE%'$$, 1, 'T1: sees only the subject they teach (Maths)');
select pg_temp.counts($$select count(*) from public.subjects where id = '42000000-0000-4000-c000-000000000002'$$, 0, 'T1 (class teacher of S1): cannot read Science taught by a colleague in S1');
select pg_temp.counts($$select count(*) from public.class_subjects where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 1, 'T1: sees only class-subject link for the subject they teach');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id in ('35000000-0000-4000-c000-000000000001','35000000-0000-4000-c000-000000000002','35000000-0000-4000-c000-000000000003')$$, 2, 'T1: sees only own assignments');
select pg_temp.counts($$select count(*) from public.teacher_assignments where staff_id = '12000000-0000-4000-c000-000000000003'$$, 0, 'T1: cannot read another teacher''s assignment (even in own section)');
select pg_temp.counts($$select count(*) from public.staff_directory() where full_name like 'Scope%'$$, 1, 'T1: staff directory shows self only (is own class teacher)');
select pg_temp.counts('select count(*) from public.school_settings', 1, 'T1: still reads school settings');
select pg_temp.counts($$select count(*) from public.holidays where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 12, 'T1: still reads the holiday list');
select pg_temp.counts($$select count(*) from public.academic_years where id = '22000000-0000-4000-c000-000000000001'$$, 1, 'T1: still reads academic years');
-- joins can't leak hidden rows either
select pg_temp.counts($$select count(*) from public.teacher_assignments a join public.subjects s on s.id = a.subject_id where s.name = 'SCOPE Science'$$, 0, 'T1: a join cannot reveal a colleague''s subject');

-- =====================================================================
-- T2: class teacher of S3, subject teacher in S1
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-c000-000000000003');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 2, 'T2: sees own 2 sections (S1 assigned, S3 class teacher)');
select pg_temp.counts($$select count(*) from public.sections where id = '35000000-0000-4000-c000-000000000002'$$, 0, 'T2: cannot read S2');
select pg_temp.counts($$select count(*) from public.subjects where name like 'SCOPE%'$$, 2, 'T2: sees the 2 subjects they teach');
select pg_temp.counts($$select count(*) from public.subjects where id = '42000000-0000-4000-c000-000000000001'$$, 0, 'T2: cannot read Maths (not theirs)');
select pg_temp.counts($$select count(*) from public.staff_directory() where full_name like 'Scope%'$$, 2, 'T2: directory = self + class teacher of S1');

-- =====================================================================
-- T3: no classes, no duties -> nothing
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-c000-000000000004');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 0, 'T3 (no classes): no sections');
select pg_temp.counts($$select count(*) from public.classes where name like 'SCOPE%'$$, 0, 'T3: no classes');
select pg_temp.counts($$select count(*) from public.subjects where name like 'SCOPE%'$$, 0, 'T3: no subjects');
select pg_temp.counts($$select count(*) from public.class_subjects where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 0, 'T3: no class-subject links');
select pg_temp.counts($$select count(*) from public.teacher_assignments where staff_id <> '12000000-0000-4000-c000-000000000004'$$, 0, 'T3: no other teachers'' assignments');
select pg_temp.counts($$select count(*) from public.staff_directory() where full_name like 'Scope%'$$, 1, 'T3: directory = self only');

-- =====================================================================
-- T4: fee_collection duty -> may look up every section/class/subject
-- (for fees), but still not other teachers' assignments
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-c000-000000000005');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 3, 'T4 (fee_collection): duty overrides scope: all sections');
select pg_temp.counts($$select count(*) from public.classes where name like 'SCOPE%'$$, 2, 'T4 (fee_collection): all classes');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id in ('35000000-0000-4000-c000-000000000001','35000000-0000-4000-c000-000000000002','35000000-0000-4000-c000-000000000003')$$, 0, 'T4 (fee_collection): still no other teachers'' assignments');
select pg_temp.affects($$update public.sections set room = 'X' where id = '35000000-0000-4000-c000-000000000001'$$, 0, 'T4 (fee_collection): still cannot edit sections');

-- revoke the duty: scope applies again immediately
select pg_temp.login_as('00000000-0000-4000-c000-000000000001');
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '12000000-0000-4000-c000-000000000005'$$, 1, 'admin: revokes T4''s duty');
select pg_temp.login_as('00000000-0000-4000-c000-000000000005');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 0, 'T4 after revoke: back to own sections only (none)');

-- =====================================================================
-- Admin sees everything
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-c000-000000000001');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '22000000-0000-4000-c000-000000000001'$$, 3, 'admin: all sections');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id in ('35000000-0000-4000-c000-000000000001','35000000-0000-4000-c000-000000000002','35000000-0000-4000-c000-000000000003')$$, 4, 'admin: all assignments');
select pg_temp.counts($$select count(*) from public.subjects where name like 'SCOPE%'$$, 3, 'admin: all subjects');
