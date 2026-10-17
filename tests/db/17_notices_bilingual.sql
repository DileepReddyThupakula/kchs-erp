-- Notices Part B: Telugu states, parents audience (no parent access), group checklist, log. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000001', 'admin@nb.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000002', 'duty@nb.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000003', 'ct1@nb.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000004', 'ct2@nb.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000005', 'other@nb.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1f000000-0000-4000-fb00-000000000001', '00000000-0000-4000-fb00-000000000001', 'admin',   'NB-ADM', 'Nb Admin'),
  ('1f000000-0000-4000-fb00-000000000002', '00000000-0000-4000-fb00-000000000002', 'teacher', 'NB-DUT', 'Nb Duty'),
  ('1f000000-0000-4000-fb00-000000000003', '00000000-0000-4000-fb00-000000000003', 'teacher', 'NB-CT1', 'Nb Class teacher C1-A'),
  ('1f000000-0000-4000-fb00-000000000004', '00000000-0000-4000-fb00-000000000004', 'teacher', 'NB-CT2', 'Nb Class teacher C2-A'),
  ('1f000000-0000-4000-fb00-000000000005', '00000000-0000-4000-fb00-000000000005', 'teacher', 'NB-OTH', 'Nb Unrelated');
insert into public.staff_permissions (staff_id, duty) values ('1f000000-0000-4000-fb00-000000000002', 'notices_diary');
insert into public.academic_years (id, name, start_date, end_date) values ('2f000000-0000-4000-fb00-000000000001', 'NB-2087', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3a000000-0000-4000-fb00-000000000001', 'NB C1', 951), ('3a000000-0000-4000-fb00-000000000002', 'NB C2', 952);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id, parents_group_name) values
  ('3b000000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', '3a000000-0000-4000-fb00-000000000001', 'A', '1f000000-0000-4000-fb00-000000000003', 'NB C1-A parents'),
  ('3b000000-0000-4000-fb00-000000000002', '2f000000-0000-4000-fb00-000000000001', '3a000000-0000-4000-fb00-000000000001', 'B', null, null),
  ('3b000000-0000-4000-fb00-000000000003', '2f000000-0000-4000-fb00-000000000001', '3a000000-0000-4000-fb00-000000000002', 'A', '1f000000-0000-4000-fb00-000000000004', null);
update public.school_settings set circular_prefix = 'NB';

create function pg_temp.note(p jsonb) returns uuid language sql as $$ select public.save_notice(p) $$;
grant execute on function pg_temp.note(jsonb) to authenticated;

-- ---------------------------------------------------------------- who can write
select pg_temp.login_as('00000000-0000-4000-fb00-000000000005');
select pg_temp.throws($$select public.save_notice('{"title":"Parents","body":"Hello parents","audience":"parents_all"}')$$, 'normal teacher: cannot create a parents notice', '42501');
select pg_temp.throws($$insert into public.notices (academic_year_id, title, body, audience) values ('2f000000-0000-4000-fb00-000000000001', 'Direct', 'direct write', 'parents_all')$$, 'direct insert into notices is refused', '42501');
select pg_temp.throws($$select public.notice_send_open(gen_random_uuid(), 'staff', 'app')$$, 'normal teacher: cannot open a send', '42501');
select pg_temp.throws($$select * from public.notice_send_list(gen_random_uuid())$$, 'normal teacher: cannot read a checklist', '42501');
select pg_temp.throws($$select * from public.notice_send_counts()$$, 'normal teacher: cannot read send counts', '42501');

select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.lives($$select pg_temp.note('{"title":"Annual Day for parents","body":"Rehearsals from Monday 19 October","audience":"parents_all"}')$$, 'duty: creates a notice for parents (whole school)');
select pg_temp.lives($$select pg_temp.note(jsonb_build_object('title', 'Class one trip', 'body', 'Trip on 25 October', 'audience', 'parents_classes', 'class_ids', jsonb_build_array('3a000000-0000-4000-fb00-000000000001')))$$, 'duty: creates a notice for parents of selected classes');
select pg_temp.throws($$select pg_temp.note('{"title":"No class","body":"Trip on 25 October","audience":"parents_classes","class_ids":[]}')$$, 'parents of selected classes needs a class', '23514');
select pg_temp.lives($$select pg_temp.note('{"title":"Staff meeting","body":"Staff meeting on Friday","audience":"all"}')$$, 'duty: creates a staff notice');
select pg_temp.counts($$select count(*) from public.notices where audience in ('parents_all', 'parents_classes', 'all') and title in ('Annual Day for parents', 'Class one trip', 'Staff meeting')$$, 3, 'duty sees all three drafts');

-- drafts are invisible to teachers; after publishing parents notices appear for the right teachers
select pg_temp.login_as('00000000-0000-4000-fb00-000000000003');
select pg_temp.counts($$select count(*) from public.notices where title in ('Annual Day for parents', 'Class one trip', 'Staff meeting')$$, 0, 'teacher: drafts are hidden');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.lives($$select public.publish_notice(id) from public.notices where title in ('Annual Day for parents', 'Class one trip', 'Staff meeting')$$, 'duty: publishes all three');
select pg_temp.counts($$select count(distinct circular_seq) from public.notices where title in ('Annual Day for parents', 'Class one trip', 'Staff meeting')$$, 3, 'circular numbers are distinct');
select pg_temp.counts($$select count(*) from public.notices where title in ('Annual Day for parents', 'Class one trip', 'Staff meeting') and circular_no like 'NB/NB-2087/00_'$$, 3, 'numbering format is prefix/year/001...');
select pg_temp.counts($$select max(circular_seq) - min(circular_seq) from public.notices where title in ('Annual Day for parents', 'Class one trip', 'Staff meeting')$$, 2, 'numbers are consecutive (no gap)');
select pg_temp.lives($$select public.publish_notice(id) from public.notices where title = 'Staff meeting'$$, 'publishing again is harmless');
select pg_temp.counts($$select count(distinct circular_no) from public.notices where title in ('Annual Day for parents', 'Class one trip', 'Staff meeting')$$, 3, 'publishing again did not take a new number');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000003');
select pg_temp.counts($$select count(*) from public.notices where title in ('Annual Day for parents', 'Class one trip')$$, 2, 'class teacher of C1: sees the whole-school and the C1 parents notice');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000004');
select pg_temp.counts($$select count(*) from public.notices where title in ('Annual Day for parents', 'Class one trip')$$, 1, 'class teacher of C2: sees only the whole-school parents notice');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000005');
select pg_temp.counts($$select count(*) from public.notices where title = 'Class one trip'$$, 0, 'unrelated teacher: does not see the C1 parents notice');
select pg_temp.counts($$select count(*) from public.notices where title = 'Annual Day for parents'$$, 1, 'unrelated teacher: sees the whole-school parents notice (read only)');
select pg_temp.throws($$select public.save_notice(jsonb_build_object('id', (select id from public.notices where title = 'Annual Day for parents'), 'title', 'Edited', 'body', 'edited text here', 'audience', 'parents_all'))$$, 'teacher: cannot edit it', '42501');
select pg_temp.lives($$select public.mark_notice_read((select id from public.notices where title = 'Annual Day for parents'))$$, 'teacher: can mark it as read');

-- no parent access: nobody without a staff login can read anything
select pg_temp.login_as(null);
select pg_temp.throws($$select count(*) from public.notices$$, 'not signed in (a parent): no access to notices at all', '42501');

-- ---------------------------------------------------------------- expiry
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.lives($$select pg_temp.note(jsonb_build_object('title', 'Old parents notice', 'body', 'Expired already', 'audience', 'parents_all', 'publish_date', app.today_ist() - 10, 'expires_on', app.today_ist() - 5))$$, 'duty: an old notice');
select pg_temp.lives($$select public.publish_notice(id) from public.notices where title = 'Old parents notice'$$, 'published');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000005');
select pg_temp.counts($$select count(*) from public.notices where title = 'Old parents notice'$$, 0, 'teacher: an expired notice is hidden');

-- ---------------------------------------------------------------- Telugu rules
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.lives($$select pg_temp.note('{"title":"Fee reminder note","body":"Last date is 25 October","audience":"all"}')$$, 'draft with English only');
select pg_temp.counts($$select count(*) from public.notices where title = 'Fee reminder note' and te_status = 'none' and title_te is null$$, 1, 'English only: no Telugu, status none');
select pg_temp.lives($$select pg_temp.note(jsonb_build_object('id', (select id from public.notices where title = 'Fee reminder note'), 'title', 'Fee reminder note', 'body', 'Last date is 25 October', 'audience', 'all', 'title_te', 'రుసుము గుర్తింపు', 'body_te', 'చివరి తేదీ 25 అక్టోబర్'))$$, 'office types the Telugu before publishing');
select pg_temp.counts($$select count(*) from public.notices where title = 'Fee reminder note' and te_status = 'reviewed'$$, 1, 'typed Telugu is reviewed');
select pg_temp.lives($$select public.publish_notice(id) from public.notices where title = 'Fee reminder note'$$, 'publish');
select pg_temp.counts($$select count(*) from public.notices where title = 'Fee reminder note' and te_status = 'reviewed' and body_te is not null$$, 1, 'publishing keeps reviewed Telugu');
select pg_temp.lives($$select pg_temp.note(jsonb_build_object('title', 'No telugu yet', 'body', 'Holiday on Monday', 'audience', 'all'))$$, 'another draft');
select pg_temp.lives($$select public.publish_notice(id) from public.notices where title = 'No telugu yet'$$, 'publish it');
select pg_temp.counts($$select count(*) from public.notices where title = 'No telugu yet' and te_status = 'pending'$$, 1, 'publishing English only: Telugu is pending (the server translates it)');
select pg_temp.throws($$select public.apply_notice_translation((select id from public.notices where title = 'No telugu yet'), 'శీర్షిక', 'పాఠ్యం', 'x')$$, 'teacher or duty cannot store a translation (server only)', '42501');
select pg_temp.login_as(null);
select set_config('role', 'postgres', true);
select pg_temp.counts($$select case when public.apply_notice_translation((select id from public.notices where title = 'No telugu yet'), 'శీర్షిక', 'పాఠ్యం', 'wrong') then 1 else 0 end$$, 0, 'translation of outdated English is not applied');
select pg_temp.counts($$select case when public.apply_notice_translation((select id from public.notices where title = 'No telugu yet'), 'శీర్షిక', 'సోమవారం సెలవు', md5('No telugu yet' || E'\n' || 'Holiday on Monday')) then 1 else 0 end$$, 1, 'translation of the current English is stored');
select pg_temp.counts($$select case when public.apply_notice_translation((select id from public.notices where title = 'Fee reminder note'), 'యంత్ర', 'యంత్ర', md5('Fee reminder note' || E'\n' || 'Last date is 25 October')) then 1 else 0 end$$, 0, 'machine translation never overwrites reviewed Telugu');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.lives($$select pg_temp.note(jsonb_build_object('id', (select id from public.notices where title = 'No telugu yet'), 'title', 'No telugu yet', 'body', 'Holiday on Tuesday', 'audience', 'all', 'title_te', 'శీర్షిక', 'body_te', 'సోమవారం సెలవు'))$$, 'English changed but Telugu kept in the form: the office edited it');
select pg_temp.counts($$select count(*) from public.notices where title = 'No telugu yet' and te_status = 'auto'$$, 0, 'edited Telugu is not auto any more');
select pg_temp.lives($$select pg_temp.note(jsonb_build_object('id', (select id from public.notices where title = 'No telugu yet'), 'title', 'No telugu yet', 'body', 'Holiday on Wednesday', 'audience', 'all', 'title_te', 'శీర్షిక', 'body_te', 'సోమవారం సెలవు'))$$, 'English changed again with identical Telugu');
select pg_temp.counts($$select count(*) from public.notices where title = 'No telugu yet' and te_status = 'reviewed'$$, 1, 'Telugu stays reviewed when only the English changes');

-- ---------------------------------------------------------------- checklist
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Annual Day for parents'))$$, 3, 'whole-school parents notice: one row per section (3)');
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Class one trip'))$$, 2, 'C1 parents notice: the two C1 sections');
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Staff meeting')) where group_key = 'staff'$$, 1, 'staff notice: the staff group');
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Class one trip')) where group_label = 'NB C1-A parents'$$, 1, 'the group name set on the section is used');
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Class one trip')) where group_label = 'NB C1 – B parents group'$$, 1, 'a section without a name gets a default label');
select pg_temp.throws($$select * from public.notice_send_list((select id from public.notices where title = 'Fee reminder note' limit 1)) where false; select public.notice_send_open((select id from public.notices where title = 'Class one trip'), 'section:3b000000-0000-4000-fb00-000000000003', 'app')$$, 'a group that is not one of the notice''s groups is refused', '23514');
select pg_temp.lives($$select public.notice_send_open((select id from public.notices where title = 'Class one trip'), 'section:3b000000-0000-4000-fb00-000000000001', 'app')$$, 'duty: opens WhatsApp for one group');
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Class one trip')) where status = 'opened'$$, 1, 'the row says opened (not sent)');
select pg_temp.lives($$select public.notice_send_mark((select id from public.notices where title = 'Class one trip'), 'section:3b000000-0000-4000-fb00-000000000001', true)$$, 'duty: marks it as sent');
select pg_temp.lives($$select public.notice_send_open((select id from public.notices where title = 'Class one trip'), 'section:3b000000-0000-4000-fb00-000000000001', 'web')$$, 'opening again');
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Class one trip')) where status = 'marked_sent'$$, 1, 'opening again does not undo "marked as sent"');
select pg_temp.lives($$select public.notice_send_mark((select id from public.notices where title = 'Class one trip'), 'section:3b000000-0000-4000-fb00-000000000002', true)$$, 'marking a group never opened');
select pg_temp.counts($$select sent * 100 + total from public.notice_send_counts() where notice_id = (select id from public.notices where title = 'Class one trip')$$, 202, 'Sent to 2 of 2 groups');
select pg_temp.lives($$select public.notice_send_mark((select id from public.notices where title = 'Class one trip'), 'section:3b000000-0000-4000-fb00-000000000002', false)$$, 'unmark');
select pg_temp.counts($$select sent * 100 + total from public.notice_send_counts() where notice_id = (select id from public.notices where title = 'Class one trip')$$, 102, 'Sent to 1 of 2 groups');
select pg_temp.throws($$select public.notice_send_open((select id from public.notices where title = 'Class one trip'), 'staff', 'app')$$, 'the staff group is not a group of a parents notice', '23514');
select pg_temp.lives($$select pg_temp.note('{"title":"Unpublished draft","body":"Not out yet","audience":"all"}')$$, 'a draft');
select pg_temp.throws($$select public.notice_send_open((select id from public.notices where title = 'Unpublished draft'), 'staff', 'app')$$, 'a draft cannot be sent', '23514');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
-- log: every open is logged "opened", never "delivered"
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.counts($$select count(*) from public.message_log where kind = 'notice' and status = 'opened' and summary like '%opened in WhatsApp for NB C1-A parents'$$, 2, 'Admin: both opens are in the log as "opened"');
select pg_temp.counts($$select count(*) from public.message_log where summary ilike '%delivered%'$$, 0, 'nothing is ever logged as delivered');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'notice_sends' and action = 'insert'), 'checklist changes are audit-logged');

-- ---------------------------------------------------------------- group labels and revoked duty
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.affects($$update public.sections set parents_group_name = 'hacked' where id = '3b000000-0000-4000-fb00-000000000001'$$, 0, 'duty teacher cannot edit a group name (Admin only)');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.affects($$update public.sections set parents_group_name = 'NB C1-A parents group' where id = '3b000000-0000-4000-fb00-000000000001'$$, 1, 'Admin edits a group name');
update public.school_settings set staff_group_name = 'NB staff group';
select pg_temp.counts($$select count(*) from public.notice_send_list((select id from public.notices where title = 'Staff meeting')) where group_label = 'NB staff group'$$, 1, 'the staff group name comes from School settings');
delete from public.staff_permissions where staff_id = '1f000000-0000-4000-fb00-000000000002';
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.throws($$select public.save_notice('{"title":"After revoke","body":"After revoke","audience":"parents_all"}')$$, 'revoked duty: cannot create a notice', '42501');
select pg_temp.throws($$select public.notice_send_open((select id from public.notices where title = 'Class one trip'), 'section:3b000000-0000-4000-fb00-000000000001', 'app')$$, 'revoked duty: cannot open WhatsApp sends', '42501');
select pg_temp.throws($$select * from public.notice_send_counts()$$, 'revoked duty: cannot read the counts', '42501');
select pg_temp.counts($$select count(*) from public.notice_sends$$, 0, 'revoked duty: cannot read the checklist table');
