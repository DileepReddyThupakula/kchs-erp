-- Diary Part A rules in the database: Telugu states, expected subjects from assignments, cap, service-only functions. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000001', 'admin@dt.test');
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000002', 'duty@dt.test');
select pg_temp.fixture_user('00000000-0000-4000-fa00-000000000003', 't@dt.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1e000000-0000-4000-fa00-000000000001', '00000000-0000-4000-fa00-000000000001', 'admin',   'DT-ADM', 'Dt Admin'),
  ('1e000000-0000-4000-fa00-000000000002', '00000000-0000-4000-fa00-000000000002', 'teacher', 'DT-DUT', 'Dt Duty'),
  ('1e000000-0000-4000-fa00-000000000003', '00000000-0000-4000-fa00-000000000003', 'teacher', 'DT-T',   'Dt Teacher');
-- the next Monday (always a working day), so the tests do not depend on the weekday they run on
create function pg_temp.mon() returns date language sql as $$ select app.today_ist() + (8 - extract(isodow from app.today_ist())::int) $$;
create function pg_temp.mo() returns integer language sql as $$ select pg_temp.mon() - app.today_ist() $$;
grant execute on function pg_temp.mon(), pg_temp.mo() to authenticated;
insert into public.staff_permissions (staff_id, duty) values ('1e000000-0000-4000-fa00-000000000002', 'notices_diary');
insert into public.academic_years (id, name, start_date, end_date) values ('2e000000-0000-4000-fa00-000000000001', 'DT-2086', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3e000000-0000-4000-fa00-000000000001', 'DT C1', 961);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3f000000-0000-4000-fa00-000000000001', '2e000000-0000-4000-fa00-000000000001', '3e000000-0000-4000-fa00-000000000001', 'A', '1e000000-0000-4000-fa00-000000000003');
insert into public.subjects (id, name, code, name_te) values
  ('5e000000-0000-4000-fa00-000000000001', 'DT Maths', 'DTM', 'గణితం'), ('5e000000-0000-4000-fa00-000000000002', 'DT Art', 'DTA', null), ('5e000000-0000-4000-fa00-000000000003', 'DT Music', 'DTU', null);
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1e000000-0000-4000-fa00-000000000003', '3f000000-0000-4000-fa00-000000000001', '5e000000-0000-4000-fa00-000000000001'),
  ('1e000000-0000-4000-fa00-000000000003', '3f000000-0000-4000-fa00-000000000001', '5e000000-0000-4000-fa00-000000000002'),
  ('1e000000-0000-4000-fa00-000000000002', '3f000000-0000-4000-fa00-000000000001', '5e000000-0000-4000-fa00-000000000003');
-- the timetable only orders: Art is in period 1, Maths in period 3, Music is not in the timetable
insert into public.timetable_entries (academic_year_id, section_id, weekday, period_no, subject_id, teacher_id) values
  ('2e000000-0000-4000-fa00-000000000001', '3f000000-0000-4000-fa00-000000000001', extract(isodow from pg_temp.mon())::int, 1, '5e000000-0000-4000-fa00-000000000002', '1e000000-0000-4000-fa00-000000000003'),
  ('2e000000-0000-4000-fa00-000000000001', '3f000000-0000-4000-fa00-000000000001', extract(isodow from pg_temp.mon())::int, 3, '5e000000-0000-4000-fa00-000000000001', '1e000000-0000-4000-fa00-000000000003');

create function pg_temp.sub(p_subj text, p_body text, p_go boolean, p_te text default null) returns uuid language sql as $$
  select public.submit_diary(jsonb_build_object('section_id', '3f000000-0000-4000-fa00-000000000001', 'entry_date', pg_temp.mon(), 'subject_id', p_subj, 'kind', 'subject', 'body', p_body, 'body_te', p_te, 'submit', p_go))
$$;
grant execute on function pg_temp.sub(text, text, boolean, text) to authenticated;
create function pg_temp.adm(p_subj text, p_body text, p_te text) returns uuid language sql as $$
  select public.admin_save_diary_line(jsonb_build_object('section_id', '3f000000-0000-4000-fa00-000000000001', 'entry_date', pg_temp.mon(), 'subject_id', p_subj, 'kind', 'subject', 'body', p_body, 'body_te', p_te))
$$;
grant execute on function pg_temp.adm(text, text, text) to authenticated;

-- expected subjects come from assignments; the timetable orders them
select pg_temp.login_as('00000000-0000-4000-fa00-000000000002');
select pg_temp.counts($$select count(*) from public.diary_class_plan('3f000000-0000-4000-fa00-000000000001', pg_temp.mon())$$, 3, 'plan: all three assigned subjects, including the one not in the timetable');
select pg_temp.counts($$select count(*) from (select subject_id, row_number() over () ord from public.diary_class_plan('3f000000-0000-4000-fa00-000000000001', pg_temp.mon())) x where (ord = 1 and subject_id = '5e000000-0000-4000-fa00-000000000002') or (ord = 3 and subject_id = '5e000000-0000-4000-fa00-000000000003')$$, 2, 'plan: timetable order first (Art, then Maths), the untimetabled subject last');
select pg_temp.counts($$select expected from public.diary_board(pg_temp.mon()) where section_id = '3f000000-0000-4000-fa00-000000000001'$$, 3, 'board: expected = 3 (from assignments)');

-- teacher: Telugu typed by a teacher is ignored; submit marks it pending
select pg_temp.login_as('00000000-0000-4000-fa00-000000000003');
select pg_temp.lives($$select pg_temp.sub('5e000000-0000-4000-fa00-000000000001', 'Maths: Ex 5.1 q 1-6', false, 'teacher typed telugu')$$, 'teacher saves a draft with Telugu in the request');
select pg_temp.counts($$select count(*) from public.diary_entries where body_te is not null and entry_date = pg_temp.mon()$$, 0, 'teacher-typed Telugu was ignored');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'none' and entry_date = pg_temp.mon()$$, 1, 'a draft has no translation pending');
select pg_temp.lives($$select pg_temp.sub('5e000000-0000-4000-fa00-000000000001', 'Maths: Ex 5.1 q 1-6', true)$$, 'teacher submits');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'pending' and entry_date = pg_temp.mon()$$, 1, 'submit: Telugu is pending');

-- service-only functions
select pg_temp.throws($$select public.apply_diary_translation((select id from public.diary_entries limit 1), 'x', 'y')$$, 'teacher cannot call apply_diary_translation', '42501');
select pg_temp.throws($$select public.translation_reserve(10)$$, 'teacher cannot reserve translation characters', '42501');
select pg_temp.throws($$select * from public.translation_status()$$, 'teacher cannot read translation status', '42501');
select pg_temp.throws($$select * from public.translation_cache$$, 'teacher cannot read the translation cache', '42501');

-- the server (service role) stores a machine translation
select pg_temp.login_as(null);
select set_config('role', 'postgres', true);
select pg_temp.counts($$select case when public.apply_diary_translation((select id from public.diary_entries where entry_date = pg_temp.mon() and body like 'Maths%'), 'గణితం: అభ్యాసం 5.1', 'wronghash') then 1 else 0 end$$, 0, 'a translation for outdated English is not applied');
select pg_temp.counts($$select case when public.apply_diary_translation((select id from public.diary_entries where entry_date = pg_temp.mon() and body like 'Maths%'), 'గణితం: అభ్యాసం 5.1 ప్రశ్న 1-6', md5('Maths: Ex 5.1 q 1-6')) then 1 else 0 end$$, 1, 'a translation for the current English is stored');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'auto' and body_te is not null and entry_date = pg_temp.mon()$$, 1, 'status is auto-translated');

-- teacher resubmits the same English: Telugu kept; new English: Telugu cleared and pending again
select pg_temp.login_as('00000000-0000-4000-fa00-000000000003');
select pg_temp.lives($$select pg_temp.sub('5e000000-0000-4000-fa00-000000000001', 'Maths: Ex 5.1 q 1-6', true)$$, 'resubmit unchanged English');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'auto' and entry_date = pg_temp.mon()$$, 1, 'unchanged English: no new translation needed');
select pg_temp.lives($$select pg_temp.sub('5e000000-0000-4000-fa00-000000000001', 'Maths: Ex 5.2 q 1-8', true)$$, 'teacher changes the English');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'pending' and body_te is null and entry_date = pg_temp.mon()$$, 1, 'changed English: old Telugu removed, pending again');

-- Admin / duty edit makes Telugu reviewed; reviewed is never overwritten
select pg_temp.login_as('00000000-0000-4000-fa00-000000000002');
select pg_temp.lives($$select pg_temp.adm('5e000000-0000-4000-fa00-000000000001', 'Maths: Ex 5.2 q 1-8', 'గణితం: అభ్యాసం 5.2, ప్రశ్నలు 1-8')$$, 'duty types the Telugu');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'reviewed' and entry_date = pg_temp.mon()$$, 1, 'typed Telugu is reviewed');
select pg_temp.login_as(null);
select set_config('role', 'postgres', true);
select pg_temp.counts($$select case when public.apply_diary_translation((select id from public.diary_entries where entry_date = pg_temp.mon() and body like 'Maths%'), 'machine text', md5('Maths: Ex 5.2 q 1-8')) then 1 else 0 end$$, 0, 'a machine translation never overwrites reviewed Telugu');
select pg_temp.login_as('00000000-0000-4000-fa00-000000000002');
select pg_temp.lives($$select pg_temp.adm('5e000000-0000-4000-fa00-000000000001', 'Maths: Ex 5.3 q 1-8', 'గణితం: అభ్యాసం 5.2, ప్రశ్నలు 1-8')$$, 'duty edits only the English');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'reviewed' and body_te like '%5.2%' and body like '%5.3%'$$, 1, 'English changed: reviewed Telugu is kept');
select pg_temp.lives($$select pg_temp.adm('5e000000-0000-4000-fa00-000000000002', 'Art: draw a poster', null)$$, 'duty adds a line without Telugu');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'pending' and body like 'Art%'$$, 1, 'a new line without Telugu is pending');
select pg_temp.lives($$select pg_temp.adm('5e000000-0000-4000-fa00-000000000002', 'Art: draw a poster', 'కళ: పోస్టర్ గీయండి')$$, 'duty types Telugu for it');
select pg_temp.lives($$select pg_temp.adm('5e000000-0000-4000-fa00-000000000002', 'Art: draw a poster', '')$$, 'duty clears the Telugu');
select pg_temp.counts($$select count(*) from public.diary_entries where te_status = 'pending' and body like 'Art%' and body_te is null$$, 1, 'cleared Telugu goes back to pending');

-- cap and usage
select pg_temp.login_as('00000000-0000-4000-fa00-000000000001');
update public.school_settings set translation_monthly_cap = 100 where id = 1;
select pg_temp.counts($$select cap from public.translation_status()$$, 100, 'Admin reads the cap');
select pg_temp.login_as(null);
select set_config('role', 'postgres', true);
delete from public.translation_usage;
select pg_temp.counts($$select case when public.translation_reserve(60) then 1 else 0 end$$, 1, 'reserve 60 of 100');
select pg_temp.counts($$select case when public.translation_reserve(50) then 1 else 0 end$$, 0, 'reserving past the cap is refused');
select pg_temp.counts($$select chars from public.translation_usage$$, 60, 'a refused reservation counts nothing');
select pg_temp.counts($$select case when public.translation_reserve(40) then 1 else 0 end$$, 1, 'exactly up to the cap is allowed');
select pg_temp.login_as('00000000-0000-4000-fa00-000000000001');
select pg_temp.counts($$select used from public.translation_status()$$, 100, 'Admin sees usage at 100');
select pg_temp.login_as('00000000-0000-4000-fa00-000000000002');
select pg_temp.throws($$select * from public.translation_status()$$, 'duty teacher cannot read the translation status (Admin only)', '42501');
