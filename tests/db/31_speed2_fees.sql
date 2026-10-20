-- Speed pass 2 (fees pages): the one-call functions give exactly what the separate queries gave, and only to those who may see fee data. Rolled back.
update public.academic_years set is_current = false where is_current;
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000001', 'admin@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000002', 'teacher@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000003', 'office-fee@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000004', 'office-nofee@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-ff00-000000000005', 'old@sp.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name, email, status) values
  ('1b200000-0000-4000-ff00-000000000001', '00000000-0000-4000-ff00-000000000001', 'admin',          'SP-ADM', 'Sp Admin', 'admin@sp.test', 'active'),
  ('1b200000-0000-4000-ff00-000000000002', '00000000-0000-4000-ff00-000000000002', 'teacher',        'SP-TCH', 'Sp Teacher', 'teacher@sp.test', 'active'),
  ('1b200000-0000-4000-ff00-000000000003', '00000000-0000-4000-ff00-000000000003', 'computer_staff', 'SP-FEE', 'Sp Office with fee access', 'office-fee@sp.test', 'active'),
  ('1b200000-0000-4000-ff00-000000000004', '00000000-0000-4000-ff00-000000000004', 'computer_staff', 'SP-NOF', 'Sp Office without fee access', 'office-nofee@sp.test', 'active'),
  ('1b200000-0000-4000-ff00-000000000005', '00000000-0000-4000-ff00-000000000005', 'teacher', 'SP-OLD', 'Sp Deactivated', 'old@sp.test', 'inactive');
insert into public.staff_permissions (staff_id, duty) values ('1b200000-0000-4000-ff00-000000000003', 'fee_collection'), ('1b200000-0000-4000-ff00-000000000004', 'student_records');
insert into public.staff_permissions (staff_id, duty) select '1b200000-0000-4000-ff00-000000000002', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';

insert into public.academic_years (id, name, start_date, end_date, status, is_current) values ('2b300000-0000-4000-ff00-000000000001', 'SP-2024-25', '2024-04-01', '2025-03-31', 'active', true);
insert into public.classes (id, name, sort_order) values ('3a600000-0000-4000-ff00-000000000001', 'SP A', 960), ('3a600000-0000-4000-ff00-000000000002', 'SP B', 961);
insert into public.sections (id, academic_year_id, class_id, name) values
  ('3b600000-0000-4000-ff00-000000000001', '2b300000-0000-4000-ff00-000000000001', '3a600000-0000-4000-ff00-000000000001', 'A'),
  ('3b600000-0000-4000-ff00-000000000002', '2b300000-0000-4000-ff00-000000000001', '3a600000-0000-4000-ff00-000000000002', 'A');
insert into public.fee_heads (id, name, code, sort_order) values ('62400000-0000-4000-ff00-000000000001', 'SP Tuition', 'SP-TUI', 90), ('62400000-0000-4000-ff00-000000000002', 'SP Trip', 'SP-TRP', 91);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63400000-0000-4000-ff00-000000000001', '2b300000-0000-4000-ff00-000000000001', 'SP Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values
  ('2b300000-0000-4000-ff00-000000000001', '3a600000-0000-4000-ff00-000000000001', '62400000-0000-4000-ff00-000000000001', 1200000, '63400000-0000-4000-ff00-000000000001'),
  ('2b300000-0000-4000-ff00-000000000001', '3a600000-0000-4000-ff00-000000000002', '62400000-0000-4000-ff00-000000000001', 2400000, '63400000-0000-4000-ff00-000000000001');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('56300000-0000-4000-ff00-000000000001', 'SP-1', 'Sp Ana', 'female', '2016-01-01', '2022-06-01'),
  ('56300000-0000-4000-ff00-000000000002', 'SP-2', 'Sp Bala', 'male', '2016-01-01', '2022-06-01'),
  ('56300000-0000-4000-ff00-000000000003', 'SP-3', 'Sp Chitra', 'female', '2016-01-01', '2022-06-01');
insert into public.guardians (id, full_name, phone) values ('57300000-0000-4000-ff00-000000000001', 'Sp Parent', '9000000011');
insert into public.student_guardians (student_id, guardian_id, relation, is_primary) values ('56300000-0000-4000-ff00-000000000001', '57300000-0000-4000-ff00-000000000001', 'father', true);
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values
  ('56300000-0000-4000-ff00-000000000001', '2b300000-0000-4000-ff00-000000000001', '3b600000-0000-4000-ff00-000000000001', 1),
  ('56300000-0000-4000-ff00-000000000002', '2b300000-0000-4000-ff00-000000000001', '3b600000-0000-4000-ff00-000000000002', 1);
-- Ana pays part; Bala pays some; Chitra is not enrolled and has no dues
select pg_temp.login_as('00000000-0000-4000-ff00-000000000003');
select pg_temp.lives($$select public.collect_fee('56300000-0000-4000-ff00-000000000001', 150000, 'cash')$$, 'setup: Ana pays part');
select pg_temp.lives($$select public.collect_fee('56300000-0000-4000-ff00-000000000002', 300000, 'upi', 'REF1')$$, 'setup: Bala pays part');
select pg_temp.logout();

-- ================= the dues page equals the plain queries
select pg_temp.login_as('00000000-0000-4000-ff00-000000000001');
create temp table _d as select public.fees_dues_page('2b300000-0000-4000-ff00-000000000001', '2024-08-15') j;
grant all on _d to authenticated;
select pg_temp.ok((select jsonb_array_length(j -> 'students') from _d) = 2, 'dues: the two students who owe are listed');
select pg_temp.ok((select (x ->> 'outstanding')::bigint from _d, jsonb_array_elements(j -> 'students') x where x ->> 'adm' = 'SP-1')
  = (select sum(amount_paise - concession_paise - paid_paise) from public.student_fee_dues where student_id = '56300000-0000-4000-ff00-000000000001' and voided_at is null), 'dues: Ana''s outstanding equals amount - concession - paid (paise, exact)');
select pg_temp.ok((select (x ->> 'outstanding')::bigint from _d, jsonb_array_elements(j -> 'students') x where x ->> 'adm' = 'SP-2')
  = 2400000 - 300000, 'dues: Bala''s outstanding is the class fee minus the payment, in paise');
select pg_temp.ok((select (x ->> 'overdue')::bigint from _d, jsonb_array_elements(j -> 'students') x where x ->> 'adm' = 'SP-1')
  = (select coalesce(sum(amount_paise - concession_paise - paid_paise), 0) from public.student_fee_dues where student_id = '56300000-0000-4000-ff00-000000000001' and voided_at is null and due_date < '2024-08-15' and amount_paise - concession_paise - paid_paise > 0), 'dues: "overdue" counts only lines due before today');
select pg_temp.ok((select jsonb_array_length(x -> 'dues') from _d, jsonb_array_elements(j -> 'students') x where x ->> 'adm' = 'SP-1')
  = (select count(*) from public.student_fee_dues where student_id = '56300000-0000-4000-ff00-000000000001' and voided_at is null and amount_paise - concession_paise - paid_paise > 0), 'dues: only lines with something left are listed');
select pg_temp.ok((select x ->> 'phone' from _d, jsonb_array_elements(j -> 'students') x where x ->> 'adm' = 'SP-1') = '9000000011' and (select x ->> 'phone' from _d, jsonb_array_elements(j -> 'students') x where x ->> 'adm' = 'SP-2') is null, 'dues: the parent phone, or none');
select pg_temp.ok((select x ->> 'classLabel' from _d, jsonb_array_elements(j -> 'students') x where x ->> 'adm' = 'SP-1') = 'SP A – A', 'dues: the class label');
select pg_temp.ok((select string_agg(x ->> 'name', ',' order by ord) from _d, jsonb_array_elements(j -> 'heads') with ordinality t(x, ord) where x ->> 'name' like 'SP %') = 'SP Tuition' and (select jsonb_array_length(j -> 'classes') from _d) >= 2, 'dues: heads that have dues, and the classes');
select pg_temp.logout();

-- ================= receipts
select pg_temp.login_as('00000000-0000-4000-ff00-000000000001');
create temp table _r as select public.fees_receipts_page('2b300000-0000-4000-ff00-000000000001', date '2000-01-01', date '2100-01-01') j;
grant all on _r to authenticated;
select pg_temp.ok((select jsonb_array_length(j -> 'rows') from _r) = (select count(*) from public.fee_receipts where receipt_date between date '2000-01-01' and date '2100-01-01'), 'receipts: every receipt of the range, cancelled ones included');
select pg_temp.ok((select (x ->> 'total')::bigint from _r, jsonb_array_elements(j -> 'rows') x where x ->> 'studentName' = 'Sp Ana') = 150000, 'receipts: the total in paise');
select pg_temp.ok((select x ->> 'collectedBy' from _r, jsonb_array_elements(j -> 'rows') x where x ->> 'studentName' = 'Sp Ana') = 'Sp Office with fee access', 'receipts: who collected it');
select pg_temp.ok((select x ->> 'className' from _r, jsonb_array_elements(j -> 'rows') x where x ->> 'studentName' = 'Sp Ana') = 'SP A', 'receipts: the student''s class');
select pg_temp.ok((select (h ->> 'amount')::bigint from _r, jsonb_array_elements(j -> 'rows') x, jsonb_array_elements(x -> 'heads') h where x ->> 'studentName' = 'Sp Ana') = 150000, 'receipts: the fee head amount equals the receipt');
select pg_temp.ok((select (sum((x ->> 'total')::bigint)) from _r, jsonb_array_elements(j -> 'rows') x where x ->> 'status' = 'valid') = (select sum(total_paise) from public.fee_receipts where receipt_date between date '2000-01-01' and date '2100-01-01' and status = 'valid'), 'receipts: the money adds up exactly');
select pg_temp.ok((select (x ->> 'date')::date from _r, jsonb_array_elements(j -> 'rows') x limit 1) is not null and (select count(*) from _r, jsonb_array_elements(j -> 'rows') x where x ->> 'receiptNo' is null) = 0, 'receipts: numbers and dates are there (gap-free numbers are untouched)');
select pg_temp.ok((select jsonb_array_length(public.fees_receipts_page('2b300000-0000-4000-ff00-000000000001', '2000-01-01', '2000-01-02') -> 'rows')) = 0, 'receipts: an empty range is empty');
select pg_temp.logout();

-- ================= fee setup
select pg_temp.login_as('00000000-0000-4000-ff00-000000000001');
select pg_temp.ok((select jsonb_array_length(public.fees_setup_page('2b300000-0000-4000-ff00-000000000001') -> 'structure')) = 2 and (select jsonb_array_length(public.fees_setup_page('2b300000-0000-4000-ff00-000000000001') -> 'plans')) = 1, 'setup: the amounts and the plans of the year');
select pg_temp.ok((select jsonb_array_length(public.fees_setup_page('2b300000-0000-4000-ff00-000000000001') -> 'installments')) = (select count(*) from public.fee_plan_installments where plan_id = '63400000-0000-4000-ff00-000000000001'), 'setup: the instalments of those plans');
select pg_temp.ok((select (x ->> 'amount_paise')::bigint from jsonb_array_elements(public.fees_setup_page('2b300000-0000-4000-ff00-000000000001') -> 'structure') x where x ->> 'class_id' = '3a600000-0000-4000-ff00-000000000002') = 2400000, 'setup: amounts stay in paise');
select pg_temp.logout();

-- ================= fee access only: the same answer for fee staff; nothing for anyone else
select pg_temp.login_as('00000000-0000-4000-ff00-000000000003');
select pg_temp.ok((select jsonb_array_length(public.fees_dues_page('2b300000-0000-4000-ff00-000000000001', '2024-08-15') -> 'students')) = 2, 'office with fee access: sees the dues');
select pg_temp.ok((select jsonb_array_length(public.fees_receipts_page('2b300000-0000-4000-ff00-000000000001', date '2000-01-01', date '2100-01-01') -> 'rows')) >= 2, 'office with fee access: sees the receipts');
select pg_temp.ok((select jsonb_array_length(public.fees_setup_page('2b300000-0000-4000-ff00-000000000001') -> 'structure')) = 2, 'office with fee access: sees the fee setup data');
create function pg_temp.nothing() returns boolean language sql as $$
  select jsonb_array_length(public.fees_dues_page('2b300000-0000-4000-ff00-000000000001', '2024-08-15') -> 'students') = 0
     and jsonb_array_length(public.fees_receipts_page('2b300000-0000-4000-ff00-000000000001', '2000-01-01', current_date + 1) -> 'rows') = 0
     and jsonb_array_length(public.fees_setup_page('2b300000-0000-4000-ff00-000000000001') -> 'structure') = 0
     and jsonb_array_length(public.fees_setup_page('2b300000-0000-4000-ff00-000000000001') -> 'plans') = 0
$$;
grant execute on function pg_temp.nothing() to authenticated, anon;
select pg_temp.login_as('00000000-0000-4000-ff00-000000000002');
select pg_temp.ok(pg_temp.nothing(), 'teacher (every duty but fees): gets no dues, no receipts, no fee setup');
select pg_temp.login_as('00000000-0000-4000-ff00-000000000004');
select pg_temp.ok(pg_temp.nothing(), 'office without fee access: gets no dues, no receipts, no fee setup');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.fees_dues_page('2b300000-0000-4000-ff00-000000000001', '2024-08-15')$$, 'not signed in: refused', '42501');
select pg_temp.throws($$select public.fees_receipts_page('2b300000-0000-4000-ff00-000000000001', '2000-01-01', '2100-01-01')$$, 'not signed in: refused (receipts)', '42501');
select pg_temp.throws($$select public.fees_setup_page('2b300000-0000-4000-ff00-000000000001')$$, 'not signed in: refused (setup)', '42501');
select pg_temp.logout();

-- ================= session_context: who am I + my duties + the academic years, in one call (the same answers as the three queries it replaces)
create function pg_temp.ctx(p_user uuid) returns jsonb language plpgsql as $$ begin perform pg_temp.login_as(p_user); return public.session_context(); end $$;
grant execute on function pg_temp.ctx(uuid) to authenticated, anon;
select pg_temp.ok((pg_temp.ctx('00000000-0000-4000-ff00-000000000001') -> 'staff' ->> 'app_role') = 'admin' and (pg_temp.ctx('00000000-0000-4000-ff00-000000000001') -> 'staff' ->> 'full_name') = 'Sp Admin', 'session: the Admin sees their own staff row');
select pg_temp.ok((select count(*) from jsonb_array_elements(pg_temp.ctx('00000000-0000-4000-ff00-000000000001') -> 'duties')) = (select count(*) from unnest(enum_range(null::public.staff_duty))), 'session: the Admin holds every duty');
select pg_temp.ok((pg_temp.ctx('00000000-0000-4000-ff00-000000000003') -> 'duties') = '["fee_collection"]'::jsonb, 'session: office staff hold exactly the duties they were given');
select pg_temp.ok(not ((pg_temp.ctx('00000000-0000-4000-ff00-000000000002') -> 'duties') ? 'fee_collection') and ((pg_temp.ctx('00000000-0000-4000-ff00-000000000002') -> 'duties') ? 'student_records'), 'session: a teacher never has the fee duty, whatever else they hold');
select pg_temp.ok((pg_temp.ctx('00000000-0000-4000-ff00-000000000001') -> 'staff' ->> 'id') = '1b200000-0000-4000-ff00-000000000001', 'session: only their own row, never another person''s');
select pg_temp.ok(jsonb_array_length(pg_temp.ctx('00000000-0000-4000-ff00-000000000002') -> 'years') = (select count(*) from public.academic_years) and (select count(*) from jsonb_array_elements(pg_temp.ctx('00000000-0000-4000-ff00-000000000002') -> 'years') y where y ->> 'name' = 'SP-2024-25') = 1, 'session: the academic years come with it (newest first)');
select pg_temp.ok((pg_temp.ctx('00000000-0000-4000-ff00-000000000005') -> 'staff') = 'null'::jsonb or (pg_temp.ctx('00000000-0000-4000-ff00-000000000005') -> 'staff') is null, 'session: a deactivated person gets no staff row (so every page sends them to the login page)');
select pg_temp.ok(jsonb_array_length(pg_temp.ctx('00000000-0000-4000-ff00-000000000005') -> 'duties') = 0, 'session: a deactivated person holds no duty');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.session_context()$$, 'session: not signed in is refused', '42501');
select pg_temp.logout();
