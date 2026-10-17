-- Fee access: Admin, and office staff the Admin picked. NEVER a teacher, whatever duties they hold. Cut off at once. Rolled back.
update public.school_settings set mediums = '{English,Telugu}', receipt_no_prefix = 'RCPT-' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000001', 'admin@fa.test');
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000002', 'teacher@fa.test');
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000003', 'office-fee@fa.test');
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000004', 'office-nofee@fa.test');
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000005', 'office-2@fa.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1e000000-0000-4000-fa00-000000000001', '00000000-0000-4000-fa00-000000000001', 'admin',          'FA-ADM', 'Fa Admin'),
  ('1e000000-0000-4000-fa00-000000000002', '00000000-0000-4000-fa00-000000000002', 'teacher',        'FA-TCH', 'Fa Teacher with every other duty'),
  ('1e000000-0000-4000-fa00-000000000003', '00000000-0000-4000-fa00-000000000003', 'computer_staff', 'FA-OFF', 'Fa Office with fee access'),
  ('1e000000-0000-4000-fa00-000000000004', '00000000-0000-4000-fa00-000000000004', 'computer_staff', 'FA-NOF', 'Fa Office without fee access'),
  ('1e000000-0000-4000-fa00-000000000005', '00000000-0000-4000-fa00-000000000005', 'computer_staff', 'FA-OF2', 'Fa Office 2');
-- the teacher holds EVERY duty except the fee one (which the database will not give them)
insert into public.staff_permissions (staff_id, duty) select '1e000000-0000-4000-fa00-000000000002', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';
insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000003', 'fee_collection');
-- the no-fee office person has other duties (they are still not fee people)
insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000004', 'student_records'), ('1e000000-0000-4000-fa00-000000000004', 'notices_diary');

insert into public.academic_years (id, name, start_date, end_date) values ('2e000000-0000-4000-fa00-000000000001', 'FA-2079-80', '2079-04-01', '2080-03-31');
insert into public.classes (id, name, sort_order) values ('3a200000-0000-4000-fa00-000000000001', 'FA Class', 971);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3b200000-0000-4000-fa00-000000000001', '2e000000-0000-4000-fa00-000000000001', '3a200000-0000-4000-fa00-000000000001', 'A', '1e000000-0000-4000-fa00-000000000002');
insert into public.fee_heads (id, name, code, sort_order) values ('62000000-0000-4000-fa00-000000000001', 'FA Tuition', 'FA-TUI', 92);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63000000-0000-4000-fa00-000000000001', '2e000000-0000-4000-fa00-000000000001', 'FA Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values
  ('2e000000-0000-4000-fa00-000000000001', '3a200000-0000-4000-fa00-000000000001', '62000000-0000-4000-fa00-000000000001', 1200000, '63000000-0000-4000-fa00-000000000001');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('55200000-0000-4000-fa00-000000000001', 'FA-0001', 'Fa One', 'male', '2070-01-01', '2078-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) values ('55200000-0000-4000-fa00-000000000001', '2e000000-0000-4000-fa00-000000000001', '3b200000-0000-4000-fa00-000000000001');
-- one payment, made by the office person with fee access
select pg_temp.login_as('00000000-0000-4000-fa00-000000000003');
select pg_temp.lives($$select public.collect_fee('55200000-0000-4000-fa00-000000000001', 50000, 'cash')$$, 'office with fee access: collects a payment');

-- how many rows can the CURRENT person read from every fee table / fee report source?
create function pg_temp.fee_rows() returns bigint language plpgsql as $$
declare t text; n bigint; total bigint := 0;
begin
  foreach t in array array['fee_heads','fee_plans','fee_plan_installments','fee_structure','student_fee_plans','fee_concessions','student_fee_dues',
                           'fee_receipts','fee_receipt_items','fee_campaigns','fee_campaign_class_amounts','fee_campaign_students','fee_settings'] loop
    execute format('select count(*) from public.%I', t) into n;
    total := total + n;
  end loop;
  return total;
end $$;
create function pg_temp.fee_tables_readable() returns text language plpgsql as $$
declare t text; n bigint; out text := '';
begin
  foreach t in array array['fee_heads','fee_plans','fee_plan_installments','fee_structure','student_fee_plans','fee_concessions','student_fee_dues',
                           'fee_receipts','fee_receipt_items','fee_campaigns','fee_campaign_class_amounts','fee_campaign_students','fee_settings'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then out := out || t || ':' || n || ' '; end if;
  end loop;
  return out;
end $$;

-- ================= with fee access
select pg_temp.login_as('00000000-0000-4000-fa00-000000000003');
select pg_temp.counts($$select (pg_temp.fee_rows() > 0)::int$$, 1, 'office with fee access: reads the fee tables');
select pg_temp.counts($$select count(*) from public.student_fee_dues where student_id = '55200000-0000-4000-fa00-000000000001'$$, 12, 'office with fee access: reads the dues');
select pg_temp.ok(public.has_duty('fee_collection') and 'fee_collection' = any (array(select public.my_duties()::text)), 'office with fee access: has_duty and my_duties say so');
select pg_temp.counts($$select count(*) from public.fee_receipts where student_id = '55200000-0000-4000-fa00-000000000001'$$, 1, 'office with fee access: reads the receipt');
select pg_temp.login_as('00000000-0000-4000-fa00-000000000001');
select pg_temp.counts($$select (pg_temp.fee_rows() > 0)::int$$, 1, 'admin: reads the fee tables');

-- ================= the teacher with every OTHER duty
select pg_temp.login_as('00000000-0000-4000-fa00-000000000002');
select pg_temp.counts($$select count(*) from public.my_duties()$$, 7, 'teacher: has the 7 other duties');
select pg_temp.ok(not public.has_duty('fee_collection'), 'teacher with every other duty: has_duty(fee_collection) is false');
select pg_temp.ok(pg_temp.fee_tables_readable() = '', 'teacher with every other duty: reads NO fee table', pg_temp.fee_tables_readable());
select pg_temp.throws($$select public.collect_fee('55200000-0000-4000-fa00-000000000001', 100, 'cash')$$, 'teacher: cannot collect a fee', '42501');
select pg_temp.throws($$select public.cancel_fee_receipt((select id from public.fee_receipts limit 1), 'x')$$, 'teacher: cannot cancel a receipt');
select pg_temp.throws($$select public.regenerate_fee_dues('2e000000-0000-4000-fa00-000000000001')$$, 'teacher: cannot regenerate dues');
select pg_temp.affects($$update public.fee_settings set upi_id = 'hack@upi'$$, 0, 'teacher: cannot change payment settings');
select pg_temp.throws($$insert into public.fee_heads (name, code) values ('Sneaky', 'SNK')$$, 'teacher: cannot add a fee head');
select pg_temp.counts($$select count(*) from storage.objects where bucket_id = 'payment-qr'$$, 0, 'teacher: cannot list the payment QR file');
select pg_temp.counts($$select count(*) from public.message_log$$, 0, 'teacher: reads no message log (fee reminders)');
select pg_temp.throws($$select public.log_message('fee_due', 'x', null, null, null, 'whatsapp', 'x')$$, 'teacher: cannot log a fee reminder', '42501');

-- even a STRAY fee row (as if left over in the data) gives a teacher nothing
select pg_temp.logout();
alter table public.staff_permissions disable trigger staff_permissions_fee_office_only;
insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000002', 'fee_collection');
alter table public.staff_permissions enable trigger staff_permissions_fee_office_only;
select pg_temp.login_as('00000000-0000-4000-fa00-000000000002');
select pg_temp.ok(not public.has_duty('fee_collection'), 'teacher with a stray fee row: still false');
select pg_temp.ok(pg_temp.fee_tables_readable() = '', 'teacher with a stray fee row: still reads no fee table');
select pg_temp.throws($$select public.collect_fee('55200000-0000-4000-fa00-000000000001', 100, 'cash')$$, 'teacher with a stray fee row: still cannot collect', '42501');
select pg_temp.counts($$select count(*) from public.my_duties() d where d::text = 'fee_collection'$$, 0, 'teacher with a stray fee row: my_duties never lists fee_collection');

-- ================= the database refuses to give the fee duty to a teacher or Admin
select pg_temp.login_as('00000000-0000-4000-fa00-000000000001');
select pg_temp.throws($$insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000002', 'fee_collection')$$, 'admin: cannot grant fee access to a teacher', 'P0001');
select pg_temp.throws($$insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000001', 'fee_collection')$$, 'admin: cannot grant fee access to an Admin row either', 'P0001');
select pg_temp.lives($$insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000005', 'fee_collection')$$, 'admin: CAN grant fee access to office staff');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'staff_permissions' and action = 'insert' and new_data ->> 'duty' = 'fee_collection' and new_data ->> 'staff_id' = '1e000000-0000-4000-fa00-000000000005' and actor_role = 'admin'$$, 1, 'the grant is audit-logged');
-- turning that office person into a teacher takes the fee duty away (and a teacher cannot be turned back into a fee holder by the role alone)
select pg_temp.lives($$update public.staff set app_role = 'teacher' where id = '1e000000-0000-4000-fa00-000000000005'$$, 'admin: changes the role to teacher');
select pg_temp.counts($$select count(*) from public.staff_permissions where staff_id = '1e000000-0000-4000-fa00-000000000005' and duty = 'fee_collection'$$, 0, 'role changed away from office: the fee grant is removed');
select pg_temp.lives($$update public.staff set app_role = 'computer_staff' where id = '1e000000-0000-4000-fa00-000000000005'$$, 'admin: changes the role back to office');
select pg_temp.counts($$select count(*) from public.staff_permissions where staff_id = '1e000000-0000-4000-fa00-000000000005' and duty = 'fee_collection'$$, 0, 'and fee access does NOT come back by itself');

-- ================= office staff WITHOUT fee access (even with other duties)
select pg_temp.login_as('00000000-0000-4000-fa00-000000000004');
select pg_temp.ok(not public.has_duty('fee_collection'), 'office without fee access: has_duty false');
select pg_temp.ok(pg_temp.fee_tables_readable() = '', 'office without fee access: reads NO fee table', pg_temp.fee_tables_readable());
select pg_temp.throws($$select public.collect_fee('55200000-0000-4000-fa00-000000000001', 100, 'cash')$$, 'office without fee access: cannot collect', '42501');
select pg_temp.counts($$select count(*) from storage.objects where bucket_id = 'payment-qr'$$, 0, 'office without fee access: cannot list the payment QR file');
select pg_temp.counts($$select count(*) from public.students where admission_no = 'FA-0001'$$, 1, 'office without fee access: still sees the student (they hold student_records)');
select pg_temp.counts($$select count(*) from public.my_duties()$$, 2, 'office without fee access: has only the two duties they were given (no implicit duties)');
select pg_temp.counts($$select count(*) from public.staff where employee_code like 'FA-%'$$, 1, 'office staff: sees only their own staff record');

-- ================= cut off at once
select pg_temp.login_as('00000000-0000-4000-fa00-000000000001');
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '1e000000-0000-4000-fa00-000000000003' and duty = 'fee_collection'$$, 1, 'admin: removes the office person''s fee access');
select pg_temp.login_as('00000000-0000-4000-fa00-000000000003');
select pg_temp.ok(not public.has_duty('fee_collection'), 'access removed: has_duty false immediately');
select pg_temp.ok(pg_temp.fee_tables_readable() = '', 'access removed: every fee table is empty immediately', pg_temp.fee_tables_readable());
select pg_temp.throws($$select public.collect_fee('55200000-0000-4000-fa00-000000000001', 100, 'cash')$$, 'access removed: cannot collect', '42501');
-- granting again brings it back; deactivating cuts it again
select pg_temp.login_as('00000000-0000-4000-fa00-000000000001');
select pg_temp.lives($$insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000003', 'fee_collection')$$, 'admin: grants it again');
select pg_temp.login_as('00000000-0000-4000-fa00-000000000003');
select pg_temp.counts($$select (pg_temp.fee_rows() > 0)::int$$, 1, 'granted again: reads the fee tables');
select pg_temp.logout();
update public.staff set status = 'inactive' where id = '1e000000-0000-4000-fa00-000000000003';
select pg_temp.login_as('00000000-0000-4000-fa00-000000000003');
select pg_temp.ok(pg_temp.fee_tables_readable() = '', 'deactivated office person: no fee data even with the grant');
select pg_temp.login_as(null);
select pg_temp.throws($$select count(*) from public.fee_receipts$$, 'anonymous: no fee data', '42501');

-- ================= nothing else shows fee amounts
select pg_temp.logout();
update public.staff set status = 'active' where id = '1e000000-0000-4000-fa00-000000000003';
select pg_temp.login_as('00000000-0000-4000-fa00-000000000002');
select pg_temp.counts($$select count(*) from public.audit_logs$$, 0, 'teacher: no audit log (it holds fee details)');
select pg_temp.counts($$select count(*) from public.students s where s.admission_no = 'FA-0001' and s::text ~* '(due|fee|paid|amount)'$$, 0, 'a student row carries no fee column');
