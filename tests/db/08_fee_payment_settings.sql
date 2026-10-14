-- Payment modes (reference rules) and the school UPI / QR settings. Rolled back.
update public.school_settings set mediums = '{English,Telugu}', receipt_no_prefix = 'RCPT-' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-f200-000000000001', 'admin@pay.test');
select pg_temp.fixture_user('00000000-0000-4000-f200-000000000002', 'duty@pay.test');
select pg_temp.fixture_user('00000000-0000-4000-f200-000000000003', 'plain@pay.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('17000000-0000-4000-f200-000000000001', '00000000-0000-4000-f200-000000000001', 'admin',   'PAY-ADM', 'Pay Admin'),
  ('17000000-0000-4000-f200-000000000002', '00000000-0000-4000-f200-000000000002', 'teacher', 'PAY-DUT', 'Pay Duty'),
  ('17000000-0000-4000-f200-000000000003', '00000000-0000-4000-f200-000000000003', 'teacher', 'PAY-PLN', 'Pay Plain');
insert into public.staff_permissions (staff_id, duty) values ('17000000-0000-4000-f200-000000000002', 'fee_collection');

insert into public.academic_years (id, name, start_date, end_date) values ('27000000-0000-4000-f200-000000000001', 'PAY-2095-96', '2095-04-01', '2096-03-31');
insert into public.classes (id, name, sort_order) values ('3e000000-0000-4000-f200-000000000001', 'PAY Class', 941);
insert into public.sections (id, academic_year_id, class_id, name) values ('3f000000-0000-4000-f200-000000000001', '27000000-0000-4000-f200-000000000001', '3e000000-0000-4000-f200-000000000001', 'A');
insert into public.fee_heads (id, name, sort_order) values ('63000000-0000-4000-f200-000000000001', 'PAY Head', 92);
insert into public.fee_plans (id, academic_year_id, name, kind) values ('64000000-0000-4000-f200-000000000001', '27000000-0000-4000-f200-000000000001', 'PAY One-time', 'one_time');
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id)
  values ('27000000-0000-4000-f200-000000000001', '3e000000-0000-4000-f200-000000000001', '63000000-0000-4000-f200-000000000001', 1000000, '64000000-0000-4000-f200-000000000001');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('56000000-0000-4000-f200-000000000001', 'PAY-0001', 'Pay One', 'male', '2085-01-01', '2094-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) values ('56000000-0000-4000-f200-000000000001', '27000000-0000-4000-f200-000000000001', '3f000000-0000-4000-f200-000000000001');

-- ============ modes: UPI / bank transfer optional, cheque required ============
select pg_temp.login_as('00000000-0000-4000-f200-000000000002');
select pg_temp.lives($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'upi')$$, 'UPI saves without a reference');
select pg_temp.lives($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'bank_transfer')$$, 'bank transfer saves without a reference');
select pg_temp.lives($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'upi', 'UPI-123')$$, 'UPI saves with a reference too');
select pg_temp.lives($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'cash')$$, 'cash needs no reference');
select pg_temp.throws($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'cheque')$$, 'cheque without a number is refused', '23514');
select pg_temp.throws($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'cheque', '   ')$$, 'a blank cheque number is refused', '23514');
select pg_temp.lives($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'cheque', '004512')$$, 'cheque with a number is accepted');
select pg_temp.counts($$select count(*) from public.fee_receipts where student_id = '56000000-0000-4000-f200-000000000001' and payment_mode = 'upi' and reference_no is null$$, 1, 'the UPI receipt without a reference is stored');
select pg_temp.affects($$update public.fee_receipts set reference_no = null where payment_mode = 'cheque'$$, 0, 'duty cannot edit receipts');

-- ============ settings: only Admin changes; duty reads; others nothing ============
select pg_temp.counts('select count(*) from public.fee_settings', 1, 'fee duty: can read the payment settings (to show the QR)');
select pg_temp.affects($$update public.fee_settings set upi_id = 'hacker@upi'$$, 0, 'fee duty: cannot change the UPI id');
select pg_temp.affects($$update public.fee_settings set require_upi_reference = true$$, 0, 'fee duty: cannot change the reference setting');
select pg_temp.throws($$insert into public.fee_settings (id, upi_id) values (2, 'x@y')$$, 'nobody can add a second settings row', '42501');
select pg_temp.affects($$delete from public.fee_settings$$, 0, 'fee duty: cannot delete the settings');

select pg_temp.login_as('00000000-0000-4000-f200-000000000003');
select pg_temp.counts('select count(*) from public.fee_settings', 0, 'no duty: cannot read the payment settings');
select pg_temp.affects($$update public.fee_settings set upi_id = 'hacker@upi'$$, 0, 'no duty: cannot change them');
select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.fee_settings', 'anon: no access', '42501');

select pg_temp.login_as('00000000-0000-4000-f200-000000000001');
select pg_temp.affects($$update public.fee_settings set upi_id = 'kchs.school@okbank', payee_name = 'Krishna Chaitanya High School'$$, 1, 'admin: sets the UPI id and payee name');
select pg_temp.throws($$update public.fee_settings set upi_id = 'not a upi id'$$, 'a malformed UPI id is refused', '23514');
select pg_temp.counts($$select count(*) from public.fee_settings where changed_by_name = 'Pay Admin' and updated_by = '00000000-0000-4000-f200-000000000001'$$, 1, 'last editor (name and user) is recorded on the row');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'fee_settings.update' and actor_role = 'admin' and details->>'upi_id_new' = 'kc***@okbank'$$, 1, 'change is audit-logged with the UPI id partly masked');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'fee_settings.update' and details::text like '%kchs.school%'$$, 0, 'the full UPI id never reaches the audit log');
select pg_temp.affects($$update public.fee_settings set upi_id = 'kchs.fees@okbank'$$, 1, 'admin: changes the UPI id again');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'fee_settings.update' and details->>'upi_id_old' = 'kc***@okbank' and details->>'upi_id_new' = 'kc***@okbank'$$, 1, 'second change logged (old and new, masked)');
select pg_temp.affects($$update public.fee_settings set payee_name = payee_name$$, 1, 'an unchanged save is allowed');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'fee_settings.update'$$, 2, 'an unchanged save adds no audit entry');

-- ============ require reference for UPI (Admin setting) ============
select pg_temp.affects($$update public.fee_settings set require_upi_reference = true$$, 1, 'admin: turns on "Require reference for UPI"');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'fee_settings.update' and details->>'require_upi_reference_new' = 'true'$$, 1, 'the setting change is audit-logged');
select pg_temp.throws($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'upi')$$, 'with the setting on, UPI without a reference is refused', '23514');
select pg_temp.lives($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'upi', 'UPI-999')$$, 'with the setting on, UPI with a reference is accepted');
select pg_temp.lives($$select public.collect_fee('56000000-0000-4000-f200-000000000001', 10000, 'bank_transfer')$$, 'bank transfer stays optional');
select pg_temp.throws($$select public.create_misc_receipt('63000000-0000-4000-f200-000000000001', 5000, 'upi', null, null, 'Walk-in')$$, 'misc receipt follows the same UPI rule', '23514');
select pg_temp.affects($$update public.fee_settings set require_upi_reference = false$$, 1, 'admin: turns it off again');
select pg_temp.lives($$select public.create_misc_receipt('63000000-0000-4000-f200-000000000001', 5000, 'upi', null, null, 'Walk-in')$$, 'misc UPI receipt without a reference works when the setting is off');
select pg_temp.throws($$select public.create_misc_receipt('63000000-0000-4000-f200-000000000001', 5000, 'cheque', null, null, 'Walk-in')$$, 'misc cheque still needs a number', '23514');

-- ============ QR image storage ============
select pg_temp.lives($$insert into storage.objects (bucket_id, name, owner) values ('payment-qr', 'qr-test.png', auth.uid())$$, 'admin: uploads the QR image');
select pg_temp.login_as('00000000-0000-4000-f200-000000000002');
select pg_temp.counts($$select count(*) from storage.objects where bucket_id = 'payment-qr'$$, 1, 'fee duty: can read the QR image (to show it)');
select pg_temp.throws($$insert into storage.objects (bucket_id, name) values ('payment-qr', 'qr-fake.png')$$, 'fee duty: cannot upload a QR image', '42501');
select pg_temp.affects($$update storage.objects set name = 'x.png' where bucket_id = 'payment-qr'$$, 0, 'fee duty: cannot replace the QR image');
select pg_temp.login_as('00000000-0000-4000-f200-000000000003');
select pg_temp.counts($$select count(*) from storage.objects where bucket_id = 'payment-qr'$$, 0, 'no duty: cannot see the QR image');
select pg_temp.throws($$insert into storage.objects (bucket_id, name) values ('payment-qr', 'qr-fake2.png')$$, 'no duty: cannot upload a QR image', '42501');
