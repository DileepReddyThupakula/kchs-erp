-- Admin dashboard in one call: same numbers as the separate queries, Admin only. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000001', 'admin@ad.test');
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000002', 'duty@ad.test');
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000003', 't@ad.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1c000000-0000-4000-fe00-000000000001', '00000000-0000-4000-fe00-000000000001', 'admin',   'AD-ADM', 'Ad Admin'),
  ('1c000000-0000-4000-fe00-000000000002', '00000000-0000-4000-fe00-000000000002', 'teacher', 'AD-DUT', 'Ad Duty teacher'),
  ('1c000000-0000-4000-fe00-000000000003', '00000000-0000-4000-fe00-000000000003', 'teacher', 'AD-TCH', 'Ad Teacher');
insert into public.staff_permissions (staff_id, duty) values ('1c000000-0000-4000-fe00-000000000002', 'notices_diary'), ('1c000000-0000-4000-fe00-000000000002', 'all_class_attendance');
insert into public.academic_years (id, name, start_date, end_date) values ('2c000000-0000-4000-fe00-000000000001', 'AD-2088', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3e000000-0000-4000-fe00-000000000001', 'AD C1', 931);
insert into public.sections (id, academic_year_id, class_id, name) values
  ('3f000000-0000-4000-fe00-000000000001', '2c000000-0000-4000-fe00-000000000001', '3e000000-0000-4000-fe00-000000000001', 'A'),
  ('3f000000-0000-4000-fe00-000000000002', '2c000000-0000-4000-fe00-000000000001', '3e000000-0000-4000-fe00-000000000001', 'B');
-- two published notices (one expired, one live) and a draft
insert into public.notices (id, academic_year_id, title, body, audience, status, publish_date, expires_on, important, circular_no) values
  ('4c000000-0000-4000-fe00-000000000001', '2c000000-0000-4000-fe00-000000000001', 'AD live',    'Body text', 'all', 'published', app.today_ist() - 1, null, true, 'AD/1'),
  ('4c000000-0000-4000-fe00-000000000002', '2c000000-0000-4000-fe00-000000000001', 'AD expired', 'Body text', 'all', 'published', app.today_ist() - 20, app.today_ist() - 5, false, 'AD/2'),
  ('4c000000-0000-4000-fe00-000000000003', '2c000000-0000-4000-fe00-000000000001', 'AD draft',   'Body text', 'all', 'draft', app.today_ist(), null, false, null),
  ('4c000000-0000-4000-fe00-000000000004', '2c000000-0000-4000-fe00-000000000001', 'AD future',  'Body text', 'all', 'published', app.today_ist() + 3, null, false, 'AD/4');

select pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
create temp table _d as select public.admin_dashboard('2c000000-0000-4000-fe00-000000000001', app.today_ist()) d;
grant all on _d to authenticated;
select pg_temp.counts($$select (d -> 'counts' ->> 'sections')::int from _d$$, 2, 'dashboard: sections of the year');
select pg_temp.counts($$select (d -> 'counts' ->> 'classes')::int - (select count(*) from public.classes where is_active) from _d$$, 0, 'dashboard: classes = the classes table');
select pg_temp.counts($$select (d -> 'counts' ->> 'subjects')::int - (select count(*) from public.subjects where is_active) from _d$$, 0, 'dashboard: subjects = the subjects table');
select pg_temp.counts($$select (d -> 'counts' ->> 'active_staff')::int - (select count(*) from public.staff_directory() where status = 'active') from _d$$, 0, 'dashboard: active staff = the staff directory');
select pg_temp.counts($$select jsonb_array_length(d -> 'diary') from _d$$, 2, 'dashboard: one diary row per section of the year');
select pg_temp.counts($$select count(*) from _d, jsonb_array_elements(d -> 'notices') n where n ->> 'title' like 'AD %'$$, 1, 'dashboard: only the live published notice (not expired, draft or future)');
select pg_temp.counts($$select count(*) from _d, jsonb_array_elements(d -> 'notices') n where n ->> 'title' = 'AD live' and (n ->> 'important')::boolean and not (n ->> 'read')::boolean$$, 1, 'the live notice is important and unread by Admin');
select pg_temp.counts($$select case when (d -> 'unmarked')::text = (select coalesce(jsonb_agg(jsonb_build_object('section_id', u.section_id, 'section_label', u.section_label, 'session', u.session, 'staff_name', u.staff_name)), '[]'::jsonb)::text from public.unmarked_sessions(app.today_ist()) u) then 1 else 0 end from _d$$, 1, 'unmarked sessions = the existing function');
select pg_temp.counts($$select (d -> 'pending_leave')::int - (select count(*) from public.leave_requests where status = 'pending') from _d$$, 0, 'pending leave = the table');
-- a notice read by the admin flips the flag
select pg_temp.lives($$select public.mark_notice_read('4c000000-0000-4000-fe00-000000000001')$$, 'admin marks the notice read');
select pg_temp.counts($$select count(*) from jsonb_array_elements(public.admin_dashboard('2c000000-0000-4000-fe00-000000000001', app.today_ist()) -> 'notices') n where n ->> 'title' = 'AD live' and (n ->> 'read')::boolean$$, 1, 'then the dashboard shows it as read');

-- nobody else gets it
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
select pg_temp.throws($$select public.admin_dashboard('2c000000-0000-4000-fe00-000000000001', app.today_ist())$$, 'a teacher with duties cannot call it', '42501');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000003');
select pg_temp.throws($$select public.admin_dashboard('2c000000-0000-4000-fe00-000000000001', app.today_ist())$$, 'a plain teacher cannot call it', '42501');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.admin_dashboard('2c000000-0000-4000-fe00-000000000001', app.today_ist())$$, 'nor anonymous', '42501');
select pg_temp.logout();
update public.staff set status = 'inactive' where id = '1c000000-0000-4000-fe00-000000000001';
select pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
select pg_temp.throws($$select public.admin_dashboard('2c000000-0000-4000-fe00-000000000001', app.today_ist())$$, 'nor a deactivated admin', '42501');
