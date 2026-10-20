-- Login IDs (mobile number / username / email): who can read them, uniqueness, masking in the audit log, the per-login-ID lock. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-ff30-000000000001', 'admin@li.test');
select pg_temp.fixture_user('00000000-0000-4000-ff30-000000000002', 'teacher1@li.test');
select pg_temp.fixture_user('00000000-0000-4000-ff30-000000000003', 'teacher2@li.test');
select pg_temp.fixture_user('00000000-0000-4000-ff30-000000000004', 'office@li.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name, email, status) values
  ('1f300000-0000-4000-ff30-000000000001', '00000000-0000-4000-ff30-000000000001', 'admin',          'LI-ADM', 'Li Admin', 'admin@li.test', 'active'),
  ('1f300000-0000-4000-ff30-000000000002', '00000000-0000-4000-ff30-000000000002', 'teacher',        'LI-T1',  'Li Teacher One', 'real-t1@li.test', 'active'),
  ('1f300000-0000-4000-ff30-000000000003', '00000000-0000-4000-ff30-000000000003', 'teacher',        'LI-T2',  'Li Teacher Two', null, 'active'),
  ('1f300000-0000-4000-ff30-000000000004', '00000000-0000-4000-ff30-000000000004', 'computer_staff', 'LI-OFF', 'Li Office', null, 'active');
insert into public.staff_permissions (staff_id, duty) values ('1f300000-0000-4000-ff30-000000000004', 'student_records');

-- ================= the Admin sets login IDs
select pg_temp.login_as('00000000-0000-4000-ff30-000000000001');
select pg_temp.lives($$insert into public.staff_logins (staff_id, login_id, kind) values
  ('1f300000-0000-4000-ff30-000000000001', 'admin@li.test', 'email'),
  ('1f300000-0000-4000-ff30-000000000002', '9876543210', 'mobile'),
  ('1f300000-0000-4000-ff30-000000000003', 'ravi.teacher', 'username'),
  ('1f300000-0000-4000-ff30-000000000004', 'office.one', 'username')$$, 'Admin: sets a mobile number, a username and an email as login IDs');
select pg_temp.counts($$select count(*) from public.staff_logins where staff_id::text like '1f300000-0000-4000-ff30-%'$$, 4, 'Admin: reads every login ID');
select pg_temp.throws($$insert into public.staff_logins (staff_id, login_id, kind) values ('1f300000-0000-4000-ff30-000000000004', '9876543210', 'mobile')$$, 'two staff cannot share one login ID (staff 4 is already on a username, and the number is taken)', '23505');
select pg_temp.throws($$update public.staff_logins set login_id = '9876543210' where staff_id = '1f300000-0000-4000-ff30-000000000003'$$, 'a second person cannot take the same mobile number', '23514');
select pg_temp.throws($$update public.staff_logins set login_id = 'Ravi.Teacher' where staff_id = '1f300000-0000-4000-ff30-000000000003'$$, 'a login ID must be lower case (so it is unique whatever the capitals)', '23514');
select pg_temp.throws($$update public.staff_logins set login_id = '12345', kind = 'mobile' where staff_id = '1f300000-0000-4000-ff30-000000000003'$$, 'a mobile number must be 10 digits starting with 6 to 9', '23514');
select pg_temp.throws($$update public.staff_logins set kind = 'email' where staff_id = '1f300000-0000-4000-ff30-000000000003'$$, 'the kind must match the login ID (an email has an @)', '23514');
select pg_temp.logout();

-- ================= who can read them
select pg_temp.login_as('00000000-0000-4000-ff30-000000000002');
select pg_temp.counts($$select count(*) from public.staff_logins$$, 1, 'teacher: reads only their OWN login ID, not anyone else''s');
select pg_temp.ok((select login_id from public.staff_logins) = '9876543210', 'teacher: and it is their own');
select pg_temp.counts($$select count(*) from public.staff_logins where staff_id = '1f300000-0000-4000-ff30-000000000003'$$, 0, 'teacher: cannot read a colleague''s login ID');
select pg_temp.affects($$update public.staff_logins set login_id = '9000000001' where staff_id = '1f300000-0000-4000-ff30-000000000002'$$, 0, 'teacher: cannot change even their own login ID');
select pg_temp.throws($$insert into public.staff_logins (staff_id, login_id, kind) values ('1f300000-0000-4000-ff30-000000000002', 'sneaky.id', 'username')$$, 'teacher: cannot add a login ID', '42501');
select pg_temp.affects($$delete from public.staff_logins$$, 0, 'teacher: cannot delete a login ID');
select pg_temp.ok((select count(*) from public.staff where id = '1f300000-0000-4000-ff30-000000000003') = 0, 'teacher: also cannot read colleagues in the staff table (existing rule)');
select pg_temp.login_as('00000000-0000-4000-ff30-000000000004');
select pg_temp.counts($$select count(*) from public.staff where id::text like '1f300000-0000-4000-ff30-%'$$, 1, 'office staff: see only their own staff row (existing rule: the full staff table is for the Admin)');
select pg_temp.counts($$select count(*) from public.staff_logins where staff_id <> '1f300000-0000-4000-ff30-000000000004'$$, 0, 'office staff: and NOT other people''s login IDs (the login-ID table has its own rule, so a future widening of the staff table cannot expose mobile numbers)');
select pg_temp.counts($$select count(*) from public.staff_logins$$, 1, 'office staff: only their own');
select pg_temp.affects($$update public.staff_logins set login_id = 'hijack.me'$$, 0, 'office staff: cannot change login IDs');
select pg_temp.login_as(null);
select pg_temp.throws($$select * from public.staff_logins$$, 'not signed in: no access to login IDs at all', '42501');
select pg_temp.logout();

-- ================= the audit log shows a mobile number masked
select pg_temp.login_as('00000000-0000-4000-ff30-000000000001');
select pg_temp.ok((select count(*) from public.audit_logs where table_name = 'staff_logins' and new_data ->> 'login_id' = '9876543210') >= 1, 'setup: the raw audit row exists (the log itself stores the change)');
select pg_temp.ok(app.audit_clean('{"login_id": "9876543210"}'::jsonb) = '{"login_id": "******3210"}'::jsonb, 'audit cleaning: a mobile login ID keeps only its last four digits');
select pg_temp.ok(app.audit_clean('{"login_id": "ravi.teacher"}'::jsonb) = '{"login_id": "ravi.teacher"}'::jsonb, 'audit cleaning: a username or email is shown as typed');
select pg_temp.ok(position('9876543210' in public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500)::text) = 0, 'the audit screen data never contains the full mobile number');
select pg_temp.ok(position('******3210' in public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500)::text) > 0, '...only the masked one');
select pg_temp.logout();

-- ================= failed sign-ins: only the server may write them; per-login-ID lock after 10 in 15 minutes
select pg_temp.login_as('00000000-0000-4000-ff30-000000000002');
select pg_temp.throws($$select public.log_failed_login(md5('x'), 'x', false, '10.0.0.1', 'x')$$, 'a signed-in teacher cannot write failed sign-ins', '42501');
select pg_temp.throws($$select public.login_is_locked(md5('x'))$$, 'a signed-in teacher cannot ask who is locked', '42501');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.login_is_locked(md5('x'))$$, 'not signed in: cannot ask who is locked', '42501');
select pg_temp.logout();
select public.log_failed_login(md5('li-nine'), '******1111', true, '10.20.0.' || g, 'Test') from generate_series(1, 9) g;
select public.log_failed_login(md5('li-ten'), '******2222', true, '10.21.0.' || g, 'Test') from generate_series(1, 10) g;
select public.log_failed_login(md5('li-other'), 'other.person', false, '10.22.0.1', 'Test');
select pg_temp.ok(not public.login_is_locked(md5('li-nine')), 'lock: 9 failures in 15 minutes do not lock');
select pg_temp.ok(public.login_is_locked(md5('li-ten')), 'lock: the 10th failure locks the login ID');
select pg_temp.ok(not public.login_is_locked(md5('li-other')), 'lock: another login ID is not affected');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'auth.login_locked' and details ->> 'key' = md5('li-ten')$$, 1, 'lock: written once, for the alerts');
select public.log_failed_login(md5('li-ten'), '******2222', true, '10.21.1.1', 'Test');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'auth.login_locked' and details ->> 'key' = md5('li-ten')$$, 1, 'lock: still only one entry when more failures follow');
-- the lock ends after 15 minutes
insert into public.audit_logs (action, table_name, occurred_at, details) select 'auth.login_failed', 'auth', now() - interval '16 minutes', jsonb_build_object('email', 'old.person', 'key', md5('li-old')) from generate_series(1, 12);
select pg_temp.ok(not public.login_is_locked(md5('li-old')), 'lock: twelve failures that are older than 15 minutes do not lock');
-- alerts show it (login IDs with 5+ failures in 15 minutes)
select public.log_failed_login(md5('li-alert'), '******3333', true, '10.23.0.' || g, 'Test') from generate_series(1, 10) g;
select pg_temp.login_as('00000000-0000-4000-ff30-000000000001');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i::text like '%Sign-in locked for 15 minutes: ******3333%'), 'alerts: a locked sign-in is shown, with the masked label');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i::text like '%Failed sign-in for ******3333%'), 'alerts: and the repeated failures too');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i::text like '%******1111%'), 'alerts: 9 failures spread over IPs is not yet an alert');
select pg_temp.ok(position('li-alert' in public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500)::text) = 0, 'the keyed hash itself is never shown in the audit screen data');
select pg_temp.logout();

-- the emergency script's log entry: only the server may write it
select pg_temp.login_as('00000000-0000-4000-ff30-000000000001');
select pg_temp.throws($$select public.log_script_event('staff.password_reset_script', '{"x":1}')$$, 'even the Admin cannot write a script event from the app', '42501');
select pg_temp.logout();
select pg_temp.lives($$select public.log_script_event('staff.password_reset_script', '{"login":"******3210","password":"secret"}')$$, 'the server may write the script event');
select pg_temp.throws($$select public.log_script_event('anything.else', '{}')$$, 'only the known script event is accepted', '22023');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'staff.password_reset_script' and details::text like '%secret%'$$, 0, 'a password in the details is dropped, never stored');
