-- =====================================================================
--  Diary Part A: Telugu is generated automatically (server only), subjects
--  get an editable Telugu name, expected subjects come from the teachers'
--  assignments (the timetable only orders them), and translation usage is
--  counted against a monthly cap.
-- =====================================================================

-- Telugu subject names (standard names; VERIFY with a Telugu speaker) -------
alter table public.subjects add column name_te text;
alter table public.subjects add column name_te_verified boolean not null default false;
update public.subjects set name_te = case name
  when 'Telugu' then 'తెలుగు'
  when 'Hindi' then 'హిందీ'
  when 'English' then 'ఆంగ్లం'
  when 'Mathematics' then 'గణితం'
  when 'Environmental Studies' then 'పరిసరాల విజ్ఞానం'
  when 'Physical Science' then 'భౌతిక శాస్త్రం'
  when 'Biological Science' then 'జీవ శాస్త్రం'
  when 'Social Studies' then 'సాంఘిక శాస్త్రం'
  when 'General Awareness' then 'సాధారణ పరిజ్ఞానం'
  when 'Rhymes & Stories' then 'పద్యాలు, కథలు'
  when 'Drawing' then 'చిత్రలేఖనం'
  when 'Art & Cultural Education' then 'కళలు, సాంస్కృతిక విద్య'
  when 'Work & Computer Education' then 'పని, కంప్యూటర్ విద్య'
  when 'Physical & Health Education' then 'శారీరక, ఆరోగ్య విద్య'
  when 'Value Education & Life Skills' then 'విలువల విద్య, జీవన నైపుణ్యాలు'
end where name_te is null;

drop function public.subject_names();
create function public.subject_names() returns table (id uuid, name text, name_te text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.name_te from public.subjects s where app.is_staff_user()
$$;
revoke execute on function public.subject_names() from public, anon;
grant execute on function public.subject_names() to authenticated;

-- Telugu state of a diary line ---------------------------------------------
--   none: no Telugu yet (draft / older entry)   pending: waiting for translation
--   auto: machine translated                    reviewed: typed or edited by Admin / duty (never overwritten)
alter table public.diary_entries add column te_status text not null default 'none' check (te_status in ('none', 'pending', 'auto', 'reviewed'));
alter table public.diary_entries add column te_src_hash text;
update public.diary_entries set te_status = 'reviewed', te_src_hash = md5(trim(body)) where body_te is not null;

-- Settings: monthly cap ----------------------------------------------------
alter table public.school_settings add column translation_monthly_cap bigint not null default 1500000 check (translation_monthly_cap >= 0);

-- Usage counter and cache (server / service role only) ---------------------
create table public.translation_usage (
  month date primary key,
  chars bigint not null default 0 check (chars >= 0)
);
create table public.translation_cache (
  hash       text primary key,
  text_te    text not null,
  chars      integer not null,
  created_at timestamptz not null default now()
);
alter table public.translation_usage enable row level security;
alter table public.translation_cache enable row level security;
revoke all on public.translation_usage, public.translation_cache from public, anon, authenticated;
grant select, insert, update on public.translation_usage, public.translation_cache to service_role;

-- reserve characters against this month's cap; false = over the cap (nothing counted)
create function public.translation_reserve(p_chars integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  m    date := date_trunc('month', app.today_ist())::date;
  cap  bigint := (select translation_monthly_cap from public.school_settings where id = 1);
  used bigint;
begin
  insert into public.translation_usage (month) values (m) on conflict do nothing;
  select chars into used from public.translation_usage where month = m for update;
  if p_chars <= 0 or used + p_chars > cap then
    return false;
  end if;
  update public.translation_usage set chars = chars + p_chars where month = m;
  return true;
end $$;
revoke execute on function public.translation_reserve(integer) from public, anon, authenticated;
grant execute on function public.translation_reserve(integer) to service_role;

-- Admin: this month's use against the cap
create function public.translation_status() returns table (used bigint, cap bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select coalesce((select u.chars from public.translation_usage u where u.month = date_trunc('month', app.today_ist())::date), 0)::bigint,
                      (select s.translation_monthly_cap from public.school_settings s where s.id = 1);
end $$;
revoke execute on function public.translation_status() from public, anon;
grant execute on function public.translation_status() to authenticated;

-- warning level for the dashboard: Admin only sees the numbers; the duty sees nothing
-- store a machine translation (server only). Never touches reviewed text; only applies
-- when the English is still the English that was translated.
create function public.apply_diary_translation(p_entry uuid, p_te text, p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.diary_entries
     set body_te = trim(p_te), te_status = 'auto', te_src_hash = p_hash
   where id = p_entry and te_status <> 'reviewed' and md5(trim(body)) = p_hash and archived_at is null and length(trim(p_te)) > 0;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.apply_diary_translation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_diary_translation(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Teacher submission: English only. Telugu is generated after Submit.
-- ---------------------------------------------------------------------
create or replace function public.submit_diary(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sec    uuid := nullif(p ->> 'section_id', '')::uuid;
  d      date := (p ->> 'entry_date')::date;
  subj   uuid := nullif(p ->> 'subject_id', '')::uuid;
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'subject');
  v_body text := trim(coalesce(p ->> 'body', ''));
  go     boolean := coalesce((p ->> 'submit')::boolean, false);
  me     uuid := app.current_staff_id();
  today  date := app.today_ist();
  eid    uuid;
  e      public.diary_entries;
  st     text := case when coalesce((p ->> 'submit')::boolean, false) then 'submitted' else 'draft' end;
  h      text;
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
  h := md5(v_body);
  perform app.diary_year(sec, d);

  perform app.diary_lock(sec, d, subj, v_kind);
  eid := app.diary_find(sec, d, subj, v_kind);
  if eid is null then
    insert into public.diary_entries (academic_year_id, entry_date, subject_id, kind, body, status, author_id, submitted_at, te_status)
    values (app.diary_year(sec, d), d, subj, v_kind, v_body, st, me, case when go then now() end, case when go then 'pending' else 'none' end)
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
       set body = v_body, status = st,
           submitted_at = case when go then coalesce(e.submitted_at, now()) else null end,
           -- reviewed Telugu is kept; machine Telugu is kept while the English is unchanged
           body_te = case when e.te_status = 'reviewed' or (e.te_status = 'auto' and e.te_src_hash = h) then e.body_te else null end,
           te_status = case when e.te_status = 'reviewed' then 'reviewed'
                            when e.te_status = 'auto' and e.te_src_hash = h then 'auto'
                            when go then 'pending' else 'none' end
     where id = eid;
  end if;
  return eid;
end $$;

-- ---------------------------------------------------------------------
-- Admin / duty line edit: Telugu typed or edited here becomes "reviewed"
-- ---------------------------------------------------------------------
create or replace function public.admin_save_diary_line(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sec    uuid := nullif(p ->> 'section_id', '')::uuid;
  d      date := (p ->> 'entry_date')::date;
  subj   uuid := nullif(p ->> 'subject_id', '')::uuid;
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'subject');
  v_body text := trim(coalesce(p ->> 'body', ''));
  v_te   text := nullif(trim(coalesce(p ->> 'body_te', '')), '');
  h      text;
  eid    uuid;
  e      public.diary_entries;
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
  h := md5(v_body);
  perform app.diary_year(sec, d);
  perform app.diary_lock(sec, d, subj, v_kind);
  eid := app.diary_find(sec, d, subj, v_kind);
  if eid is null then
    insert into public.diary_entries (academic_year_id, entry_date, subject_id, kind, body, body_te, status, submitted_at, te_status, te_src_hash)
    values (app.diary_year(sec, d), d, subj, v_kind, v_body, v_te, 'submitted', now(), case when v_te is null then 'pending' else 'reviewed' end, case when v_te is null then null else h end)
    returning id into eid;
    insert into public.diary_entry_sections (entry_id, section_id) values (eid, sec);
    delete from public.diary_skips where section_id = sec and entry_date = d and subject_id = subj;
  else
    select * into e from public.diary_entries where id = eid for update;
    update public.diary_entries
       set body = v_body,
           status = case when e.status = 'draft' then 'submitted' else e.status end,
           submitted_at = coalesce(e.submitted_at, now()),
           body_te = case when v_te is distinct from e.body_te then v_te                                   -- Telugu edited here
                          when e.te_status = 'reviewed' or (e.te_status = 'auto' and e.te_src_hash = h) then e.body_te
                          else null end,
           te_status = case when v_te is distinct from e.body_te then (case when v_te is null then 'pending' else 'reviewed' end)
                            when e.te_status = 'reviewed' then 'reviewed'
                            when e.te_status = 'auto' and e.te_src_hash = h then 'auto'
                            else 'pending' end,
           te_src_hash = case when v_te is distinct from e.body_te then (case when v_te is null then null else h end)
                              when e.te_status = 'auto' and e.te_src_hash = h then e.te_src_hash
                              when e.te_status = 'reviewed' then e.te_src_hash
                              else null end
     where id = eid;
  end if;
  return eid;
end $$;

-- ---------------------------------------------------------------------
-- Expected subjects: the section's teacher assignments (active teachers).
-- The timetable only gives the order.
-- ---------------------------------------------------------------------
create or replace function app.diary_expected(p_section uuid, p_date date) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct a.subject_id from public.teacher_assignments a
  join public.staff st on st.id = a.staff_id and st.status = 'active'
  where a.section_id = p_section
    and not exists (select 1 from public.diary_skips k where k.section_id = p_section and k.entry_date = p_date and k.subject_id = a.subject_id)
$$;

create or replace function public.diary_class_plan(p_section uuid, p_date date)
returns table (subject_id uuid, first_period integer, teachers text, skipped boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  return query
  select a.subject_id,
         (select min(t.period_no)::int from public.timetable_entries t
           where t.section_id = p_section and t.subject_id = a.subject_id and t.weekday = extract(isodow from p_date)::int),
         string_agg(st.full_name, ', ' order by st.full_name),
         exists (select 1 from public.diary_skips k where k.section_id = p_section and k.entry_date = p_date and k.subject_id = a.subject_id)
  from public.teacher_assignments a
  join public.staff st on st.id = a.staff_id and st.status = 'active'
  join public.subjects sj on sj.id = a.subject_id
  where a.section_id = p_section
  group by a.subject_id, sj.sort_order, sj.name
  order by 2 nulls last, sj.sort_order, sj.name;
end $$;
