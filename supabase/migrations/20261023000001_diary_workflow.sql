-- =====================================================================
--  Diary workflow: teachers submit their own subject, Admin / the
--  notices_diary duty review the whole class together and publish.
--
--  Status: draft -> submitted -> published.
--  One entry per (section, date, subject). A teacher writes only for a
--  (section, subject) pair assigned to them, plus a "class remark" for the
--  section they are class teacher of. Dates: today up to 7 days ahead.
--  No direct writes: everything goes through the checked functions below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings and columns
-- ---------------------------------------------------------------------
alter table public.school_settings add column diary_deadline time not null default '15:30';

alter table public.diary_entries add column body_te text check (body_te is null or length(trim(body_te)) >= 1);
alter table public.diary_entries add column author_id uuid references public.staff (id) on delete set null;
alter table public.diary_entries add column kind text not null default 'subject' check (kind in ('subject', 'remark'));
alter table public.diary_entries add column submitted_at timestamptz;
alter table public.diary_entries add constraint diary_remark_no_subject check (kind = 'subject' or subject_id is null);
create index diary_entries_author_idx on public.diary_entries (author_id);

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.diary_entries'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%draft%published%';
  execute format('alter table public.diary_entries drop constraint %I', c);
end $$;
alter table public.diary_entries add constraint diary_entries_status_check check (status in ('draft', 'submitted', 'published'));

-- sections the admin chose not to expect a subject from, for one date
create table public.diary_skips (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  entry_date date not null,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  skipped_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (section_id, entry_date, subject_id)
);
create index diary_skips_skipped_by_idx on public.diary_skips (skipped_by);
select app.attach_std_triggers('public.diary_skips');

-- in-app reminders to a teacher (subject_id null = the class remark)
create table public.diary_reminders (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.staff (id) on delete cascade,
  section_id  uuid not null references public.sections (id) on delete cascade,
  entry_date  date not null,
  subject_id  uuid references public.subjects (id) on delete cascade,
  reminded_by uuid references public.staff (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
create unique index diary_reminders_key on public.diary_reminders
  (teacher_id, section_id, entry_date, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index diary_reminders_section_idx on public.diary_reminders (section_id);
create index diary_reminders_subject_idx on public.diary_reminders (subject_id);
create index diary_reminders_by_idx on public.diary_reminders (reminded_by);
select app.attach_std_triggers('public.diary_reminders');

-- every "opened in WhatsApp" action (we can never know if it was sent)
create table public.message_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('diary', 'notice', 'fee_due', 'absence', 'other')),
  target     text not null check (target in ('group', 'student')),
  student_id uuid references public.students (id) on delete set null,
  section_id uuid references public.sections (id) on delete set null,
  ref_date   date,
  channel    text not null default 'app' check (channel in ('app', 'web', 'share', 'copy', 'download', 'print')),
  status     text not null default 'opened' check (status in ('opened', 'marked_sent', 'skipped')),
  summary    text,
  actor_id   uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index message_log_student_idx on public.message_log (student_id);
create index message_log_section_idx on public.message_log (section_id);
create index message_log_actor_idx on public.message_log (actor_id);
create index message_log_created_idx on public.message_log (created_at desc);
select app.attach_std_triggers('public.message_log');

-- ---------------------------------------------------------------------
-- Visibility: published -> teachers of the section; drafts / submitted ->
-- the author, Admin and the duty only
-- ---------------------------------------------------------------------
create or replace function app.diary_visible(p_entry uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_staff_user() and exists (
    select 1 from public.diary_entries e
    where e.id = p_entry
      and (app.is_admin()
           or (e.archived_at is null
               and (public.has_duty('notices_diary')
                    or e.author_id = app.current_staff_id()
                    or (e.status = 'published'
                        and exists (select 1 from public.diary_entry_sections s
                                    where s.entry_id = e.id and app.teaches_section(s.section_id)))))))
$$;

alter table public.diary_skips enable row level security;
alter table public.diary_reminders enable row level security;
alter table public.message_log enable row level security;
create policy dsk_select on public.diary_skips for select to authenticated using ((select public.has_duty('notices_diary')));
create policy drm_select on public.diary_reminders for select to authenticated
  using (teacher_id = (select app.current_staff_id()) or (select public.has_duty('notices_diary')));
create policy ml_select on public.message_log for select to authenticated using ((select app.is_admin()));
grant select on public.diary_skips, public.diary_reminders, public.message_log to authenticated;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- subjects the timetable expects for a section on a date, minus skipped ones
create function app.diary_expected(p_section uuid, p_date date) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct t.subject_id from public.timetable_entries t
  where t.section_id = p_section and t.weekday = extract(isodow from p_date)::int and t.subject_id is not null
    and not exists (select 1 from public.diary_skips k where k.section_id = p_section and k.entry_date = p_date and k.subject_id = t.subject_id)
$$;

-- the live entry for one key (single-section entries written by this workflow)
create function app.diary_find(p_section uuid, p_date date, p_subject uuid, p_kind text) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.diary_entries e
  join public.diary_entry_sections s on s.entry_id = e.id
  where s.section_id = p_section and e.entry_date = p_date and e.kind = p_kind
    and e.subject_id is not distinct from p_subject and e.archived_at is null
  order by e.created_at limit 1
$$;

create function app.diary_lock(p_section uuid, p_date date, p_subject uuid, p_kind text) returns void
language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtext('diary:' || p_section::text || p_date::text || coalesce(p_subject::text, p_kind)))
$$;

create function app.diary_year(p_section uuid, p_date date) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare yid uuid;
begin
  select s.academic_year_id into yid from public.sections s where s.id = p_section;
  if yid is null then
    raise exception 'Unknown section' using errcode = '23514';
  end if;
  if not exists (select 1 from public.academic_years y where y.id = yid and p_date between y.start_date and y.end_date) then
    raise exception 'That date is outside the academic year of the chosen section' using errcode = '23514';
  end if;
  return yid;
end $$;
revoke execute on function app.diary_expected(uuid, date), app.diary_find(uuid, date, uuid, text),
  app.diary_lock(uuid, date, uuid, text), app.diary_year(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Teacher: save a draft or submit
-- p: {section_id, entry_date, subject_id?, kind?, body, body_te?, submit?}
-- ---------------------------------------------------------------------
create function public.submit_diary(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sec   uuid := nullif(p ->> 'section_id', '')::uuid;
  d     date := (p ->> 'entry_date')::date;
  subj  uuid := nullif(p ->> 'subject_id', '')::uuid;
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'subject');
  v_body text := trim(coalesce(p ->> 'body', ''));
  v_te   text := nullif(trim(coalesce(p ->> 'body_te', '')), '');
  go    boolean := coalesce((p ->> 'submit')::boolean, false);
  me    uuid := app.current_staff_id();
  today date := app.today_ist();
  eid   uuid;
  e     public.diary_entries;
  st    text := case when coalesce((p ->> 'submit')::boolean, false) then 'submitted' else 'draft' end;
begin
  if me is null or not app.is_staff_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if sec is null or d is null then
    raise exception 'Choose the section and the date' using errcode = '23514';
  end if;
  if v_kind not in ('subject', 'remark') then
    raise exception 'Unknown entry type' using errcode = '23514';
  end if;
  if (v_kind = 'remark') <> (subj is null) then
    raise exception 'A subject entry needs a subject; a class remark has none' using errcode = '23514';
  end if;
  if v_kind = 'subject' then
    if not exists (select 1 from public.teacher_assignments a where a.staff_id = me and a.section_id = sec and a.subject_id = subj) then
      raise exception 'You are not assigned to this subject in this section' using errcode = '42501';
    end if;
  elsif not app.is_class_teacher(sec) then
    raise exception 'Only the class teacher can add the class remark' using errcode = '42501';
  end if;
  if d < today or d > today + 7 then
    raise exception 'Choose a date from today up to 7 days ahead' using errcode = '23514';
  end if;
  if length(v_body) < 2 then
    raise exception 'Write the diary text' using errcode = '23514';
  end if;
  perform app.diary_year(sec, d);

  perform app.diary_lock(sec, d, subj, v_kind);
  eid := app.diary_find(sec, d, subj, v_kind);
  if eid is null then
    insert into public.diary_entries (academic_year_id, entry_date, subject_id, kind, body, body_te, status, author_id, submitted_at)
    values (app.diary_year(sec, d), d, subj, v_kind, v_body, v_te, st, me, case when go then now() end)
    returning id into eid;
    insert into public.diary_entry_sections (entry_id, section_id) values (eid, sec);
    delete from public.diary_skips where section_id = sec and entry_date = d and subject_id = subj;
  else
    select * into e from public.diary_entries where id = eid for update;
    if e.status = 'published' then
      raise exception 'This entry is already published; ask the school office to change it' using errcode = '23514';
    end if;
    if e.author_id is distinct from me then
      raise exception 'Another teacher has already started this entry' using errcode = '42501';
    end if;
    update public.diary_entries
       set body = v_body, body_te = v_te, status = st,
           submitted_at = case when go then coalesce(e.submitted_at, now()) else null end
     where id = eid;
  end if;
  return eid;
end $$;
revoke execute on function public.submit_diary(jsonb) from public, anon;
grant execute on function public.submit_diary(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Admin / duty: edit any line, add a line
-- p: {section_id, entry_date, subject_id?, kind?, body, body_te?}
-- ---------------------------------------------------------------------
create function public.admin_save_diary_line(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sec   uuid := nullif(p ->> 'section_id', '')::uuid;
  d     date := (p ->> 'entry_date')::date;
  subj  uuid := nullif(p ->> 'subject_id', '')::uuid;
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'subject');
  v_body text := trim(coalesce(p ->> 'body', ''));
  v_te   text := nullif(trim(coalesce(p ->> 'body_te', '')), '');
  eid   uuid;
begin
  perform app.require_notices_duty();
  if sec is null or d is null then
    raise exception 'Choose the section and the date' using errcode = '23514';
  end if;
  if v_kind not in ('subject', 'remark') or (v_kind = 'remark') <> (subj is null) then
    raise exception 'A subject entry needs a subject; a class remark has none' using errcode = '23514';
  end if;
  if subj is not null and not exists (select 1 from public.subjects where id = subj) then
    raise exception 'Unknown subject' using errcode = '23514';
  end if;
  if length(v_body) < 2 then
    raise exception 'Write the diary text' using errcode = '23514';
  end if;
  perform app.diary_year(sec, d);
  perform app.diary_lock(sec, d, subj, v_kind);
  eid := app.diary_find(sec, d, subj, v_kind);
  if eid is null then
    insert into public.diary_entries (academic_year_id, entry_date, subject_id, kind, body, body_te, status, submitted_at)
    values (app.diary_year(sec, d), d, subj, v_kind, v_body, v_te, 'submitted', now())
    returning id into eid;
    insert into public.diary_entry_sections (entry_id, section_id) values (eid, sec);
    delete from public.diary_skips where section_id = sec and entry_date = d and subject_id = subj;
  else
    update public.diary_entries
       set body = v_body, body_te = v_te,
           status = case when status = 'draft' then 'submitted' else status end,
           submitted_at = coalesce(submitted_at, now())
     where id = eid;
  end if;
  return eid;
end $$;
revoke execute on function public.admin_save_diary_line(jsonb) from public, anon;
grant execute on function public.admin_save_diary_line(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Publish / unpublish one class-day
-- ---------------------------------------------------------------------
create function app.diary_publish_section(p_section uuid, p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.diary_entries e
     set status = 'published', published_at = now(), published_by = app.current_staff_id()
   where e.status = 'submitted' and e.archived_at is null and e.entry_date = p_date
     and exists (select 1 from public.diary_entry_sections s where s.entry_id = e.id and s.section_id = p_section);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function app.diary_publish_section(uuid, date) from public, anon, authenticated;

create function public.publish_class_diary(p_section uuid, p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform app.require_notices_duty();
  n := app.diary_publish_section(p_section, p_date);
  if n = 0 and not exists (
       select 1 from public.diary_entries e join public.diary_entry_sections s on s.entry_id = e.id
       where s.section_id = p_section and e.entry_date = p_date and e.status = 'published' and e.archived_at is null) then
    raise exception 'Nothing submitted to publish for this class and date' using errcode = '23514';
  end if;
  return n;
end $$;
revoke execute on function public.publish_class_diary(uuid, date) from public, anon;
grant execute on function public.publish_class_diary(uuid, date) to authenticated;

-- publish every class whose expected subjects are all in; returns how many classes
create function public.publish_all_complete(p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare sec record; classes integer := 0;
begin
  perform app.require_notices_duty();
  for sec in
    select s.id from public.sections s
    join public.academic_years y on y.id = s.academic_year_id and p_date between y.start_date and y.end_date
    where exists (select 1 from app.diary_expected(s.id, p_date))
      and not exists (
        select 1 from app.diary_expected(s.id, p_date) x(subject_id)
        where not exists (select 1 from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
                          where es.section_id = s.id and e.entry_date = p_date and e.kind = 'subject' and e.subject_id = x.subject_id
                            and e.status in ('submitted', 'published') and e.archived_at is null))
      and exists (select 1 from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
                  where es.section_id = s.id and e.entry_date = p_date and e.status = 'submitted' and e.archived_at is null)
  loop
    if app.diary_publish_section(sec.id, p_date) > 0 then classes := classes + 1; end if;
  end loop;
  return classes;
end $$;
revoke execute on function public.publish_all_complete(date) from public, anon;
grant execute on function public.publish_all_complete(date) to authenticated;

-- published -> submitted again (so the class can be corrected and republished)
create function public.unpublish_class_diary(p_section uuid, p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform app.require_notices_duty();
  update public.diary_entries e
     set status = 'submitted', published_at = null, published_by = null
   where e.status = 'published' and e.archived_at is null and e.entry_date = p_date
     and exists (select 1 from public.diary_entry_sections s where s.entry_id = e.id and s.section_id = p_section);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.unpublish_class_diary(uuid, date) from public, anon;
grant execute on function public.unpublish_class_diary(uuid, date) to authenticated;

-- single-entry status change (the older entry list): unpublished entries of the
-- new workflow go back to "submitted"
create or replace function public.set_diary_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.diary_entries;
begin
  perform app.require_notices_duty();
  if p_status not in ('draft', 'submitted', 'published') then
    raise exception 'Status must be draft, submitted or published' using errcode = '23514';
  end if;
  select * into e from public.diary_entries where id = p_id for update;
  if not found or e.archived_at is not null then
    raise exception 'This diary entry cannot be changed' using errcode = '23514';
  end if;
  update public.diary_entries
     set status = p_status,
         published_at = case when p_status = 'published' and e.status <> 'published' then now() when p_status <> 'published' then null else e.published_at end,
         published_by = case when p_status = 'published' and e.status <> 'published' then app.current_staff_id() when p_status <> 'published' then null else e.published_by end,
         submitted_at = case when p_status = 'draft' then null else coalesce(e.submitted_at, now()) end
   where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Skip a subject, remind a teacher
-- ---------------------------------------------------------------------
create function public.skip_diary_subject(p_section uuid, p_date date, p_subject uuid, p_skip boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  if p_skip then
    insert into public.diary_skips (section_id, entry_date, subject_id, skipped_by)
    values (p_section, p_date, p_subject, app.current_staff_id())
    on conflict (section_id, entry_date, subject_id) do nothing;
  else
    delete from public.diary_skips where section_id = p_section and entry_date = p_date and subject_id = p_subject;
  end if;
end $$;
revoke execute on function public.skip_diary_subject(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.skip_diary_subject(uuid, date, uuid, boolean) to authenticated;

-- p_subject null = remind the class teacher about the class remark
create function public.remind_diary(p_section uuid, p_date date, p_subject uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; t record;
begin
  perform app.require_notices_duty();
  for t in
    select a.staff_id from public.teacher_assignments a where a.section_id = p_section and a.subject_id = p_subject
    union
    select s.class_teacher_id from public.sections s where s.id = p_section and p_subject is null and s.class_teacher_id is not null
  loop
    insert into public.diary_reminders (teacher_id, section_id, entry_date, subject_id, reminded_by)
    values (t.staff_id, p_section, p_date, p_subject, app.current_staff_id())
    on conflict (teacher_id, section_id, entry_date, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set reminded_by = excluded.reminded_by, created_at = now();
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'No teacher is assigned to this subject' using errcode = '23514';
  end if;
  return n;
end $$;
revoke execute on function public.remind_diary(uuid, date, uuid) from public, anon;
grant execute on function public.remind_diary(uuid, date, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- The board: one row per section for a date (Admin / duty)
-- ---------------------------------------------------------------------
create function public.diary_board(p_date date)
returns table (section_id uuid, expected integer, submitted integer, published integer, skipped integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  return query
  select s.id,
    (select count(*)::int from app.diary_expected(s.id, p_date)),
    (select count(distinct e.subject_id)::int from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
       where es.section_id = s.id and e.entry_date = p_date and e.kind = 'subject' and e.status in ('submitted', 'published')
         and e.archived_at is null and e.subject_id in (select * from app.diary_expected(s.id, p_date))),
    (select count(*)::int from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
       where es.section_id = s.id and e.entry_date = p_date and e.status = 'published' and e.archived_at is null),
    (select count(*)::int from public.diary_skips k where k.section_id = s.id and k.entry_date = p_date)
  from public.sections s
  join public.academic_years y on y.id = s.academic_year_id and p_date between y.start_date and y.end_date;
end $$;
revoke execute on function public.diary_board(date) from public, anon;
grant execute on function public.diary_board(date) to authenticated;

-- ---------------------------------------------------------------------
-- Attachments: the author may attach to an unpublished entry
-- ---------------------------------------------------------------------
create function app.diary_can_attach(p_entry uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_staff_user() and exists (
    select 1 from public.diary_entries e
    where e.id = p_entry and e.archived_at is null
      and (public.has_duty('notices_diary')
           or (e.author_id = app.current_staff_id() and e.status <> 'published' and e.entry_date >= app.today_ist())))
$$;
grant execute on function app.diary_can_attach(uuid) to authenticated;

create or replace function public.add_diary_attachment(p_entry uuid, p_path text, p_name text, p_mime text, p_size bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin
  if not app.diary_can_attach(p_entry) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_path not like p_entry::text || '/%' then
    raise exception 'The file must be stored under the entry' using errcode = '23514';
  end if;
  insert into public.diary_attachments (entry_id, file_path, file_name, mime_type, size_bytes)
  values (p_entry, p_path, p_name, p_mime, p_size) returning id into aid;
  return aid;
end $$;

create or replace function public.remove_attachment(p_kind text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare path text; ent uuid;
begin
  if p_kind = 'diary' then
    select entry_id into ent from public.diary_attachments where id = p_id;
    if ent is null or not app.diary_can_attach(ent) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    delete from public.diary_attachments where id = p_id returning file_path into path;
  elsif p_kind = 'notice' then
    perform app.require_notices_duty();
    delete from public.notice_attachments where id = p_id returning file_path into path;
  else
    raise exception 'Unknown attachment type' using errcode = '23514';
  end if;
  return path;
end $$;

drop policy diary_files_insert on storage.objects;
drop policy diary_files_delete on storage.objects;
create policy diary_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'diary-files' and app.diary_can_attach(app.uuid_or_null((storage.foldername(name))[1])));
create policy diary_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'diary-files' and app.diary_can_attach(app.uuid_or_null((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- Log "opened in WhatsApp" style actions (Admin and the duties)
-- ---------------------------------------------------------------------
create function public.log_message(p_kind text, p_target text, p_student uuid, p_section uuid, p_date date, p_channel text, p_summary text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare lid uuid;
begin
  if not app.is_staff_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind in ('diary', 'notice') then
    perform app.require_notices_duty();
  elsif p_kind = 'fee_due' then
    if not public.has_duty('fee_collection') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif p_kind = 'absence' then
    if not public.has_duty('all_class_attendance') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_target = 'student' and p_student is null then
    raise exception 'A personal message needs a student' using errcode = '23514';
  end if;
  insert into public.message_log (kind, target, student_id, section_id, ref_date, channel, summary, actor_id)
  values (p_kind, p_target, p_student, p_section, p_date, coalesce(p_channel, 'app'), left(p_summary, 300), app.current_staff_id())
  returning id into lid;
  return lid;
end $$;
revoke execute on function public.log_message(text, text, uuid, uuid, date, text, text) from public, anon;
grant execute on function public.log_message(text, text, uuid, uuid, date, text, text) to authenticated;

-- my reminders that are still open (no submitted entry yet)
create function public.my_diary_reminders() returns table (id uuid, section_id uuid, entry_date date, subject_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, r.section_id, r.entry_date, r.subject_id from public.diary_reminders r
  where r.teacher_id = app.current_staff_id() and r.entry_date >= app.today_ist()
    and not exists (select 1 from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
                    where es.section_id = r.section_id and e.entry_date = r.entry_date and e.subject_id is not distinct from r.subject_id
                      and e.status in ('submitted', 'published') and e.archived_at is null)
$$;
revoke execute on function public.my_diary_reminders() from public, anon;
grant execute on function public.my_diary_reminders() to authenticated;
