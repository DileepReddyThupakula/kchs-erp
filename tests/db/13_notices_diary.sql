-- Notices and diary: permissions, scope, audience, numbering, read receipts. Rolled back.
update public.school_settings set circular_prefix = 'TT' where id = 1;

select pg_temp.fixture_user('00000000-0000-4000-f700-000000000001', 'admin@nd.test');
select pg_temp.fixture_user('00000000-0000-4000-f700-000000000002', 'duty@nd.test');
select pg_temp.fixture_user('00000000-0000-4000-f700-000000000003', 'ct@nd.test');
select pg_temp.fixture_user('00000000-0000-4000-f700-000000000004', 'subj@nd.test');
select pg_temp.fixture_user('00000000-0000-4000-f700-000000000005', 'other@nd.test');
select pg_temp.fixture_user('00000000-0000-4000-f700-000000000006', 'c2@nd.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1b000000-0000-4000-f700-000000000001', '00000000-0000-4000-f700-000000000001', 'admin',   'ND-ADM', 'Nd Admin'),
  ('1b000000-0000-4000-f700-000000000002', '00000000-0000-4000-f700-000000000002', 'teacher', 'ND-DUT', 'Nd Duty'),
  ('1b000000-0000-4000-f700-000000000003', '00000000-0000-4000-f700-000000000003', 'teacher', 'ND-CT',  'Nd Class teacher of A'),
  ('1b000000-0000-4000-f700-000000000004', '00000000-0000-4000-f700-000000000004', 'teacher', 'ND-SUB', 'Nd Subject teacher of B'),
  ('1b000000-0000-4000-f700-000000000005', '00000000-0000-4000-f700-000000000005', 'teacher', 'ND-OTH', 'Nd Other'),
  ('1b000000-0000-4000-f700-000000000006', '00000000-0000-4000-f700-000000000006', 'teacher', 'ND-C2',  'Nd Class teacher of C (class 2)');
insert into public.staff_permissions (staff_id, duty) values ('1b000000-0000-4000-f700-000000000002', 'notices_diary');
insert into public.academic_years (id, name, start_date, end_date) values
  ('2b000000-0000-4000-f700-000000000001', 'ND-2085', app.today_ist() - 100, app.today_ist() + 300),
  ('2b000000-0000-4000-f700-000000000002', 'ND-OLD',  app.today_ist() - 900, app.today_ist() - 500);
insert into public.classes (id, name, sort_order) values
  ('3c000000-0000-4000-f700-000000000001', 'ND C1', 981), ('3c000000-0000-4000-f700-000000000002', 'ND C2', 982);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3d000000-0000-4000-f700-000000000001', '2b000000-0000-4000-f700-000000000001', '3c000000-0000-4000-f700-000000000001', 'A', '1b000000-0000-4000-f700-000000000003'),
  ('3d000000-0000-4000-f700-000000000002', '2b000000-0000-4000-f700-000000000001', '3c000000-0000-4000-f700-000000000001', 'B', null),
  ('3d000000-0000-4000-f700-000000000003', '2b000000-0000-4000-f700-000000000001', '3c000000-0000-4000-f700-000000000002', 'A', '1b000000-0000-4000-f700-000000000006'),
  ('3d000000-0000-4000-f700-000000000004', '2b000000-0000-4000-f700-000000000002', '3c000000-0000-4000-f700-000000000001', 'OLD', null);
insert into public.subjects (id, name, code) values ('5b000000-0000-4000-f700-000000000001', 'ND Maths', 'NDM'), ('5b000000-0000-4000-f700-000000000002', 'ND English', 'NDE');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1b000000-0000-4000-f700-000000000004', '3d000000-0000-4000-f700-000000000002', '5b000000-0000-4000-f700-000000000001');

create function pg_temp.today() returns date language sql as $$ select app.today_ist() $$;
grant execute on function pg_temp.today() to authenticated;

-- =====================================================================
-- Diary: who can write
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f700-000000000005');
select pg_temp.throws($$select public.save_diary('{"entry_date":"2000-01-01","section_ids":[],"body":"x"}')$$, 'normal teacher: cannot add a diary entry', '42501');
select pg_temp.throws($$insert into public.diary_entries (academic_year_id, entry_date, body) values ('2b000000-0000-4000-f700-000000000001', pg_temp.today(), 'direct')$$, 'direct table insert is refused', '42501');
select pg_temp.throws($$select public.archive_diary(gen_random_uuid(), true)$$, 'normal teacher: cannot archive', '42501');

select pg_temp.login_as('00000000-0000-4000-f700-000000000002');   -- duty
select pg_temp.lives($$select public.save_diary(jsonb_build_object('entry_date', pg_temp.today(), 'section_ids', jsonb_build_array('3d000000-0000-4000-f700-000000000001'), 'subject_id', '5b000000-0000-4000-f700-000000000001', 'body', 'Maths: exercise 4.2', 'status', 'published'))$$, 'duty teacher: adds a published diary entry for A');
select pg_temp.lives($$select public.save_diary(jsonb_build_object('entry_date', pg_temp.today(), 'section_ids', jsonb_build_array('3d000000-0000-4000-f700-000000000001', '3d000000-0000-4000-f700-000000000002'), 'body', 'Draft remark for A and B', 'status', 'draft'))$$, 'duty teacher: adds a draft for two sections');
select pg_temp.throws($$select public.save_diary(jsonb_build_object('entry_date', pg_temp.today(), 'section_ids', jsonb_build_array(), 'body', 'No section', 'status', 'draft'))$$, 'a diary entry needs a section', '23514');
select pg_temp.throws($$select public.save_diary(jsonb_build_object('entry_date', pg_temp.today() + 400, 'section_ids', jsonb_build_array('3d000000-0000-4000-f700-000000000001'), 'body', 'Far future', 'status', 'draft'))$$, 'the date must be inside the academic year', '23514');
select pg_temp.throws($$select public.save_diary(jsonb_build_object('entry_date', pg_temp.today(), 'section_ids', jsonb_build_array('3d000000-0000-4000-f700-000000000001', '3d000000-0000-4000-f700-000000000004'), 'body', 'Mixed years', 'status', 'draft'))$$, 'sections from two academic years are refused', '23514');
select pg_temp.throws($$select public.save_diary(jsonb_build_object('entry_date', pg_temp.today(), 'section_ids', jsonb_build_array('3d000000-0000-4000-f700-000000000001'), 'body', 'x', 'status', 'draft'))$$, 'a one-letter diary text is refused', '23514');
-- quick entry: all lines or none
select pg_temp.lives($$select public.save_diary_day(pg_temp.today() - 1, array['3d000000-0000-4000-f700-000000000001'::uuid], jsonb_build_array(
  jsonb_build_object('subject_id', '5b000000-0000-4000-f700-000000000001', 'body', 'Maths: tables'),
  jsonb_build_object('subject_id', '5b000000-0000-4000-f700-000000000002', 'body', 'English: reading')), true)$$, 'quick entry: two lines saved together');
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.today() - 1 and id in (select entry_id from public.diary_entry_sections where section_id in ('3d000000-0000-4000-f700-000000000001','3d000000-0000-4000-f700-000000000002','3d000000-0000-4000-f700-000000000003'))$$, 2, 'quick entry: both lines exist');
select pg_temp.throws($$select public.save_diary_day(pg_temp.today() - 2, array['3d000000-0000-4000-f700-000000000001'::uuid], jsonb_build_array(
  jsonb_build_object('subject_id', '5b000000-0000-4000-f700-000000000001', 'body', 'Valid line'),
  jsonb_build_object('subject_id', '5b000000-0000-4000-f700-000000000002', 'body', 'x')), true)$$, 'quick entry: one bad line saves nothing', '23514');
select pg_temp.counts($$select count(*) from public.diary_entries where entry_date = pg_temp.today() - 2 and id in (select entry_id from public.diary_entry_sections where section_id in ('3d000000-0000-4000-f700-000000000001','3d000000-0000-4000-f700-000000000002','3d000000-0000-4000-f700-000000000003'))$$, 0, 'quick entry: nothing was left behind');

-- =====================================================================
-- Diary: who sees what
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f700-000000000003');   -- class teacher of A
select pg_temp.counts($$select count(*) from public.diary_entries where status = 'published'$$, 3, 'class teacher: sees published entries of their section');
select pg_temp.counts($$select count(*) from public.diary_entries where status = 'draft'$$, 0, 'class teacher: drafts are hidden');
select pg_temp.counts($$select count(*) from public.diary_entry_sections where section_id = '3d000000-0000-4000-f700-000000000002'$$, 0, 'class teacher: links of other sections are hidden');
select pg_temp.login_as('00000000-0000-4000-f700-000000000004');   -- subject teacher of B
select pg_temp.counts($$select count(*) from public.diary_entries$$, 0, 'teacher of B: sees no diary of section A');
select pg_temp.login_as('00000000-0000-4000-f700-000000000005');
select pg_temp.counts($$select count(*) from public.diary_entries$$, 0, 'unrelated teacher: sees no diary');
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');   -- duty sees drafts too
select pg_temp.counts($$select count(*) from public.diary_entries where id in (select entry_id from public.diary_entry_sections where section_id in ('3d000000-0000-4000-f700-000000000001','3d000000-0000-4000-f700-000000000002','3d000000-0000-4000-f700-000000000003'))$$, 4, 'duty teacher: sees every entry including drafts');
-- publish the draft: then the subject teacher of B sees it (it includes B)
select pg_temp.lives($$select public.set_diary_status((select id from public.diary_entries where body = 'Draft remark for A and B'), 'published')$$, 'duty teacher: publishes a draft');
select pg_temp.login_as('00000000-0000-4000-f700-000000000004');
select pg_temp.counts($$select count(*) from public.diary_entries$$, 1, 'teacher of B: sees the published entry that includes section B');
-- archive: Admin only
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.throws($$select public.archive_diary((select id from public.diary_entries limit 1), true)$$, 'duty teacher: cannot archive (Admin only)', '42501');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');
select pg_temp.lives($$select public.archive_diary((select id from public.diary_entries where body = 'Maths: exercise 4.2'), true)$$, 'Admin: archives a diary entry');
select pg_temp.counts($$select count(*) from public.diary_entries where archived_at is not null and id in (select entry_id from public.diary_entry_sections where section_id in ('3d000000-0000-4000-f700-000000000001','3d000000-0000-4000-f700-000000000002','3d000000-0000-4000-f700-000000000003'))$$, 1, 'Admin: still sees the archived entry');
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.counts($$select count(*) from public.diary_entries where archived_at is not null$$, 0, 'duty teacher: cannot see archived entries');
select pg_temp.login_as('00000000-0000-4000-f700-000000000003');
select pg_temp.counts($$select count(*) from public.diary_entries where body = 'Maths: exercise 4.2'$$, 0, 'class teacher: an archived entry disappears');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');
select pg_temp.lives($$select public.archive_diary((select id from public.diary_entries where body = 'Maths: exercise 4.2'), false)$$, 'Admin: restores it');
select pg_temp.login_as('00000000-0000-4000-f700-000000000003');
select pg_temp.counts($$select count(*) from public.diary_entries where body = 'Maths: exercise 4.2'$$, 1, 'class teacher: sees the restored entry');

-- =====================================================================
-- Notices: write rules, audit, numbering
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f700-000000000005');
select pg_temp.throws($$select public.save_notice('{"title":"Sneaky","body":"x y","audience":"all"}')$$, 'normal teacher: cannot create a notice', '42501');
select pg_temp.throws($$select public.publish_notice(gen_random_uuid())$$, 'normal teacher: cannot publish', '42501');
select pg_temp.throws($$select public.archive_notice(gen_random_uuid(), true)$$, 'normal teacher: cannot archive a notice', '42501');
select pg_temp.throws($$insert into public.notices (academic_year_id, title, body, audience) values ('2b000000-0000-4000-f700-000000000001', 'direct', 'direct', 'all')$$, 'direct notice insert is refused', '42501');

select pg_temp.login_as('00000000-0000-4000-f700-000000000002');   -- duty
create temp table _n (name text primary key, id uuid);
grant all on _n to authenticated;
insert into _n select 'all',      public.save_notice(jsonb_build_object('title', 'Holiday notice', 'body', 'School closed on Monday.', 'audience', 'all', 'important', true));
insert into _n select 'roles',    public.save_notice(jsonb_build_object('title', 'Teachers meeting', 'body', 'Staff room, 4 pm.', 'audience', 'roles', 'roles', jsonb_build_array('teacher')));
insert into _n select 'classes',  public.save_notice(jsonb_build_object('title', 'Class 2 exam duty', 'body', 'Invigilation list attached.', 'audience', 'classes', 'class_ids', jsonb_build_array('3c000000-0000-4000-f700-000000000002')));
insert into _n select 'teachers', public.save_notice(jsonb_build_object('title', 'For two teachers', 'body', 'Please see the principal.', 'audience', 'teachers', 'staff_ids', jsonb_build_array('1b000000-0000-4000-f700-000000000004', '1b000000-0000-4000-f700-000000000005')));
insert into _n select 'expired',  public.save_notice(jsonb_build_object('title', 'Old circular', 'body', 'Past event.', 'audience', 'all', 'publish_date', pg_temp.today() - 10, 'expires_on', pg_temp.today() - 1));
insert into _n select 'future',   public.save_notice(jsonb_build_object('title', 'Next week notice', 'body', 'Not yet.', 'audience', 'all', 'publish_date', pg_temp.today() + 7));
insert into _n select 'draft',    public.save_notice(jsonb_build_object('title', 'Draft notice', 'body', 'Still writing.', 'audience', 'all'));
select pg_temp.counts($$select count(*) from public.notices where status = 'draft' and circular_no is null and academic_year_id = '2b000000-0000-4000-f700-000000000001'$$, 7, 'new notices are drafts with no circular number');
select pg_temp.throws($$select public.save_notice('{"title":"No audience list","body":"xx","audience":"classes","class_ids":[]}')$$, 'a class notice needs at least one class', '23514');
select pg_temp.throws($$select public.save_notice(jsonb_build_object('title', 'Backwards', 'body', 'xx', 'audience', 'all', 'publish_date', pg_temp.today(), 'expires_on', pg_temp.today() - 3))$$, 'expiry before the publish date is refused', '23514');
select pg_temp.ok((select publish_notice = 'TT/ND-2085/001' from (select public.publish_notice((select id from _n where name = 'all'))) q(publish_notice)), 'first circular number is TT/ND-2085/001 (prefix from settings)');
select pg_temp.ok((select public.publish_notice((select id from _n where name = 'roles'))) = 'TT/ND-2085/002', 'second is 002');
select pg_temp.ok((select public.publish_notice((select id from _n where name = 'all'))) = 'TT/ND-2085/001', 'publishing twice returns the same number and uses no new one');
select pg_temp.lives($$select public.publish_notice((select id from _n where name = 'classes')), public.publish_notice((select id from _n where name = 'teachers')), public.publish_notice((select id from _n where name = 'expired')), public.publish_notice((select id from _n where name = 'future'))$$, 'duty teacher: publishes the rest');
select pg_temp.ok((select array_agg(circular_seq order by circular_seq) = array[1,2,3,4,5,6] from public.notices where circular_seq is not null and academic_year_id = '2b000000-0000-4000-f700-000000000001'), 'numbers 1 to 6 with no gap and no duplicate');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'notices' and action = 'update' and new_data ->> 'status' = 'published'), 'publishing is audit-logged');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'diary_entries' and action = 'insert'), 'diary writes are audit-logged');
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');

-- =====================================================================
-- Notices: audience and visibility
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f700-000000000003');   -- class teacher of A (class 1)
select pg_temp.ok((select count(*) = 2 from public.notices where academic_year_id = '2b000000-0000-4000-f700-000000000001'), 'class teacher of class 1 sees: all-staff and teachers-role notices (not class 2, not the 2 named teachers)');
select pg_temp.ok((select bool_or(important) from public.notices where title = 'Holiday notice'), 'important flag is kept');
select pg_temp.counts($$select count(*) from public.notices where title in ('Old circular', 'Next week notice', 'Draft notice')$$, 0, 'expired, not-yet-published and draft notices are hidden');
select pg_temp.login_as('00000000-0000-4000-f700-000000000006');   -- class teacher of class 2
select pg_temp.ok((select count(*) = 3 and bool_or(title = 'Class 2 exam duty') from public.notices where academic_year_id = '2b000000-0000-4000-f700-000000000001'), 'teacher of class 2 also sees the class-2 notice');
select pg_temp.login_as('00000000-0000-4000-f700-000000000004');   -- named teacher
select pg_temp.ok((select count(*) = 3 and bool_or(title = 'For two teachers') from public.notices where academic_year_id = '2b000000-0000-4000-f700-000000000001'), 'a named teacher sees the notice addressed to them');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');   -- Admin
select pg_temp.counts($$select count(*) from public.notices where academic_year_id = '2b000000-0000-4000-f700-000000000001'$$, 7, 'Admin sees everything including drafts, expired and future');
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.counts($$select count(*) from public.notices where academic_year_id = '2b000000-0000-4000-f700-000000000001'$$, 7, 'duty teacher sees every notice including drafts');
select pg_temp.counts($$select count(*) from public.notice_audience a join public.notices n on n.id = a.notice_id where n.academic_year_id = '2b000000-0000-4000-f700-000000000001'$$, 4, 'audience rows are visible to those who can see the notice');
select pg_temp.login_as('00000000-0000-4000-f700-000000000005');
select pg_temp.counts($$select count(*) from public.notice_audience a join public.notices n on n.id = a.notice_id where n.academic_year_id = '2b000000-0000-4000-f700-000000000001' and a.role is not null$$, 1, 'a teacher sees audience rows only of notices they can see');

-- archive: Admin only; hidden from everyone but Admin
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.throws($$select public.archive_notice((select id from _n where name = 'all'), true)$$, 'duty teacher: cannot archive a notice', '42501');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');
select pg_temp.lives($$select public.archive_notice((select id from _n where name = 'roles'), true)$$, 'Admin: archives a notice');
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.counts($$select count(*) from public.notices where title = 'Teachers meeting'$$, 0, 'duty teacher: an archived notice is hidden');
select pg_temp.login_as('00000000-0000-4000-f700-000000000003');
select pg_temp.counts($$select count(*) from public.notices where title = 'Teachers meeting'$$, 0, 'teacher: an archived notice is hidden');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');
select pg_temp.lives($$select public.archive_notice((select id from _n where name = 'roles'), false)$$, 'Admin: restores it');

-- =====================================================================
-- Read receipts
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f700-000000000003');
select pg_temp.lives($$select public.mark_notice_read((select id from _n where name = 'all'))$$, 'teacher: marks a notice as read');
select pg_temp.lives($$select public.mark_notice_read((select id from _n where name = 'all'))$$, 'marking again is harmless');
select pg_temp.throws($$select public.mark_notice_read((select id from _n where name = 'classes'))$$, 'cannot mark a notice that is not addressed to them', '42501');
select pg_temp.throws($$select public.mark_notice_read((select id from _n where name = 'draft'))$$, 'cannot mark a draft', '42501');
select pg_temp.counts($$select count(*) from public.notice_reads where staff_id <> '1b000000-0000-4000-f700-000000000003'$$, 0, 'a teacher sees only their own receipts');
select pg_temp.ok((select count(*) = 1 from public.notices n where n.academic_year_id = '2b000000-0000-4000-f700-000000000001' and n.status = 'published' and n.publish_date <= app.today_ist() and (n.expires_on is null or n.expires_on >= app.today_ist()) and not exists (select 1 from public.notice_reads r where r.notice_id = n.id)) and (select public.my_unread_notices()) >= 1, 'unread: the roles notice is still unread (all-staff read)');
select pg_temp.login_as('00000000-0000-4000-f700-000000000005');
select pg_temp.counts($$select count(*) from public.notice_reads$$, 0, 'another teacher sees none of those receipts');
select pg_temp.throws($$select * from public.notice_readers((select id from _n where name = 'all'))$$, 'teacher cannot list who has read', '42501');
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.throws($$select * from public.notice_readers((select id from _n where name = 'all'))$$, 'duty teacher cannot list who has read (Admin only)', '42501');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');
select pg_temp.ok((select count(*) filter (where read_at is not null) = 1 and count(*) filter (where read_at is null) >= 5
  from public.notice_readers((select id from _n where name = 'all'))), 'Admin: read and unread counts for an all-staff notice');
select pg_temp.ok((select count(*) = 2 from public.notice_readers((select id from _n where name = 'teachers'))), 'Admin: audience of a named-teachers notice is exactly those two');
select pg_temp.ok((select count(*) = 1 and bool_and(full_name like '%class 2%') from public.notice_readers((select id from _n where name = 'classes'))), 'Admin: audience of a class notice = the teachers of that class');

-- =====================================================================
-- Attachments + revoked duty
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.lives($$select public.add_notice_attachment((select id from _n where name = 'all'), (select id::text from _n where name = 'all') || '/circular.pdf', 'circular.pdf', 'application/pdf', 1000)$$, 'duty teacher: adds an attachment record');
select pg_temp.throws($$select public.add_notice_attachment((select id from _n where name = 'all'), 'other-folder/x.pdf', 'x.pdf', 'application/pdf', 1000)$$, 'the file must sit under the notice folder', '23514');
select pg_temp.throws($$select public.add_notice_attachment((select id from _n where name = 'all'), (select id::text from _n where name = 'all') || '/virus.exe', 'virus.exe', 'application/x-msdownload', 1000)$$, 'only PDF and images are allowed', '23514');
select pg_temp.login_as('00000000-0000-4000-f700-000000000003');
select pg_temp.counts($$select count(*) from public.notice_attachments$$, 1, 'class teacher: sees the attachment of a notice addressed to them');
select pg_temp.throws($$select public.remove_attachment('notice', (select id from public.notice_attachments limit 1))$$, 'teacher cannot remove attachments', '42501');
select pg_temp.login_as('00000000-0000-4000-f700-000000000001');
delete from public.staff_permissions where staff_id = '1b000000-0000-4000-f700-000000000002';
select pg_temp.login_as('00000000-0000-4000-f700-000000000002');
select pg_temp.throws($$select public.save_notice('{"title":"After revoke","body":"xx","audience":"all"}')$$, 'revoked duty: cannot create a notice', '42501');
select pg_temp.throws($$select public.save_diary_day(pg_temp.today(), array['3d000000-0000-4000-f700-000000000001'::uuid], jsonb_build_array(jsonb_build_object('body', 'After revoke')), true)$$, 'revoked duty: cannot add diary entries', '42501');
select pg_temp.counts($$select count(*) from public.notices where status = 'draft'$$, 0, 'revoked duty: drafts are hidden again');
select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.notices', 'anon: no access to notices', '42501');
select pg_temp.throws('select count(*) from public.diary_entries', 'anon: no access to diary', '42501');
