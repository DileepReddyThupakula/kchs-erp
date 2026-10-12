-- =====================================================================
-- Fees addition: special fees (campaigns) + miscellaneous receipts
--   fee_campaigns              one special fee (own fee head + own plan)
--   fee_campaign_class_amounts amount per class (when not one flat amount)
--   fee_campaign_students      exactly who pays it
--   fee_receipts.kind = 'misc' payments not tied to a due (same numbering)
-- Only Admin creates / edits / cancels (functions below; no write policies).
-- fee_collection duty collects on special-fee dues like any other due.
-- =====================================================================

create table public.fee_campaigns (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references public.academic_years (id) on delete restrict,
  fee_head_id       uuid not null unique references public.fee_heads (id) on delete restrict,
  plan_id           uuid not null unique references public.fee_plans (id) on delete restrict,
  name              text not null check (length(trim(name)) >= 2),
  description       text,
  amount_mode       text not null check (amount_mode in ('flat', 'per_class')),
  amount_paise      bigint check (amount_paise is null or amount_paise >= 0),
  audience          text not null check (audience in ('all', 'classes', 'sections', 'students')),
  audience_ids      uuid[] not null default '{}',   -- class or section ids, for display
  apply_concessions boolean not null default false,
  status            text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at      timestamptz,
  cancel_reason     text,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  check (amount_mode = 'per_class' or amount_paise is not null),
  check (status = 'active' or (cancelled_at is not null and length(trim(coalesce(cancel_reason, ''))) >= 3))
);
create index fee_campaigns_year_idx on public.fee_campaigns (academic_year_id);
select app.attach_std_triggers('public.fee_campaigns');

create table public.fee_campaign_class_amounts (
  campaign_id  uuid not null references public.fee_campaigns (id) on delete cascade,
  class_id     uuid not null references public.classes (id) on delete restrict,
  amount_paise bigint not null check (amount_paise >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid,
  primary key (campaign_id, class_id)
);
create index fee_campaign_class_amounts_class_idx on public.fee_campaign_class_amounts (class_id);
select app.attach_std_triggers('public.fee_campaign_class_amounts');

create table public.fee_campaign_students (
  campaign_id uuid not null references public.fee_campaigns (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  primary key (campaign_id, student_id)
);
create index fee_campaign_students_student_idx on public.fee_campaign_students (student_id);
select app.attach_std_triggers('public.fee_campaign_students');

-- ---------------------------------------------------------------------
-- Miscellaneous receipts: no due, optional student, same number series
-- ---------------------------------------------------------------------
alter table public.fee_receipts add column kind text not null default 'dues' check (kind in ('dues', 'misc'));
alter table public.fee_receipts add column payer_name text;
alter table public.fee_receipts alter column student_id drop not null;
alter table public.fee_receipts add constraint fee_receipts_payer_check
  check ((kind = 'dues' and student_id is not null) or (kind = 'misc' and (student_id is not null or length(trim(coalesce(payer_name, ''))) >= 2)));
alter table public.fee_receipt_items alter column due_id drop not null;

-- ---------------------------------------------------------------------
-- Existing fee logic, made campaign-aware
-- ---------------------------------------------------------------------
-- Concessions skip special fees created with "don't apply concessions"
-- (unless the concession names that special fee's head explicitly).
create or replace function app.apply_concessions(p_student uuid, p_year uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c    public.fee_concessions;
  d    record;
  rem  bigint;
  take bigint;
begin
  update public.student_fee_dues set concession_paise = 0
   where student_id = p_student and academic_year_id = p_year and voided_at is null and concession_paise <> 0;
  for c in select * from public.fee_concessions where student_id = p_student and academic_year_id = p_year
           order by (kind = 'fixed'), created_at loop
    if c.kind = 'percent' then
      update public.student_fee_dues dd
         set concession_paise = concession_paise + least((amount_paise * c.percent_bp) / 10000, amount_paise - paid_paise - concession_paise)
       where dd.student_id = p_student and dd.academic_year_id = p_year and dd.voided_at is null
         and (c.fee_head_id = dd.fee_head_id
              or (c.fee_head_id is null and not exists (select 1 from public.fee_campaigns fc where fc.fee_head_id = dd.fee_head_id and not fc.apply_concessions)));
    else
      rem := c.amount_paise;
      for d in select dd.id, dd.amount_paise - dd.paid_paise - dd.concession_paise as room from public.student_fee_dues dd
               where dd.student_id = p_student and dd.academic_year_id = p_year and dd.voided_at is null
                 and (c.fee_head_id = dd.fee_head_id
                      or (c.fee_head_id is null and not exists (select 1 from public.fee_campaigns fc where fc.fee_head_id = dd.fee_head_id and not fc.apply_concessions)))
               order by dd.due_date desc, dd.installment_seq desc loop
        exit when rem <= 0;
        take := least(rem, d.room);
        continue when take <= 0;
        update public.student_fee_dues set concession_paise = concession_paise + take where id = d.id;
        rem := rem - take;
      end loop;
    end if;
  end loop;
end $$;

-- Regular generation must never void special-fee dues (their head isn't in fee_structure).
create or replace function app.generate_dues(p_student uuid, p_year uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cls   uuid;
  st    public.students;
  y     public.academic_years;
  joinm date;
  fs    record;
begin
  select s.class_id into cls from public.student_enrollments e join public.sections s on s.id = e.section_id
   where e.student_id = p_student and e.academic_year_id = p_year;
  select * into st from public.students where id = p_student;
  if cls is null or st.status <> 'active' then
    return;
  end if;
  select * into y from public.academic_years where id = p_year;
  if st.admission_date > y.start_date and st.admission_date <= y.end_date then
    joinm := date_trunc('month', st.admission_date)::date;
  end if;

  for fs in
    select f.fee_head_id, f.amount_paise, coalesce(o.plan_id, f.default_plan_id) as plan_id
      from public.fee_structure f
      left join public.student_fee_plans o on o.student_id = p_student and o.academic_year_id = p_year and o.fee_head_id = f.fee_head_id
     where f.academic_year_id = p_year and f.class_id = cls
  loop
    if fs.plan_id is null or fs.amount_paise = 0 then
      update public.student_fee_dues set voided_at = now(), concession_paise = 0
       where student_id = p_student and academic_year_id = p_year and fee_head_id = fs.fee_head_id and voided_at is null and paid_paise = 0;
    else
      perform app.generate_head_dues(p_student, p_year, fs.fee_head_id, fs.amount_paise, fs.plan_id, joinm);
    end if;
  end loop;

  update public.student_fee_dues d set voided_at = now(), concession_paise = 0
   where d.student_id = p_student and d.academic_year_id = p_year and d.voided_at is null and d.paid_paise = 0
     and not exists (select 1 from public.fee_structure f where f.academic_year_id = p_year and f.class_id = cls and f.fee_head_id = d.fee_head_id)
     and not exists (select 1 from public.fee_campaigns fc where fc.fee_head_id = d.fee_head_id);

  perform app.apply_concessions(p_student, p_year);
end $$;

-- Cancelling: items without a due (misc) just stay as history.
create or replace function public.cancel_fee_receipt(p_receipt_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r  public.fee_receipts;
  it record;
  yr uuid;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for cancelling' using errcode = '23514';
  end if;
  select * into r from public.fee_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'Receipt not found' using errcode = 'P0002';
  end if;
  if r.status = 'cancelled' then
    raise exception 'Receipt % is already cancelled', r.receipt_no using errcode = '23514';
  end if;
  for it in select due_id, amount_paise from public.fee_receipt_items where receipt_id = p_receipt_id and due_id is not null loop
    update public.student_fee_dues set paid_paise = paid_paise - it.amount_paise where id = it.due_id;
  end loop;
  update public.fee_receipts
     set status = 'cancelled', cancelled_by = app.current_staff_id(), cancelled_at = now(), cancel_reason = trim(p_reason)
   where id = p_receipt_id;
  for yr in select distinct dd.academic_year_id from public.student_fee_dues dd
             where dd.id in (select due_id from public.fee_receipt_items where receipt_id = p_receipt_id and due_id is not null) loop
    perform app.apply_concessions(r.student_id, yr);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Special-fee dues: only UNPAID dues are ever changed.
-- ---------------------------------------------------------------------
create function app.generate_campaign_dues(p_campaign uuid, p_student uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c       public.fee_campaigns;
  m       record;
  amount  bigint;
  seqs    smallint[];
  shares  integer[];
  amounts bigint[];
  i       integer;
  inst    record;
begin
  select * into c from public.fee_campaigns where id = p_campaign;
  if c.status <> 'active' then
    return;
  end if;
  select array_agg(seq order by seq), array_agg(coalesce(share_bp, 0) order by seq) into seqs, shares
    from public.fee_plan_installments where plan_id = c.plan_id;

  for m in select cs.student_id, sec.class_id, st.status
             from public.fee_campaign_students cs
             join public.students st on st.id = cs.student_id
             left join public.student_enrollments e on e.student_id = cs.student_id and e.academic_year_id = c.academic_year_id
             left join public.sections sec on sec.id = e.section_id
            where cs.campaign_id = p_campaign and (p_student is null or cs.student_id = p_student) loop
    continue when m.status <> 'active';
    amount := case when c.amount_mode = 'flat' then c.amount_paise
                   else (select amount_paise from public.fee_campaign_class_amounts where campaign_id = p_campaign and class_id = m.class_id) end;
    if coalesce(amount, 0) = 0 then
      update public.student_fee_dues set voided_at = now(), concession_paise = 0
       where student_id = m.student_id and fee_head_id = c.fee_head_id and voided_at is null and paid_paise = 0;
      continue;
    end if;
    amounts := app.split_shares(amount, shares);
    for i in 1 .. array_length(seqs, 1) loop
      select * into inst from public.fee_plan_installments where plan_id = c.plan_id and seq = seqs[i];
      insert into public.student_fee_dues (student_id, academic_year_id, fee_head_id, plan_id, installment_seq, label, due_date, amount_paise)
      values (m.student_id, c.academic_year_id, c.fee_head_id, c.plan_id, inst.seq, inst.label, inst.due_date, amounts[i])
      on conflict (student_id, academic_year_id, fee_head_id, plan_id, installment_seq) do update
        set amount_paise = excluded.amount_paise, concession_paise = 0, label = excluded.label,
            due_date = excluded.due_date, voided_at = null
        where public.student_fee_dues.paid_paise = 0;   -- part-paid / paid dues are never touched
    end loop;
    perform app.apply_concessions(m.student_id, c.academic_year_id);
  end loop;
end $$;
revoke execute on function app.generate_campaign_dues(uuid, uuid) from public, authenticated, anon;

-- Members from an audience: all | classes | sections | students
create function app.campaign_audience(p_year uuid, p_audience text, p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct e.student_id
    from public.student_enrollments e
    join public.sections sec on sec.id = e.section_id
    join public.students st on st.id = e.student_id
   where e.academic_year_id = p_year and st.status = 'active'
     and (p_audience = 'all'
          or (p_audience = 'classes' and sec.class_id = any (p_ids))
          or (p_audience = 'sections' and sec.id = any (p_ids)))
  union
  select st.id from public.students st where p_audience = 'students' and st.id = any (p_ids) and st.status = 'active'
$$;
revoke execute on function app.campaign_audience(uuid, text, uuid[]) from public, authenticated, anon;

-- p = { academic_year_id, name, description?, amount_mode: flat|per_class, amount_paise?,
--       class_amounts?: [{class_id, amount_paise}], due_date (one-time) | installments?: [{label, due_date, share_bp}],
--       audience: all|classes|sections|students, audience_ids?: [uuid], apply_concessions?: bool }
create function public.create_special_fee(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  yr     uuid := (p ->> 'academic_year_id')::uuid;
  nm     text := trim(p ->> 'name');
  ids    uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'audience_ids', '[]')) x), '{}');
  head   uuid;
  plan   uuid;
  cid    uuid;
  inst   jsonb;
  n      integer := 0;
  sum_bp integer := 0;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nm is null or length(nm) < 2 then
    raise exception 'Give the special fee a name' using errcode = '23514';
  end if;
  if (p ->> 'audience') not in ('all', 'classes', 'sections', 'students') then
    raise exception 'Choose who pays' using errcode = '23514';
  end if;
  if (p ->> 'audience') <> 'all' and coalesce(array_length(ids, 1), 0) = 0 then
    raise exception 'Choose at least one class, section or student' using errcode = '23514';
  end if;

  insert into public.fee_heads (name, code, sort_order) values (nm, null, 100) returning id into head;
  if jsonb_array_length(coalesce(p -> 'installments', '[]')) > 0 then
    insert into public.fee_plans (academic_year_id, name, kind) values (yr, 'Special: ' || nm, 'custom') returning id into plan;
    for inst in select * from jsonb_array_elements(p -> 'installments') loop
      n := n + 1;
      sum_bp := sum_bp + (inst ->> 'share_bp')::int;
      insert into public.fee_plan_installments (plan_id, seq, label, due_date, share_bp)
      values (plan, n, coalesce(nullif(trim(inst ->> 'label'), ''), 'Part ' || n), (inst ->> 'due_date')::date, (inst ->> 'share_bp')::int);
    end loop;
    if sum_bp <> 10000 then
      raise exception 'Installment percentages must add up to 100%%' using errcode = '23514';
    end if;
  else
    if nullif(p ->> 'due_date', '') is null then
      raise exception 'Give a due date' using errcode = '23514';
    end if;
    insert into public.fee_plans (academic_year_id, name, kind) values (yr, 'Special: ' || nm, 'one_time') returning id into plan;
    update public.fee_plan_installments set due_date = (p ->> 'due_date')::date, label = 'One-time' where plan_id = plan and seq = 1;
  end if;

  insert into public.fee_campaigns (academic_year_id, fee_head_id, plan_id, name, description, amount_mode, amount_paise, audience, audience_ids, apply_concessions)
  values (yr, head, plan, nm, nullif(trim(p ->> 'description'), ''), p ->> 'amount_mode', nullif(p ->> 'amount_paise', '')::bigint,
          p ->> 'audience', ids, coalesce((p ->> 'apply_concessions')::boolean, false))
  returning id into cid;
  if p ->> 'amount_mode' = 'per_class' then
    insert into public.fee_campaign_class_amounts (campaign_id, class_id, amount_paise)
    select cid, (x ->> 'class_id')::uuid, (x ->> 'amount_paise')::bigint from jsonb_array_elements(coalesce(p -> 'class_amounts', '[]')) x;
  end if;
  insert into public.fee_campaign_students (campaign_id, student_id)
  select cid, sid from app.campaign_audience(yr, p ->> 'audience', ids) sid;
  perform app.generate_campaign_dues(cid);
  return cid;
end $$;

-- Edit amount / class amounts / due date / description: unpaid dues only.
-- p = { description?, amount_paise?, class_amounts?, due_date?, apply_concessions? }
create function public.update_special_fee(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.fee_campaigns;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into c from public.fee_campaigns where id = p_id for update;
  if not found or c.status <> 'active' then
    raise exception 'Special fee not found or cancelled' using errcode = 'P0002';
  end if;
  update public.fee_campaigns set
    description = case when p ? 'description' then nullif(trim(p ->> 'description'), '') else description end,
    amount_paise = case when p ? 'amount_paise' and amount_mode = 'flat' then (p ->> 'amount_paise')::bigint else amount_paise end,
    apply_concessions = coalesce((p ->> 'apply_concessions')::boolean, apply_concessions)
  where id = p_id;
  if p ? 'class_amounts' and c.amount_mode = 'per_class' then
    delete from public.fee_campaign_class_amounts where campaign_id = p_id;
    insert into public.fee_campaign_class_amounts (campaign_id, class_id, amount_paise)
    select p_id, (x ->> 'class_id')::uuid, (x ->> 'amount_paise')::bigint from jsonb_array_elements(p -> 'class_amounts') x;
  end if;
  if nullif(p ->> 'due_date', '') is not null then
    -- one-time special fees: move the single due date
    update public.fee_plan_installments set due_date = (p ->> 'due_date')::date
     where plan_id = c.plan_id and (select count(*) from public.fee_plan_installments where plan_id = c.plan_id) = 1;
  end if;
  perform app.generate_campaign_dues(p_id);
end $$;

create function public.add_special_fee_students(p_id uuid, p_student_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.fee_campaigns;
  n integer;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into c from public.fee_campaigns where id = p_id;
  if not found or c.status <> 'active' then
    raise exception 'Special fee not found or cancelled' using errcode = 'P0002';
  end if;
  insert into public.fee_campaign_students (campaign_id, student_id)
  select p_id, s from unnest(p_student_ids) s
  where exists (select 1 from public.students where id = s and status = 'active')
  on conflict do nothing;
  get diagnostics n = row_count;
  perform app.generate_campaign_dues(p_id);
  return n;
end $$;

-- Cancel: unpaid dues are voided; paid dues and receipts stay untouched.
create function public.cancel_special_fee(p_id uuid, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.fee_campaigns;
  n integer;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for cancelling' using errcode = '23514';
  end if;
  select * into c from public.fee_campaigns where id = p_id for update;
  if not found then
    raise exception 'Special fee not found' using errcode = 'P0002';
  end if;
  if c.status = 'cancelled' then
    raise exception 'Already cancelled' using errcode = '23514';
  end if;
  update public.student_fee_dues set voided_at = now(), concession_paise = 0
   where fee_head_id = c.fee_head_id and voided_at is null and paid_paise = 0;
  get diagnostics n = row_count;
  update public.fee_campaigns set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason) where id = p_id;
  update public.fee_heads set is_active = false where id = c.fee_head_id;
  return n;
end $$;

-- Miscellaneous receipt (Admin): no due; same gap-free number series.
create function public.create_misc_receipt(
  p_fee_head_id  uuid,
  p_amount_paise bigint,
  p_mode         text,
  p_reference    text default null,
  p_student_id   uuid default null,
  p_payer_name   text default null,
  p_notes        text default null,
  p_receipt_date date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me     uuid := app.current_staff_id();
  rdate  date := coalesce(p_receipt_date, app.today_ist());
  fy     text;
  n      bigint;
  rid    uuid;
  prefix text;
begin
  if not app.is_admin() or me is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Enter an amount greater than zero' using errcode = '23514';
  end if;
  if p_mode not in ('cash', 'upi', 'cheque', 'bank_transfer') then
    raise exception 'Unknown payment mode' using errcode = '23514';
  end if;
  if p_mode <> 'cash' and length(trim(coalesce(p_reference, ''))) = 0 then
    raise exception 'A reference number is required for UPI, cheque and bank transfer' using errcode = '23514';
  end if;
  if not exists (select 1 from public.fee_heads where id = p_fee_head_id and is_active) then
    raise exception 'Pick an active fee head' using errcode = '23514';
  end if;
  if exists (select 1 from public.fee_campaigns where fee_head_id = p_fee_head_id) then
    raise exception 'Special fees are collected through their dues, not as miscellaneous receipts' using errcode = '23514';
  end if;
  if p_student_id is null and length(trim(coalesce(p_payer_name, ''))) < 2 then
    raise exception 'Link a student or enter the payer''s name' using errcode = '23514';
  end if;

  fy := app.fin_year(rdate);
  n := app.next_number('receipt:' || fy);
  select coalesce(receipt_no_prefix, '') into prefix from public.school_settings where id = 1;
  insert into public.fee_receipts (receipt_no, financial_year, seq, receipt_date, student_id, payer_name, kind, total_paise, payment_mode,
                                   reference_no, notes, collected_by, is_demo)
  values (prefix || fy || '/' || lpad(n::text, 4, '0'), fy, n, rdate, p_student_id, nullif(trim(p_payer_name), ''), 'misc', p_amount_paise,
          p_mode, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), me,
          coalesce((select is_demo from public.students where id = p_student_id), false))
  returning id into rid;
  insert into public.fee_receipt_items (receipt_id, due_id, fee_head_id, amount_paise) values (rid, null, p_fee_head_id, p_amount_paise);
  return rid;
end $$;

revoke execute on function public.create_special_fee(jsonb), public.update_special_fee(uuid, jsonb), public.add_special_fee_students(uuid, uuid[]),
  public.cancel_special_fee(uuid, text), public.create_misc_receipt(uuid, bigint, text, text, uuid, text, text, date) from public, anon;
grant execute on function public.create_special_fee(jsonb), public.update_special_fee(uuid, jsonb), public.add_special_fee_students(uuid, uuid[]),
  public.cancel_special_fee(uuid, text), public.create_misc_receipt(uuid, bigint, text, text, uuid, text, text, date) to authenticated;

-- RLS: read = fee access; writes only through the functions above.
alter table public.fee_campaigns enable row level security;
alter table public.fee_campaign_class_amounts enable row level security;
alter table public.fee_campaign_students enable row level security;
create policy fee_campaigns_select on public.fee_campaigns for select to authenticated using ((select app.has_fee_access()));
create policy fee_campaign_class_amounts_select on public.fee_campaign_class_amounts for select to authenticated using ((select app.has_fee_access()));
create policy fee_campaign_students_select on public.fee_campaign_students for select to authenticated using ((select app.has_fee_access()));

revoke all on all tables in schema public from anon;
