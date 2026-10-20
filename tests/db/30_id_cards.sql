-- ID cards (database part): numbering, issue, photo rules, QR, settings, replace, cancel, automatic cancellation, rollover undo, lookup, refusals, log. Rolled back.
update public.academic_years set is_current = false where is_current;
update public.school_settings set mediums = '{English,Telugu}' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000001', 'admin@ci.test');
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000002', 'office-duty@ci.test');
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000003', 'office-records@ci.test');
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000004', 'teacher-duty@ci.test');
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000005', 'old-admin@ci.test');
select pg_temp.fixture_user('00000000-0000-4000-fe00-000000000006', 'office-fee@ci.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name, email, status) values
  ('1c000000-0000-4000-fe00-000000000001', '00000000-0000-4000-fe00-000000000001', 'admin',          'CI-ADM', 'Ci Admin', 'admin@ci.test', 'active'),
  ('1c000000-0000-4000-fe00-000000000002', '00000000-0000-4000-fe00-000000000002', 'computer_staff', 'CI-DUT', 'Ci Office with the duty', 'office-duty@ci.test', 'active'),
  ('1c000000-0000-4000-fe00-000000000003', '00000000-0000-4000-fe00-000000000003', 'computer_staff', 'CI-REC', 'Ci Office with student records only', 'office-records@ci.test', 'active'),
  ('1c000000-0000-4000-fe00-000000000004', '00000000-0000-4000-fe00-000000000004', 'teacher',        'CI-TCH', 'Ci Teacher with every duty', 'teacher-duty@ci.test', 'active'),
  ('1c000000-0000-4000-fe00-000000000005', '00000000-0000-4000-fe00-000000000005', 'admin',          'CI-OLD', 'Ci Deactivated Admin', 'old-admin@ci.test', 'inactive'),
  ('1c000000-0000-4000-fe00-000000000006', '00000000-0000-4000-fe00-000000000006', 'computer_staff', 'CI-FEE', 'Ci Office with fee access', 'office-fee@ci.test', 'active');
insert into public.staff_permissions (staff_id, duty) values
  ('1c000000-0000-4000-fe00-000000000002', 'certificates_idcards'), ('1c000000-0000-4000-fe00-000000000003', 'student_records'), ('1c000000-0000-4000-fe00-000000000006', 'fee_collection');
insert into public.staff_permissions (staff_id, duty) select '1c000000-0000-4000-fe00-000000000004', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';

insert into public.academic_years (id, name, start_date, end_date, status, is_current) values
  ('2c100000-0000-4000-fe00-000000000001', 'CI-2024-25', '2024-04-01', '2025-03-31', 'active', true),
  ('2c100000-0000-4000-fe00-000000000002', 'CI-2025-26', '2025-04-01', '2026-03-31', 'planned', false);
insert into public.classes (id, name, sort_order) values ('3c200000-0000-4000-fe00-000000000001', 'CI A', 975), ('3c200000-0000-4000-fe00-000000000002', 'CI B', 976);
insert into public.sections (id, academic_year_id, class_id, name, medium) values
  ('3d200000-0000-4000-fe00-000000000001', '2c100000-0000-4000-fe00-000000000001', '3c200000-0000-4000-fe00-000000000001', 'A', 'English'),
  ('3d200000-0000-4000-fe00-000000000002', '2c100000-0000-4000-fe00-000000000001', '3c200000-0000-4000-fe00-000000000002', 'A', 'English');
-- what the rollover needs in the new year
insert into public.subjects (id, name, code) values ('5c200000-0000-4000-fe00-000000000001', 'CI Maths', 'CIM');
insert into public.class_subjects (academic_year_id, class_id, subject_id, sort_order) values ('2c100000-0000-4000-fe00-000000000002', '3c200000-0000-4000-fe00-000000000002', '5c200000-0000-4000-fe00-000000000001', 1);
insert into public.fee_heads (id, name, code, sort_order) values ('62200000-0000-4000-fe00-000000000001', 'CI Tuition', 'CI-TUI', 97);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63200000-0000-4000-fe00-000000000001', '2c100000-0000-4000-fe00-000000000002', 'CI Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values ('2c100000-0000-4000-fe00-000000000002', '3c200000-0000-4000-fe00-000000000002', '62200000-0000-4000-fe00-000000000001', 1200000, '63200000-0000-4000-fe00-000000000001');
-- students (photo_path set = has a photo)
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date, photo_path, address, village_town, district) values
  ('56200000-0000-4000-fe00-000000000001', 'CI-01', 'Anu Reddy',   'female', '2016-01-15', '2022-06-01', '56200000-0000-4000-fe00-000000000001/p.jpg', 'House 12, Gandhi Road', 'Yerraguntla', 'YSR Kadapa'),
  ('56200000-0000-4000-fe00-000000000002', 'CI-02', 'Bala Kumar',  'male',   '2016-02-15', '2022-06-01', '56200000-0000-4000-fe00-000000000002/p.jpg', 'House 3', 'Yerraguntla', 'YSR Kadapa'),
  ('56200000-0000-4000-fe00-000000000003', 'CI-03', 'Chitra NoPhoto', 'female', '2016-03-15', '2022-06-01', null, null, null, null),
  ('56200000-0000-4000-fe00-000000000004', 'CI-04', 'Dev Top',     'male',   '2014-04-15', '2020-06-01', '56200000-0000-4000-fe00-000000000004/p.jpg', null, null, null),
  ('56200000-0000-4000-fe00-000000000005', 'CI-05', 'Eka Top',     'female', '2014-05-15', '2020-06-01', '56200000-0000-4000-fe00-000000000005/p.jpg', null, null, null),
  ('56200000-0000-4000-fe00-000000000006', 'CI-06', 'Left Boy',    'male',   '2016-06-15', '2022-06-01', '56200000-0000-4000-fe00-000000000006/p.jpg', null, null, null),
  ('56200000-0000-4000-fe00-000000000007', 'CI-07', 'No Class',    'male',   '2016-07-15', '2022-06-01', '56200000-0000-4000-fe00-000000000007/p.jpg', null, null, null),
  ('56200000-0000-4000-fe00-000000000008', 'CI-08', 'Auto Left',   'male',   '2016-08-15', '2022-06-01', '56200000-0000-4000-fe00-000000000008/p.jpg', null, null, null),
  ('56200000-0000-4000-fe00-000000000009', 'CI-09', 'Auto Passed', 'female', '2016-09-15', '2022-06-01', '56200000-0000-4000-fe00-000000000009/p.jpg', null, null, null),
  ('56200000-0000-4000-fe00-000000000010', 'CI-10', 'Auto Tc',     'female', '2016-10-15', '2022-06-01', '56200000-0000-4000-fe00-000000000010/p.jpg', null, null, null);
update public.students set status = 'left', status_date = '2024-08-01' where id = '56200000-0000-4000-fe00-000000000006';
insert into public.guardians (id, full_name, phone) values ('57200000-0000-4000-fe00-000000000001', 'Parent One', '9000000001'), ('57200000-0000-4000-fe00-000000000002', 'Parent Two', '9000000002');
insert into public.student_guardians (student_id, guardian_id, relation, is_primary) select id, '57200000-0000-4000-fe00-000000000001', 'father', true from public.students where id::text like '56200000-%' and id::text <> '56200000-0000-4000-fe00-000000000002';
insert into public.student_guardians (student_id, guardian_id, relation, is_primary) values ('56200000-0000-4000-fe00-000000000002', '57200000-0000-4000-fe00-000000000002', 'mother', true);
insert into public.student_profiles (student_id, details) values ('56200000-0000-4000-fe00-000000000001', '{"name_te": "అను రెడ్డి", "blood_group": "O+"}'::jsonb);
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no)
  select s.id, '2c100000-0000-4000-fe00-000000000001', case when s.admission_no in ('CI-04', 'CI-05') then '3d200000-0000-4000-fe00-000000000002'::uuid else '3d200000-0000-4000-fe00-000000000001'::uuid end, right(s.admission_no, 2)::int
    from public.students s where s.id::text like '56200000-%' and s.admission_no <> 'CI-07';

create function pg_temp.fp_cards() returns text language sql as $$
  select md5(coalesce((select string_agg(concat_ws(',', k.id, k.number, k.student_id, k.status, k.cancel_kind, k.cancel_reason, k.cancel_ref, (k.cancelled_at is null), k.photo_pending), '|' order by k.number) from public.id_cards k where k.student_id::text like '56200000-%'), ''))
$$;
create function pg_temp.card_id(p_number text) returns uuid language sql as $$ select id from public.id_cards where number = p_number $$;
grant execute on function pg_temp.card_id(text) to authenticated, anon;

-- ================= refusals: nobody but the Admin and the office duty holder
create function pg_temp.refused_all(p_who text) returns void language plpgsql as $$
declare f text;
begin
  foreach f in array array[
    $q$select public.id_card_sections()$q$,
    $q$select public.id_card_candidates('3d200000-0000-4000-fe00-000000000001')$q$,
    $q$select public.id_card_issue(array['56200000-0000-4000-fe00-000000000001']::uuid[])$q$,
    $q$select public.id_card_print_data(array[gen_random_uuid()])$q$,
    $q$select public.id_card_print(array[gen_random_uuid()])$q$,
    $q$select public.id_card_replace(gen_random_uuid(), 'lost')$q$,
    $q$select public.id_card_cancel(gen_random_uuid(), 'mistake')$q$,
    $q$select public.id_card_lookup('ID/CI-2024-25/0001')$q$,
    $q$select public.id_card_register('2c100000-0000-4000-fe00-000000000001')$q$,
    $q$select public.id_card_register_export('2c100000-0000-4000-fe00-000000000001', 'csv')$q$,
    $q$select public.id_cards_for_student('56200000-0000-4000-fe00-000000000001')$q$,
    $q$select public.id_card_settings_get()$q$,
    $q$select public.id_card_settings_save('ID', false, false)$q$] loop
    perform pg_temp.throws(f, p_who || ': refused — ' || split_part(split_part(f, '(', 1), '.', 2), '42501');
  end loop;
end $$;
select pg_temp.login_as('00000000-0000-4000-fe00-000000000004'); select pg_temp.refused_all('teacher with every duty');
select pg_temp.counts($$select count(*) from public.id_cards$$, 0, 'teacher: reads no card rows (and there are none yet)');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000003'); select pg_temp.refused_all('office with student records only');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000006'); select pg_temp.refused_all('office with fee access');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000005'); select pg_temp.refused_all('deactivated Admin');
select pg_temp.login_as(null); select pg_temp.refused_all('not signed in');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
select pg_temp.throws($$select public.id_card_settings_save('ID', false, false)$$, 'office duty holder: cannot change the settings', '42501');
select pg_temp.throws($$select public.id_card_cancel(gen_random_uuid(), 'mistake')$$, 'office duty holder: cannot cancel a card (Admin only)', '42501');
select pg_temp.logout();

-- ================= photo rules
select pg_temp.ok(app.photo_problem(300, 400, 100000, 'image/jpeg') is null and app.photo_problem(600, 800, 4000000, 'image/png') is null, 'photo rules: a good JPEG or PNG passes');
select pg_temp.ok(app.photo_problem(299, 400, 100000, 'image/jpeg') like '%too small%' and app.photo_problem(300, 399, 100000, 'image/jpeg') like '%too small%', 'photo rules: smaller than 300 x 400 is refused');
select pg_temp.ok(app.photo_problem(600, 800, 5242881, 'image/jpeg') like '%5 MB%' and app.photo_problem(600, 800, 5242880, 'image/jpeg') is null, 'photo rules: over 5 MB is refused, exactly 5 MB is fine');
select pg_temp.ok(app.photo_problem(600, 800, 1000, 'image/gif') like '%JPEG or PNG%' and app.photo_problem(600, 800, 1000, null) is not null, 'photo rules: only JPEG or PNG');
select pg_temp.ok(app.photo_problem(1600, 800, 1000, 'image/jpeg') like '%wrong shape%' and app.photo_problem(300, 900, 1000, 'image/jpeg') like '%wrong shape%', 'photo rules: a very wide or very thin picture is refused (crop to passport size)');
select pg_temp.ok((select not public from storage.buckets where id = 'student-photos') and (select file_size_limit from storage.buckets where id = 'student-photos') = 5242880, 'photo storage: private (no public links) and limited to 5 MB');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
select pg_temp.lives($$select public.student_photo_set('56200000-0000-4000-fe00-000000000003', '56200000-0000-4000-fe00-000000000003/new.jpg', 600, 800, 200000, 'image/jpeg')$$, 'office duty holder: can add a photo that passes the rules');
select pg_temp.ok((select photo_path from public.students where id = '56200000-0000-4000-fe00-000000000003') = '56200000-0000-4000-fe00-000000000003/new.jpg', 'photo: the path is saved on the student');
select pg_temp.throws($$select public.student_photo_set('56200000-0000-4000-fe00-000000000003', '56200000-0000-4000-fe00-000000000003/x.jpg', 100, 100, 200000, 'image/jpeg')$$, 'photo: a too-small photo is refused', '23514');
select pg_temp.throws($$select public.student_photo_set('56200000-0000-4000-fe00-000000000003', '56200000-0000-4000-fe00-000000000001/x.jpg', 600, 800, 200000, 'image/jpeg')$$, 'photo: a path under another student is refused', '23514');
create temp table _plan as select public.student_photos_plan('[{"name":"ci-01.JPG","width":600,"height":800,"bytes":100000,"mime":"image/jpeg"},{"name":"CI-02.png","width":200,"height":300,"bytes":100000,"mime":"image/png"},{"name":"CI-99.jpg","width":600,"height":800,"bytes":1000,"mime":"image/jpeg"},{"name":"CI-01.png","width":600,"height":800,"bytes":1000,"mime":"image/png"},{"name":"CI-06.jpg","width":600,"height":800,"bytes":1000,"mime":"image/jpeg"}]'::jsonb) j;
grant all on _plan to authenticated;
select pg_temp.ok((select string_agg(x ->> 'status', ',' order by ord) from _plan, jsonb_array_elements(j) with ordinality t(x, ord)) = 'ok,problem,no_match,duplicate,student_left', 'bulk upload preview: matched by admission number (any case, any extension); too small, no match, duplicate and left students are listed as problems', (select string_agg(x ->> 'status', ',' order by ord) from _plan, jsonb_array_elements(j) with ordinality t(x, ord)));
select pg_temp.ok((select x ->> 'student' from _plan, jsonb_array_elements(j) x where x ->> 'admission_no' = 'CI-01' limit 1) = 'Anu Reddy' and (select (x ->> 'replaces')::boolean from _plan, jsonb_array_elements(j) x where x ->> 'admission_no' = 'CI-01' limit 1), 'bulk upload preview: shows who it matched and that it would replace an existing photo');
select pg_temp.lives($$select public.student_photos_bulk_log(12, 'CI A A')$$, 'bulk upload: the count is logged');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000006');
select pg_temp.throws($$select public.student_photo_set('56200000-0000-4000-fe00-000000000003', '56200000-0000-4000-fe00-000000000003/n.jpg', 600, 800, 200000, 'image/jpeg')$$, 'office with fee access only: cannot add photos', '42501');
select pg_temp.throws($$select public.student_photos_plan('[]'::jsonb)$$, 'office with fee access only: cannot preview a bulk upload', '42501');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.student_photo_set('56200000-0000-4000-fe00-000000000003', '56200000-0000-4000-fe00-000000000003/n.jpg', 600, 800, 200000, 'image/jpeg')$$, 'not signed in: cannot add photos', '42501');
select pg_temp.logout();

-- ================= issuing: the office duty holder
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
create temp table _cand as select public.id_card_candidates('3d200000-0000-4000-fe00-000000000001') j;
grant all on _cand to authenticated;
select pg_temp.ok((select string_agg(x ->> 'name' || ':' || coalesce(x ->> 'problem', 'ok'), ',' order by ord) from _cand, jsonb_array_elements(j) with ordinality t(x, ord) where x ->> 'name' in ('Anu Reddy', 'Left Boy')) = 'Anu Reddy:ok,Left Boy:Student has left', 'preview: problems are listed (a student who left)');
create temp table _i1 as select public.id_card_issue(array['56200000-0000-4000-fe00-000000000007', '56200000-0000-4000-fe00-000000000006', '56200000-0000-4000-fe00-000000000002', '56200000-0000-4000-fe00-000000000001', '56200000-0000-4000-fe00-000000000003']::uuid[]) j;
grant all on _i1 to authenticated;
select pg_temp.ok((select string_agg(x ->> 'name' || '=' || (x ->> 'number'), ',' order by x ->> 'number') from _i1, jsonb_array_elements(j -> 'issued') x) = 'Anu Reddy=ID/CI-2024-25/0001,Bala Kumar=ID/CI-2024-25/0002,Chitra NoPhoto=ID/CI-2024-25/0003', 'issue: numbers are gap-free and follow class, section and roll order (Chitra now has a photo)', (select string_agg(x ->> 'name' || '=' || (x ->> 'number'), ',' order by x ->> 'number') from _i1, jsonb_array_elements(j -> 'issued') x));
select pg_temp.ok((select string_agg(x ->> 'name' || ':' || (x ->> 'reason'), ',' order by x ->> 'name') from _i1, jsonb_array_elements(j -> 'skipped') x) = 'Left Boy:Student has left,No Class:Not in a class this year', 'issue: a student who left and a student with no class are skipped with the reason');
select pg_temp.ok((select (public.id_card_issue(array['56200000-0000-4000-fe00-000000000001']::uuid[]) -> 'skipped' -> 0 ->> 'reason')) = 'Already has a card', 'issue: a student who already has a card this year is skipped');
select pg_temp.ok((select next_no from public.id_card_series where academic_year_id = '2c100000-0000-4000-fe00-000000000001') = 4, 'numbering: skipped students used no number (next is 4)');
select pg_temp.throws($$select public.id_card_issue(array['56200000-0000-4000-fe00-000000000008']::uuid[], '{"56200000-0000-4000-fe00-000000000008": "no photo needed"}'::jsonb)$$, 'issue: the duty holder cannot use the photo-pending override (Admin only)', '42501');
select pg_temp.throws($$select public.id_card_issue(null)$$, 'issue: nothing chosen is refused', '23514');
select pg_temp.ok((select count(*) from public.id_cards where status = 'issued') = 3 and (select count(*) from public.id_card_prints) = 3, 'issue: each new card has its first print recorded');
-- what is on the card
create temp table _b1 as select public.id_card_print_data(array[pg_temp.card_id('ID/CI-2024-25/0001'), pg_temp.card_id('ID/CI-2024-25/0002')]) j;
grant all on _b1 to authenticated;
select pg_temp.ok((select x ->> 'qr' = x ->> 'number' and (x ->> 'qr') ~ '^ID/CI-2024-25/[0-9]{4}$' from _b1, jsonb_array_elements(j -> 'cards') x limit 1) and (select bool_and(x ->> 'qr' = x ->> 'number') from _b1, jsonb_array_elements(j -> 'cards') x), 'QR: holds exactly the card number, nothing else, for every card');
select pg_temp.ok((select x ->> 'name_te' from _b1, jsonb_array_elements(j -> 'cards') x where x ->> 'number' = 'ID/CI-2024-25/0001') = 'అను రెడ్డి' and (select x ->> 'name_te' from _b1, jsonb_array_elements(j -> 'cards') x where x ->> 'number' = 'ID/CI-2024-25/0002') is null, 'card: the Telugu name is there only when it is saved (never a guess)');
select pg_temp.ok((select x ->> 'blood_group' from _b1, jsonb_array_elements(j -> 'cards') x where x ->> 'number' = 'ID/CI-2024-25/0001') = 'O+' and (select x ->> 'blood_group' from _b1, jsonb_array_elements(j -> 'cards') x where x ->> 'number' = 'ID/CI-2024-25/0002') is null, 'card: the blood group is there only when it is saved');
select pg_temp.ok((select x ->> 'phone' from _b1, jsonb_array_elements(j -> 'cards') x where x ->> 'number' = 'ID/CI-2024-25/0002') = '9000000002', 'card: one parent phone, the primary contact');
select pg_temp.ok((select not exists (select 1 from jsonb_array_elements(j -> 'cards') x, jsonb_object_keys(x) k where k not in ('card_id','number','qr','status','year','name','name_te','class','section','admission_no','phone','blood_group','photo_path','photo_pending'))
               from _b1), 'card: ONLY the allowed fields are ever returned (no address, date of birth, government ID, fee, marks, attendance)');
select pg_temp.ok(position('Gandhi' in (select (j -> 'cards')::text from _b1)) = 0 and position('Yerraguntla' in (select (j -> 'cards')::text from _b1)) = 0 and position('2016-01-15' in (select (j -> 'cards')::text from _b1)) = 0, 'card: no student address and no date of birth anywhere in what is printed');
select pg_temp.ok((select (x ->> 'photo_path') is not null and (x ->> 'photo_pending') = 'false' from _b1, jsonb_array_elements(j -> 'cards') x limit 1), 'card: the photo is referenced by its private path only (the page makes a short-lived link)');
select pg_temp.logout();

-- ================= the two switches (Admin only, logged) and the Admin's photo-pending override
select pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
select pg_temp.lives($$select public.id_card_settings_save('ID', false, true)$$, 'settings: the Admin switches the phone off');
select pg_temp.ok((select x ->> 'phone' is null and x ->> 'blood_group' = 'O+' from jsonb_array_elements(public.id_card_print_data(array[pg_temp.card_id('ID/CI-2024-25/0001')]) -> 'cards') x), 'settings: the phone is gone from the printed card at once; the blood group stays');
select pg_temp.lives($$select public.id_card_settings_save('ID', false, false)$$, 'settings: and the blood group off too');
select pg_temp.ok((select bool_and(x ->> 'blood_group' is null and x ->> 'phone' is null) from jsonb_array_elements(public.id_card_print_data(array[pg_temp.card_id('ID/CI-2024-25/0001'), pg_temp.card_id('ID/CI-2024-25/0002')]) -> 'cards') x), 'settings: both are off for every card');
select pg_temp.ok((select count(*) from public.audit_logs where action = 'idcard.setting' and actor_user_id = '00000000-0000-4000-fe00-000000000001') = 2, 'settings: each switch is in the log (2 entries)');
select pg_temp.lives($$select public.id_card_settings_save('ID', true, true)$$, 'settings: both back on');
select pg_temp.ok((select count(*) from public.audit_logs where action = 'idcard.setting') = 4, 'settings: switching back on is logged too');
update public.students set photo_path = null where id = '56200000-0000-4000-fe00-000000000010';
create temp table _o1 as select public.id_card_issue(array['56200000-0000-4000-fe00-000000000010']::uuid[], '{"56200000-0000-4000-fe00-000000000010": "Photo will arrive on Monday"}'::jsonb) j;
grant all on _o1 to authenticated;
select pg_temp.ok((select x ->> 'number' from _o1, jsonb_array_elements(j -> 'issued') x) = 'ID/CI-2024-25/0004' and (select photo_pending from public.id_cards where number = 'ID/CI-2024-25/0004') and (select pending_reason from public.id_cards where number = 'ID/CI-2024-25/0004') = 'Photo will arrive on Monday', 'override: the Admin issues a card without a photo, with the reason saved');
select pg_temp.ok((select x ->> 'photo_pending' = 'true' and x ->> 'photo_path' is null from jsonb_array_elements(public.id_card_print_data(array[pg_temp.card_id('ID/CI-2024-25/0004')]) -> 'cards') x), 'override: the printed card shows the grey "photo pending" box');
select pg_temp.ok((select (public.id_card_issue(array['56200000-0000-4000-fe00-000000000003']::uuid[], '{}') -> 'skipped' -> 0 ->> 'reason')) = 'Already has a card', 'override: a card that exists is never issued twice');
select pg_temp.logout();

-- two more cards (by the duty holder) for the automatic-cancel tests
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
select pg_temp.ok((select string_agg(x ->> 'number', ',' order by x ->> 'number') from jsonb_array_elements(public.id_card_issue(array['56200000-0000-4000-fe00-000000000008', '56200000-0000-4000-fe00-000000000009']::uuid[]) -> 'issued') x) = 'ID/CI-2024-25/0005,ID/CI-2024-25/0006', 'numbering continues without a gap (0005, 0006)');

-- ================= printer jam (same person, within 10 minutes) and nothing else
select pg_temp.ok((select jsonb_array_length(public.id_card_print(array[pg_temp.card_id('ID/CI-2024-25/0001'), pg_temp.card_id('ID/CI-2024-25/0002')]) -> 'cards')) = 2, 'reprint: the same person printing the same sheet again within 10 minutes keeps the same cards');
select pg_temp.ok((select count(*) from public.id_card_prints where card_id = pg_temp.card_id('ID/CI-2024-25/0001')) = 2, 'reprint: it is recorded as a second print');
select pg_temp.logout();
select pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
select pg_temp.throws($$select public.id_card_print(array[pg_temp.card_id('ID/CI-2024-25/0001')])$$, 'reprint: another person cannot reprint the same card (replace it instead)', '23514');
select pg_temp.logout();

-- ================= lost cards: a new number, the old one cancelled
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
select pg_temp.throws($$select public.id_card_replace(pg_temp.card_id('ID/CI-2024-25/0001'), 'because')$$, 'replace: the reason must be from the list', '23514');
select pg_temp.throws($$select public.id_card_replace(pg_temp.card_id('ID/CI-2024-25/0001'), 'other')$$, 'replace: "other" needs a note', '23514');
create temp table _r1 as select public.id_card_replace(pg_temp.card_id('ID/CI-2024-25/0001'), 'lost') j;
grant all on _r1 to authenticated;
select pg_temp.ok((select j ->> 'number' from _r1) = 'ID/CI-2024-25/0007' and (select j ->> 'old_number' from _r1) = 'ID/CI-2024-25/0001', 'replace: the lost card gets a NEW number (0007)');
select pg_temp.ok((select status || '|' || cancel_kind from public.id_cards where number = 'ID/CI-2024-25/0001') = 'cancelled|lost', 'replace: the old card is cancelled as lost');
select pg_temp.ok((select jsonb_array_length(j -> 'print' -> 'cards') from _r1) = 1, 'replace: the new card is ready to print');
select pg_temp.throws($$select public.id_card_print_data(array[pg_temp.card_id('ID/CI-2024-25/0001')])$$, 'a cancelled card cannot be printed', '23514');
select pg_temp.throws($$select public.id_card_replace(pg_temp.card_id('ID/CI-2024-25/0001'), 'lost')$$, 'a cancelled card cannot be replaced again', '23514');
select pg_temp.throws($$select public.id_card_replace(pg_temp.card_id('ID/CI-2024-25/0004'), 'damaged')$$, 'replace: the duty holder cannot replace a photo-pending card (Admin only)', '42501');
select pg_temp.ok((public.id_card_lookup('id/ci-2024-25/0001') ->> 'status') = 'cancelled' and (public.id_card_lookup('ID/CI-2024-25/0001') ->> 'replaced_by') = 'ID/CI-2024-25/0007', 'lookup: the old number shows cancelled and says which card replaced it (any letter case)');
select pg_temp.ok((public.id_card_lookup('ID/CI-2024-25/0007') ->> 'status') = 'issued' and (public.id_card_lookup('ID/CI-2024-25/0007') ->> 'name') = 'Anu Reddy', 'lookup: the new number shows the student');
select pg_temp.ok((public.id_card_lookup('ID/NOPE/0001') ->> 'found') = 'false', 'lookup: an unknown number is "not found"');
select pg_temp.logout();
select pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
select pg_temp.ok((select public.id_card_replace(pg_temp.card_id('ID/CI-2024-25/0004'), 'damaged') ->> 'number') = 'ID/CI-2024-25/0008', 'replace: the Admin replaces the photo-pending card (0008)');
select pg_temp.ok((select photo_pending from public.id_cards where number = 'ID/CI-2024-25/0008'), 'replace: the photo-pending flag carries over to the new card');
select pg_temp.lives($$select public.id_card_cancel(pg_temp.card_id('ID/CI-2024-25/0002'), 'Issued by mistake')$$, 'cancel: the Admin cancels a card with a reason');
select pg_temp.ok((select cancel_kind || '|' || cancel_reason from public.id_cards where number = 'ID/CI-2024-25/0002') = 'admin|Issued by mistake', 'cancel: the kind and the reason are kept');
select pg_temp.throws($$select public.id_card_cancel(pg_temp.card_id('ID/CI-2024-25/0002'), 'again')$$, 'cancel: a card cannot be cancelled twice', '23514');
select pg_temp.throws($$select public.id_card_cancel(pg_temp.card_id('ID/CI-2024-25/0003'), 'no')$$, 'cancel: a reason is required', '23514');
select pg_temp.logout();

-- ================= a student who leaves: every card is cancelled at once
update public.students set status = 'left' where id = '56200000-0000-4000-fe00-000000000008';
update public.students set status = 'passed_out' where id = '56200000-0000-4000-fe00-000000000009';
update public.students set status = 'tc_issued' where id = '56200000-0000-4000-fe00-000000000010';
select pg_temp.ok((select string_agg(number || ':' || status || ':' || coalesce(cancel_kind, ''), ',' order by number) from public.id_cards where number in ('ID/CI-2024-25/0005', 'ID/CI-2024-25/0006', 'ID/CI-2024-25/0008')) = 'ID/CI-2024-25/0005:cancelled:student_left,ID/CI-2024-25/0006:cancelled:student_left,ID/CI-2024-25/0008:cancelled:student_left', 'leaving: left, passed out and TC issued all cancel the cards automatically');
select pg_temp.ok((select count(*) from public.audit_logs where action = 'idcard.auto_cancel') = 3, 'leaving: each automatic cancellation is in the log');
update public.students set status = 'active' where id = '56200000-0000-4000-fe00-000000000008';
select pg_temp.ok((select status from public.id_cards where number = 'ID/CI-2024-25/0005') = 'cancelled', 'leaving: a returning student does NOT get the old card back');
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
select pg_temp.ok((select x ->> 'number' from jsonb_array_elements(public.id_card_issue(array['56200000-0000-4000-fe00-000000000008']::uuid[]) -> 'issued') x) = 'ID/CI-2024-25/0009', 'leaving: a returning student gets a new card (0009)');
select pg_temp.logout();

-- ================= register and its export
select pg_temp.login_as('00000000-0000-4000-fe00-000000000002');
select pg_temp.ok((public.id_card_register('2c100000-0000-4000-fe00-000000000001') ->> 'total')::int = 9 and (public.id_card_register('2c100000-0000-4000-fe00-000000000001') ->> 'next_no')::int = 10, 'register: 9 cards, next number 10');
select pg_temp.ok((select x ->> 'replaced_by' from jsonb_array_elements(public.id_card_register('2c100000-0000-4000-fe00-000000000001') -> 'rows') x where x ->> 'number' = 'ID/CI-2024-25/0001') = 'ID/CI-2024-25/0007', 'register: shows what replaced a card');
select pg_temp.lives($$select public.id_card_register_export('2c100000-0000-4000-fe00-000000000001', 'xlsx')$$, 'register export: allowed');
select pg_temp.ok(position('Gandhi' in public.id_card_register('2c100000-0000-4000-fe00-000000000001')::text) = 0 and position('9000000' in public.id_card_register('2c100000-0000-4000-fe00-000000000001')::text) = 0, 'register: no address and no phone number in it');
select pg_temp.ok((select jsonb_array_length(public.id_cards_for_student('56200000-0000-4000-fe00-000000000001'))) = 2, 'a student''s cards: both the cancelled and the new one');
select pg_temp.logout();

-- ================= the log: calm, factual, and nothing private
select pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
select pg_temp.ok((select count(*) from public.audit_logs where action = 'idcard.lookup' and actor_user_id = '00000000-0000-4000-fe00-000000000002') = 5, 'lookup: every lookup, found or not, is in the log (5 lookups)');
select pg_temp.ok(not exists (select 1 from public.audit_logs a where (a.action like 'idcard.%' or a.table_name like 'id_card%')
                 and regexp_replace(coalesce(a.details::text, '') || coalesce(a.new_data::text, '') || coalesce(a.old_data::text, ''), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', 'g')
                     ~* '(9000000[0-9]{3}|[అ-హ]|gandhi|yerraguntla|\.jpg|\.png|date_of_birth|blood_group\":\"|o\+)'), 'log: no phone number, blood group, Telugu name, address or photo name in any ID card entry');
select pg_temp.ok(not exists (select 1 from public.audit_logs a where a.table_name = 'id_cards' and a.new_data ? 'payload' and a.new_data ->> 'payload' <> '[REDACTED]'), 'log: what is printed on a card (payload) is not copied into the log');
select pg_temp.ok(not exists (select 1 from public.audit_logs a where a.action = 'student.photo' and a.details::text ~* '(jpg|png|/)'), 'log: a photo entry says only who added a photo, never the picture or its file name');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'student.photos_bulk' and (details ->> 'count')::int = 12 and details::text not like '%CI-01%'), 'log: a bulk upload records how many and which class, no file names');
select pg_temp.ok((select (public.audit_entries(now() - interval '1 hour', null, null, 'idcards', null, null, null, 300) ->> 'total')::int) >= 12, 'log: the kind "ID cards" lists them');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, 'idcards', null, null, null, 300) -> 'rows') r where r ->> 'summary' = 'ID card ID/CI-2024-25/0001 replaced by ID/CI-2024-25/0007, reason: lost'), 'log: a replacement reads as a calm sentence');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_record_history('students', '56200000-0000-4000-fe00-000000000001')) r where r ->> 'action' = 'idcard.card_issued' and r ->> 'summary' = 'ID card ID/CI-2024-25/0001 issued'), 'log: the student''s History shows the card being issued');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.audit_record_history('students', '56200000-0000-4000-fe00-000000000001')) r where r ->> 'action' = 'idcard.replace'), 'log: and the replacement');
select pg_temp.ok((select jsonb_array_length(public.id_card_preview(array['56200000-0000-4000-fe00-000000000001', '56200000-0000-4000-fe00-000000000006']::uuid[]) -> 'cards')) = 1 and (select x ->> 'number' is null and x ->> 'qr' is null from jsonb_array_elements(public.id_card_preview(array['56200000-0000-4000-fe00-000000000001']::uuid[]) -> 'cards') x), 'preview: shows the cards before issuing (no number yet, a student who left is not in it)');
select pg_temp.ok((select (i ->> 'count')::int from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i ->> 'key' = 'idcards_look') >= 3, 'alert: replaced cards (2) and the photo-pending override (1) are counted');
select pg_temp.ok((select (i ->> 'count')::int from jsonb_array_elements(public.audit_alerts(7) -> 'items') i where i ->> 'key' = 'idcards_look')
                = (public.audit_entries((date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '6 days') at time zone 'Asia/Kolkata', null, null, null, null, null, null, 1, 0, 'idcards_look') ->> 'total')::int, 'alert: the card count equals the page it opens');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.audit_entries(now() - interval '1 hour', null, null, null, null, null, null, 300, 0, 'idcards_look') -> 'rows') r where r ->> 'action' not in ('idcard.replace', 'idcard.issue')), 'alert: only replacements and photo-pending issues are listed');
select pg_temp.ok((select jsonb_array_length(public.audit_alerts(7) -> 'items')) = 10, 'alert: the dashboard now carries 10 cards');
select pg_temp.logout();

-- ================= a promotion rollover and its undo: nothing cancelled or stray is left behind
select pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
select pg_temp.lives($$select public.id_card_issue(array['56200000-0000-4000-fe00-000000000004', '56200000-0000-4000-fe00-000000000005']::uuid[])$$, 'setup: cards for the two students of the top class');
create temp table _fp0 as select pg_temp.fp_cards() fp, (select count(*) from public.id_cards) n, (select next_no from public.id_card_series where academic_year_id = '2c100000-0000-4000-fe00-000000000001') nx;
grant all on _fp0 to authenticated;
create temp table _rc as select public.rollover_confirm('2c100000-0000-4000-fe00-000000000001', '2c100000-0000-4000-fe00-000000000002', '{}', true, 'CI-2025-26') j;
grant all on _rc to authenticated;
select pg_temp.ok((select count(*) from public.id_cards k where k.student_id in ('56200000-0000-4000-fe00-000000000004', '56200000-0000-4000-fe00-000000000005') and k.status = 'cancelled' and k.cancel_kind = 'student_left' and k.cancel_ref = 'rollover:' || (select j ->> 'run_id' from _rc)) = 2, 'rollover: the cards of the two students who passed out are cancelled automatically and tagged with the rollover');
select pg_temp.ok((select status from public.id_cards where number = 'ID/CI-2024-25/0007') = 'issued', 'rollover: the card of a student who moved up is untouched (it simply expires with its printed year)');
create function pg_temp.blocked_by(p_sql text, p_run uuid, p_key text) returns boolean language plpgsql as $$
declare r jsonb;
begin
  begin
    execute p_sql;
    r := public.rollover_undo_check(p_run);
    raise exception 'RESULT %', r::text;
  exception when others then
    perform pg_temp.login_as('00000000-0000-4000-fe00-000000000001');
    if sqlerrm like 'RESULT %' then
      r := substr(sqlerrm, 8)::jsonb;
      return not (r ->> 'allowed')::boolean and exists (select 1 from jsonb_array_elements(r -> 'reasons') x where x ->> 'key' = p_key);
    end if;
    raise;
  end;
end $$;
grant execute on function pg_temp.blocked_by(text, uuid, text) to authenticated;
select pg_temp.ok((public.rollover_undo_check((select (j ->> 'run_id')::uuid from _rc)) ->> 'allowed')::boolean, 'rollover: undo is allowed while no card exists for the new year');
select pg_temp.ok(pg_temp.blocked_by($$select public.id_card_issue(array['56200000-0000-4000-fe00-000000000001']::uuid[])$$, (select (j ->> 'run_id')::uuid from _rc), 'id_cards'), 'rollover: once a card is issued for the new year, undo is refused (so no stray card can be left behind)');
select pg_temp.ok((public.rollover_undo_check((select (j ->> 'run_id')::uuid from _rc)) ->> 'allowed')::boolean, 'rollover: that trial was rolled back, undo is allowed again');
select pg_temp.lives($$select public.rollover_undo((select (j ->> 'run_id')::uuid from _rc))$$, 'rollover: undo');
select pg_temp.ok((select pg_temp.fp_cards() = fp and (select count(*) from public.id_cards) = n from _fp0), 'undo: every card is exactly as before the rollover (the two cancelled cards are issued again, nothing else changed)');
select pg_temp.ok((select count(*) from public.id_cards where cancel_ref is not null) = 0 and (select count(*) from public.id_cards where academic_year_id = '2c100000-0000-4000-fe00-000000000002') = 0 and not exists (select 1 from public.id_card_series where academic_year_id = '2c100000-0000-4000-fe00-000000000002'), 'undo: no cancelled-by-rollover card and no card or numbering for the new year is left');
select pg_temp.ok((select status from public.students where id = '56200000-0000-4000-fe00-000000000004') = 'active', 'undo: the students are active again');
select pg_temp.logout();
