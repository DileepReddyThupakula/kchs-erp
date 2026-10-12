-- Fees: permissions, exact money math, allocation, receipts, cancellation,
-- safe regeneration. Rolled back (see scripts/test-db.mjs).
update public.school_settings set mediums = '{English,Telugu}', receipt_no_prefix = 'RCPT-' where id = 1;

select pg_temp.fixture_user('00000000-0000-4000-f000-000000000001', 'admin@fee.test');
select pg_temp.fixture_user('00000000-0000-4000-f000-000000000002', 'feeduty@fee.test');
select pg_temp.fixture_user('00000000-0000-4000-f000-000000000003', 'teacher@fee.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('15000000-0000-4000-f000-000000000001', '00000000-0000-4000-f000-000000000001', 'admin',   'FEE-ADM', 'Fee Admin'),
  ('15000000-0000-4000-f000-000000000002', '00000000-0000-4000-f000-000000000002', 'teacher', 'FEE-DUT', 'Fee Duty Teacher'),
  ('15000000-0000-4000-f000-000000000003', '00000000-0000-4000-f000-000000000003', 'teacher', 'FEE-TCH', 'Fee Plain Teacher');
insert into public.staff_permissions (staff_id, duty) values ('15000000-0000-4000-f000-000000000002', 'fee_collection');

-- year, class (plain teacher is its class teacher: scope must NOT open fees)
insert into public.academic_years (id, name, start_date, end_date) values ('25000000-0000-4000-f000-000000000001', 'FEE-2080-81', '2080-04-01', '2081-03-31');
insert into public.classes (id, name, sort_order) values ('3a000000-0000-4000-f000-000000000001', 'FEE Class', 961);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3b000000-0000-4000-f000-000000000001', '25000000-0000-4000-f000-000000000001', '3a000000-0000-4000-f000-000000000001', 'A', '15000000-0000-4000-f000-000000000003');
insert into public.fee_heads (id, name, code, sort_order) values ('60000000-0000-4000-f000-000000000001', 'FEE Tuition', 'FEE-TUI', 91);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values
  ('61000000-0000-4000-f000-000000000001', '25000000-0000-4000-f000-000000000001', 'FEE Monthly', 'monthly', 10),
  ('61000000-0000-4000-f000-000000000002', '25000000-0000-4000-f000-000000000001', 'FEE One-time', 'one_time', 10),
  ('61000000-0000-4000-f000-000000000003', '25000000-0000-4000-f000-000000000001', 'FEE Terms', 'custom', 10);
insert into public.fee_plan_installments (plan_id, seq, label, due_date, share_bp) values
  ('61000000-0000-4000-f000-000000000003', 1, 'Term 1', '2080-04-10', 4000),
  ('61000000-0000-4000-f000-000000000003', 2, 'Term 2', '2080-09-10', 3000),
  ('61000000-0000-4000-f000-000000000003', 3, 'Term 3', '2081-01-10', 3000);
-- ₹10,000.01 a year: does not divide evenly by 12 or by 40/30/30
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values
  ('25000000-0000-4000-f000-000000000001', '3a000000-0000-4000-f000-000000000001', '60000000-0000-4000-f000-000000000001', 1000001, '61000000-0000-4000-f000-000000000001');

-- students: S1 joined before the year, S2 joins mid-year (15 Sep), S3 one-time override, S4 custom override
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('54000000-0000-4000-f000-000000000001', 'FEE-0001', 'Fee One',   'male',   '2070-01-01', '2079-06-01'),
  ('54000000-0000-4000-f000-000000000002', 'FEE-0002', 'Fee Two',   'female', '2070-01-01', '2080-09-15'),
  ('54000000-0000-4000-f000-000000000003', 'FEE-0003', 'Fee Three', 'male',   '2070-01-01', '2079-06-01'),
  ('54000000-0000-4000-f000-000000000004', 'FEE-0004', 'Fee Four',  'female', '2070-01-01', '2079-06-01');
insert into public.student_fee_plans (student_id, academic_year_id, fee_head_id, plan_id, reason) values
  ('54000000-0000-4000-f000-000000000003', '25000000-0000-4000-f000-000000000001', '60000000-0000-4000-f000-000000000001', '61000000-0000-4000-f000-000000000002', 'Parent pays once'),
  ('54000000-0000-4000-f000-000000000004', '25000000-0000-4000-f000-000000000001', '60000000-0000-4000-f000-000000000001', '61000000-0000-4000-f000-000000000003', 'Parent pays per term');
insert into public.student_enrollments (student_id, academic_year_id, section_id) select id, '25000000-0000-4000-f000-000000000001', '3b000000-0000-4000-f000-000000000001' from public.students where admission_no like 'FEE-%';

-- =====================================================================
-- Generation + exact money math (as owner)
-- =====================================================================
select pg_temp.counts($$select count(*) from public.fee_plan_installments where plan_id = '61000000-0000-4000-f000-000000000001'$$, 12, 'monthly plan gets 12 installments Apr–Mar automatically');
select pg_temp.counts($$select count(*) from public.fee_plan_installments where plan_id = '61000000-0000-4000-f000-000000000001' and extract(day from due_date) = 10$$, 12, 'monthly due day = 10th');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 12, 'enrolment generated 12 monthly dues');
select pg_temp.counts($$select sum(amount_paise) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 1000001, 'monthly split adds up exactly to the paisa');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq < 12 and amount_paise = 83333$$, 11, 'months 1–11 = 83,333 paise each');
select pg_temp.counts($$select amount_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 12$$, 83338, 'remainder goes to the last installment (83,338)');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000002' and voided_at is null$$, 7, 'mid-year joiner (Sep): monthly dues only from Sep to Mar');
select pg_temp.ok((select min(due_date) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000002' and voided_at is null) = '2080-09-10', 'mid-year joiner''s first due is 10 Sep (joining month)');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000003' and voided_at is null and amount_paise = 1000001$$, 1, 'override plan one-time: a single due for the full amount');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000003' and plan_id = '61000000-0000-4000-f000-000000000001'$$, 0, 'override student has no monthly dues');
select pg_temp.ok((select string_agg(amount_paise::text, ',' order by installment_seq) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000004' and voided_at is null) = '400000,300000,300001', 'custom 40/30/30 plan: 4,00,000 + 3,00,000 + 3,00,001 (exact)');
select pg_temp.ok(app.split_equal(100, 3) = '{33,33,34}' and app.split_equal(0, 12) = array_fill(0::bigint, array[12]), 'split_equal: remainder last, zero safe');
select pg_temp.throws($$select app.split_shares(1000, '{5000,4000}')$$, 'custom percentages must add up to 100%', '23514');

-- =====================================================================
-- ADMIN: concessions (percent + fixed)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f000-000000000001');
select pg_temp.lives($$insert into public.fee_concessions (student_id, academic_year_id, fee_head_id, kind, percent_bp, reason) values ('54000000-0000-4000-f000-000000000001', '25000000-0000-4000-f000-000000000001', '60000000-0000-4000-f000-000000000001', 'percent', 1000, 'Sibling concession')$$, 'admin: adds a 10% concession');
select pg_temp.counts($$select sum(concession_paise) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 99996, '10% applied per installment, rounded down (11×8,333 + 8,333)');
select pg_temp.lives($$insert into public.fee_concessions (student_id, academic_year_id, kind, amount_paise, reason) values ('54000000-0000-4000-f000-000000000003', '25000000-0000-4000-f000-000000000001', 'fixed', 50000, 'Joined late, reduced at enrolment')$$, 'admin: adds a fixed ₹500 concession');
select pg_temp.counts($$select concession_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000003' and voided_at is null$$, 50000, 'fixed concession applied');
select pg_temp.throws($$insert into public.fee_concessions (student_id, academic_year_id, kind, amount_paise, reason) values ('54000000-0000-4000-f000-000000000003', '25000000-0000-4000-f000-000000000001', 'fixed', 100, '')$$, 'concession needs a reason', '23514');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'fee_concessions' and action = 'insert' and actor_role = 'admin'$$, 2, 'concessions are audit-logged');

-- =====================================================================
-- DUTY TEACHER (fee_collection)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f000-000000000002');
select pg_temp.counts($$select count(*) from public.student_fee_dues where academic_year_id = '25000000-0000-4000-f000-000000000001' and voided_at is null$$, 23, 'fee duty: sees every student''s dues');
select pg_temp.counts($$select count(*) from public.fee_structure where academic_year_id = '25000000-0000-4000-f000-000000000001'$$, 1, 'fee duty: sees the fee structure');
-- partial payment, oldest first: due 1 net = 83,333 − 8,333 = 75,000
select pg_temp.lives($$select public.collect_fee('54000000-0000-4000-f000-000000000001', 100000, 'cash')$$, 'fee duty: collects ₹1,000 (partial)');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 1 and voided_at is null$$, 75000, 'allocated to the oldest due first (fully paid: 75,000)');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 2 and voided_at is null$$, 25000, 'remainder goes to the next due (25,000)');
-- choose a specific due
select pg_temp.lives($$select public.collect_fee('54000000-0000-4000-f000-000000000001', 30000, 'upi', 'UPI-REF-1', null,
  array(select id from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 5 and voided_at is null))$$, 'fee duty: pays a chosen due (month 5)');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 5 and voided_at is null$$, 30000, 'payment went only to the chosen due');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 2 and voided_at is null$$, 25000, 'other dues untouched by a chosen-due payment');
-- overpayment blocked (S3 owes 10,00,001 − 50,000 = 9,50,001)
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000003', 950002, 'cash')$$, 'paying more than is due is blocked', '23514');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000001', 80000, 'cash', null, null,
  array(select id from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 5 and voided_at is null))$$, 'paying more than the chosen dues is blocked', '23514');
select pg_temp.lives($$select public.collect_fee('54000000-0000-4000-f000-000000000003', 950001, 'cheque', 'CHQ-77')$$, 'paying exactly the full balance is allowed');
select pg_temp.counts($$select sum(amount_paise - concession_paise - paid_paise) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000003' and voided_at is null$$, 0, 'balance is now zero');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000003', 1, 'cash')$$, 'nothing more can be paid once settled', '23514');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000004', 1000, 'upi')$$, 'UPI / cheque / transfer need a reference number', '23514');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000004', 0, 'cash')$$, 'zero amount is rejected', '23514');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000004', 1000, 'cash', null, null, null, '2080-05-01')$$, 'fee duty: cannot backdate a receipt', '42501');
-- receipts: sequential, unique, collected_by recorded
select pg_temp.ok((select max(seq) - min(seq) = 2 and count(distinct receipt_no) = 3 from public.fee_receipts where student_id in (select id from public.students where admission_no like 'FEE-%')), 'three receipts get three consecutive, unique numbers');
select pg_temp.counts($$select count(*) from public.fee_receipts where student_id in (select id from public.students where admission_no like 'FEE-%') and collected_by = '15000000-0000-4000-f000-000000000002' and receipt_no like 'RCPT-%/%'$$, 3, 'who collected each payment is recorded; number format RCPT-<FY>/<0001>');
-- forbidden for the duty
select pg_temp.throws($$insert into public.fee_heads (name) values ('Sneaky head')$$, 'fee duty: cannot add fee heads', '42501');
select pg_temp.affects($$update public.fee_structure set amount_paise = 1 where academic_year_id = '25000000-0000-4000-f000-000000000001'$$, 0, 'fee duty: cannot change amounts');
select pg_temp.affects($$update public.fee_plans set due_day = 5 where academic_year_id = '25000000-0000-4000-f000-000000000001'$$, 0, 'fee duty: cannot change plans');
select pg_temp.throws($$insert into public.fee_concessions (student_id, academic_year_id, kind, percent_bp, reason) values ('54000000-0000-4000-f000-000000000002', '25000000-0000-4000-f000-000000000001', 'percent', 5000, 'Friend')$$, 'fee duty: cannot give concessions', '42501');
select pg_temp.throws($$insert into public.student_fee_plans (student_id, academic_year_id, fee_head_id, plan_id, reason) values ('54000000-0000-4000-f000-000000000002', '25000000-0000-4000-f000-000000000001', '60000000-0000-4000-f000-000000000001', '61000000-0000-4000-f000-000000000002', 'Change')$$, 'fee duty: cannot change a student''s plan', '42501');
select pg_temp.affects($$update public.student_fee_dues set paid_paise = amount_paise - concession_paise where student_id = '54000000-0000-4000-f000-000000000002'$$, 0, 'fee duty: cannot edit dues directly');
select pg_temp.affects($$update public.fee_receipts set total_paise = 1$$, 0, 'fee duty: cannot edit receipts');
select pg_temp.affects($$delete from public.fee_receipts$$, 0, 'fee duty: cannot delete receipts');
select pg_temp.throws($$select public.cancel_fee_receipt((select id from public.fee_receipts where student_id = '54000000-0000-4000-f000-000000000003'), 'Mistake')$$, 'fee duty: cannot cancel a receipt', '42501');
select pg_temp.throws($$select public.regenerate_fee_dues('25000000-0000-4000-f000-000000000001')$$, 'fee duty: cannot regenerate dues', '42501');

-- =====================================================================
-- TEACHER WITHOUT THE DUTY (class teacher of the section!) + anon
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f000-000000000003');
select pg_temp.counts('select count(*) from public.fee_heads', 0, 'no duty: no fee heads');
select pg_temp.counts('select count(*) from public.fee_plans', 0, 'no duty: no plans');
select pg_temp.counts('select count(*) from public.fee_plan_installments', 0, 'no duty: no installments');
select pg_temp.counts('select count(*) from public.fee_structure', 0, 'no duty: no fee structure');
select pg_temp.counts('select count(*) from public.student_fee_dues', 0, 'no duty: no dues, even for own section''s students');
select pg_temp.counts('select count(*) from public.fee_receipts', 0, 'no duty: no receipts');
select pg_temp.counts('select count(*) from public.fee_receipt_items', 0, 'no duty: no receipt items');
select pg_temp.counts('select count(*) from public.fee_concessions', 0, 'no duty: no concessions');
select pg_temp.counts('select count(*) from public.student_fee_plans', 0, 'no duty: no plan overrides');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000004', 1000, 'cash')$$, 'no duty: cannot collect', '42501');

select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.student_fee_dues', 'anon: no access to dues', '42501');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000004', 1000, 'cash')$$, 'anon: cannot collect', '42501');

-- =====================================================================
-- ADMIN: cancel restores dues; regeneration is safe
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f000-000000000001');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'fee_receipts' and action = 'insert' and actor_user_id = '00000000-0000-4000-f000-000000000002'$$, 3, 'every receipt is audit-logged with the collector (admin reads the log)');
select pg_temp.throws($$select public.cancel_fee_receipt((select id from public.fee_receipts where student_id = '54000000-0000-4000-f000-000000000001' and total_paise = 100000), '')$$, 'cancelling needs a reason', '23514');
select pg_temp.lives($$select public.cancel_fee_receipt((select id from public.fee_receipts where student_id = '54000000-0000-4000-f000-000000000001' and total_paise = 100000), 'Wrong student')$$, 'admin: cancels the ₹1,000 receipt');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 1 and voided_at is null$$, 0, 'cancellation restored due 1 to unpaid');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 2 and voided_at is null$$, 0, 'cancellation restored due 2 to unpaid');
select pg_temp.counts($$select count(*) from public.fee_receipts where student_id = '54000000-0000-4000-f000-000000000001' and status = 'cancelled' and cancel_reason = 'Wrong student' and cancelled_by = '15000000-0000-4000-f000-000000000001'$$, 1, 'cancelled receipt keeps its number, shows who and why');
select pg_temp.counts($$select count(*) from public.fee_receipt_items i join public.fee_receipts r on r.id = i.receipt_id where r.status = 'cancelled' and r.student_id = '54000000-0000-4000-f000-000000000001'$$, 2, 'cancelled receipt items are kept (history)');
select pg_temp.throws($$select public.cancel_fee_receipt((select id from public.fee_receipts where status = 'cancelled' and student_id = '54000000-0000-4000-f000-000000000001'), 'Again')$$, 'a receipt cannot be cancelled twice', '23514');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'fee_receipts' and action = 'update' and new_data->>'status' = 'cancelled' and actor_role = 'admin'
  and record_id = (select id::text from public.fee_receipts where student_id = '54000000-0000-4000-f000-000000000001' and status = 'cancelled')$$, 1, 'cancellation is audit-logged');
select pg_temp.affects($$delete from public.fee_receipts where student_id = '54000000-0000-4000-f000-000000000001'$$, 0, 'admin: receipts are never deleted');
select pg_temp.lives($$select public.collect_fee('54000000-0000-4000-f000-000000000004', 100000, 'bank_transfer', 'NEFT-1', null, null, '2080-05-01')$$, 'admin: may date a receipt in the past');
select pg_temp.counts($$select count(*) from public.fee_receipts where student_id = '54000000-0000-4000-f000-000000000004' and financial_year = '2080-81' and seq = 1 and receipt_no = 'RCPT-2080-81/0001'$$, 1, 'numbering restarts per financial year (2080-81/0001)');

-- regeneration: raise tuition to ₹12,000 with month 5 part-paid
select pg_temp.lives($$update public.fee_structure set amount_paise = 1200000 where academic_year_id = '25000000-0000-4000-f000-000000000001'$$, 'admin: raises the annual amount');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 12, 'regeneration never duplicates dues');
select pg_temp.counts($$select sum(amount_paise) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 1200000, 'new amount split exactly');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and installment_seq = 5 and voided_at is null$$, 30000, 'payments on dues survive regeneration');
select pg_temp.counts($$select sum(concession_paise) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 120000, 'concession re-applied on the new amounts (10%)');
select pg_temp.counts($$select paid_paise from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000003' and voided_at is null$$, 950001, 'fully paid one-time due is kept');
-- plan change for a part-paid student: paid monthly due kept, rest moves to one-time
select pg_temp.lives($$insert into public.student_fee_plans (student_id, academic_year_id, fee_head_id, plan_id, reason) values ('54000000-0000-4000-f000-000000000001', '25000000-0000-4000-f000-000000000001', '60000000-0000-4000-f000-000000000001', '61000000-0000-4000-f000-000000000002', 'Now paying once')$$, 'admin: changes a student''s plan to one-time');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 2, 'after the switch: the part-paid month + one one-time due');
select pg_temp.counts($$select sum(amount_paise) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 1200000, 'total still equals the annual amount');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is not null and paid_paise = 0$$, 11, 'unpaid monthly dues are voided, not deleted');
select pg_temp.counts($$select public.regenerate_fee_dues('25000000-0000-4000-f000-000000000001')$$, 4, 'admin: regenerating the whole year is safe to repeat');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '54000000-0000-4000-f000-000000000001' and voided_at is null$$, 2, 'regenerating again changes nothing');

-- revoke the duty: blocked immediately
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '15000000-0000-4000-f000-000000000002'$$, 1, 'admin: revokes fee_collection');
select pg_temp.login_as('00000000-0000-4000-f000-000000000002');
select pg_temp.counts('select count(*) from public.student_fee_dues', 0, 'revoked duty: no fee data');
select pg_temp.throws($$select public.collect_fee('54000000-0000-4000-f000-000000000004', 1000, 'cash')$$, 'revoked duty: cannot collect', '42501');
