-- Diary workflow: teachers submit, Admin / duty review and publish. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-f900-000000000001', 'admin@dw.test');
select pg_temp.fixture_user('00000000-0000-4000-f900-000000000002', 'duty@dw.test');
select pg_temp.fixture_user('00000000-0000-4000-f900-000000000003', 'ct@dw.test');
select pg_temp.fixture_user('00000000-0000-4000-f900-000000000004', 'eng@dw.test');
select pg_temp.fixture_user('00000000-0000-4000-f900-000000000005', 'other@dw.test');
select pg_temp.fixture_user('00000000-0000-4000-f900-000000000006', 'sci2@dw.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1d000000-0000-4000-f900-000000000001', '00000000-0000-4000-f900-000000000001', 'admin',   'DW-ADM', 'Dw Admin'),
  ('1d000000-0000-4000-f900-000000000002', '00000000-0000-4000-f900-000000000002', 'teacher', 'DW-DUT', 'Dw Duty'),
  ('1d000000-0000-4000-f900-000000000003', '00000000-0000-4000-f900-000000000003', 'teacher', 'DW-CT',  'Dw Maths + class teacher of A'),
  ('1d000000-0000-4000-f900-000000000004', '00000000-0000-4000-f900-000000000004', 'teacher', 'DW-ENG', 'Dw English teacher'),
  ('1d000000-0000-4000-f900-000000000005', '00000000-0000-4000-f900-000000000005', 'teacher', 'DW-OTH', 'Dw Unassigned'),
  ('1d000000-0000-4000-f900-000000000006', '00000000-0000-4000-f900-000000000006', 'teacher', 'DW-SC2', 'Dw second Science teacher');
-- the next Monday (always a working day), so the tests do not depend on the weekday they run on
create function pg_temp.mon() returns date language sql as $$ select app.today_ist() + (8 - extract(isodow from app.today_ist())::int) $$;
create function pg_temp.mo() returns integer language sql as $$ select pg_temp.mon() - app.today_ist() $$;
grant execute on function pg_temp.mon(), pg_temp.mo() to authenticated;
insert into public.staff_permissions (staff_id, duty) values ('1d000000-0000-4000-f900-000000000002', 'notices_diary');
insert into public.academic_years (id, name, start_date, end_date) values
  ('2d000000-0000-4000-f900-000000000001', 'DW-2085', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3e000000-0000-4000-f900-000000000001', 'DW C1', 971);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3f000000-0000-4000-f900-000000000001', '2d000000-0000-4000-f900-000000000001', '3e000000-0000-4000-f900-000000000001', 'A', '1d000000-0000-4000-f900-000000000003'),
  ('3f000000-0000-4000-f900-000000000002', '2d000000-0000-4000-f900-000000000001', '3e000000-0000-4000-f900-000000000001', 'B', null);
insert into public.subjects (id, name, code) values
  ('5d000000-0000-4000-f900-000000000001', 'DW Maths', 'DWM'), ('5d000000-0000-4000-f900-000000000002', 'DW English', 'DWE'), ('5d000000-0000-4000-f900-000000000003', 'DW Science', 'DWS');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1d000000-0000-4000-f900-000000000003', '3f000000-0000-4000-f900-000000000001', '5d000000-0000-4000-f900-000000000001'),
  ('1d000000-0000-4000-f900-000000000004', '3f000000-0000-4000-f900-000000000001', '5d000000-0000-4000-f900-000000000002'),
  ('1d000000-0000-4000-f900-000000000003', '3f000000-0000-4000-f900-000000000002', '5d000000-0000-4000-f900-000000000003'),
  ('1d000000-0000-4000-f900-000000000006', '3f000000-0000-4000-f900-000000000002', '5d000000-0000-4000-f900-000000000003');
-- the timetable expects Maths and English in A, tomorrow's weekday
insert into public.timetable_entries (academic_year_id, section_id, weekday, period_no, subject_id, teacher_id) values
  ('2d000000-0000-4000-f900-000000000001', '3f000000-0000-4000-f900-000000000001', extract(isodow from pg_temp.mon())::int, 1, '5d000000-0000-4000-f900-000000000001', '1d000000-0000-4000-f900-000000000003'),
  ('2d000000-0000-4000-f900-000000000001', '3f000000-0000-4000-f900-000000000001', extract(isodow from pg_temp.mon())::int, 2, '5d000000-0000-4000-f900-000000000002', '1d000000-0000-4000-f900-000000000004');

create function pg_temp.sub(p_sec text, p_day integer, p_subj text, p_body text, p_go boolean, p_kind text default 'subject', p_te text default null)
returns uuid language sql as $$
  select public.submit_diary(jsonb_build_object('section_id', p_sec, 'entry_date', app.today_ist() + p_day, 'subject_id', p_subj,
    'kind', p_kind, 'body', p_body, 'body_te', p_te, 'submit', p_go))
$$;
grant execute on function pg_temp.sub(text, integer, text, text, boolean, text, text) to authenticated;

-- =====================================================================
-- Teachers: only their own subject / section / dates
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f900-000000000005');   -- unassigned
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000001', 'Maths work', true)$$, 'unassigned teacher: cannot submit', '42501');
select pg_temp.login_as('00000000-0000-4000-f900-000000000003');   -- Maths in A and B-science, class teacher of A
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000002', 'English work', true)$$, 'a subject that is not theirs in that section: refused', '42501');
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000002', pg_temp.mo(), '5d000000-0000-4000-f900-000000000001', 'Maths in B', true)$$, 'a section where they do not teach that subject: refused', '42501');
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', -1, '5d000000-0000-4000-f900-000000000001', 'Yesterday', true)$$, 'a past date is refused', '23514');
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', 8, '5d000000-0000-4000-f900-000000000001', 'Too far', true)$$, 'more than 7 days ahead is refused', '23514');
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000001', 'x', true)$$, 'a one-letter text is refused', '23514');
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', 7, '5d000000-0000-4000-f900-000000000001', 'Seven days ahead', false)$$, '7 days ahead is allowed');
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', 0, '5d000000-0000-4000-f900-000000000001', 'Today work', false)$$, 'today is allowed');
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000001', 'Maths: ex 3 (draft)', false)$$, 'saves a draft');
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000001', 'Maths: ex 3', true, 'subject', 'గణితం: అభ్యాసం 3')$$, 'resubmits (updates) with Telugu text');
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.mon() and subject_id = '5d000000-0000-4000-f900-000000000001' and kind = 'subject'$$, 1, 'one entry per section, date and subject');
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.mon() and status = 'submitted' and body_te is null$$, 1, 'status is submitted; Telugu typed by a teacher is ignored (it is generated)');
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), null, 'Class remark: PTM on Friday', true, 'remark')$$, 'class teacher: adds the class remark');
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000002', pg_temp.mo(), null, 'Remark for B', true, 'remark')$$, 'but not for a section they are not class teacher of', '42501');
select pg_temp.throws($$insert into public.diary_entries (academic_year_id, entry_date, body) values ('2d000000-0000-4000-f900-000000000001', app.today_ist(), 'direct')$$, 'direct insert is refused', '42501');
select pg_temp.affects($$update public.diary_entries set body = 'hacked'$$, 0, 'direct update changes nothing');
select pg_temp.affects($$delete from public.diary_entries$$, 0, 'direct delete changes nothing');
select pg_temp.throws($$select public.publish_class_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon())$$, 'teacher: cannot publish', '42501');
select pg_temp.throws($$select public.admin_save_diary_line(jsonb_build_object('section_id', '3f000000-0000-4000-f900-000000000001', 'entry_date', pg_temp.mon(), 'subject_id', '5d000000-0000-4000-f900-000000000001', 'body', 'edit by teacher'))$$, 'teacher: cannot use the admin edit', '42501');
select pg_temp.throws($$select public.diary_board(pg_temp.mon())$$, 'teacher: cannot read the board', '42501');
select pg_temp.throws($$select public.remind_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon(), '5d000000-0000-4000-f900-000000000002')$$, 'teacher: cannot send reminders', '42501');
select pg_temp.throws($$select public.log_message('diary', 'group', null, null, null, 'app', 'x')$$, 'teacher: cannot log a share (no sharing)', '42501');
select pg_temp.counts($$select count(*) from public.diary_entries where author_id = app.current_staff_id()$$, (3 + (pg_temp.mo() <> 7)::int), 'author sees their own drafts and submissions');

-- =====================================================================
-- Privacy of drafts / submitted
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f900-000000000004');   -- English teacher of A
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date >= app.today_ist()$$, 0, 'another teacher of the same class cannot see unpublished entries');
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), null, 'English: poem', true, 'remark')$$, 'a subject teacher cannot add the class remark', '42501');
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000002', 'English: poem', false)$$, 'English teacher: saves a draft of their own subject');
select pg_temp.login_as('00000000-0000-4000-f900-000000000002');   -- duty
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.mon()$$, 3, 'duty teacher: sees every submitted entry and draft');

-- =====================================================================
-- Duty: board, remind, skip, edit, publish
-- =====================================================================
select pg_temp.counts($$select expected from public.diary_board(pg_temp.mon()) where section_id = '3f000000-0000-4000-f900-000000000001'$$, 2, 'board: two expected subjects from the timetable');
select pg_temp.counts($$select submitted from public.diary_board(pg_temp.mon()) where section_id = '3f000000-0000-4000-f900-000000000001'$$, 1, 'board: only Maths is submitted (English is a draft)');
select pg_temp.lives($$select public.remind_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon(), '5d000000-0000-4000-f900-000000000002')$$, 'duty: reminds the English teacher');
select pg_temp.throws($$select public.remind_diary('3f000000-0000-4000-f900-000000000002', pg_temp.mon(), '5d000000-0000-4000-f900-000000000002')$$, 'reminding for a subject with no teacher is refused', '23514');
select pg_temp.lives($$select public.remind_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon(), '5d000000-0000-4000-f900-000000000002')$$, 'reminding twice does not duplicate');
select pg_temp.throws($$select public.publish_class_diary('3f000000-0000-4000-f900-000000000002', pg_temp.mon())$$, 'publishing a class with nothing submitted is refused', '23514');
select pg_temp.counts($$select public.publish_all_complete(pg_temp.mon())$$, 0, 'publish all: an incomplete class (English missing) is not published');
select pg_temp.lives($$select public.skip_diary_subject('3f000000-0000-4000-f900-000000000001', pg_temp.mon(), '5d000000-0000-4000-f900-000000000002', true)$$, 'duty: skips English');
select pg_temp.counts($$select expected from public.diary_board(pg_temp.mon()) where section_id = '3f000000-0000-4000-f900-000000000001'$$, 1, 'board: expected falls to 1');
select pg_temp.lives($$select public.admin_save_diary_line(jsonb_build_object('section_id', '3f000000-0000-4000-f900-000000000001', 'entry_date', pg_temp.mon(), 'subject_id', '5d000000-0000-4000-f900-000000000001', 'body', 'Maths: ex 3 and 4', 'body_te', 'గణితం'))$$, 'duty: edits a submitted line');
select pg_temp.lives($$select public.admin_save_diary_line(jsonb_build_object('section_id', '3f000000-0000-4000-f900-000000000001', 'entry_date', pg_temp.mon(), 'subject_id', '5d000000-0000-4000-f900-000000000003', 'body', 'Science added by office'))$$, 'duty: adds a line for a new subject');
select pg_temp.throws($$select public.admin_save_diary_line(jsonb_build_object('section_id', '3f000000-0000-4000-f900-000000000001', 'entry_date', pg_temp.mon(), 'kind', 'remark', 'subject_id', '5d000000-0000-4000-f900-000000000003', 'body', 'bad'))$$, 'a remark cannot have a subject', '23514');
select pg_temp.counts($$select public.publish_all_complete(pg_temp.mon())$$, 1, 'duty: publishes the one complete class');
select pg_temp.counts($$select count(*) from public.diary_entries where status = 'published' and entry_date = pg_temp.mon()$$, 3, 'Maths, Science and the remark are published; the English draft is not');
select pg_temp.counts($$select public.publish_class_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon())$$, 0, 'publishing again changes nothing (idempotent)');

-- =====================================================================
-- After publication
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f900-000000000003');   -- Maths teacher
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000001', 'Maths: sneaky edit', true)$$, 'teacher: cannot edit after publication', '23514');
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.mon() and status = 'published'$$, 3, 'teacher of the section: sees the published entries read-only');
select pg_temp.affects($$update public.diary_entries set body = 'hacked' where entry_date = pg_temp.mon()$$, 0, 'direct edit of a published entry changes nothing');
select pg_temp.login_as('00000000-0000-4000-f900-000000000004');   -- English teacher
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.mon()$$, 4, 'English teacher: sees published ones plus their own draft');
select pg_temp.counts($$select count(*) from public.subject_names() where name = 'DW Science'$$, 1, 'subject names are readable for the combined view');
select pg_temp.login_as('00000000-0000-4000-f900-000000000005');   -- unassigned
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.mon()$$, 0, 'unrelated teacher: sees nothing');
select pg_temp.login_as('00000000-0000-4000-f900-000000000002');   -- duty: unpublish, teacher fixes, republish
select pg_temp.counts($$select public.unpublish_class_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon())$$, 3, 'duty: unpublishes the class');
select pg_temp.login_as('00000000-0000-4000-f900-000000000003');
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000001', pg_temp.mo(), '5d000000-0000-4000-f900-000000000001', 'Maths: ex 3, 4 and 5', true)$$, 'teacher: can edit again once it is unpublished');
select pg_temp.login_as('00000000-0000-4000-f900-000000000002');
select pg_temp.counts($$select public.publish_class_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon())$$, 3, 'duty: republishes after the edit');
select pg_temp.counts($$select count(*) from public.diary_entries where body = 'Maths: ex 3, 4 and 5' and status = 'published'$$, 1, 'the edited text is the published text');

-- =====================================================================
-- Reminders, two teachers on one subject, duty revoked, logging, audit
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f900-000000000004');
select pg_temp.counts($$select count(*) from public.my_diary_reminders()$$, 1, 'English teacher: sees the reminder (their entry is still a draft)');
select pg_temp.login_as('00000000-0000-4000-f900-000000000003');   -- Science in B (shared with teacher 6)
select pg_temp.lives($$select pg_temp.sub('3f000000-0000-4000-f900-000000000002', 2, '5d000000-0000-4000-f900-000000000003', 'Science: plants', false)$$, 'first Science teacher starts the entry');
select pg_temp.login_as('00000000-0000-4000-f900-000000000006');
select pg_temp.throws($$select pg_temp.sub('3f000000-0000-4000-f900-000000000002', 2, '5d000000-0000-4000-f900-000000000003', 'Science: animals', true)$$, 'the second Science teacher cannot overwrite it', '42501');
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = app.today_ist() + 2$$, 0, 'and cannot see the first teacher''s draft');

select pg_temp.login_as('00000000-0000-4000-f900-000000000002');
select pg_temp.lives($$select public.log_message('diary', 'group', null, '3f000000-0000-4000-f900-000000000001', pg_temp.mon(), 'app', 'Class DW C1-A diary')$$, 'duty: logs a diary share');
select pg_temp.throws($$select public.log_message('fee_due', 'student', null, null, null, 'app', 'x')$$, 'duty without fee duty: cannot log a fee message', '42501');
select pg_temp.counts($$select count(*) from public.message_log$$, 0, 'duty teacher: cannot read the share log (Admin only)');
select pg_temp.login_as('00000000-0000-4000-f900-000000000001');
delete from public.staff_permissions where staff_id = '1d000000-0000-4000-f900-000000000002';
select pg_temp.login_as('00000000-0000-4000-f900-000000000002');
select pg_temp.throws($$select public.publish_class_diary('3f000000-0000-4000-f900-000000000001', pg_temp.mon())$$, 'revoked duty: cannot publish any more', '42501');
select pg_temp.throws($$select public.diary_board(app.today_ist())$$, 'revoked duty: cannot read the board', '42501');
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.mon()$$, 0, 'revoked duty: the unpublished English draft is hidden again');

select pg_temp.login_as('00000000-0000-4000-f900-000000000001');
select pg_temp.counts($$select count(*) from public.message_log where kind = 'diary' and summary = 'Class DW C1-A diary'$$, 1, 'Admin: sees the log entry');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'diary_entries' and action = 'update'
  and old_data ->> 'body' = 'Maths: ex 3' and new_data ->> 'body' = 'Maths: ex 3 and 4'), 'an edit is audit-logged with old and new text');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'message_log' and action = 'insert'), 'the share is audit-logged');

-- =====================================================================
-- The class plan and board for the duty teacher (no direct table access)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f900-000000000001');
insert into public.staff_permissions (staff_id, duty) values ('1d000000-0000-4000-f900-000000000002', 'notices_diary');
select pg_temp.login_as('00000000-0000-4000-f900-000000000002');
select pg_temp.counts($$select count(*) from public.timetable_entries$$, 0, 'duty teacher cannot read the timetable table directly');
select pg_temp.counts($$select count(*) from public.diary_class_plan('3f000000-0000-4000-f900-000000000001', pg_temp.mon())$$, 2, 'but the class plan lists the two timetable subjects, in order');
select pg_temp.counts($$select count(*) from public.diary_class_plan('3f000000-0000-4000-f900-000000000001', pg_temp.mon()) where skipped$$, 1, 'the plan flags the skipped subject (English)');
select pg_temp.counts($$select first_period from public.diary_class_plan('3f000000-0000-4000-f900-000000000001', pg_temp.mon()) where teachers like 'Dw English%'$$, 2, 'the plan gives period order and the teacher name');
select pg_temp.counts($$select pending from public.diary_board(pg_temp.mon()) where section_id = '3f000000-0000-4000-f900-000000000001'$$, 0, 'board: nothing pending after publishing');
select pg_temp.login_as('00000000-0000-4000-f900-000000000005');
select pg_temp.throws($$select * from public.diary_class_plan('3f000000-0000-4000-f900-000000000001', pg_temp.mon())$$, 'normal teacher: cannot read the class plan', '42501');
