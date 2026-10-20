-- ID cards (students): database part. Rules IC1-IC12 in DECISIONS.md.
--   * Admin, or an OFFICE person holding the "Certificates & ID cards" duty. A teacher never, even with the duty.
--   * Gap-free numbers per academic year (ID/2026-27/0001), given when the cards are issued.
--   * The QR holds only the card number. The back never carries an address, date of birth, government ID, fees, marks or attendance.
--   * Cards of a student who leaves (left / passed out / TC issued) are cancelled automatically; a rollover undo puts back exactly those.
--   * Photos are private children's data: rules for adding them (type, size, shape), bulk matching by admission number, nothing about the photo in the log.

create or replace function app.idcard_can() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or app.cert_is_office_with_duty()
$$;
revoke execute on function app.idcard_can() from public, anon;
grant execute on function app.idcard_can() to authenticated;       -- the read policies below call it

create or replace function app.require_idcard() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.idcard_can() then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;
revoke execute on function app.require_idcard() from public, anon, authenticated;

-- ------------------------------------------------------------------ tables
create table public.id_card_settings (
  id              smallint primary key default 1 check (id = 1),
  prefix          text not null default 'ID' check (prefix ~ '^[A-Za-z0-9_-]{1,12}$'),
  show_phone      boolean not null default true,     -- the parent phone on the back (Admin can switch it off for the whole school)
  show_blood_group boolean not null default true,    -- the blood group on the back (same)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid
);
insert into public.id_card_settings (id) values (1);

create table public.id_card_series (
  academic_year_id uuid primary key references public.academic_years (id) on delete restrict,
  next_no          integer not null default 1 check (next_no >= 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid
);

create table public.id_card_batches (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  label            text not null,
  issued_count     integer not null,
  skipped_count    integer not null,
  number_from      text,
  number_to        text,
  photo_pending_count integer not null default 0,
  issued_by        uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid
);

create table public.id_cards (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  seq              integer not null,
  number           text not null unique,
  student_id       uuid not null references public.students (id) on delete restrict,
  batch_id         uuid references public.id_card_batches (id) on delete set null,
  status           text not null default 'issued' check (status in ('issued', 'cancelled')),
  payload          jsonb not null,           -- what is on the card, frozen at issue (never copied into the log)
  photo_pending    boolean not null default false,
  pending_reason   text,
  replaces_id      uuid references public.id_cards (id) on delete set null,
  issued_by        uuid references public.staff (id) on delete set null,
  cancel_kind      text check (cancel_kind in ('lost', 'damaged', 'parent_request', 'other', 'admin', 'student_left')),
  cancel_reason    text,
  cancelled_at     timestamptz,
  cancelled_by     uuid references public.staff (id) on delete set null,
  cancel_ref       text,                      -- 'rollover:<run id>' when a promotion rollover cancelled it (so an undo can put it back)
  is_demo          boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid,
  unique (academic_year_id, seq),
  check (status = 'issued' or (cancel_kind is not null and cancelled_at is not null)),
  check (not photo_pending or length(btrim(coalesce(pending_reason, ''))) >= 3)
);
create unique index id_cards_one_issued_per_year on public.id_cards (student_id, academic_year_id) where status = 'issued';
create index id_cards_student_idx on public.id_cards (student_id);
create index id_cards_batch_idx on public.id_cards (batch_id);
create index id_cards_ref_idx on public.id_cards (cancel_ref) where cancel_ref is not null;

create table public.id_card_prints (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.id_cards (id) on delete cascade,
  copy_no    integer not null check (copy_no >= 1),
  printed_by uuid references public.staff (id) on delete set null,
  printed_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid,
  unique (card_id, copy_no)
);

select app.attach_std_triggers('public.id_card_settings');
select app.attach_std_triggers('public.id_card_series');
select app.attach_std_triggers('public.id_card_batches');
select app.attach_std_triggers('public.id_cards', '{payload}');
select app.attach_std_triggers('public.id_card_prints');

alter table public.id_card_settings enable row level security;
alter table public.id_card_series enable row level security;
alter table public.id_card_batches enable row level security;
alter table public.id_cards enable row level security;
alter table public.id_card_prints enable row level security;
revoke all on public.id_card_settings, public.id_card_series, public.id_card_batches, public.id_cards, public.id_card_prints from public, anon, authenticated, service_role;
grant select on public.id_card_settings, public.id_card_series, public.id_card_batches, public.id_cards, public.id_card_prints to authenticated;
create policy idc_settings_read on public.id_card_settings for select to authenticated using ((select app.idcard_can()));
create policy idc_series_read on public.id_card_series for select to authenticated using ((select app.idcard_can()));
create policy idc_batches_read on public.id_card_batches for select to authenticated using ((select app.idcard_can()));
create policy idc_cards_read on public.id_cards for select to authenticated using ((select app.idcard_can()));
create policy idc_prints_read on public.id_card_prints for select to authenticated using ((select app.idcard_can()));

-- ------------------------------------------------------------------ photos: the rules, the private storage
create or replace function app.photo_problem(p_w integer, p_h integer, p_bytes bigint, p_mime text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_mime is null or p_mime not in ('image/jpeg', 'image/png') then 'Use a JPEG or PNG photo.'
    when p_bytes is null or p_bytes <= 0 then 'The photo is empty.'
    when p_bytes > 5242880 then 'The photo is bigger than 5 MB.'
    when p_w is null or p_h is null or p_w < 300 or p_h < 400 then 'The photo is too small: it must be at least 300 x 400 pixels.'
    when p_w::numeric / p_h > 1.34 or p_w::numeric / p_h < 0.5 then 'The photo is the wrong shape. Crop it to a passport-size portrait.'
    else null end
$$;

update storage.buckets set file_size_limit = 5242880 where id = 'student-photos';     -- 5 MB; the bucket stays private
drop policy if exists student_photos_select on storage.objects;
drop policy if exists student_photos_insert on storage.objects;
drop policy if exists student_photos_update on storage.objects;
create policy student_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and (app.can_view_student(app.uuid_or_null((storage.foldername(name))[1])) or (select app.idcard_can())));
create policy student_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and ((select app.can_manage_students()) or (select app.idcard_can())));
create policy student_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and ((select app.can_manage_students()) or (select app.idcard_can())))
  with check (bucket_id = 'student-photos' and ((select app.can_manage_students()) or (select app.idcard_can())));

create or replace function public.student_photo_set(p_student uuid, p_path text, p_w integer, p_h integer, p_bytes bigint, p_mime text) returns void
language plpgsql security definer set search_path = '' as $$
declare prob text; st public.students;
begin
  if not (app.can_manage_students() or app.idcard_can()) then raise exception 'not allowed' using errcode = '42501'; end if;
  prob := app.photo_problem(p_w, p_h, p_bytes, p_mime);
  if prob is not null then raise exception '%', prob using errcode = '23514'; end if;
  select * into st from public.students where id = p_student;
  if st.id is null then raise exception 'Unknown student' using errcode = '23514'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> p_student::text or length(p_path) > 200 then raise exception 'The photo must be stored under this student' using errcode = '23514'; end if;
  update public.students set photo_path = p_path where id = p_student;
  perform public.log_event('student.photo', 'students', p_student::text, jsonb_build_object('summary', 'Photo ' || case when st.photo_path is null then 'added' else 'replaced' end || ' for ' || st.full_name));
end $$;

-- the preview of a bulk upload: file names match students by admission number. Nothing is saved here and nothing about the pictures is kept.
create or replace function public.student_photos_plan(p_files jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f jsonb; adm text; st public.students; prob text; out jsonb := '[]'::jsonb; seen text[] := '{}'; status text; cls text;
begin
  if not (app.can_manage_students() or app.idcard_can()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 500 then raise exception 'Choose at most 500 photos at a time' using errcode = '23514'; end if;
  for f in select * from jsonb_array_elements(p_files) loop
    adm := upper(btrim(regexp_replace(coalesce(f ->> 'name', ''), '\.[A-Za-z0-9]{2,5}$', '')));
    select * into st from public.students where admission_no = adm;
    prob := app.photo_problem(nullif(f ->> 'width', '')::int, nullif(f ->> 'height', '')::int, nullif(f ->> 'bytes', '')::bigint, f ->> 'mime');
    cls := null;
    if st.id is not null then
      select c.name || ' ' || s.name into cls from public.student_enrollments e join public.sections s on s.id = e.section_id join public.classes c on c.id = s.class_id
        join public.academic_years y on y.id = e.academic_year_id where e.student_id = st.id order by y.start_date desc limit 1;
    end if;
    status := case when st.id is null then 'no_match' when adm = any (seen) then 'duplicate' when st.status <> 'active' then 'student_left' when prob is not null then 'problem' else 'ok' end;
    seen := seen || adm;
    out := out || jsonb_build_object('name', f ->> 'name', 'admission_no', adm, 'student_id', st.id, 'student', st.full_name, 'class', cls, 'status', status, 'problem', prob, 'replaces', st.photo_path is not null);
  end loop;
  return out;
end $$;

create or replace function public.student_photos_bulk_log(p_count integer, p_label text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.can_manage_students() or app.idcard_can()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_count is null or p_count < 1 or p_count > 1000 then raise exception 'Bad photo count' using errcode = '23514'; end if;
  perform public.log_event('student.photos_bulk', 'students', null, jsonb_build_object('summary', p_count || ' photos uploaded' || coalesce(' for ' || nullif(left(btrim(p_label), 60), ''), ''), 'count', p_count));
end $$;

-- ------------------------------------------------------------------ the card
create or replace function app.idcard_payload(p_student uuid, p_year uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare st public.students; det jsonb; y public.academic_years; cls text; sec text; phone text;
begin
  select * into st from public.students where id = p_student;
  select * into y from public.academic_years where id = p_year;
  select coalesce(details, '{}'::jsonb) into det from public.student_profiles where student_id = p_student;
  det := coalesce(det, '{}'::jsonb);
  select c.name, s.name into cls, sec from public.student_enrollments e join public.sections s on s.id = e.section_id join public.classes c on c.id = s.class_id
   where e.student_id = p_student and e.academic_year_id = p_year;
  select g.phone into phone from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
   where sg.student_id = p_student and g.phone is not null order by sg.is_primary desc, sg.created_at limit 1;
  -- only what the card may carry: never an address, date of birth, government ID, fee, mark or attendance
  return jsonb_build_object('name', st.full_name, 'name_te', nullif(btrim(det ->> 'name_te'), ''), 'class', cls, 'section', sec, 'admission_no', st.admission_no,
                            'year', y.name, 'phone', phone, 'blood_group', nullif(btrim(det ->> 'blood_group'), ''));
end $$;
revoke execute on function app.idcard_payload(uuid, uuid) from public, anon, authenticated;

create or replace function app.idcard_next_number(p_year uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer; pfx text; yname text;
begin
  insert into public.id_card_series (academic_year_id) values (p_year) on conflict do nothing;
  select next_no into n from public.id_card_series where academic_year_id = p_year for update;
  update public.id_card_series set next_no = n + 1 where academic_year_id = p_year;
  select prefix into pfx from public.id_card_settings where id = 1;
  select name into yname from public.academic_years where id = p_year;
  return jsonb_build_object('seq', n, 'number', pfx || '/' || yname || '/' || lpad(n::text, 4, '0'));
end $$;
revoke execute on function app.idcard_next_number(uuid) from public, anon, authenticated;

-- the sections of the current year, for choosing a class to print
create or replace function public.id_card_sections() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare y public.academic_years;
begin
  perform app.require_idcard();
  select * into y from public.academic_years where is_current limit 1;
  return jsonb_build_object('year', y.name, 'year_id', y.id, 'sections', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'label', c.name || ' ' || s.name, 'class_id', c.id, 'class', c.name,
             'students', (select count(*) from public.student_enrollments e join public.students st on st.id = e.student_id where e.section_id = s.id and st.status = 'active'))
             order by c.sort_order, s.name)
      from public.sections s join public.classes c on c.id = s.class_id where s.academic_year_id = y.id), '[]'::jsonb));
end $$;

-- every student of a section or class with what stands in the way of a card (the preview before "Issue")
create or replace function public.id_card_candidates(p_section uuid default null, p_class uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare y public.academic_years;
begin
  perform app.require_idcard();
  select * into y from public.academic_years where is_current limit 1;
  if p_section is null and p_class is null then raise exception 'Choose a section or a class' using errcode = '23514'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('student_id', st.id, 'name', st.full_name, 'admission_no', st.admission_no, 'class', c.name, 'section', s.name, 'roll_no', e.roll_no,
            'status', st.status, 'has_photo', st.photo_path is not null, 'photo_path', st.photo_path,
            'card_number', (select k.number from public.id_cards k where k.student_id = st.id and k.academic_year_id = y.id and k.status = 'issued'),
            'card_id', (select k.id from public.id_cards k where k.student_id = st.id and k.academic_year_id = y.id and k.status = 'issued'),
            'problem', case when st.status <> 'active' then 'Student has left' when st.photo_path is null then 'No photo'
                            when exists (select 1 from public.id_cards k where k.student_id = st.id and k.academic_year_id = y.id and k.status = 'issued') then 'Already has a card' end)
            order by c.sort_order, s.name, e.roll_no nulls last, st.full_name)
    from public.student_enrollments e join public.students st on st.id = e.student_id join public.sections s on s.id = e.section_id join public.classes c on c.id = s.class_id
   where e.academic_year_id = y.id and (p_section is null or s.id = p_section) and (p_class is null or c.id = p_class)), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ issue
create or replace function public.id_card_issue(p_students uuid[], p_overrides jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.current_staff_id();
  y public.academic_years;
  r record;
  num jsonb;
  cid uuid;
  bid uuid := gen_random_uuid();
  issued jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  first_no text; last_no text; n_issued int := 0; n_pending int := 0;
  reason text; lbl text; why text;
  ovr jsonb := coalesce(p_overrides, '{}'::jsonb);
begin
  perform app.require_idcard();
  if p_students is null or cardinality(p_students) = 0 then raise exception 'Choose the students' using errcode = '23514'; end if;
  if cardinality(p_students) > 500 then raise exception 'Issue at most 500 cards at a time' using errcode = '23514'; end if;
  if ovr <> '{}'::jsonb and not app.is_admin() then raise exception 'Only the Admin can issue a card without a photo' using errcode = '42501'; end if;
  select * into y from public.academic_years where is_current limit 1;
  if y.id is null then raise exception 'There is no current academic year' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtext('idcard:' || y.id::text));
  insert into public.id_card_batches (id, academic_year_id, label, issued_count, skipped_count, issued_by) values (bid, y.id, 'batch', 0, 0, me);
  for r in
    select st.id, st.full_name, st.status, st.photo_path, st.is_demo, e.id enr, c.name cname, s.name sname
      from unnest(p_students) as u(id)
      join public.students st on st.id = u.id
      left join public.student_enrollments e on e.student_id = st.id and e.academic_year_id = y.id
      left join public.sections s on s.id = e.section_id left join public.classes c on c.id = s.class_id
     order by c.sort_order nulls last, s.name, e.roll_no nulls last, st.full_name
  loop
    why := case when r.status <> 'active' then 'Student has left'
                when r.enr is null then 'Not in a class this year'
                when exists (select 1 from public.id_cards k where k.student_id = r.id and k.academic_year_id = y.id and k.status = 'issued') then 'Already has a card'
                when r.photo_path is null and length(btrim(coalesce(ovr ->> r.id::text, ''))) < 3 then 'No photo' end;
    if why is not null then
      skipped := skipped || jsonb_build_object('student_id', r.id, 'name', r.full_name, 'reason', why);
      continue;
    end if;
    reason := case when r.photo_path is null then btrim(ovr ->> r.id::text) end;
    num := app.idcard_next_number(y.id);
    insert into public.id_cards (academic_year_id, seq, number, student_id, batch_id, payload, photo_pending, pending_reason, issued_by, is_demo)
    values (y.id, (num ->> 'seq')::int, num ->> 'number', r.id, bid, app.idcard_payload(r.id, y.id), reason is not null, reason, me, r.is_demo) returning id into cid;
    insert into public.id_card_prints (card_id, copy_no, printed_by) values (cid, 1, me);
    first_no := coalesce(first_no, num ->> 'number'); last_no := num ->> 'number'; n_issued := n_issued + 1; if reason is not null then n_pending := n_pending + 1; end if;
    issued := issued || jsonb_build_object('card_id', cid, 'student_id', r.id, 'name', r.full_name, 'number', num ->> 'number', 'class', r.cname, 'section', r.sname);
    lbl := coalesce(lbl, r.cname || ' ' || r.sname);
  end loop;
  lbl := coalesce(lbl, 'no cards');
  update public.id_card_batches set label = lbl, issued_count = n_issued, skipped_count = jsonb_array_length(skipped), number_from = first_no, number_to = last_no, photo_pending_count = n_pending where id = bid;
  if n_issued = 0 then
    delete from public.id_card_batches where id = bid;
    return jsonb_build_object('batch_id', null, 'issued', issued, 'skipped', skipped);
  end if;
  perform public.log_event('idcard.issue', 'id_card_batches', bid::text, jsonb_build_object(
    'summary', 'ID cards issued: ' || n_issued || ' (' || first_no || case when first_no <> last_no then ' to ' || last_no else '' end || ')' || ', ' || lbl || case when n_pending > 0 then ', ' || n_pending || ' with the photo pending' else '' end,
    'count', n_issued, 'skipped', jsonb_array_length(skipped), 'from', first_no, 'to', last_no, 'photo_pending', n_pending,
    'pending_reasons', (select coalesce(jsonb_agg(distinct pending_reason), '[]'::jsonb) from public.id_cards where batch_id = bid and photo_pending)));
  return jsonb_build_object('batch_id', bid, 'issued', issued, 'skipped', skipped);
end $$;

-- what the print page shows. The QR is ONLY the card number. Phone and blood group follow the two settings.
create or replace function app.idcard_bundle(p_cards uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.id_card_settings;
begin
  select * into s from public.id_card_settings where id = 1;
  return jsonb_build_object(
    'school', app.cert_school(),
    'settings', jsonb_build_object('show_phone', s.show_phone, 'show_blood_group', s.show_blood_group),
    'cards', coalesce((select jsonb_agg(jsonb_build_object(
        'card_id', k.id, 'number', k.number, 'qr', k.number, 'status', k.status, 'year', k.payload ->> 'year',
        'name', k.payload ->> 'name', 'name_te', k.payload ->> 'name_te', 'class', k.payload ->> 'class', 'section', k.payload ->> 'section', 'admission_no', k.payload ->> 'admission_no',
        'phone', case when s.show_phone then k.payload ->> 'phone' end, 'blood_group', case when s.show_blood_group then k.payload ->> 'blood_group' end,
        'photo_path', st.photo_path, 'photo_pending', k.photo_pending and st.photo_path is null) order by k.seq)
      from unnest(p_cards) as u(id) join public.id_cards k on k.id = u.id join public.students st on st.id = k.student_id), '[]'::jsonb));
end $$;
revoke execute on function app.idcard_bundle(uuid[]) from public, anon, authenticated;

create or replace function public.id_card_print_data(p_cards uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_idcard();
  if p_cards is null or cardinality(p_cards) = 0 or cardinality(p_cards) > 500 then raise exception 'Choose 1 to 500 cards' using errcode = '23514'; end if;
  if exists (select 1 from public.id_cards where id = any (p_cards) and status <> 'issued') then raise exception 'A cancelled card cannot be printed' using errcode = '23514'; end if;
  return app.idcard_bundle(p_cards);
end $$;

-- the same sheet again (a printer jam): only by the same person, within 10 minutes of the first print. Logged.
create or replace function public.id_card_print(p_cards uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.current_staff_id(); n int;
begin
  perform app.require_idcard();
  if p_cards is null or cardinality(p_cards) = 0 or cardinality(p_cards) > 500 then raise exception 'Choose 1 to 500 cards' using errcode = '23514'; end if;
  if exists (select 1 from public.id_cards where id = any (p_cards) and status <> 'issued') or (select count(*) from public.id_cards where id = any (p_cards)) <> cardinality(p_cards) then
    raise exception 'A cancelled or unknown card cannot be printed' using errcode = '23514';
  end if;
  if exists (select 1 from public.id_cards k join public.id_card_prints p on p.card_id = k.id and p.copy_no = 1
              where k.id = any (p_cards) and not (p.printed_by is not distinct from me and p.printed_at > now() - interval '10 minutes')) then
    raise exception 'These cards were printed more than 10 minutes ago, or by someone else. If a card is lost or damaged, replace it: it gets a new number.' using errcode = '23514';
  end if;
  insert into public.id_card_prints (card_id, copy_no, printed_by) select k.id, (select coalesce(max(copy_no), 0) + 1 from public.id_card_prints where card_id = k.id), me from public.id_cards k where k.id = any (p_cards);
  get diagnostics n = row_count;
  perform public.log_event('idcard.print', 'id_cards', null, jsonb_build_object('summary', 'ID cards printed again (same sheet, same person, within 10 minutes): ' || n, 'count', n));
  return app.idcard_bundle(p_cards);
end $$;

-- a lost / damaged card: a new number, the old one is cancelled with the reason
create or replace function public.id_card_replace(p_card uuid, p_reason text, p_note text default null, p_pending_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.current_staff_id();
  c public.id_cards; st public.students; num jsonb; cid uuid; pend text;
begin
  perform app.require_idcard();
  if p_reason is null or p_reason not in ('lost', 'damaged', 'parent_request', 'other') then raise exception 'Choose the reason (lost, damaged, parent request, other)' using errcode = '23514'; end if;
  if p_reason = 'other' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Write the reason' using errcode = '23514'; end if;
  select * into c from public.id_cards where id = p_card for update;
  if c.id is null then raise exception 'Card not found' using errcode = 'P0002'; end if;
  if c.status <> 'issued' then raise exception 'Card % is already cancelled', c.number using errcode = '23514'; end if;
  select * into st from public.students where id = c.student_id;
  if st.status <> 'active' then raise exception 'The student has left: no new card' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtext('idcard:' || c.academic_year_id::text));
  pend := case when st.photo_path is null then btrim(coalesce(p_pending_reason, c.pending_reason)) end;
  if st.photo_path is null and (pend is null or length(pend) < 3) then raise exception 'The student has no photo: add one first' using errcode = '23514'; end if;
  if st.photo_path is null and not app.is_admin() then raise exception 'Only the Admin can issue a card without a photo' using errcode = '42501'; end if;
  update public.id_cards set status = 'cancelled', cancel_kind = p_reason, cancel_reason = case when p_reason = 'other' then btrim(p_note) else coalesce(nullif(btrim(p_note), ''), replace(p_reason, '_', ' ')) end,
         cancelled_at = now(), cancelled_by = me where id = c.id;
  num := app.idcard_next_number(c.academic_year_id);
  insert into public.id_cards (academic_year_id, seq, number, student_id, batch_id, payload, photo_pending, pending_reason, replaces_id, issued_by, is_demo)
  values (c.academic_year_id, (num ->> 'seq')::int, num ->> 'number', c.student_id, null, app.idcard_payload(c.student_id, c.academic_year_id), pend is not null, pend, c.id, me, c.is_demo) returning id into cid;
  insert into public.id_card_prints (card_id, copy_no, printed_by) values (cid, 1, me);
  perform public.log_event('idcard.replace', 'students', c.student_id::text, jsonb_build_object(
    'summary', 'ID card ' || c.number || ' replaced by ' || (num ->> 'number') || ', reason: ' || replace(p_reason, '_', ' '),
    'old_number', c.number, 'new_number', num ->> 'number', 'reason', p_reason, 'card_id', cid));
  return jsonb_build_object('card_id', cid, 'number', num ->> 'number', 'old_number', c.number) || jsonb_build_object('print', app.idcard_bundle(array[cid]));
end $$;

-- cancelling a card issued by mistake (Admin only; a lost card is replaced, not cancelled)
create or replace function public.id_card_cancel(p_card uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.id_cards;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for cancelling' using errcode = '23514'; end if;
  select * into c from public.id_cards where id = p_card for update;
  if c.id is null then raise exception 'Card not found' using errcode = 'P0002'; end if;
  if c.status <> 'issued' then raise exception 'Card % is already cancelled', c.number using errcode = '23514'; end if;
  update public.id_cards set status = 'cancelled', cancel_kind = 'admin', cancel_reason = btrim(p_reason), cancelled_at = now(), cancelled_by = app.current_staff_id() where id = c.id;
  perform public.log_event('idcard.cancel', 'students', c.student_id::text, jsonb_build_object('summary', 'ID card ' || c.number || ' cancelled, reason: ' || btrim(p_reason), 'number', c.number, 'reason', btrim(p_reason)));
end $$;

-- a student who leaves: every card is cancelled at once, and never revived (a returning student gets a new card)
create or replace function app.idcard_on_student_left() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record; ref text := nullif(current_setting('app.rollover_run', true), '');
begin
  if new.status in ('left', 'passed_out', 'tc_issued') and old.status is distinct from new.status then
    for c in select id, number from public.id_cards where student_id = new.id and status = 'issued' loop
      update public.id_cards set status = 'cancelled', cancel_kind = 'student_left', cancel_reason = 'Student ' || case new.status when 'passed_out' then 'passed out' when 'tc_issued' then 'was given a TC' else 'left the school' end,
             cancelled_at = now(), cancelled_by = null, cancel_ref = case when ref is not null then 'rollover:' || ref end where id = c.id;
      insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
      values (auth.uid(), app.current_app_role()::text, 'idcard.auto_cancel', 'students', new.id::text,
              jsonb_build_object('summary', 'ID card ' || c.number || ' cancelled automatically: student ' || case new.status when 'passed_out' then 'passed out' when 'tc_issued' then 'was given a TC' else 'left the school' end, 'number', c.number));
    end loop;
  end if;
  return null;
end $$;
create trigger id_cards_on_student_left after update of status on public.students
  for each row execute function app.idcard_on_student_left();

-- ------------------------------------------------------------------ lookup by card number (type or scan): logged
create or replace function public.id_card_lookup(p_number text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.id_cards; st public.students; num text := btrim(coalesce(p_number, '')); cls text;
begin
  perform app.require_idcard();
  if length(num) < 3 or length(num) > 40 then raise exception 'Type the card number' using errcode = '23514'; end if;
  select * into c from public.id_cards where upper(number) = upper(num);
  perform public.log_event('idcard.lookup', 'id_cards', c.id::text, jsonb_build_object('summary', 'Card lookup: ' || left(num, 40) || case when c.id is null then ' (not found)' else '' end, 'number', left(num, 40), 'found', c.id is not null));
  if c.id is null then return jsonb_build_object('found', false); end if;
  select * into st from public.students where id = c.student_id;
  select cl.name || ' ' || s.name into cls from public.student_enrollments e join public.sections s on s.id = e.section_id join public.classes cl on cl.id = s.class_id where e.student_id = st.id and e.academic_year_id = c.academic_year_id;
  return jsonb_build_object('found', true, 'card_id', c.id, 'number', c.number, 'status', c.status, 'cancel_kind', c.cancel_kind, 'cancel_reason', c.cancel_reason,
    'year', c.payload ->> 'year', 'student_id', st.id, 'name', st.full_name, 'admission_no', st.admission_no, 'class', cls, 'student_status', st.status,
    'replaced_by', (select k.number from public.id_cards k where k.replaces_id = c.id));
end $$;

-- ------------------------------------------------------------------ register
create or replace function public.id_card_register(p_year uuid, p_limit integer default 500, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare total bigint; r jsonb;
begin
  perform app.require_idcard();
  select count(*) into total from public.id_cards where academic_year_id = p_year;
  select coalesce(jsonb_agg(rw order by (rw ->> 'seq')::int), '[]'::jsonb) into r from (
    select jsonb_build_object('id', k.id, 'seq', k.seq, 'number', k.number, 'student_id', k.student_id, 'student', st.full_name, 'admission_no', st.admission_no,
             'class', k.payload ->> 'class', 'section', k.payload ->> 'section', 'status', k.status, 'issued_by', iss.full_name, 'issued_at', k.created_at,
             'cancel_kind', k.cancel_kind, 'cancel_reason', k.cancel_reason, 'photo_pending', k.photo_pending,
             'replaced_by', (select k2.number from public.id_cards k2 where k2.replaces_id = k.id), 'replaces', (select k3.number from public.id_cards k3 where k3.id = k.replaces_id),
             'prints', (select count(*) from public.id_card_prints p where p.card_id = k.id)) rw
      from public.id_cards k join public.students st on st.id = k.student_id left join public.staff iss on iss.id = k.issued_by
     where k.academic_year_id = p_year order by k.seq limit least(greatest(coalesce(p_limit, 500), 1), 2000) offset greatest(coalesce(p_offset, 0), 0)) q;
  return jsonb_build_object('total', total, 'rows', r, 'next_no', (select next_no from public.id_card_series where academic_year_id = p_year));
end $$;

create or replace function public.id_card_register_export(p_year uuid, p_format text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app.require_idcard();
  if p_format not in ('csv', 'xlsx', 'print', 'pdf') then raise exception 'unknown format' using errcode = '23514'; end if;
  r := public.id_card_register(p_year, 2000, 0);
  perform public.log_report('id-card-register', p_format, jsonb_build_object('year', (select name from public.academic_years where id = p_year)), jsonb_array_length(r -> 'rows'));
  return r;
end $$;

create or replace function public.id_cards_for_student(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_idcard();
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'number', k.number, 'year', k.payload ->> 'year', 'status', k.status, 'cancel_kind', k.cancel_kind, 'cancel_reason', k.cancel_reason) order by k.created_at desc)
                     from public.id_cards k where k.student_id = p_student), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ settings (Admin only; every switch is logged)
create or replace function public.id_card_settings_save(p_prefix text, p_show_phone boolean, p_show_blood_group boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.id_card_settings;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into o from public.id_card_settings where id = 1 for update;
  update public.id_card_settings set prefix = btrim(p_prefix), show_phone = coalesce(p_show_phone, show_phone), show_blood_group = coalesce(p_show_blood_group, show_blood_group) where id = 1;
  if o.show_phone is distinct from coalesce(p_show_phone, o.show_phone) then
    perform public.log_event('idcard.setting', 'id_card_settings', '1', jsonb_build_object('summary', 'The parent phone number on the ID card back was switched ' || case when p_show_phone then 'ON' else 'OFF' end, 'setting', 'phone', 'on', p_show_phone));
  end if;
  if o.show_blood_group is distinct from coalesce(p_show_blood_group, o.show_blood_group) then
    perform public.log_event('idcard.setting', 'id_card_settings', '1', jsonb_build_object('summary', 'The blood group on the ID card back was switched ' || case when p_show_blood_group then 'ON' else 'OFF' end, 'setting', 'blood_group', 'on', p_show_blood_group));
  end if;
  if o.prefix is distinct from btrim(p_prefix) then
    perform public.log_event('idcard.setting', 'id_card_settings', '1', jsonb_build_object('summary', 'The ID card number prefix was changed to ' || btrim(p_prefix), 'setting', 'prefix'));
  end if;
end $$;

create or replace function public.id_card_settings_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_idcard();
  return (select to_jsonb(s) - 'created_at' - 'updated_at' - 'created_by' - 'updated_by' from public.id_card_settings s where id = 1);
end $$;

-- ------------------------------------------------------------------ the audit log understands ID cards
create or replace function app.audit_group(p_action text, p_table text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_action like 'auth.%' or p_action = 'student.ids_revealed' then 'access'
    when p_action like 'report.%' then 'exports'
    when p_action like 'rollover.%' then 'students'
    when p_action like 'certificate.%' then 'certificates'
    when p_action like 'idcard.%' then 'idcards'
    when p_action like 'student.photo%' then 'students'
    when p_action like 'fee.%' or p_action like 'fee_settings.%' then 'fees'
    when p_table in ('certificates', 'certificate_prints', 'certificate_templates', 'certificate_series', 'certificate_settings') then 'certificates'
    when p_table in ('id_cards', 'id_card_prints', 'id_card_batches', 'id_card_series', 'id_card_settings') then 'idcards'
    when p_table in ('students', 'student_profiles', 'student_secure_values', 'guardians', 'student_guardians', 'student_enrollments', 'student_documents') then 'students'
    when p_table like 'fee\_%' or p_table like 'student\_fee\_%' or p_table like 'student_fee_plans' then 'fees'
    when p_table in ('exam_components', 'result_groups', 'result_group_members', 'marks', 'grade_bands', 'grade_entries', 'subject_pass_marks', 'report_remarks',
                     'report_card_prints', 'subject_results', 'student_results', 'exam_class_modes', 'exam_subject_max', 'descriptive_grades', 'remark_bank') then 'marks'
    when p_table in ('attendance_sessions', 'student_attendance', 'staff_attendance', 'leave_requests', 'leave_balances', 'leave_types') then 'attendance'
    when p_table in ('staff', 'staff_permissions', 'teacher_assignments', 'timetable_entries', 'timetable_substitutions', 'bell_schedules', 'bell_periods', 'class_bell_schedules') then 'staff'
    else 'other'
  end
$$;

-- ------------------------------------------------------------------ audit sentences, the 10th alert
create or replace function app.audit_shape(a public.audit_logs, p_actor_name text, p_with_changes boolean default true) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  d jsonb := coalesce(a.new_data, a.old_data, '{}'::jsonb);
  lbl text := nullif(coalesce(d ->> 'full_name', d ->> 'name', d ->> 'receipt_no', d ->> 'title', d ->> 'admission_no', d ->> 'employee_code'), '');
  tl text := app.audit_table_label(a.table_name);
  summ text;
begin
  if a.action in ('insert', 'update', 'delete') then
    summ := app.audit_verb(a.action) || ' ' || tl || coalesce(' ' || lbl, '');
    if a.table_name = 'fee_receipts' and a.action = 'update' and a.old_data ->> 'status' = 'valid' and a.new_data ->> 'status' = 'cancelled' then
      summ := 'Cancelled receipt ' || coalesce(lbl, '') || ' — ' || coalesce(a.new_data ->> 'cancel_reason', 'no reason given');
    elsif a.table_name in ('exam_components', 'result_groups') and a.action = 'update' and a.old_data ->> 'locked_at' is not null and a.new_data ->> 'locked_at' is null then
      summ := 'Unlocked ' || tl || coalesce(' ' || lbl, '') || coalesce(' — ' || nullif(a.new_data ->> 'lock_note', ''), '');
    elsif a.table_name in ('exam_components', 'result_groups') and a.action = 'update' and a.old_data ->> 'locked_at' is null and a.new_data ->> 'locked_at' is not null then
      summ := 'Locked ' || tl || coalesce(' ' || lbl, '');
    end if;
  elsif a.action = 'auth.login' then summ := 'Signed in';
  elsif a.action = 'auth.login_failed' then summ := 'Failed sign-in for ' || coalesce(a.details ->> 'email', 'unknown address');
  elsif a.action = 'student.ids_revealed' then summ := 'Full ID numbers viewed for a student';
  elsif a.action like 'report.%' then
    summ := case a.action when 'report.export' then 'Exported ' when 'report.print' then 'Printed ' else 'Viewed ' end
            || 'report ' || coalesce(a.details ->> 'report', '') || coalesce(' (' || (a.details ->> 'rows') || ' rows)', '');
  elsif a.action like 'rollover.%' or a.action like 'certificate.%' or a.action like 'idcard.%' or a.action like 'student.photo%' then summ := coalesce(a.details ->> 'summary', 'Year rollover or certificate') || coalesce(' (' || (a.details ->> 'students_affected') || ' students)', '');
  elsif a.action = 'fee.receipt_reprinted' then summ := 'Receipt reprinted';
  else summ := replace(replace(a.action, '.', ' '), '_', ' ');
  end if;
  return jsonb_build_object(
    'id', a.id, 'at', a.occurred_at, 'actor_id', a.actor_user_id, 'actor_name', p_actor_name, 'actor_role', a.actor_role,
    'action', a.action, 'kind', a.kind, 'table', a.table_name, 'table_label', tl,
    'record_id', a.record_id, 'record_label', lbl, 'summary', summ,
    'changes', case when p_with_changes and a.action in ('insert', 'update', 'delete') then app.audit_changes(a.old_data, a.new_data) else '[]'::jsonb end,
    'details', app.audit_clean(a.details, false));
end $$;

create or replace function app.audit_alert_match(a public.audit_logs, p_key text) returns boolean
language sql stable set search_path = '' as $$
  select case p_key
    when 'ids_revealed' then a.action = 'student.ids_revealed'
       or (a.action = 'report.export' and a.details ->> 'report' = 'government-export' and coalesce((a.details #>> '{filters,full_ids}')::boolean, false))
    when 'receipts_cancelled' then a.table_name = 'fee_receipts' and a.action = 'update' and a.old_data ->> 'status' = 'valid' and a.new_data ->> 'status' = 'cancelled'
    when 'exams_unlocked' then a.table_name in ('exam_components', 'result_groups') and a.action = 'update' and a.old_data ->> 'locked_at' is not null and a.new_data ->> 'locked_at' is null
    when 'marks_after_unlock' then a.table_name = 'marks' and exists (
         select 1 from public.audit_logs u
          where u.table_name = 'exam_components' and u.action = 'update' and u.id < a.id
            and u.record_id = coalesce(a.new_data, a.old_data) ->> 'component_id'
            and u.old_data ->> 'locked_at' is not null and u.new_data ->> 'locked_at' is null)
    when 'failed_logins' then a.action = 'auth.login_failed' and (
         select count(*) from public.audit_logs b
          where b.action = 'auth.login_failed' and b.details ->> 'email' = a.details ->> 'email'
            and b.occurred_at <= a.occurred_at and b.occurred_at >= a.occurred_at - interval '15 minutes') >= 5
    when 'duties_changed' then a.table_name = 'staff_permissions' and a.action in ('insert', 'delete')
    when 'roles_changed' then a.table_name = 'staff' and a.action = 'update' and (a.old_data ->> 'app_role') is distinct from (a.new_data ->> 'app_role')
    when 'staff_deactivated' then a.table_name = 'staff' and a.action = 'update' and a.old_data ->> 'status' = 'active' and a.new_data ->> 'status' <> 'active'
    when 'certificates_look' then a.action = 'certificate.cancel' or (a.action = 'certificate.print' and coalesce((a.details ->> 'duplicate')::boolean, false)) or (a.action = 'certificate.issue' and coalesce((a.details ->> 'override')::boolean, false))
    when 'idcards_look' then a.action = 'idcard.replace' or (a.action = 'idcard.issue' and coalesce((a.details ->> 'photo_pending')::int, 0) > 0)
    else false end
$$;
revoke execute on function app.audit_alert_match(public.audit_logs, text) from public, anon, authenticated;

create or replace function app.audit_alerts(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d int := least(greatest(coalesce(p_days, 7), 1), 90);
  since timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata') - make_interval(days => d - 1)) at time zone 'Asia/Kolkata';  -- start of the day, d-1 days ago (India)
  r jsonb;
begin
  with hits as (
    select 'ids_revealed' k, a.id, a.occurred_at, a.actor_user_id,
           'Full ID numbers ' || case when a.action = 'student.ids_revealed' then 'viewed' else 'exported (government export)' end t
      from public.audit_logs a
     where a.occurred_at >= since
       and (a.action = 'student.ids_revealed'
            or (a.action = 'report.export' and a.details ->> 'report' = 'government-export' and coalesce((a.details #>> '{filters,full_ids}')::boolean, false)))
    union all
    select 'receipts_cancelled', a.id, a.occurred_at, a.actor_user_id,
           'Receipt ' || coalesce(a.new_data ->> 'receipt_no', '') || ' — ' || coalesce(a.new_data ->> 'cancel_reason', 'no reason given')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'fee_receipts' and a.action = 'update' and a.old_data ->> 'status' = 'valid' and a.new_data ->> 'status' = 'cancelled'
    union all
    select 'exams_unlocked', a.id, a.occurred_at, a.actor_user_id,
           'Unlocked ' || coalesce(a.new_data ->> 'name', 'exam') || coalesce(' — ' || nullif(a.new_data ->> 'lock_note', ''), '')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name in ('exam_components', 'result_groups') and a.action = 'update'
       and a.old_data ->> 'locked_at' is not null and a.new_data ->> 'locked_at' is null
    union all
    select 'marks_after_unlock', a.id, a.occurred_at, a.actor_user_id,
           'Mark ' || case a.action when 'insert' then 'added' when 'delete' then 'removed' else 'changed' end || ' after unlock'
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'marks'
       and exists (select 1 from public.audit_logs u
                    where u.table_name = 'exam_components' and u.action = 'update' and u.id < a.id
                      and u.record_id = coalesce(a.new_data, a.old_data) ->> 'component_id'
                      and u.old_data ->> 'locked_at' is not null and u.new_data ->> 'locked_at' is null)
    union all
    select 'failed_logins', f.id, f.occurred_at, null, 'Failed sign-in for ' || coalesce(f.details ->> 'email', '?')
      from (select a.id, a.occurred_at, a.details,
                   count(*) over (partition by a.details ->> 'email' order by a.occurred_at range between interval '15 minutes' preceding and current row) c
              from public.audit_logs a where a.action = 'auth.login_failed' and a.occurred_at >= since) f
     where f.c >= 5
    union all
    select 'duties_changed', a.id, a.occurred_at, a.actor_user_id,
           case a.action when 'insert' then 'Duty given: ' else 'Duty removed: ' end || coalesce(coalesce(a.new_data, a.old_data) ->> 'duty', '')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'staff_permissions' and a.action in ('insert', 'delete')
    union all
    select 'roles_changed', a.id, a.occurred_at, a.actor_user_id,
           coalesce(a.new_data ->> 'full_name', 'Staff member') || ': ' || coalesce(a.old_data ->> 'app_role', 'none') || ' → ' || coalesce(a.new_data ->> 'app_role', 'none')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'staff' and a.action = 'update' and (a.old_data ->> 'app_role') is distinct from (a.new_data ->> 'app_role')
    union all
    select 'certificates_look', a.id, a.occurred_at, a.actor_user_id, coalesce(a.details ->> 'summary', 'Certificate entry')
      from public.audit_logs a
     where a.occurred_at >= since
       and (a.action = 'certificate.cancel' or (a.action = 'certificate.print' and coalesce((a.details ->> 'duplicate')::boolean, false)) or (a.action = 'certificate.issue' and coalesce((a.details ->> 'override')::boolean, false)))
    union all
    select 'idcards_look', a.id, a.occurred_at, a.actor_user_id, coalesce(a.details ->> 'summary', 'ID card entry')
      from public.audit_logs a
     where a.occurred_at >= since and (a.action = 'idcard.replace' or (a.action = 'idcard.issue' and coalesce((a.details ->> 'photo_pending')::int, 0) > 0))
    union all
    select 'staff_deactivated', a.id, a.occurred_at, a.actor_user_id,
           coalesce(a.new_data ->> 'full_name', 'Staff member') || ' → ' || (a.new_data ->> 'status')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'staff' and a.action = 'update' and a.old_data ->> 'status' = 'active' and a.new_data ->> 'status' <> 'active'
  ), ranked as (
    select h.*, count(*) over (partition by k) total, row_number() over (partition by k order by occurred_at desc, id desc) rn from hits h
  )
  select jsonb_build_object('days', d, 'items', (
    select jsonb_agg(jsonb_build_object(
             'key', def.key, 'label', def.label, 'severity', def.severity,
             'count', coalesce((select max(total) from ranked where k = def.key), 0),
             'latest_at', (select max(occurred_at) from ranked where k = def.key),
             'rows', coalesce((select jsonb_agg(jsonb_build_object('at', x.occurred_at, 'who', app.audit_actor_name(x.actor_user_id), 'text', x.t) order by x.occurred_at desc)
                                 from ranked x where x.k = def.key and x.rn <= 10), '[]'::jsonb)) order by def.ord)
      from (values
        (1, 'ids_revealed',       'Full ID numbers viewed or exported',                                     'high'),
        (2, 'receipts_cancelled', 'Fee receipts cancelled',                                                 'high'),
        (3, 'exams_unlocked',     'Exams or results unlocked',                                              'high'),
        (4, 'marks_after_unlock', 'Marks changed after a result was published or an exam unlocked',         'high'),
        (5, 'failed_logins',      'Repeated failed sign-ins on one account',                                'high'),
        (6, 'duties_changed',     'Duties or fee access changed',                                           'medium'),
        (7, 'roles_changed',      'Staff roles changed',                                                    'medium'),
        (8, 'staff_deactivated',  'Staff deactivated',                                                      'medium'),
        (9, 'certificates_look',  'Certificates worth a look: duplicates, TC overrides, cancellations',      'medium'),
        (10, 'idcards_look',      'ID cards worth a look: replaced cards and photo-pending overrides',     'medium')) def(ord, key, label, severity))
  ) into r;
  return r;
end $$;
revoke execute on function app.audit_alerts(integer) from public, anon, authenticated;

-- ------------------------------------------------------------------ rollover: ID cards
create or replace function public.rollover_confirm(p_from uuid, p_to uuid, p_plan jsonb, p_checked boolean, p_typed_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  yt public.academic_years;
  yf public.academic_years;
  r record;
  sec record;
  sec_id uuid;
  snap_students jsonb := '[]'::jsonb;
  snap_adopted jsonb := '[]'::jsonb;
  new_secs uuid[] := '{}';
  new_enrs jsonb := '[]'::jsonb;
  new_plans uuid[] := '{}';
  new_asg uuid[] := '{}';
  asg_ids uuid[];
  plan_new uuid;
  mapped uuid;
  plans_missing int := 0;
  enr uuid;
  mark bigint;
  run_id uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  sm jsonb;
begin
  perform app.require_admin_only();
  perform set_config('app.rollover_run', run_id::text, true);      -- ID cards cancelled by this rollover are tagged with it, so an undo can put them back
  if not coalesce(p_checked, false) then raise exception 'Tick "I have checked the totals" first' using errcode = '23514'; end if;
  select * into yt from public.academic_years where id = p_to;
  select * into yf from public.academic_years where id = p_from;
  if yt.id is null or yf.id is null then raise exception 'Unknown academic year' using errcode = '23514'; end if;
  if lower(btrim(coalesce(p_typed_name, ''))) <> lower(btrim(yt.name)) then
    raise exception 'Type the new year name exactly (%) to confirm', yt.name using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('kchs-rollover'));
  v := app.rollover_compute(p_from, p_to, p_plan);
  if not (v ->> 'can_confirm')::boolean then
    raise exception 'The checklist is not all green: fix the red items first' using errcode = '23514';
  end if;

  -- snapshot: what is about to change, exactly as it is now
  select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'status', st.status, 'status_date', st.status_date, 'status_reason', st.status_reason)), '[]'::jsonb) into snap_students
    from public.students st where st.id in (select student_id from _ro_rows where outcome in ('passed_out', 'left'));
  select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', e.id, 'student_id', e.student_id, 'section_id', e.section_id, 'roll_no', e.roll_no)), '[]'::jsonb) into snap_adopted
    from public.student_enrollments e where e.id in (select enr_id from _ro_rows where is_new);

  -- 1. sections that do not exist yet
  for sec in select * from _ro_secs where existing_id is null and n > 0 loop
    insert into public.sections (academic_year_id, class_id, name, medium, class_teacher_id)
    values (p_to, sec.to_class_id, sec.name, sec.medium, sec.teacher_id) returning id into sec_id;
    new_secs := new_secs || sec_id;
    -- subject-teacher assignments are copied from the section the cohort comes from (same teacher, same subject); the Admin can change them afterwards
    if coalesce((p_plan ->> 'copy_assignments')::boolean, true) and sec.src_id is not null then
      with ins as (
        insert into public.teacher_assignments (staff_id, section_id, subject_id, periods_per_week)
        select ta.staff_id, sec_id, ta.subject_id, ta.periods_per_week
          from public.teacher_assignments ta join public.staff st on st.id = ta.staff_id and st.status = 'active'
         where ta.section_id = sec.src_id
           and exists (select 1 from public.class_subjects cs where cs.academic_year_id = p_to and cs.class_id = sec.to_class_id and cs.subject_id = ta.subject_id)
        on conflict do nothing returning id)
      select coalesce(array_agg(id), '{}') into asg_ids from ins;
      new_asg := new_asg || asg_ids;
    end if;
  end loop;

  -- 2. leavers
  update public.students st set status = case _ro_rows.outcome when 'passed_out' then 'passed_out' else 'left' end, status_date = today,
         status_reason = case _ro_rows.outcome when 'passed_out' then 'Passed out (year rollover to ' || yt.name || ')' else 'Left school (year rollover to ' || yt.name || ')' end
    from _ro_rows where _ro_rows.student_id = st.id and _ro_rows.outcome in ('passed_out', 'left');

  -- 3. new admissions already in the new year: move to their section (roll numbers are set at the end)
  update public.student_enrollments e set roll_no = null from _ro_rows q where q.enr_id = e.id and q.is_new;
  update public.student_enrollments e set section_id = (select s.id from public.sections s where s.academic_year_id = p_to and s.class_id = q.to_class_id and s.name = q.to_section)
    from _ro_rows q where q.enr_id = e.id and q.is_new;

  -- 4. fee plans carry over (matched to the new year's plan with the same name); concessions do NOT
  for r in select sp.* , r2.student_id as sid from public.student_fee_plans sp join _ro_rows r2 on r2.student_id = sp.student_id and r2.outcome in ('promote', 'detain')
            where sp.academic_year_id = p_from loop
    select np.id into mapped from public.fee_plans np join public.fee_plans op on op.name = np.name and op.id = r.plan_id where np.academic_year_id = p_to limit 1;
    if mapped is null then plans_missing := plans_missing + 1; continue; end if;
    insert into public.student_fee_plans (student_id, academic_year_id, fee_head_id, plan_id, reason)
    values (r.sid, p_to, r.fee_head_id, mapped, 'Carried over from ' || yf.name)
    on conflict (student_id, academic_year_id, fee_head_id) do nothing returning id into plan_new;
    if plan_new is not null then new_plans := new_plans || plan_new; plan_new := null; end if;
  end loop;

  -- 5. the new enrolments (the database makes the new year's dues from the new fee structure)
  for r in select * from _ro_rows where outcome in ('promote', 'detain') loop
    insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no, status)
    values (r.student_id, p_to, (select s.id from public.sections s where s.academic_year_id = p_to and s.class_id = r.to_class_id and s.name = r.to_section), r.to_roll, 'active')
    returning id into enr;
    new_enrs := new_enrs || jsonb_build_object('id', enr, 'student_id', r.student_id);
  end loop;
  update public.student_enrollments e set roll_no = q.to_roll from _ro_rows q where q.enr_id = e.id and q.is_new;

  -- 6. the switch: old year closed, new year current
  update public.academic_years set is_current = false, status = 'closed' where id = p_from;
  update public.academic_years set is_current = true, status = 'active' where id = p_to;

  select coalesce(max(id), 0) into mark from public.audit_logs;
  sm := (v -> 'summary') || jsonb_build_object('plans_not_matched', plans_missing, 'fee_plans_carried', coalesce(cardinality(new_plans), 0), 'assignments_copied', coalesce(cardinality(new_asg), 0),
                                              'enrollments_created', jsonb_array_length(new_enrs), 'students_affected', jsonb_array_length(new_enrs) + jsonb_array_length(snap_students) + jsonb_array_length(snap_adopted));
  insert into public.rollover_runs (id, from_year_id, to_year_id, plan, snapshot, summary, audit_mark, applied_by)
  values (run_id, p_from, p_to, coalesce(p_plan, '{}'::jsonb),
          jsonb_build_object('years', jsonb_build_array(
                jsonb_build_object('id', yf.id, 'status', yf.status, 'is_current', yf.is_current),
                jsonb_build_object('id', yt.id, 'status', yt.status, 'is_current', yt.is_current)),
              'students', snap_students, 'adopted', snap_adopted, 'sections', to_jsonb(new_secs), 'assignments', to_jsonb(new_asg), 'enrollments', new_enrs, 'fee_plans', to_jsonb(new_plans)),
          sm, mark, auth.uid());
  perform public.log_event('rollover.confirm', 'rollover_runs', run_id::text,
    jsonb_build_object('summary', 'Year rollover ' || yf.name || ' → ' || yt.name, 'from', yf.name, 'to', yt.name, 'students_affected', sm -> 'students_affected',
                       'promoted', sm -> 'promoted', 'detained', sm -> 'detained', 'passed_out', sm -> 'passed_out', 'left', sm -> 'left',
                       'new_sections', sm -> 'new_sections_created', 'carried_dues_paise', sm -> 'carried_dues_paise'));
  return jsonb_build_object('run_id', run_id, 'summary', sm);
end $$;

create or replace function app.rollover_blockers(p_run uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  run public.rollover_runs;
  out jsonb := '[]'::jsonb;
  n bigint;
  sec_ids uuid[];
  enr_ids uuid[];
  adopted_ids uuid[];
  fk record;
begin
  select * into run from public.rollover_runs where id = p_run;
  if run.id is null then raise exception 'Unknown rollover' using errcode = '23514'; end if;
  if run.status <> 'applied' then
    return jsonb_build_array(jsonb_build_object('key', 'already_undone', 'text', 'This rollover has already been undone', 'count', 1));
  end if;
  sec_ids := coalesce(array(select (x #>> '{}')::uuid from jsonb_array_elements(run.snapshot -> 'sections') x), '{}');
  enr_ids := coalesce(array(select (x ->> 'id')::uuid from jsonb_array_elements(run.snapshot -> 'enrollments') x), '{}');
  adopted_ids := coalesce(array(select (x ->> 'enrollment_id')::uuid from jsonb_array_elements(run.snapshot -> 'adopted') x), '{}');

  if exists (select 1 from public.rollover_runs o where o.status = 'applied' and o.from_year_id = run.to_year_id) then
    out := out || jsonb_build_object('key', 'later_rollover', 'text', 'A later year has already been rolled over from this one', 'count', 1);
  end if;
  select count(*) into n from public.attendance_sessions where academic_year_id = run.to_year_id;
  if n > 0 then out := out || jsonb_build_object('key', 'attendance', 'text', 'Attendance has been marked in the new year (' || n || ' sessions)', 'count', n); end if;
  select count(*) into n from public.marks where academic_year_id = run.to_year_id;
  if n > 0 then out := out || jsonb_build_object('key', 'marks', 'text', 'Marks have been entered in the new year (' || n || ')', 'count', n); end if;
  select count(distinct i.receipt_id) into n from public.fee_receipt_items i join public.student_fee_dues d on d.id = i.due_id where d.academic_year_id = run.to_year_id;
  if n > 0 then out := out || jsonb_build_object('key', 'receipts', 'text', 'Fees have been collected in the new year (' || n || ' receipts)', 'count', n); end if;
  select count(*) into n from public.student_enrollments e where e.academic_year_id = run.to_year_id and e.id <> all (enr_ids) and e.id <> all (adopted_ids);
  if n > 0 then out := out || jsonb_build_object('key', 'new_admission', 'text', n || ' student(s) have been admitted to the new year since the rollover', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name = 'student_enrollments' and a.action in ('update', 'delete')
     and a.record_id in (select x::text from unnest(enr_ids || adopted_ids) x);
  if n > 0 then out := out || jsonb_build_object('key', 'student_changed', 'text', n || ' promoted student(s) have been changed by hand since the rollover', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name = 'sections' and a.action in ('update', 'delete') and a.record_id in (select x::text from unnest(sec_ids) x);
  if n > 0 then out := out || jsonb_build_object('key', 'section_changed', 'text', 'A new section has been changed by hand since the rollover', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name in ('fee_concessions', 'student_fee_plans') and (coalesce(a.new_data, a.old_data) ->> 'academic_year_id') = run.to_year_id::text;
  if n > 0 then out := out || jsonb_build_object('key', 'fee_changes', 'text', 'Fee concessions or plans have been changed in the new year (' || n || ' changes)', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name = 'teacher_assignments' and (coalesce(a.new_data, a.old_data) ->> 'section_id') in (select x::text from unnest(sec_ids) x);
  if n > 0 then out := out || jsonb_build_object('key', 'assignments_changed', 'text', 'Teacher assignments of the new sections have been changed by hand since the rollover (' || n || ' changes)', 'count', n); end if;
  select count(*) into n from public.id_cards where academic_year_id = run.to_year_id;
  if n > 0 then out := out || jsonb_build_object('key', 'id_cards', 'text', 'ID cards have been issued in the new year (' || n || ')', 'count', n); end if;
  -- anything else already hanging on the new sections (timetable, teacher assignments, ...)
  for fk in select c.conrelid::regclass::text tbl, a.attname col
              from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
             where c.contype = 'f' and c.confrelid = 'public.sections'::regclass and c.conrelid <> 'public.student_enrollments'::regclass and c.conrelid <> 'public.teacher_assignments'::regclass loop
    execute format('select count(*) from %s where %I = any($1)', fk.tbl, fk.col) into n using sec_ids;
    if n > 0 then out := out || jsonb_build_object('key', 'section_used', 'text', 'The new sections are already used in ' || replace(replace(fk.tbl, 'public.', ''), '_', ' ') || ' (' || n || ')', 'count', n); end if;
  end loop;
  return out;
end $$;

revoke execute on function app.rollover_blockers(uuid) from public, anon, authenticated;

create or replace function public.rollover_undo(p_run uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  run public.rollover_runs;
  b jsonb;
  sec_ids uuid[];
  enr_ids uuid[];
  plan_ids uuid[];
  stu_ids uuid[];
  x jsonb;
  n_students int;
begin
  perform app.require_admin_only();
  perform pg_advisory_xact_lock(hashtext('kchs-rollover'));
  b := app.rollover_blockers(p_run);
  if jsonb_array_length(b) > 0 then
    raise exception 'Cannot undo: %', (select string_agg(e ->> 'text', '; ') from jsonb_array_elements(b) e) using errcode = '23514';
  end if;
  select * into run from public.rollover_runs where id = p_run for update;
  sec_ids  := coalesce(array(select (v #>> '{}')::uuid from jsonb_array_elements(run.snapshot -> 'sections') v), '{}');
  enr_ids  := coalesce(array(select (v ->> 'id')::uuid from jsonb_array_elements(run.snapshot -> 'enrollments') v), '{}');
  stu_ids  := coalesce(array(select (v ->> 'student_id')::uuid from jsonb_array_elements(run.snapshot -> 'enrollments') v), '{}');
  plan_ids := coalesce(array(select (v #>> '{}')::uuid from jsonb_array_elements(run.snapshot -> 'fee_plans') v), '{}');

  delete from public.teacher_assignments where id in (select (v #>> '{}')::uuid from jsonb_array_elements(coalesce(run.snapshot -> 'assignments', '[]'::jsonb)) v);
  delete from public.student_fee_plans where id = any (plan_ids);
  delete from public.student_enrollments where id = any (enr_ids);
  delete from public.student_fee_dues where academic_year_id = run.to_year_id and student_id = any (stu_ids);   -- made by the rollover; nothing is paid on them (checked above)
  -- new admissions that were moved: back to where they were
  update public.student_enrollments set roll_no = null where id in (select (v ->> 'enrollment_id')::uuid from jsonb_array_elements(run.snapshot -> 'adopted') v);
  for x in select v from jsonb_array_elements(run.snapshot -> 'adopted') v loop
    update public.student_enrollments set section_id = (x ->> 'section_id')::uuid, roll_no = nullif(x ->> 'roll_no', '')::int where id = (x ->> 'enrollment_id')::uuid;
  end loop;
  -- leavers: back to active (their earlier status, date and reason). The fee tidy-up that normally follows a status change is switched off for this step: old-year dues must not be recalculated.
  perform set_config('app.rollover_restoring', '1', true);
  update public.id_cards set status = 'issued', cancel_kind = null, cancel_reason = null, cancelled_at = null, cancelled_by = null, cancel_ref = null where cancel_ref = 'rollover:' || p_run::text;
  for x in select v from jsonb_array_elements(run.snapshot -> 'students') v loop
    update public.students set status = x ->> 'status', status_date = nullif(x ->> 'status_date', '')::date, status_reason = nullif(x ->> 'status_reason', '')
     where id = (x ->> 'id')::uuid;
  end loop;
  delete from public.sections where id = any (sec_ids);
  -- the two years as they were
  for x in select v from jsonb_array_elements(run.snapshot -> 'years') v loop
    update public.academic_years set is_current = false where id = (x ->> 'id')::uuid and (x ->> 'id')::uuid = run.to_year_id;
  end loop;
  for x in select v from jsonb_array_elements(run.snapshot -> 'years') v loop
    update public.academic_years set status = x ->> 'status', is_current = (x ->> 'is_current')::boolean where id = (x ->> 'id')::uuid;
  end loop;
  update public.rollover_runs set status = 'undone', undone_by = auth.uid(), undone_at = now() where id = p_run;
  n_students := coalesce((run.summary ->> 'students_affected')::int, 0);
  perform public.log_event('rollover.undo', 'rollover_runs', p_run::text,
    jsonb_build_object('summary', 'Year rollover undone', 'students_affected', n_students, 'sections_removed', cardinality(sec_ids), 'enrollments_removed', cardinality(enr_ids)));
  return jsonb_build_object('run_id', p_run, 'students_affected', n_students, 'sections_removed', cardinality(sec_ids), 'enrollments_removed', cardinality(enr_ids));
end $$;


-- ------------------------------------------------------------------ who may call what
do $$
declare f text;
begin
  foreach f in array array[
    'public.student_photo_set(uuid, text, integer, integer, bigint, text)', 'public.student_photos_plan(jsonb)', 'public.student_photos_bulk_log(integer, text)',
    'public.id_card_sections()', 'public.id_card_candidates(uuid, uuid)', 'public.id_card_issue(uuid[], jsonb)', 'public.id_card_print_data(uuid[])', 'public.id_card_print(uuid[])',
    'public.id_card_replace(uuid, text, text, text)', 'public.id_card_cancel(uuid, text)', 'public.id_card_lookup(text)', 'public.id_card_register(uuid, integer, integer)',
    'public.id_card_register_export(uuid, text)', 'public.id_cards_for_student(uuid)', 'public.id_card_settings_save(text, boolean, boolean)', 'public.id_card_settings_get()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
