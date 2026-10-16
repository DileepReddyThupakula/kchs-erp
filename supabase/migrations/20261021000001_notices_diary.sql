-- =====================================================================
-- Module: Notices and Diary (Part 1 - database)
--
--  Two kinds: Diary (daily class entries) and Notices (circulars).
--  Admin and a teacher with the notices_diary duty add, edit and publish
--  both; only Admin archives (and restores). Every other teacher can only
--  view: diary of sections they teach (class teacher or subject teacher),
--  notices addressed to them. Drafts, archived and (for others) expired
--  or not-yet-published notices are invisible to them.
--
--  All writes go through checked functions; the tables have no insert /
--  update / delete policy. Circular numbers are assigned when a notice is
--  first published, from a gap-free series per academic year.
-- =====================================================================

alter table public.school_settings add column circular_prefix text;   -- null = use the short name

-- ---------------------------------------------------------------------
-- Diary
-- ---------------------------------------------------------------------
create table public.diary_entries (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  entry_date       date not null,
  subject_id       uuid references public.subjects (id) on delete restrict,
  body             text not null check (length(trim(body)) >= 2),
  status           text not null default 'draft' check (status in ('draft', 'published')),
  published_at     timestamptz,
  published_by     uuid references public.staff (id) on delete set null,
  archived_at      timestamptz,
  archived_by      uuid references public.staff (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid
);
create index diary_entries_date_idx on public.diary_entries (entry_date);
create index diary_entries_year_idx on public.diary_entries (academic_year_id);
create index diary_entries_subject_idx on public.diary_entries (subject_id);
create index diary_entries_published_by_idx on public.diary_entries (published_by);
create index diary_entries_archived_by_idx on public.diary_entries (archived_by);
select app.attach_std_triggers('public.diary_entries');

create table public.diary_entry_sections (
  entry_id   uuid not null references public.diary_entries (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  primary key (entry_id, section_id)
);
create index diary_entry_sections_section_idx on public.diary_entry_sections (section_id);

create table public.diary_attachments (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.diary_entries (id) on delete cascade,
  file_path  text not null,
  file_name  text not null,
  mime_type  text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (file_path)
);
create index diary_attachments_entry_idx on public.diary_attachments (entry_id);
select app.attach_std_triggers('public.diary_attachments');

-- ---------------------------------------------------------------------
-- Notices (circulars)
-- ---------------------------------------------------------------------
create table public.notices (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  circular_seq     integer,
  circular_no      text unique,
  title            text not null check (length(trim(title)) >= 3),
  body             text not null check (length(trim(body)) >= 2),
  audience         text not null check (audience in ('all', 'roles', 'classes', 'teachers')),
  publish_date     date not null default current_date,
  expires_on       date,
  important        boolean not null default false,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  published_at     timestamptz,
  published_by     uuid references public.staff (id) on delete set null,
  archived_at      timestamptz,
  archived_by      uuid references public.staff (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  check (expires_on is null or expires_on >= publish_date),
  check ((status = 'published') = (circular_no is not null))
);
create unique index notices_year_seq on public.notices (academic_year_id, circular_seq) where circular_seq is not null;
create index notices_status_idx on public.notices (status, publish_date);
create index notices_published_by_idx on public.notices (published_by);
create index notices_archived_by_idx on public.notices (archived_by);
select app.attach_std_triggers('public.notices');

create table public.notice_audience (
  id        uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices (id) on delete cascade,
  role      public.app_role,
  class_id  uuid references public.classes (id) on delete cascade,
  staff_id  uuid references public.staff (id) on delete cascade,
  check (num_nonnulls(role, class_id, staff_id) = 1)
);
create index notice_audience_notice_idx on public.notice_audience (notice_id);
create index notice_audience_class_idx on public.notice_audience (class_id);
create index notice_audience_staff_idx on public.notice_audience (staff_id);

create table public.notice_attachments (
  id         uuid primary key default gen_random_uuid(),
  notice_id  uuid not null references public.notices (id) on delete cascade,
  file_path  text not null,
  file_name  text not null,
  mime_type  text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (file_path)
);
create index notice_attachments_notice_idx on public.notice_attachments (notice_id);
select app.attach_std_triggers('public.notice_attachments');

create table public.notice_reads (
  notice_id uuid not null references public.notices (id) on delete cascade,
  staff_id  uuid not null references public.staff (id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (notice_id, staff_id)
);
create index notice_reads_staff_idx on public.notice_reads (staff_id);

-- ---------------------------------------------------------------------
-- Visibility (used by the RLS policies and the storage policies)
-- ---------------------------------------------------------------------
create function app.diary_visible(p_entry uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_staff_user() and exists (
    select 1 from public.diary_entries e
    where e.id = p_entry
      and (app.is_admin()
           or (e.archived_at is null
               and (public.has_duty('notices_diary')
                    or (e.status = 'published'
                        and exists (select 1 from public.diary_entry_sections s
                                    where s.entry_id = e.id and app.teaches_section(s.section_id)))))))
$$;

-- does this notice's audience include the signed-in person?
create function app.notice_for_me(p_notice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notices n
    where n.id = p_notice
      and (n.audience = 'all'
           or (n.audience = 'roles' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.role = app.current_app_role()))
           or (n.audience = 'classes' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.class_id is not null and app.teaches_class(a.class_id)))
           or (n.audience = 'teachers' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.staff_id = app.current_staff_id()))))
$$;

create function app.notice_visible(p_notice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_staff_user() and exists (
    select 1 from public.notices n
    where n.id = p_notice
      and (app.is_admin()
           or (n.archived_at is null
               and (public.has_duty('notices_diary')
                    or (n.status = 'published' and n.publish_date <= app.today_ist()
                        and (n.expires_on is null or n.expires_on >= app.today_ist())
                        and app.notice_for_me(n.id))))))
$$;
grant execute on function app.diary_visible(uuid), app.notice_for_me(uuid), app.notice_visible(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS: read only; writes use the functions below
-- ---------------------------------------------------------------------
alter table public.diary_entries enable row level security;
alter table public.diary_entry_sections enable row level security;
alter table public.diary_attachments enable row level security;
alter table public.notices enable row level security;
alter table public.notice_audience enable row level security;
alter table public.notice_attachments enable row level security;
alter table public.notice_reads enable row level security;

create policy de_select on public.diary_entries for select to authenticated using (app.diary_visible(id));
create policy des_select on public.diary_entry_sections for select to authenticated using (app.diary_visible(entry_id));
create policy da_select on public.diary_attachments for select to authenticated using (app.diary_visible(entry_id));
create policy nt_select on public.notices for select to authenticated using (app.notice_visible(id));
create policy na_select on public.notice_audience for select to authenticated using (app.notice_visible(notice_id));
create policy nat_select on public.notice_attachments for select to authenticated using (app.notice_visible(notice_id));
create policy nr_select on public.notice_reads for select to authenticated
  using ((select app.is_admin()) or staff_id = (select app.current_staff_id()));

grant select on public.diary_entries, public.diary_entry_sections, public.diary_attachments,
  public.notices, public.notice_audience, public.notice_attachments, public.notice_reads to authenticated;

-- ---------------------------------------------------------------------
-- Diary functions
-- ---------------------------------------------------------------------
create function app.require_notices_duty() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff_user() or not public.has_duty('notices_diary') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
grant execute on function app.require_notices_duty() to authenticated;

-- checks + writes one diary entry; returns its id
create function app.diary_write(p_id uuid, p_date date, p_sections uuid[], p_subject uuid, p_body text, p_status text, p_demo boolean default false)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  yid   uuid;
  n_ok  integer;
  eid   uuid := p_id;
  old   public.diary_entries;
  me    uuid := app.current_staff_id();
begin
  if p_date is null then
    raise exception 'Choose the date' using errcode = '23514';
  end if;
  if p_sections is null or cardinality(p_sections) = 0 then
    raise exception 'Choose at least one section' using errcode = '23514';
  end if;
  if p_status not in ('draft', 'published') then
    raise exception 'Status must be draft or published' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_body, ''))) < 2 then
    raise exception 'Write the diary text' using errcode = '23514';
  end if;
  select count(distinct s.id), (array_agg(distinct s.academic_year_id))[1]
    into n_ok, yid
  from public.sections s where s.id = any (p_sections);
  if n_ok <> (select count(distinct x) from unnest(p_sections) x) then
    raise exception 'Unknown section' using errcode = '23514';
  end if;
  if (select count(distinct s.academic_year_id) from public.sections s where s.id = any (p_sections)) <> 1 then
    raise exception 'All sections must be from the same academic year' using errcode = '23514';
  end if;
  if not exists (select 1 from public.academic_years y where y.id = yid and p_date between y.start_date and y.end_date) then
    raise exception 'That date is outside the academic year of the chosen sections' using errcode = '23514';
  end if;
  if p_subject is not null and not exists (select 1 from public.subjects where id = p_subject) then
    raise exception 'Unknown subject' using errcode = '23514';
  end if;

  if eid is null then
    insert into public.diary_entries (academic_year_id, entry_date, subject_id, body, status, published_at, published_by, is_demo)
    values (yid, p_date, p_subject, trim(p_body), p_status, case when p_status = 'published' then now() end,
            case when p_status = 'published' then me end, p_demo)
    returning id into eid;
  else
    select * into old from public.diary_entries where id = eid for update;
    if not found or old.archived_at is not null then
      raise exception 'This diary entry cannot be edited (missing or archived)' using errcode = '23514';
    end if;
    update public.diary_entries
       set academic_year_id = yid, entry_date = p_date, subject_id = p_subject, body = trim(p_body), status = p_status,
           published_at = case when p_status = 'published' and old.status <> 'published' then now() when p_status = 'draft' then null else old.published_at end,
           published_by = case when p_status = 'published' and old.status <> 'published' then me when p_status = 'draft' then null else old.published_by end
     where id = eid;
    delete from public.diary_entry_sections where entry_id = eid;
  end if;
  insert into public.diary_entry_sections (entry_id, section_id) select eid, x from unnest(p_sections) x group by x;
  return eid;
end $$;
revoke execute on function app.diary_write(uuid, date, uuid[], uuid, text, text, boolean) from public, anon, authenticated;

-- one entry; p: {id?, entry_date, section_ids[], subject_id?, body, status}
create function public.save_diary(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  return app.diary_write(
    nullif(p ->> 'id', '')::uuid,
    (p ->> 'entry_date')::date,
    coalesce(array(select jsonb_array_elements_text(p -> 'section_ids'))::uuid[], '{}'),
    nullif(p ->> 'subject_id', '')::uuid,
    p ->> 'body',
    coalesce(p ->> 'status', 'draft'));
end $$;
revoke execute on function public.save_diary(jsonb) from public, anon;
grant execute on function public.save_diary(jsonb) to authenticated;

-- quick entry: one line per subject for the same sections and date, saved together
-- p_items: [{"subject_id": "...", "body": "..."}]
create function public.save_diary_day(p_date date, p_section_ids uuid[], p_items jsonb, p_publish boolean default true)
returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  it  jsonb;
  ids uuid[] := '{}';
begin
  perform app.require_notices_duty();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one line' using errcode = '23514';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    ids := ids || app.diary_write(null, p_date, p_section_ids, nullif(it ->> 'subject_id', '')::uuid, it ->> 'body',
                                  case when p_publish then 'published' else 'draft' end);
  end loop;
  return ids;
end $$;
revoke execute on function public.save_diary_day(date, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.save_diary_day(date, uuid[], jsonb, boolean) to authenticated;

create function public.set_diary_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.diary_entries;
begin
  perform app.require_notices_duty();
  if p_status not in ('draft', 'published') then
    raise exception 'Status must be draft or published' using errcode = '23514';
  end if;
  select * into e from public.diary_entries where id = p_id for update;
  if not found or e.archived_at is not null then
    raise exception 'This diary entry cannot be changed' using errcode = '23514';
  end if;
  update public.diary_entries
     set status = p_status,
         published_at = case when p_status = 'published' and e.status <> 'published' then now() when p_status = 'draft' then null else e.published_at end,
         published_by = case when p_status = 'published' and e.status <> 'published' then app.current_staff_id() when p_status = 'draft' then null else e.published_by end
   where id = p_id;
end $$;
revoke execute on function public.set_diary_status(uuid, text) from public, anon;
grant execute on function public.set_diary_status(uuid, text) to authenticated;

-- archive / restore: Admin only
create function public.archive_diary(p_id uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.diary_entries
     set archived_at = case when p_archive then now() end, archived_by = case when p_archive then app.current_staff_id() end
   where id = p_id;
  if not found then
    raise exception 'Unknown diary entry' using errcode = '23514';
  end if;
end $$;
revoke execute on function public.archive_diary(uuid, boolean) from public, anon;
grant execute on function public.archive_diary(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Notice functions
-- ---------------------------------------------------------------------
-- p: {id?, title, body, audience, roles[], class_ids[], staff_ids[], publish_date?, expires_on?, important?}
create function app.notice_write(p jsonb, p_demo boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  nid   uuid := nullif(p ->> 'id', '')::uuid;
  aud   text := p ->> 'audience';
  pdate date := coalesce(nullif(p ->> 'publish_date', '')::date, app.today_ist());
  edate date := nullif(p ->> 'expires_on', '')::date;
  yid   uuid;
  r     text;
  c     uuid;
  s     uuid;
  old   public.notices;
begin
  if aud is null or aud not in ('all', 'roles', 'classes', 'teachers') then
    raise exception 'Choose who the notice is for' using errcode = '23514';
  end if;
  if length(trim(coalesce(p ->> 'title', ''))) < 3 then
    raise exception 'Give the notice a title' using errcode = '23514';
  end if;
  if length(trim(coalesce(p ->> 'body', ''))) < 2 then
    raise exception 'Write the notice text' using errcode = '23514';
  end if;
  if edate is not null and edate < pdate then
    raise exception 'The expiry date cannot be before the publish date' using errcode = '23514';
  end if;
  if aud = 'roles' and jsonb_array_length(coalesce(p -> 'roles', '[]')) = 0 then
    raise exception 'Choose at least one role' using errcode = '23514';
  end if;
  if aud = 'classes' and jsonb_array_length(coalesce(p -> 'class_ids', '[]')) = 0 then
    raise exception 'Choose at least one class' using errcode = '23514';
  end if;
  if aud = 'teachers' and jsonb_array_length(coalesce(p -> 'staff_ids', '[]')) = 0 then
    raise exception 'Choose at least one teacher' using errcode = '23514';
  end if;
  select id into yid from public.academic_years where pdate between start_date and end_date order by start_date desc limit 1;
  if yid is null then
    select id into yid from public.academic_years where is_current limit 1;
  end if;
  if yid is null then
    raise exception 'No academic year covers that date' using errcode = '23514';
  end if;

  if nid is null then
    insert into public.notices (academic_year_id, title, body, audience, publish_date, expires_on, important, is_demo)
    values (yid, trim(p ->> 'title'), trim(p ->> 'body'), aud, pdate, edate, coalesce((p ->> 'important')::boolean, false), p_demo)
    returning id into nid;
  else
    select * into old from public.notices where id = nid for update;
    if not found or old.archived_at is not null then
      raise exception 'This notice cannot be edited (missing or archived)' using errcode = '23514';
    end if;
    update public.notices
       set title = trim(p ->> 'title'), body = trim(p ->> 'body'), audience = aud, publish_date = pdate, expires_on = edate,
           important = coalesce((p ->> 'important')::boolean, false)
     where id = nid;
    delete from public.notice_audience where notice_id = nid;
  end if;

  if aud = 'roles' then
    for r in select jsonb_array_elements_text(p -> 'roles') loop
      if r not in ('admin', 'teacher') then
        raise exception 'Unknown role %', r using errcode = '23514';
      end if;
      insert into public.notice_audience (notice_id, role) values (nid, r::public.app_role);
    end loop;
  elsif aud = 'classes' then
    for c in select jsonb_array_elements_text(p -> 'class_ids')::uuid loop
      insert into public.notice_audience (notice_id, class_id) values (nid, c);
    end loop;
  elsif aud = 'teachers' then
    for s in select jsonb_array_elements_text(p -> 'staff_ids')::uuid loop
      insert into public.notice_audience (notice_id, staff_id) values (nid, s);
    end loop;
  end if;
  return nid;
end $$;
revoke execute on function app.notice_write(jsonb, boolean) from public, anon, authenticated;

create function public.save_notice(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  return app.notice_write(p);
end $$;
revoke execute on function public.save_notice(jsonb) from public, anon;
grant execute on function public.save_notice(jsonb) to authenticated;

-- publish: assigns the circular number (once) from the gap-free series of the year
create function public.publish_notice(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  n    public.notices;
  yr   public.academic_years;
  seq  bigint;
  pfx  text;
  no   text;
begin
  perform app.require_notices_duty();
  select * into n from public.notices where id = p_id for update;
  if not found or n.archived_at is not null then
    raise exception 'This notice cannot be published (missing or archived)' using errcode = '23514';
  end if;
  if n.status = 'published' then
    return n.circular_no;
  end if;
  select * into yr from public.academic_years where id = n.academic_year_id;
  seq := app.next_number('circular:' || yr.name);
  select coalesce(nullif(trim(circular_prefix), ''), nullif(trim(short_name), ''), 'CIR') into pfx from public.school_settings where id = 1;
  no := pfx || '/' || yr.name || '/' || lpad(seq::text, 3, '0');
  update public.notices
     set status = 'published', circular_seq = seq, circular_no = no, published_at = now(), published_by = app.current_staff_id()
   where id = p_id;
  return no;
end $$;
revoke execute on function public.publish_notice(uuid) from public, anon;
grant execute on function public.publish_notice(uuid) to authenticated;

-- archive / restore: Admin only
create function public.archive_notice(p_id uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.notices
     set archived_at = case when p_archive then now() end, archived_by = case when p_archive then app.current_staff_id() end
   where id = p_id;
  if not found then
    raise exception 'Unknown notice' using errcode = '23514';
  end if;
end $$;
revoke execute on function public.archive_notice(uuid, boolean) from public, anon;
grant execute on function public.archive_notice(uuid, boolean) to authenticated;

-- a staff member marks a notice they can see as read
create function public.mark_notice_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.current_staff_id();
begin
  if me is null or not app.notice_visible(p_id)
     or not exists (select 1 from public.notices where id = p_id and status = 'published') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.notice_reads (notice_id, staff_id) values (p_id, me) on conflict do nothing;
end $$;
revoke execute on function public.mark_notice_read(uuid) from public, anon;
grant execute on function public.mark_notice_read(uuid) to authenticated;

-- the staff a notice is addressed to (people with a login)
create function app.notice_audience_staff(p_notice uuid) returns table (staff_id uuid)
language sql stable security definer set search_path = '' as $$
  select s.id from public.notices n
  join public.staff s on s.status = 'active' and s.app_role is not null
  where n.id = p_notice
    and (n.audience = 'all'
         or (n.audience = 'roles' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.role = s.app_role))
         or (n.audience = 'teachers' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.staff_id = s.id))
         or (n.audience = 'classes' and exists (
               select 1 from public.notice_audience a
               join public.sections sec on sec.class_id = a.class_id
               left join public.teacher_assignments ta on ta.section_id = sec.id and ta.staff_id = s.id
               where a.notice_id = n.id and (sec.class_teacher_id = s.id or ta.id is not null))))
$$;
revoke execute on function app.notice_audience_staff(uuid) from public, anon, authenticated;

-- Admin: who has and has not read a notice
create function public.notice_readers(p_notice uuid)
returns table (staff_id uuid, full_name text, designation text, read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select s.id, s.full_name, s.designation, r.read_at
  from app.notice_audience_staff(p_notice) a
  join public.staff s on s.id = a.staff_id
  left join public.notice_reads r on r.notice_id = p_notice and r.staff_id = s.id
  order by (r.read_at is null) desc, s.full_name;
end $$;
revoke execute on function public.notice_readers(uuid) from public, anon;
grant execute on function public.notice_readers(uuid) to authenticated;

-- how many visible published notices the signed-in person has not read
create function public.my_unread_notices() returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer from public.notices n
  where n.status = 'published' and n.publish_date <= app.today_ist() and (n.expires_on is null or n.expires_on >= app.today_ist())
    and not exists (select 1 from public.notice_reads r where r.notice_id = n.id and r.staff_id = app.current_staff_id())
$$;
grant execute on function public.my_unread_notices() to authenticated;

-- ---------------------------------------------------------------------
-- Attachments (metadata; the files live in private storage)
-- ---------------------------------------------------------------------
create function public.add_diary_attachment(p_entry uuid, p_path text, p_name text, p_mime text, p_size bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin
  perform app.require_notices_duty();
  if not exists (select 1 from public.diary_entries where id = p_entry and archived_at is null) then
    raise exception 'Unknown diary entry' using errcode = '23514';
  end if;
  if p_path not like p_entry::text || '/%' then
    raise exception 'The file must be stored under the entry' using errcode = '23514';
  end if;
  insert into public.diary_attachments (entry_id, file_path, file_name, mime_type, size_bytes)
  values (p_entry, p_path, p_name, p_mime, p_size) returning id into aid;
  return aid;
end $$;
revoke execute on function public.add_diary_attachment(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.add_diary_attachment(uuid, text, text, text, bigint) to authenticated;

create function public.add_notice_attachment(p_notice uuid, p_path text, p_name text, p_mime text, p_size bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin
  perform app.require_notices_duty();
  if not exists (select 1 from public.notices where id = p_notice and archived_at is null) then
    raise exception 'Unknown notice' using errcode = '23514';
  end if;
  if p_path not like p_notice::text || '/%' then
    raise exception 'The file must be stored under the notice' using errcode = '23514';
  end if;
  insert into public.notice_attachments (notice_id, file_path, file_name, mime_type, size_bytes)
  values (p_notice, p_path, p_name, p_mime, p_size) returning id into aid;
  return aid;
end $$;
revoke execute on function public.add_notice_attachment(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.add_notice_attachment(uuid, text, text, text, bigint) to authenticated;

create function public.remove_attachment(p_kind text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare path text;
begin
  perform app.require_notices_duty();
  if p_kind = 'diary' then
    delete from public.diary_attachments where id = p_id returning file_path into path;
  elsif p_kind = 'notice' then
    delete from public.notice_attachments where id = p_id returning file_path into path;
  else
    raise exception 'Unknown attachment type' using errcode = '23514';
  end if;
  return path;
end $$;
revoke execute on function public.remove_attachment(text, uuid) from public, anon;
grant execute on function public.remove_attachment(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Private storage: readers = whoever can see the parent; writers = duty
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('diary-files', 'diary-files', false, 5242880, '{application/pdf,image/jpeg,image/png,image/webp}'),
  ('notice-files', 'notice-files', false, 5242880, '{application/pdf,image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

create policy diary_files_select on storage.objects for select to authenticated
  using (bucket_id = 'diary-files' and app.diary_visible(app.uuid_or_null((storage.foldername(name))[1])));
create policy diary_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'diary-files' and (select public.has_duty('notices_diary')));
create policy diary_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'diary-files' and (select public.has_duty('notices_diary')));
create policy notice_files_select on storage.objects for select to authenticated
  using (bucket_id = 'notice-files' and app.notice_visible(app.uuid_or_null((storage.foldername(name))[1])));
create policy notice_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'notice-files' and (select public.has_duty('notices_diary')));
create policy notice_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'notice-files' and (select public.has_duty('notices_diary')));
