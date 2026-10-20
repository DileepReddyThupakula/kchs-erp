-- Module 9 audit log (database part): Admin only, IDs masked, exports logged, nothing editable or deletable, alerts. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000001', 'admin@au.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000002', 'teacher@au.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000003', 'office-fee@au.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000004', 'office-nofee@au.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000005', 'old-admin@au.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000006', 'other@au.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name, email, status) values
  ('1f000000-0000-4000-fb00-000000000001', '00000000-0000-4000-fb00-000000000001', 'admin',          'AU-ADM', 'Au Admin', 'admin@au.test', 'active'),
  ('1f000000-0000-4000-fb00-000000000002', '00000000-0000-4000-fb00-000000000002', 'teacher',        'AU-TCH', 'Au Teacher with every duty', 'teacher@au.test', 'active'),
  ('1f000000-0000-4000-fb00-000000000003', '00000000-0000-4000-fb00-000000000003', 'computer_staff', 'AU-OFF', 'Au Office with fee access', 'office-fee@au.test', 'active'),
  ('1f000000-0000-4000-fb00-000000000004', '00000000-0000-4000-fb00-000000000004', 'computer_staff', 'AU-NOF', 'Au Office without fee access', 'office-nofee@au.test', 'active'),
  ('1f000000-0000-4000-fb00-000000000005', '00000000-0000-4000-fb00-000000000005', 'admin',          'AU-OLD', 'Au Deactivated Admin', 'old-admin@au.test', 'inactive'),
  ('1f000000-0000-4000-fb00-000000000006', '00000000-0000-4000-fb00-000000000006', 'teacher',        'AU-OTH', 'Au Other Teacher', 'other@au.test', 'active');
insert into public.staff_permissions (staff_id, duty) select '1f000000-0000-4000-fb00-000000000002', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';
insert into public.staff_permissions (staff_id, duty) values ('1f000000-0000-4000-fb00-000000000003', 'fee_collection'), ('1f000000-0000-4000-fb00-000000000004', 'student_records');

insert into public.academic_years (id, name, start_date, end_date) values ('2f000000-0000-4000-fb00-000000000001', 'AU-2081-82', '2081-04-01', '2082-03-31');
insert into public.classes (id, name, sort_order) values ('3a300000-0000-4000-fb00-000000000001', 'AU Class', 972);
insert into public.sections (id, academic_year_id, class_id, name) values ('3b300000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', 'A');
insert into public.subjects (id, name, code) values ('5f300000-0000-4000-fb00-000000000001', 'AU Maths', 'AUM');
insert into public.fee_heads (id, name, code, sort_order) values ('62100000-0000-4000-fb00-000000000001', 'AU Tuition', 'AU-TUI', 93);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63100000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', 'AU Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values
  ('2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '62100000-0000-4000-fb00-000000000001', 1200000, '63100000-0000-4000-fb00-000000000001');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('55300000-0000-4000-fb00-000000000001', 'AU-0001', 'Au Student', 'male', '2070-01-01', '2078-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) values ('55300000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', '3b300000-0000-4000-fb00-000000000001');
insert into public.exam_components (id, academic_year_id, class_id, name, max_marks, sort_order) values
  ('65300000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', 'AU FA1', 20, 1),
  ('65300000-0000-4000-fb00-000000000002', '2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', 'AU FA2', 20, 2);
insert into public.marks (academic_year_id, class_id, section_id, student_id, component_id, subject_id, status, marks) values
  ('2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '3b300000-0000-4000-fb00-000000000001', '55300000-0000-4000-fb00-000000000001', '65300000-0000-4000-fb00-000000000001', '5f300000-0000-4000-fb00-000000000001', 'marked', 10),
  ('2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '3b300000-0000-4000-fb00-000000000001', '55300000-0000-4000-fb00-000000000001', '65300000-0000-4000-fb00-000000000002', '5f300000-0000-4000-fb00-000000000001', 'marked', 10);

-- ================= baseline of the alerts (the dev database may already hold real entries)
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
create temp table _base as select public.audit_alerts(7) j;
grant all on _base to authenticated;
select pg_temp.logout();

-- ================= things that happen (each one writes the log the normal way)
select pg_temp.login_as('00000000-0000-4000-fb00-000000000003');
select pg_temp.lives($$select public.collect_fee('55300000-0000-4000-fb00-000000000001', 50000, 'cash')$$, 'setup: a payment is collected');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.lives($$select public.cancel_fee_receipt((select id from public.fee_receipts where student_id = '55300000-0000-4000-fb00-000000000001' limit 1), 'Wrong amount typed')$$, 'setup: Admin cancels the receipt with a reason');
select public.log_event('student.ids_revealed', 'students', '55300000-0000-4000-fb00-000000000001', '{"aadhaar_no":"234567890123","note":"viewed 234567890123 on screen"}');
select pg_temp.logout();
update public.students set full_name = 'Au Student Renamed' where id = '55300000-0000-4000-fb00-000000000001';
update public.staff set app_role = 'computer_staff' where id = '1f000000-0000-4000-fb00-000000000006';   -- role changed
update public.staff set status = 'inactive' where id = '1f000000-0000-4000-fb00-000000000006';           -- deactivated
insert into public.staff_permissions (staff_id, duty) values ('1f000000-0000-4000-fb00-000000000004', 'notices_diary');   -- duty given
update public.exam_components set locked_at = now(), locked_by = '1f000000-0000-4000-fb00-000000000001' where id = '65300000-0000-4000-fb00-000000000001';
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.lives($$select public.unlock_exam_component('65300000-0000-4000-fb00-000000000001', 'Teacher found a typing mistake')$$, 'setup: Admin unlocks the exam with a reason');
select pg_temp.logout();
update public.marks set marks = 15 where component_id = '65300000-0000-4000-fb00-000000000001';   -- changed AFTER unlock -> alert
update public.marks set marks = 16 where component_id = '65300000-0000-4000-fb00-000000000002';   -- exam never unlocked -> no alert
-- failed sign-ins (nobody is signed in): 5 on one address, 4 on another, 25 on a third (throttled)
-- the function is for the app server only (service key); here the test runs as the database owner, with a different IP for each call
select public.log_failed_login('victim-au@school.test', '10.1.0.' || g, 'Test Browser/1.0') from generate_series(1, 5) g;
select public.log_failed_login('calm-au@school.test', '10.2.0.' || g, 'Test Browser/1.0') from generate_series(1, 4) g;
select public.log_failed_login('flood-au@school.test', '10.3.0.' || g, 'Test Browser/1.0') from generate_series(1, 25) g;
select public.log_failed_login('not an email', '10.4.0.1', null), public.log_failed_login(null, null, null), public.log_failed_login(repeat('a', 300) || '@x.test', null, null);
-- one attacker address trying many different accounts: only 10 a minute are written for that address
select public.log_failed_login('spray' || g || '-au@school.test', '10.9.9.9', 'Attacker/1.0') from generate_series(1, 30) g;
-- ...and that does not use up anyone else's allowance
select public.log_failed_login('honest-au@school.test', '10.8.8.8', 'Real Browser/1.0');
select pg_temp.logout();

-- ================= the Admin sees it, in plain words
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
create temp table _now as select public.audit_alerts(7) j;
grant all on _now to authenticated;
create function pg_temp.alert_delta(p_key text) returns int language sql as $$
  select coalesce((select (i ->> 'count')::int from _now, jsonb_array_elements(j -> 'items') i where i ->> 'key' = p_key), 0)
       - coalesce((select (i ->> 'count')::int from _base, jsonb_array_elements(j -> 'items') i where i ->> 'key' = p_key), 0)
$$;
grant execute on function pg_temp.alert_delta(text) to authenticated;
select pg_temp.ok(pg_temp.alert_delta('ids_revealed') = 1, 'alert: full IDs viewed (+1)', pg_temp.alert_delta('ids_revealed')::text);
select pg_temp.ok(pg_temp.alert_delta('receipts_cancelled') = 1, 'alert: receipt cancelled (+1)', pg_temp.alert_delta('receipts_cancelled')::text);
select pg_temp.ok(exists (select 1 from _now, jsonb_array_elements(j -> 'items') i, jsonb_array_elements(i -> 'rows') r where i ->> 'key' = 'receipts_cancelled' and r ->> 'text' like '%Wrong amount typed%'), 'alert: the cancel reason is shown');
select pg_temp.ok(pg_temp.alert_delta('exams_unlocked') = 1, 'alert: exam unlocked (+1)', pg_temp.alert_delta('exams_unlocked')::text);
select pg_temp.ok(pg_temp.alert_delta('marks_after_unlock') = 1, 'alert: a mark changed after an unlock (+1); the exam that was never unlocked does not count', pg_temp.alert_delta('marks_after_unlock')::text);
select pg_temp.ok(pg_temp.alert_delta('roles_changed') = 1, 'alert: role changed (+1)', pg_temp.alert_delta('roles_changed')::text);
select pg_temp.ok(pg_temp.alert_delta('staff_deactivated') = 1, 'alert: staff deactivated (+1)', pg_temp.alert_delta('staff_deactivated')::text);
select pg_temp.ok(pg_temp.alert_delta('duties_changed') >= 1, 'alert: duty given (counted)', pg_temp.alert_delta('duties_changed')::text);
select pg_temp.ok(pg_temp.alert_delta('failed_logins') = 25, 'alert: failed sign-ins count only for addresses with 5+ in 15 minutes (5 + the 20 recorded for the flooded one; the address with 4 does not count)', pg_temp.alert_delta('failed_logins')::text);
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'email' = 'flood-au@school.test'$$, 20, 'failed sign-ins: at most 20 per address per hour are written (flooding is throttled)');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'ip' = '10.9.9.9'$$, 10, 'failed sign-ins: one IP address writes at most 10 a minute');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'email' = 'honest-au@school.test' and details ->> 'ip' = '10.8.8.8' and details ->> 'user_agent' = 'Real Browser/1.0'$$, 1, 'failed sign-ins: another IP address is not blocked by the attacker, and its IP and browser are recorded');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'auth.login_failed' and (details ->> 'email' is null or details ->> 'email' not like '%@%')$$, 0, 'failed sign-ins: malformed / empty / over-long addresses are not written');
select pg_temp.ok((public.admin_dashboard('2f000000-0000-4000-fb00-000000000001', current_date) -> 'alerts' -> 'items') is not null, 'Admin dashboard carries the alerts in the same single call');

-- entries: filters, plain words, masking
select pg_temp.ok((public.audit_entries(now() - interval '1 hour', null, null, 'fees') ->> 'total')::int >= 2, 'entries: filter by kind "fees and receipts"');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, 'fees', null, null, null, 500) -> 'rows') r where r ->> 'kind' <> 'fees'), 'entries: the kind filter returns only that kind');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, '00000000-0000-4000-fb00-000000000001', null, null, null, null, 500) -> 'rows') r where r ->> 'summary' like 'Cancelled receipt%Wrong amount typed'), 'entries: person filter + a cancellation reads in plain words');
select pg_temp.ok((public.audit_entries(now() + interval '1 day', now() + interval '2 days') ->> 'total')::int = 0, 'entries: a date range with nothing in it is empty');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, 'students', 'students', '55300000-0000-4000-fb00-000000000001', null, 50) -> 'rows') r, jsonb_array_elements(r -> 'changes') c
                           where c ->> 'field' = 'full name' and c ->> 'before' = 'Au Student' and c ->> 'after' = 'Au Student Renamed'), 'entries: a change shows plain before / after for the changed field');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, 'students', 'students', '55300000-0000-4000-fb00-000000000001', null, 50) -> 'rows') r, jsonb_array_elements(r -> 'changes') c
                               where c ->> 'field' in ('updated at', 'updated by', 'created at')), 'entries: only changed fields are listed (no timestamps noise)');
select pg_temp.ok(position('234567890123' in public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500)::text) = 0, 'entries: a 12-digit ID number never appears, anywhere in the output');
select pg_temp.ok(position('XXXXXXXX0123' in public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500)::text) > 0, 'entries: it appears masked (last four only)');
select pg_temp.ok(jsonb_array_length(public.audit_record_history('students', '55300000-0000-4000-fb00-000000000001')) >= 2, 'one record''s history: insert and rename both listed');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_actors()) a where a ->> 'name' = 'Au Admin'), 'person filter: lists the people who appear in the log');

-- masking helpers directly
select pg_temp.logout();
select pg_temp.ok(app.audit_clean('{"aadhaar_no":"234567890123","name":"A","note":"id 234567890123 here","password":"abc","api_key":"k","nested":{"udid":"UD12345678","ok":"fine"}}'::jsonb)
  = '{"aadhaar_no":"XXXXXXXX0123","name":"A","note":"id XXXXXXXX0123 here","password":"[hidden]","api_key":"[hidden]","nested":{"udid":"XXXXXXXX5678","ok":"fine"}}'::jsonb, 'masking: ID-type keys and 12-digit numbers masked; passwords and keys hidden, even nested');
select pg_temp.ok(app.audit_clean('{"admission_no":"AU-0001","phone":"9000000001","amount":12345678901}'::jsonb) = '{"admission_no":"AU-0001","phone":"9000000001","amount":12345678901}'::jsonb, 'masking: admission numbers, phones and amounts are left alone');

-- export is logged in the same call
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
create temp table _ex as select public.audit_export('xlsx', now() - interval '1 hour', null, null, 'fees') j;
grant all on _ex to authenticated;
select pg_temp.ok(jsonb_array_length((select j from _ex)) >= 2, 'export: returns the filtered entries');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'report.export' and details ->> 'report' = 'audit-log' and details ->> 'format' = 'xlsx' and actor_user_id = '00000000-0000-4000-fb00-000000000001' and details #>> '{filters,kind}' = 'fees'), 'export: the export itself is in the log (who, format, filters)');
select pg_temp.ok(position('234567890123' in (select j::text from _ex)) = 0, 'export: IDs are masked');
select pg_temp.throws($$select public.audit_export('docx')$$, 'export: unknown format refused', '23514');

-- ================= nobody can edit or delete an entry, not even the Admin
select pg_temp.throws($$update public.audit_logs set action = 'tampered'$$, 'Admin: cannot update an audit row', '42501');
select pg_temp.throws($$delete from public.audit_logs$$, 'Admin: cannot delete an audit row', '42501');
select pg_temp.throws($$delete from public.audit_logs where id = (select max(id) from public.audit_logs)$$, 'Admin: cannot delete one specific audit row', '42501');
select pg_temp.throws($$insert into public.audit_logs (action) values ('forged')$$, 'Admin: cannot write an audit row directly (rows come only from the system)', '42501');
select pg_temp.throws($$truncate public.audit_logs$$, 'Admin: cannot empty the audit log', '42501');
select pg_temp.logout();
select pg_temp.throws($$update public.audit_logs set action = 'tampered'$$, 'database owner: update is blocked by the trigger', '42501');
select pg_temp.throws($$delete from public.audit_logs$$, 'database owner: delete is blocked by the trigger', '42501');
select pg_temp.throws($$truncate public.audit_logs$$, 'database owner: truncate is blocked by the trigger', '42501');
grant all on _results to service_role;
grant all on sequence _results_n_seq to service_role;
select set_config('role', 'service_role', true);
select pg_temp.throws($$update public.audit_logs set action = 'tampered'$$, 'service key: cannot update', '42501');
select pg_temp.throws($$delete from public.audit_logs$$, 'service key: cannot delete', '42501');
select pg_temp.throws($$insert into public.audit_logs (action) values ('forged')$$, 'service key: cannot forge a row', '42501');
select pg_temp.throws($$truncate public.audit_logs$$, 'service key: cannot truncate', '42501');
select pg_temp.logout();

-- ================= everyone else is refused
create function pg_temp.refused(p_who text) returns void language plpgsql as $$
declare f text;
begin
  foreach f in array array[
    $q$select public.audit_entries()$q$,
    $q$select public.audit_record_history('students', 'x')$q$,
    $q$select public.audit_actors()$q$,
    $q$select public.audit_export('csv')$q$,
    $q$select public.audit_alerts(7)$q$,
    $q$select public.admin_dashboard('2f000000-0000-4000-fb00-000000000001', current_date)$q$] loop
    perform pg_temp.throws(f, p_who || ': refused — ' || split_part(f, '(', 1), '42501');
  end loop;
end $$;
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002'); select pg_temp.refused('teacher (every duty but fees)');
select pg_temp.counts($$select count(*) from public.audit_logs$$, 0, 'teacher: reads no audit rows directly either');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000003'); select pg_temp.refused('office with fee access');
select pg_temp.counts($$select count(*) from public.audit_logs$$, 0, 'office with fee access: reads no audit rows directly');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000004'); select pg_temp.refused('office without fee access');
select pg_temp.counts($$select count(*) from public.audit_logs$$, 0, 'office without fee access: reads no audit rows directly');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000005'); select pg_temp.refused('deactivated Admin');
select pg_temp.counts($$select count(*) from public.audit_logs$$, 0, 'deactivated Admin: reads no audit rows directly');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000006'); select pg_temp.refused('deactivated teacher');
select pg_temp.login_as(null); select pg_temp.refused('not signed in');
select pg_temp.throws($$select count(*) from public.audit_logs$$, 'not signed in: cannot read the audit table at all', '42501');
select pg_temp.throws($$select public.log_failed_login('anon-bad@school.test', '10.5.5.5', 'x')$$, 'not signed in: can no longer call the failed sign-in log directly (only the app server can)', '42501');
select pg_temp.throws($$select public.log_event('x')$$, 'not signed in: cannot write other log events', '42501');
select pg_temp.logout();

-- ================= each alert opens exactly the entries that triggered it
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
create function pg_temp.alert_total(p_key text) returns int language sql as $$
  select coalesce((select (i ->> 'count')::int from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i ->> 'key' = p_key), 0)
$$;
grant execute on function pg_temp.alert_total(text) to authenticated;
create function pg_temp.alert_listed(p_key text) returns int language sql as $$
  select (public.audit_entries((date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '6 days') at time zone 'Asia/Kolkata', null, null, null, null, null, null, 1, 0, p_key) ->> 'total')::int
$$;
grant execute on function pg_temp.alert_listed(text) to authenticated;
select pg_temp.ok(pg_temp.alert_total(k) = pg_temp.alert_listed(k), 'alert link "' || k || '": the page lists exactly as many entries as the card counts', pg_temp.alert_total(k) || ' vs ' || pg_temp.alert_listed(k))
  from unnest(array['ids_revealed','receipts_cancelled','exams_unlocked','marks_after_unlock','failed_logins','duties_changed','roles_changed','staff_deactivated']) k;
select pg_temp.ok((select min(pg_temp.alert_total(k)) from unnest(array['receipts_cancelled','exams_unlocked','marks_after_unlock','roles_changed','staff_deactivated','failed_logins','ids_revealed']) k) >= 1, 'every alert kind has at least one entry in this test, so the comparison above is not empty');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500, 0, 'receipts_cancelled') -> 'rows') r where r ->> 'summary' not like 'Cancelled receipt%'), 'receipts link: only cancellations, no other receipt change');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500, 0, 'exams_unlocked') -> 'rows') r where r ->> 'summary' not like 'Unlocked%'), 'exams link: only unlocks');
select pg_temp.ok((public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500, 0, 'marks_after_unlock') ->> 'total')::int = 1, 'marks link: only the mark changed after the unlock (the other exam''s change is not listed)');
select pg_temp.ok((public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 500, 0, 'nonsense') ->> 'total')::int = 0, 'an unknown alert name lists nothing');
select pg_temp.logout();
