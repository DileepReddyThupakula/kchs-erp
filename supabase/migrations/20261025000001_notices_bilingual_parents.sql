-- =====================================================================
--  Notices Part B: English + Telugu, "parents" audience (printed / sent by
--  WhatsApp only: parents get NO login), WhatsApp group labels and a send
--  checklist per notice. Telugu follows the diary rules: translated on
--  publish by the server, reviewed Telugu is never overwritten.
-- =====================================================================

-- Bilingual columns --------------------------------------------------------
alter table public.notices add column title_te text check (title_te is null or length(trim(title_te)) >= 1);
alter table public.notices add column body_te text check (body_te is null or length(trim(body_te)) >= 1);
alter table public.notices add column te_status text not null default 'none' check (te_status in ('none', 'pending', 'auto', 'reviewed'));
alter table public.notices add column te_src_hash text;

-- Audience: parents (whole school or selected classes) -----------------------
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.notices'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%audience%roles%';
  execute format('alter table public.notices drop constraint %I', c);
end $$;
alter table public.notices add constraint notices_audience_check check (audience in ('all', 'roles', 'classes', 'teachers', 'parents_all', 'parents_classes'));

-- WhatsApp group labels (used only as labels in the checklist) ---------------
alter table public.sections add column parents_group_name text check (parents_group_name is null or length(trim(parents_group_name)) between 2 and 80);
alter table public.school_settings add column staff_group_name text check (staff_group_name is null or length(trim(staff_group_name)) between 2 and 80);

-- Who is a notice for ----------------------------------------------------------
create or replace function app.notice_for_me(p_notice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notices n
    where n.id = p_notice
      and (n.audience in ('all', 'parents_all')
           or (n.audience = 'roles' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.role = app.current_app_role()))
           or (n.audience in ('classes', 'parents_classes') and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.class_id is not null and app.teaches_class(a.class_id)))
           or (n.audience = 'teachers' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.staff_id = app.current_staff_id()))))
$$;

create or replace function app.notice_audience_staff(p_notice uuid) returns table (staff_id uuid)
language sql stable security definer set search_path = '' as $$
  select s.id from public.notices n
  join public.staff s on s.status = 'active' and s.app_role is not null
  where n.id = p_notice
    and (n.audience in ('all', 'parents_all')
         or (n.audience = 'roles' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.role = s.app_role))
         or (n.audience = 'teachers' and exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.staff_id = s.id))
         or (n.audience in ('classes', 'parents_classes') and exists (
               select 1 from public.notice_audience a
               join public.sections sec on sec.class_id = a.class_id
               left join public.teacher_assignments ta on ta.section_id = sec.id and ta.staff_id = s.id
               where a.notice_id = n.id and (sec.class_teacher_id = s.id or ta.id is not null))))
$$;

-- Writing a notice (adds Telugu + parents audiences) --------------------------
create or replace function app.notice_write(p jsonb, p_demo boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  nid    uuid := nullif(p ->> 'id', '')::uuid;
  aud    text := p ->> 'audience';
  pdate  date := coalesce(nullif(p ->> 'publish_date', '')::date, app.today_ist());
  edate  date := nullif(p ->> 'expires_on', '')::date;
  v_t    text := trim(coalesce(p ->> 'title', ''));
  v_b    text := trim(coalesce(p ->> 'body', ''));
  v_tte  text := nullif(trim(coalesce(p ->> 'title_te', '')), '');
  v_bte  text := nullif(trim(coalesce(p ->> 'body_te', '')), '');
  h      text;
  yid    uuid;
  r      text;
  c      uuid;
  s      uuid;
  old    public.notices;
  edited boolean;
begin
  if aud is null or aud not in ('all', 'roles', 'classes', 'teachers', 'parents_all', 'parents_classes') then
    raise exception 'Choose who the notice is for' using errcode = '23514';
  end if;
  if length(v_t) < 3 then
    raise exception 'Give the notice a title' using errcode = '23514';
  end if;
  if length(v_b) < 2 then
    raise exception 'Write the notice text' using errcode = '23514';
  end if;
  if edate is not null and edate < pdate then
    raise exception 'The expiry date cannot be before the publish date' using errcode = '23514';
  end if;
  if aud = 'roles' and jsonb_array_length(coalesce(p -> 'roles', '[]')) = 0 then
    raise exception 'Choose at least one role' using errcode = '23514';
  end if;
  if aud in ('classes', 'parents_classes') and jsonb_array_length(coalesce(p -> 'class_ids', '[]')) = 0 then
    raise exception 'Choose at least one class' using errcode = '23514';
  end if;
  if aud = 'teachers' and jsonb_array_length(coalesce(p -> 'staff_ids', '[]')) = 0 then
    raise exception 'Choose at least one teacher' using errcode = '23514';
  end if;
  h := md5(v_t || E'\n' || v_b);
  select id into yid from public.academic_years where pdate between start_date and end_date order by start_date desc limit 1;
  if yid is null then
    select id into yid from public.academic_years where is_current limit 1;
  end if;
  if yid is null then
    raise exception 'No academic year covers that date' using errcode = '23514';
  end if;

  if nid is null then
    insert into public.notices (academic_year_id, title, body, title_te, body_te, te_status, te_src_hash, audience, publish_date, expires_on, important, is_demo)
    values (yid, v_t, v_b, v_tte, v_bte, case when v_tte is null and v_bte is null then 'none' else 'reviewed' end,
            case when v_tte is null and v_bte is null then null else h end, aud, pdate, edate, coalesce((p ->> 'important')::boolean, false), p_demo)
    returning id into nid;
  else
    select * into old from public.notices where id = nid for update;
    if not found or old.archived_at is not null then
      raise exception 'This notice cannot be edited (missing or archived)' using errcode = '23514';
    end if;
    edited := v_tte is distinct from old.title_te or v_bte is distinct from old.body_te;
    update public.notices
       set title = v_t, body = v_b, audience = aud, publish_date = pdate, expires_on = edate,
           important = coalesce((p ->> 'important')::boolean, false),
           title_te = case when edited then v_tte when old.te_status = 'reviewed' or (old.te_status = 'auto' and old.te_src_hash = h) then old.title_te else null end,
           body_te  = case when edited then v_bte when old.te_status = 'reviewed' or (old.te_status = 'auto' and old.te_src_hash = h) then old.body_te else null end,
           te_status = case when edited then (case when v_tte is null and v_bte is null then 'none' else 'reviewed' end)
                            when old.te_status = 'reviewed' then 'reviewed'
                            when old.te_status = 'auto' and old.te_src_hash = h then 'auto'
                            when old.status = 'published' then 'pending' else 'none' end,
           te_src_hash = case when edited then (case when v_tte is null and v_bte is null then null else h end)
                              when old.te_status = 'reviewed' then old.te_src_hash
                              when old.te_status = 'auto' and old.te_src_hash = h then h
                              else null end
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
  elsif aud in ('classes', 'parents_classes') then
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

-- Publish: numbering as before; Telugu is marked pending for the server to translate
create or replace function public.publish_notice(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  n    public.notices;
  yr   public.academic_years;
  seq  bigint;
  pfx  text;
  no   text;
  h    text;
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
  h := md5(trim(n.title) || E'\n' || trim(n.body));
  update public.notices
     set status = 'published', circular_seq = seq, circular_no = no, published_at = now(), published_by = app.current_staff_id(),
         te_status = case when n.te_status = 'reviewed' or (n.te_status = 'auto' and n.te_src_hash = h) then n.te_status else 'pending' end,
         title_te = case when n.te_status = 'reviewed' or (n.te_status = 'auto' and n.te_src_hash = h) then n.title_te else null end,
         body_te  = case when n.te_status = 'reviewed' or (n.te_status = 'auto' and n.te_src_hash = h) then n.body_te else null end
   where id = p_id;
  return no;
end $$;

-- Server only: store a machine translation (never over reviewed Telugu, only for the English that was translated)
create function public.apply_notice_translation(p_notice uuid, p_title_te text, p_body_te text, p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.notices
     set title_te = trim(p_title_te), body_te = trim(p_body_te), te_status = 'auto', te_src_hash = p_hash
   where id = p_notice and te_status <> 'reviewed' and archived_at is null
     and md5(trim(title) || E'\n' || trim(body)) = p_hash and length(trim(p_title_te)) > 0 and length(trim(p_body_te)) > 0;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.apply_notice_translation(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_notice_translation(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- WhatsApp send checklist (one row per group). We only record that
-- WhatsApp was OPENED and that the person marked it sent; delivery is
-- never known.
-- ---------------------------------------------------------------------
create table public.notice_sends (
  id         uuid primary key default gen_random_uuid(),
  notice_id  uuid not null references public.notices (id) on delete cascade,
  group_key  text not null,                       -- 'staff' or 'section:<uuid>'
  group_label text not null,
  status     text not null default 'opened' check (status in ('opened', 'marked_sent')),
  opened_by  uuid references public.staff (id) on delete set null,
  opened_at  timestamptz,
  marked_by  uuid references public.staff (id) on delete set null,
  marked_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (notice_id, group_key)
);
create index notice_sends_opened_by_idx on public.notice_sends (opened_by);
create index notice_sends_marked_by_idx on public.notice_sends (marked_by);
select app.attach_std_triggers('public.notice_sends');
alter table public.notice_sends enable row level security;
create policy ns_select on public.notice_sends for select to authenticated using ((select public.has_duty('notices_diary')));
grant select on public.notice_sends to authenticated;

-- the groups a notice goes to: parents -> each class group; staff notices -> the staff group
create function app.notice_targets(p_notice uuid) returns table (group_key text, group_label text, section_id uuid)
language sql stable security definer set search_path = '' as $$
  select 'section:' || s.id::text,
         coalesce(s.parents_group_name, c.name || ' – ' || s.name || ' parents group'),
         s.id
  from public.notices n
  join public.sections s on s.academic_year_id = n.academic_year_id
  join public.classes c on c.id = s.class_id
  where n.id = p_notice and n.audience in ('parents_all', 'parents_classes')
    and (n.audience = 'parents_all' or exists (select 1 from public.notice_audience a where a.notice_id = n.id and a.class_id = s.class_id))
  union all
  select 'staff', coalesce((select staff_group_name from public.school_settings where id = 1), 'Staff group'), null::uuid
  from public.notices n where n.id = p_notice and n.audience not in ('parents_all', 'parents_classes')
$$;
revoke execute on function app.notice_targets(uuid) from public, anon, authenticated;

-- the checklist
create function public.notice_send_list(p_notice uuid)
returns table (group_key text, group_label text, status text, opened_by_name text, opened_at timestamptz, marked_by_name text, marked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  if not exists (select 1 from public.notices nn where nn.id = p_notice and nn.status = 'published' and nn.archived_at is null) then
    raise exception 'Only a published notice can be sent' using errcode = '23514';
  end if;
  return query
  select t.group_key, t.group_label, coalesce(ns.status, 'not_sent'), o.full_name, ns.opened_at, m.full_name, ns.marked_at
  from app.notice_targets(p_notice) t
  left join public.notice_sends ns on ns.notice_id = p_notice and ns.group_key = t.group_key
  left join public.staff o on o.id = ns.opened_by
  left join public.staff m on m.id = ns.marked_by
  order by t.group_label;
end $$;
revoke execute on function public.notice_send_list(uuid) from public, anon;
grant execute on function public.notice_send_list(uuid) to authenticated;

-- "Open WhatsApp" for one group: records + logs
create function public.notice_send_open(p_notice uuid, p_key text, p_channel text) returns void
language plpgsql security definer set search_path = '' as $$
declare t record; n public.notices; me uuid := app.current_staff_id();
begin
  perform app.require_notices_duty();
  select * into n from public.notices where id = p_notice;
  if not found or n.status <> 'published' or n.archived_at is not null then
    raise exception 'Only a published notice can be sent' using errcode = '23514';
  end if;
  select * into t from app.notice_targets(p_notice) x where x.group_key = p_key;
  if not found then
    raise exception 'That group is not one of this notice''s groups' using errcode = '23514';
  end if;
  insert into public.notice_sends (notice_id, group_key, group_label, status, opened_by, opened_at)
  values (p_notice, p_key, t.group_label, 'opened', me, now())
  on conflict (notice_id, group_key) do update set opened_by = me, opened_at = now(), group_label = excluded.group_label;
  insert into public.message_log (kind, target, section_id, ref_date, channel, summary, actor_id)
  values ('notice', 'group', t.section_id, app.today_ist(), coalesce(nullif(p_channel, ''), 'app'), left('Circular ' || coalesce(n.circular_no, '') || ' opened in WhatsApp for ' || t.group_label, 300), me);
end $$;
revoke execute on function public.notice_send_open(uuid, text, text) from public, anon;
grant execute on function public.notice_send_open(uuid, text, text) to authenticated;

create function public.notice_send_mark(p_notice uuid, p_key text, p_sent boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare t record; me uuid := app.current_staff_id();
begin
  perform app.require_notices_duty();
  if not exists (select 1 from public.notices where id = p_notice and status = 'published' and archived_at is null) then
    raise exception 'Only a published notice can be sent' using errcode = '23514';
  end if;
  select * into t from app.notice_targets(p_notice) x where x.group_key = p_key;
  if not found then
    raise exception 'That group is not one of this notice''s groups' using errcode = '23514';
  end if;
  if p_sent then
    insert into public.notice_sends (notice_id, group_key, group_label, status, marked_by, marked_at)
    values (p_notice, p_key, t.group_label, 'marked_sent', me, now())
    on conflict (notice_id, group_key) do update set status = 'marked_sent', marked_by = me, marked_at = now();
  else
    update public.notice_sends set status = 'opened', marked_by = null, marked_at = null where notice_id = p_notice and group_key = p_key;
  end if;
end $$;
revoke execute on function public.notice_send_mark(uuid, text, boolean) from public, anon;
grant execute on function public.notice_send_mark(uuid, text, boolean) to authenticated;

-- "Sent to 5 of 13 groups" for every published notice (Admin / duty)
create function public.notice_send_counts() returns table (notice_id uuid, sent integer, total integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  return query
  select n.id,
         (select count(*)::int from public.notice_sends ns where ns.notice_id = n.id and ns.status = 'marked_sent'),
         (select count(*)::int from app.notice_targets(n.id))
  from public.notices n where n.status = 'published' and n.archived_at is null;
end $$;
revoke execute on function public.notice_send_counts() from public, anon;
grant execute on function public.notice_send_counts() to authenticated;
