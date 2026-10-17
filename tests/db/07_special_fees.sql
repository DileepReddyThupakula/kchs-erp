-- Special fees (campaigns) + miscellaneous receipts. Rolled back.
update public.school_settings set mediums = '{English,Telugu}', receipt_no_prefix = 'RCPT-' where id = 1;

select pg_temp.fixture_user('00000000-0000-4000-f100-000000000001', 'admin@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-f100-000000000002', 'duty@sp.test');
select pg_temp.fixture_user('00000000-0000-4000-f100-000000000003', 'plain@sp.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('16000000-0000-4000-f100-000000000001', '00000000-0000-4000-f100-000000000001', 'admin',   'SP-ADM', 'Sp Admin'),
  ('16000000-0000-4000-f100-000000000002', '00000000-0000-4000-f100-000000000002', 'computer_staff', 'SP-DUT', 'Sp Duty'),
  ('16000000-0000-4000-f100-000000000003', '00000000-0000-4000-f100-000000000003', 'teacher', 'SP-PLN', 'Sp Plain');
insert into public.staff_permissions (staff_id, duty) values ('16000000-0000-4000-f100-000000000002', 'fee_collection');

insert into public.academic_years (id, name, start_date, end_date) values ('26000000-0000-4000-f100-000000000001', 'SP-2085-86', '2085-04-01', '2086-03-31');
insert into public.classes (id, name, sort_order) values
  ('3c000000-0000-4000-f100-000000000001', 'SP C1', 951), ('3c000000-0000-4000-f100-000000000002', 'SP C2', 952);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3d000000-0000-4000-f100-000000000001', '26000000-0000-4000-f100-000000000001', '3c000000-0000-4000-f100-000000000001', 'A', '16000000-0000-4000-f100-000000000003'),
  ('3d000000-0000-4000-f100-000000000002', '26000000-0000-4000-f100-000000000001', '3c000000-0000-4000-f100-000000000001', 'B', null),
  ('3d000000-0000-4000-f100-000000000003', '26000000-0000-4000-f100-000000000001', '3c000000-0000-4000-f100-000000000002', 'A', null);
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('55000000-0000-4000-f100-000000000001', 'SP-A1', 'Sp A1', 'male',   '2075-01-01', '2084-06-01'),
  ('55000000-0000-4000-f100-000000000002', 'SP-A2', 'Sp A2', 'female', '2075-01-01', '2084-06-01'),
  ('55000000-0000-4000-f100-000000000003', 'SP-B1', 'Sp B1', 'male',   '2075-01-01', '2084-06-01'),
  ('55000000-0000-4000-f100-000000000004', 'SP-C1', 'Sp C1', 'female', '2075-01-01', '2084-06-01'),
  ('55000000-0000-4000-f100-000000000005', 'SP-D1', 'Sp D1 (joins later)', 'male', '2075-01-01', '2085-11-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) values
  ('55000000-0000-4000-f100-000000000001', '26000000-0000-4000-f100-000000000001', '3d000000-0000-4000-f100-000000000001'),
  ('55000000-0000-4000-f100-000000000002', '26000000-0000-4000-f100-000000000001', '3d000000-0000-4000-f100-000000000001'),
  ('55000000-0000-4000-f100-000000000003', '26000000-0000-4000-f100-000000000001', '3d000000-0000-4000-f100-000000000002'),
  ('55000000-0000-4000-f100-000000000004', '26000000-0000-4000-f100-000000000001', '3d000000-0000-4000-f100-000000000003');
-- a 10% all-heads concession for A1 (special fees decide whether it applies)
insert into public.fee_concessions (student_id, academic_year_id, kind, percent_bp, reason) values
  ('55000000-0000-4000-f100-000000000001', '26000000-0000-4000-f100-000000000001', 'percent', 1000, 'Staff child');

-- =====================================================================
-- Permissions: only Admin creates / changes
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f100-000000000002');
select pg_temp.throws($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Sneaky","amount_mode":"flat","amount_paise":100,"due_date":"2085-08-10","audience":"all"}')$$, 'fee duty: cannot create a special fee', '42501');
select pg_temp.throws($$select public.create_misc_receipt((select id from public.fee_heads limit 1), 100, 'cash', null, null, 'Someone')$$, 'fee duty: cannot create a miscellaneous receipt', '42501');
select pg_temp.login_as('00000000-0000-4000-f100-000000000003');
select pg_temp.throws($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Sneaky","amount_mode":"flat","amount_paise":100,"due_date":"2085-08-10","audience":"all"}')$$, 'no duty: cannot create a special fee', '42501');

-- =====================================================================
-- Admin creates special fees for exact audiences
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f100-000000000001');
select pg_temp.lives($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Trip","description":"Zoo trip","amount_mode":"flat","amount_paise":50000,"due_date":"2085-08-10","audience":"sections","audience_ids":["3d000000-0000-4000-f100-000000000001"]}')$$, 'admin: special fee for one section');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.voided_at is null$$, 2, 'section audience: dues for exactly the 2 students of C1-A');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000003'$$, 0, 'student of another section has no Trip due');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.due_date = '2085-08-10' and d.amount_paise = 50000$$, 2, 'one-time special fee: chosen amount and due date');
select pg_temp.counts($$select sum(concession_paise) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip'$$, 0, 'concessions NOT applied when not chosen');

select pg_temp.lives($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Uniform","amount_mode":"per_class","class_amounts":[{"class_id":"3c000000-0000-4000-f100-000000000001","amount_paise":80000},{"class_id":"3c000000-0000-4000-f100-000000000002","amount_paise":60000}],"due_date":"2085-06-10","audience":"classes","audience_ids":["3c000000-0000-4000-f100-000000000001","3c000000-0000-4000-f100-000000000002"],"apply_concessions":true}')$$, 'admin: per-class special fee for two classes, concessions applied');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Uniform' and d.amount_paise = 80000 and d.voided_at is null$$, 3, 'class C1: 3 students at ₹800');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Uniform' and d.amount_paise = 60000 and d.voided_at is null$$, 1, 'class C2: 1 student at ₹600');
select pg_temp.counts($$select concession_paise from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Uniform' and d.student_id = '55000000-0000-4000-f100-000000000001'$$, 8000, 'concession applied when chosen (10% of ₹800)');

select pg_temp.lives($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Retake","amount_mode":"flat","amount_paise":30001,"audience":"students","audience_ids":["55000000-0000-4000-f100-000000000003"],"installments":[{"label":"Part 1","due_date":"2085-07-10","share_bp":5000},{"label":"Part 2","due_date":"2085-09-10","share_bp":5000}]}')$$, 'admin: special fee for one chosen student, 2 installments');
select pg_temp.ok((select string_agg(d.amount_paise::text, ',' order by d.installment_seq) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Retake') = '15000,15001', 'custom installments split exactly (₹150.00 + ₹150.01)');
select pg_temp.counts($$select count(distinct d.student_id) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Retake'$$, 1, 'only the chosen student has dues');
select pg_temp.lives($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Annual day","amount_mode":"flat","amount_paise":10000,"due_date":"2085-12-10","audience":"all"}')$$, 'admin: special fee for all active students');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Annual day'$$, 4, 'all audience: every enrolled active student of the year (4)');
select pg_temp.throws($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Bad","amount_mode":"flat","amount_paise":100,"audience":"students","audience_ids":["55000000-0000-4000-f100-000000000001"],"installments":[{"due_date":"2085-07-10","share_bp":6000},{"due_date":"2085-09-10","share_bp":3000}]}')$$, 'installment percentages must add up to 100%', '23514');
select pg_temp.throws($$select public.create_special_fee('{"academic_year_id":"26000000-0000-4000-f100-000000000001","name":"SP Nobody","amount_mode":"flat","amount_paise":100,"due_date":"2085-07-10","audience":"classes","audience_ids":[]}')$$, 'must choose who pays', '23514');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'fee_campaigns' and action = 'insert' and actor_role = 'admin' and new_data->>'name' like 'SP %'$$, 4, 'special fees are audit-logged');
-- regular regeneration never voids special-fee dues
select pg_temp.lives($$select public.regenerate_fee_dues('26000000-0000-4000-f100-000000000001')$$, 'admin: regenerates regular dues');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name like 'SP %' and d.voided_at is null$$, 12, 'special-fee dues survive regular regeneration (2+4+2+4)');

-- =====================================================================
-- Duty teacher collects on a special-fee due; cannot change it
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f100-000000000002');
select pg_temp.counts($$select count(*) from public.fee_campaigns where name like 'SP %'$$, 4, 'fee duty: sees special fees');
select pg_temp.lives($$select public.collect_fee('55000000-0000-4000-f100-000000000001', 20000, 'cash', null, null,
  array(select d.id from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000001'))$$, 'fee duty: collects part of a special-fee due');
select pg_temp.throws($$select public.update_special_fee((select id from public.fee_campaigns where name = 'SP Trip'), '{"amount_paise": 1}')$$, 'fee duty: cannot edit a special fee', '42501');
select pg_temp.throws($$select public.add_special_fee_students((select id from public.fee_campaigns where name = 'SP Trip'), array['55000000-0000-4000-f100-000000000004'::uuid])$$, 'fee duty: cannot add students', '42501');
select pg_temp.throws($$select public.cancel_special_fee((select id from public.fee_campaigns where name = 'SP Trip'), 'No')$$, 'fee duty: cannot cancel a special fee', '42501');
select pg_temp.affects($$update public.fee_campaigns set amount_paise = 1$$, 0, 'fee duty: cannot edit special fees directly');
select pg_temp.throws($$insert into public.fee_campaign_students (campaign_id, student_id) select id, '55000000-0000-4000-f100-000000000004' from public.fee_campaigns where name = 'SP Trip'$$, 'fee duty: cannot add members directly', '42501');

select pg_temp.login_as('00000000-0000-4000-f100-000000000003');
select pg_temp.counts('select count(*) from public.fee_campaigns', 0, 'no duty: sees no special fees (even as class teacher)');
select pg_temp.counts('select count(*) from public.fee_campaign_students', 0, 'no duty: sees no special-fee members');
select pg_temp.counts('select count(*) from public.fee_campaign_class_amounts', 0, 'no duty: sees no special-fee amounts');
select pg_temp.throws($$select public.collect_fee('55000000-0000-4000-f100-000000000002', 100, 'cash')$$, 'no duty: cannot collect special fees', '42501');
select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.fee_campaigns', 'anon: no access', '42501');

-- =====================================================================
-- Admin edits (unpaid only), adds a late joiner, cancels
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f100-000000000001');
select pg_temp.lives($$select public.update_special_fee((select id from public.fee_campaigns where name = 'SP Trip'), '{"amount_paise": 60000, "due_date": "2085-08-20"}')$$, 'admin: changes amount and due date');
select pg_temp.counts($$select d.amount_paise from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000002'$$, 60000, 'unpaid due takes the new amount');
select pg_temp.ok((select due_date from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000002') = '2085-08-20', 'unpaid due takes the new due date');
select pg_temp.counts($$select d.amount_paise from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000001'$$, 50000, 'part-paid due is NOT changed');
select pg_temp.ok((select due_date from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000001') = '2085-08-10', 'part-paid due keeps its due date');
-- student joins later
insert into public.student_enrollments (student_id, academic_year_id, section_id) values ('55000000-0000-4000-f100-000000000005', '26000000-0000-4000-f100-000000000001', '3d000000-0000-4000-f100-000000000003');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where d.student_id = '55000000-0000-4000-f100-000000000005'$$, 0, 'a later joiner is not added automatically');
select pg_temp.counts($$select public.add_special_fee_students((select id from public.fee_campaigns where name = 'SP Trip'), array['55000000-0000-4000-f100-000000000005'::uuid])$$, 1, 'admin: adds the late joiner');
select pg_temp.counts($$select d.amount_paise from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000005'$$, 60000, 'late joiner gets the current amount');
select pg_temp.counts($$select public.add_special_fee_students((select id from public.fee_campaigns where name = 'SP Trip'), array['55000000-0000-4000-f100-000000000005'::uuid])$$, 0, 'adding the same student again does nothing (no duplicate)');
-- cancel
select pg_temp.throws($$select public.cancel_special_fee((select id from public.fee_campaigns where name = 'SP Trip'), '')$$, 'cancelling needs a reason', '23514');
select pg_temp.counts($$select public.cancel_special_fee((select id from public.fee_campaigns where name = 'SP Trip'), 'Trip called off')$$, 2, 'admin: cancels; 2 unpaid dues voided');
select pg_temp.counts($$select count(*) from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.voided_at is null$$, 1, 'the part-paid due stays');
select pg_temp.counts($$select count(*) from public.fee_receipts r where r.student_id = '55000000-0000-4000-f100-000000000001' and r.status = 'valid' and r.total_paise = 20000$$, 1, 'its receipt stays valid');
select pg_temp.throws($$select public.add_special_fee_students((select id from public.fee_campaigns where name = 'SP Trip'), array['55000000-0000-4000-f100-000000000004'::uuid])$$, 'cannot add students to a cancelled special fee', 'P0002');
select pg_temp.throws($$select public.collect_fee('55000000-0000-4000-f100-000000000002', 100, 'cash', null, null,
  array(select d.id from public.student_fee_dues d join public.fee_campaigns c on c.fee_head_id = d.fee_head_id where c.name = 'SP Trip' and d.student_id = '55000000-0000-4000-f100-000000000002'))$$, 'cancelled (voided) dues cannot be paid', '23514');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'fee_campaigns' and action = 'update' and new_data->>'status' = 'cancelled' and new_data->>'name' = 'SP Trip'$$, 1, 'cancellation is audit-logged');

-- =====================================================================
-- Miscellaneous receipts
-- =====================================================================
insert into public.fee_heads (id, name, sort_order) values ('62000000-0000-4000-f100-000000000001', 'SP TC fee', 200);
select pg_temp.lives($$select public.create_misc_receipt('62000000-0000-4000-f100-000000000001', 5000, 'cash', null, '55000000-0000-4000-f100-000000000004')$$, 'admin: misc receipt linked to a student');
select pg_temp.lives($$select public.create_misc_receipt('62000000-0000-4000-f100-000000000001', 2500, 'upi', 'UPI-77', null, 'Walk-in parent')$$, 'admin: misc receipt with only a payer name');
select pg_temp.throws($$select public.create_misc_receipt('62000000-0000-4000-f100-000000000001', 2500, 'cash')$$, 'misc receipt needs a student or a payer name', '23514');
select pg_temp.throws($$select public.create_misc_receipt((select fee_head_id from public.fee_campaigns where name = 'SP Uniform'), 2500, 'cash', null, null, 'X Y')$$, 'special-fee heads are not collected as misc', '23514');
select pg_temp.counts($$select count(*) from public.fee_receipts r join public.fee_receipt_items i on i.receipt_id = r.id where r.kind = 'misc' and i.due_id is null and i.fee_head_id = '62000000-0000-4000-f100-000000000001'$$, 2, 'misc receipts have no due, carry their fee head');
select pg_temp.ok((select max(seq) - min(seq) = 2 and count(*) = 3 from public.fee_receipts where financial_year = app.fin_year(app.today_ist()) and seq >= (select seq from public.fee_receipts where student_id = '55000000-0000-4000-f100-000000000001' and total_paise = 20000)), 'misc receipts continue the same number series (no gap)');
select pg_temp.lives($$select public.cancel_fee_receipt((select id from public.fee_receipts where payer_name = 'Walk-in parent'), 'Entered twice')$$, 'admin: cancels a misc receipt');
select pg_temp.counts($$select count(*) from public.fee_receipts where payer_name = 'Walk-in parent' and status = 'cancelled' and receipt_no like 'RCPT-%'$$, 1, 'cancelled misc receipt keeps its number');
select pg_temp.login_as('00000000-0000-4000-f100-000000000002');
select pg_temp.counts($$select count(*) from public.fee_receipts where kind = 'misc' and payer_name = 'Walk-in parent'$$, 1, 'fee duty: can see misc receipts');
select pg_temp.throws($$select public.cancel_fee_receipt((select id from public.fee_receipts where kind = 'misc' and status = 'valid' and student_id = '55000000-0000-4000-f100-000000000004'), 'No')$$, 'fee duty: cannot cancel a misc receipt', '42501');
select pg_temp.login_as('00000000-0000-4000-f100-000000000003');
select pg_temp.counts($$select count(*) from public.fee_receipts where kind = 'misc'$$, 0, 'no duty: sees no misc receipts');
