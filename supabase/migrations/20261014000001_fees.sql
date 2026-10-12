-- =====================================================================
-- Module: Fees (Part 1: database)
-- Money is ALWAYS integer paise (bigint). Never floating point.
--   fee_heads                 Tuition, Exam, Books + custom heads
--   fee_plans / fee_plan_installments   One-time, Monthly, Custom (per year)
--   fee_structure             class + head + year -> amount + default plan
--   student_fee_plans         per-student plan override (Admin, with reason)
--   fee_concessions           fixed or percent, per student, optional head
--   student_fee_dues          one row per student, head, installment
--   fee_receipts / fee_receipt_items   payments (never deleted; Admin cancels)
-- Access (DECISIONS.md R22): Admin everything. fee_collection duty: read
-- all fee data, collect payments (collect_fee). Nobody else sees fee data.
-- Late fee: not built. fee_heads.late_fee_rule and fee_receipt_items.fine_paise
-- are reserved so it can be added later without a rebuild.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers: exact splitting and financial year
-- ---------------------------------------------------------------------
-- Equal split; the remainder goes to the LAST part (sums exactly).
create function app.split_equal(p_total bigint, p_n integer) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  base bigint;
  out  bigint[];
begin
  if p_n < 1 then return '{}'; end if;
  base := p_total / p_n;
  out := array_fill(base, array[p_n]);
  out[p_n] := p_total - base * (p_n - 1);
  return out;
end $$;

-- Split by basis points (10000 = 100%); floor each, remainder to the LAST.
create function app.split_shares(p_total bigint, p_bp integer[]) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  n   integer := coalesce(array_length(p_bp, 1), 0);
  out bigint[] := '{}';
  acc bigint := 0;
  i   integer;
  v   bigint;
begin
  if n = 0 then return out; end if;
  if (select sum(x) from unnest(p_bp) x) <> 10000 then
    raise exception 'Installment percentages must add up to 100%%' using errcode = '23514';
  end if;
  for i in 1 .. n - 1 loop
    v := (p_total * p_bp[i]) / 10000;
    out := out || v;
    acc := acc + v;
  end loop;
  return out || (p_total - acc);
end $$;

-- Indian financial year of a date: April–March, e.g. 2026-27.
create function app.fin_year(p_date date) returns text
language sql immutable set search_path = '' as $$
  select case when extract(month from p_date) >= 4
              then extract(year from p_date)::int || '-' || lpad(((extract(year from p_date)::int + 1) % 100)::text, 2, '0')
              else (extract(year from p_date)::int - 1) || '-' || lpad((extract(year from p_date)::int % 100)::text, 2, '0') end
$$;

create function app.today_ist() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.school_settings where id = 1), 'Asia/Kolkata'))::date
$$;

create function app.has_fee_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_duty('fee_collection')
$$;
grant execute on function app.has_fee_access(), app.split_equal(bigint, integer), app.split_shares(bigint, integer[]), app.fin_year(date), app.today_ist() to authenticated;

-- ---------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------
create table public.fee_heads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(trim(name)) >= 2),
  code          text unique,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  late_fee_rule jsonb,              -- reserved (no late fee yet)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid
);
select app.attach_std_triggers('public.fee_heads');

create table public.fee_plans (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  name             text not null check (length(trim(name)) >= 2),
  kind             text not null check (kind in ('one_time', 'monthly', 'custom')),
  due_day          smallint not null default 10 check (due_day between 1 and 28),
  is_active        boolean not null default true,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (academic_year_id, name)
);
select app.attach_std_triggers('public.fee_plans');

-- share_bp = % in basis points; amount_paise = fixed amount; neither = equal
-- monthly split. A custom plan uses either shares or fixed amounts.
create table public.fee_plan_installments (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.fee_plans (id) on delete cascade,
  seq          smallint not null check (seq > 0),
  label        text not null,
  due_date     date not null,
  period_month date,            -- monthly plans: first day of the month covered
  share_bp     integer check (share_bp is null or share_bp between 0 and 10000),
  amount_paise bigint check (amount_paise is null or amount_paise >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid,
  unique (plan_id, seq),
  check (share_bp is null or amount_paise is null)
);
select app.attach_std_triggers('public.fee_plan_installments');

-- (Re)build the 12 monthly installments (Apr..Mar) of a monthly plan.
create function app.build_plan_installments(p_plan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pl public.fee_plans;
  y  public.academic_years;
  m  date;
  i  integer := 0;
begin
  select * into pl from public.fee_plans where id = p_plan;
  select * into y from public.academic_years where id = pl.academic_year_id;
  if pl.kind = 'monthly' then
    delete from public.fee_plan_installments where plan_id = p_plan;
    m := date_trunc('month', y.start_date)::date;
    while m <= y.end_date loop
      i := i + 1;
      insert into public.fee_plan_installments (plan_id, seq, label, due_date, period_month)
      values (p_plan, i, to_char(m, 'Mon YYYY'), m + (pl.due_day - 1), m);
      m := (m + interval '1 month')::date;
    end loop;
  elsif pl.kind = 'one_time' and not exists (select 1 from public.fee_plan_installments where plan_id = p_plan) then
    insert into public.fee_plan_installments (plan_id, seq, label, due_date, share_bp)
    values (p_plan, 1, 'Full year', date_trunc('month', y.start_date)::date + (pl.due_day - 1), 10000);
  end if;
end $$;

create function app.fee_plan_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.kind is distinct from old.kind then
    perform app.build_plan_installments(new.id);
  elsif new.due_day is distinct from old.due_day then
    -- move every installment's day to the new due day
    update public.fee_plan_installments
       set due_date = date_trunc('month', due_date)::date + (new.due_day - 1)
     where plan_id = new.id;
  end if;
  return null;
end $$;
create trigger fee_plan_after_write after insert or update of kind, due_day on public.fee_plans
  for each row execute function app.fee_plan_after_write();

create table public.fee_structure (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete restrict,
  fee_head_id      uuid not null references public.fee_heads (id) on delete restrict,
  amount_paise     bigint not null default 0 check (amount_paise >= 0),
  default_plan_id  uuid references public.fee_plans (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (academic_year_id, class_id, fee_head_id)
);
create index fee_structure_class_idx on public.fee_structure (class_id);
create index fee_structure_head_idx on public.fee_structure (fee_head_id);
create index fee_structure_plan_idx on public.fee_structure (default_plan_id);
select app.attach_std_triggers('public.fee_structure');

create table public.student_fee_plans (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  fee_head_id      uuid not null references public.fee_heads (id) on delete restrict,
  plan_id          uuid not null references public.fee_plans (id) on delete restrict,
  reason           text not null check (length(trim(reason)) >= 3),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (student_id, academic_year_id, fee_head_id)
);
create index student_fee_plans_plan_idx on public.student_fee_plans (plan_id);
select app.attach_std_triggers('public.student_fee_plans');

create table public.fee_concessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  fee_head_id      uuid references public.fee_heads (id) on delete restrict,  -- null = all heads
  kind             text not null check (kind in ('fixed', 'percent')),
  amount_paise     bigint,
  percent_bp       integer,
  reason           text not null check (length(trim(reason)) >= 3),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  check ((kind = 'fixed' and amount_paise > 0 and percent_bp is null)
      or (kind = 'percent' and percent_bp between 1 and 10000 and amount_paise is null))
);
create index fee_concessions_student_idx on public.fee_concessions (student_id, academic_year_id);
select app.attach_std_triggers('public.fee_concessions');

-- ---------------------------------------------------------------------
-- Dues
-- ---------------------------------------------------------------------
create table public.student_fee_dues (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  fee_head_id      uuid not null references public.fee_heads (id) on delete restrict,
  plan_id          uuid not null references public.fee_plans (id) on delete restrict,
  installment_seq  smallint not null,
  label            text not null,
  due_date         date not null,
  amount_paise     bigint not null check (amount_paise >= 0),
  concession_paise bigint not null default 0,
  paid_paise       bigint not null default 0,
  voided_at        timestamptz,   -- superseded (plan/class change); kept for history
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (student_id, academic_year_id, fee_head_id, plan_id, installment_seq),
  check (concession_paise between 0 and amount_paise),
  check (paid_paise >= 0 and paid_paise <= amount_paise - concession_paise),
  check (voided_at is null or paid_paise = 0)
);
create index student_fee_dues_student_idx on public.student_fee_dues (student_id, academic_year_id);
create index student_fee_dues_due_idx on public.student_fee_dues (due_date) where voided_at is null;
create index student_fee_dues_head_idx on public.student_fee_dues (fee_head_id);
create index student_fee_dues_plan_idx on public.student_fee_dues (plan_id);
select app.attach_std_triggers('public.student_fee_dues');

-- Recompute every concession on a student's dues for a year.
-- Percent: floor(amount × % ) per due. Fixed: allocated from the LAST
-- installment backwards. Never more than the unpaid part of a due.
create function app.apply_concessions(p_student uuid, p_year uuid) returns void
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
      update public.student_fee_dues
         set concession_paise = concession_paise + least((amount_paise * c.percent_bp) / 10000, amount_paise - paid_paise - concession_paise)
       where student_id = p_student and academic_year_id = p_year and voided_at is null
         and (c.fee_head_id is null or fee_head_id = c.fee_head_id);
    else
      rem := c.amount_paise;
      for d in select id, amount_paise - paid_paise - concession_paise as room from public.student_fee_dues
               where student_id = p_student and academic_year_id = p_year and voided_at is null
                 and (c.fee_head_id is null or fee_head_id = c.fee_head_id)
               order by due_date desc, installment_seq desc loop
        exit when rem <= 0;
        take := least(rem, d.room);
        continue when take <= 0;
        update public.student_fee_dues set concession_paise = concession_paise + take where id = d.id;
        rem := rem - take;
      end loop;
    end if;
  end loop;
end $$;

-- Generate / refresh one head's dues for a student (safe to re-run):
--  * paid or part-paid dues are never removed and never go below what's paid
--  * unpaid dues of another plan are voided (plan changed)
--  * monthly plans start from the joining month for mid-year joiners
create function app.generate_head_dues(p_student uuid, p_year uuid, p_head uuid, p_annual bigint, p_plan uuid, p_join date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pl       public.fee_plans;
  locked   bigint;
  remain   bigint;
  seqs     smallint[];
  amounts  bigint[];
  shares   integer[];
  fixed    bigint[];
  n_fixed  integer;
  i        integer;
  inst     record;
  monthly  bigint[];
begin
  select * into pl from public.fee_plans where id = p_plan;

  -- dues already part-paid under a DIFFERENT plan stay as they are
  select coalesce(sum(amount_paise), 0) into locked from public.student_fee_dues
   where student_id = p_student and academic_year_id = p_year and fee_head_id = p_head
     and plan_id <> p_plan and voided_at is null and paid_paise > 0;
  update public.student_fee_dues set voided_at = now(), concession_paise = 0
   where student_id = p_student and academic_year_id = p_year and fee_head_id = p_head
     and plan_id <> p_plan and voided_at is null and paid_paise = 0;
  remain := greatest(p_annual - locked, 0);

  if pl.kind = 'monthly' then
    if locked > 0 then
      -- switched plan mid-year: spread what is left over the coming months
      select array_agg(seq order by seq) into seqs from public.fee_plan_installments
       where plan_id = p_plan and coalesce(period_month, due_date) >= date_trunc('month', app.today_ist());
      if seqs is null then
        select array[max(seq)] into seqs from public.fee_plan_installments where plan_id = p_plan;
      end if;
      amounts := app.split_equal(remain, array_length(seqs, 1));
    else
      -- annual amount split over all months; joiners pay from their month
      select array_agg(seq order by seq) into seqs from public.fee_plan_installments where plan_id = p_plan;
      monthly := app.split_equal(remain, array_length(seqs, 1));
      amounts := '{}';
      select array_agg(x.seq order by x.seq), array_agg(monthly[x.ord::int] order by x.seq)
        into seqs, amounts
        from (select seq, row_number() over (order by seq) as ord, period_month
                from public.fee_plan_installments where plan_id = p_plan) x
       where p_join is null or x.period_month >= p_join;
    end if;
  else
    select array_agg(seq order by seq), array_agg(share_bp order by seq), array_agg(amount_paise order by seq),
           count(amount_paise)
      into seqs, shares, fixed, n_fixed
      from public.fee_plan_installments where plan_id = p_plan;
    if seqs is null then
      raise exception 'Plan "%" has no installments', pl.name using errcode = '23514';
    end if;
    if n_fixed = array_length(seqs, 1) then
      if (select sum(x) from unnest(fixed) x) <> remain then
        raise exception 'Installment amounts of plan "%" (%) do not add up to the fee (%)', pl.name,
          (select sum(x) from unnest(fixed) x), remain using errcode = '23514';
      end if;
      amounts := fixed;
    elsif n_fixed = 0 then
      amounts := app.split_shares(remain, shares);
    else
      raise exception 'Plan "%" mixes fixed amounts and percentages', pl.name using errcode = '23514';
    end if;
  end if;

  if seqs is not null then
    for i in 1 .. array_length(seqs, 1) loop
      select * into inst from public.fee_plan_installments where plan_id = p_plan and seq = seqs[i];
      insert into public.student_fee_dues (student_id, academic_year_id, fee_head_id, plan_id, installment_seq, label, due_date, amount_paise)
      values (p_student, p_year, p_head, p_plan, inst.seq, inst.label, inst.due_date, amounts[i])
      on conflict (student_id, academic_year_id, fee_head_id, plan_id, installment_seq) do update
        set amount_paise = greatest(excluded.amount_paise, public.student_fee_dues.paid_paise),
            concession_paise = 0,
            label = excluded.label,
            due_date = excluded.due_date,
            voided_at = null;
    end loop;
  end if;

  -- installments of this plan no longer due (e.g. joining month moved): void if unpaid
  update public.student_fee_dues set voided_at = now(), concession_paise = 0
   where student_id = p_student and academic_year_id = p_year and fee_head_id = p_head and plan_id = p_plan
     and voided_at is null and paid_paise = 0 and not (installment_seq = any (coalesce(seqs, '{}')));
end $$;

-- All heads for a student in a year, from their current class.
create function app.generate_dues(p_student uuid, p_year uuid) returns void
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
    return; -- not enrolled / not active: leave existing dues untouched
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
      -- no fee set: void unpaid dues of that head (paid ones stay)
      update public.student_fee_dues set voided_at = now(), concession_paise = 0
       where student_id = p_student and academic_year_id = p_year and fee_head_id = fs.fee_head_id and voided_at is null and paid_paise = 0;
    else
      perform app.generate_head_dues(p_student, p_year, fs.fee_head_id, fs.amount_paise, fs.plan_id, joinm);
    end if;
  end loop;

  -- heads not charged to this class any more (class change): void unpaid
  update public.student_fee_dues d set voided_at = now(), concession_paise = 0
   where d.student_id = p_student and d.academic_year_id = p_year and d.voided_at is null and d.paid_paise = 0
     and not exists (select 1 from public.fee_structure f where f.academic_year_id = p_year and f.class_id = cls and f.fee_head_id = d.fee_head_id);

  perform app.apply_concessions(p_student, p_year);
end $$;
revoke execute on function app.generate_dues(uuid, uuid), app.generate_head_dues(uuid, uuid, uuid, bigint, uuid, date),
  app.apply_concessions(uuid, uuid), app.build_plan_installments(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------
-- Automatic (re)generation
-- ---------------------------------------------------------------------
create function app.dues_on_enrollment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.generate_dues(new.student_id, new.academic_year_id);
  return null;
end $$;
create trigger fee_dues_on_enrollment after insert or update of section_id, academic_year_id on public.student_enrollments
  for each row execute function app.dues_on_enrollment();

create function app.dues_on_student_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e record;
begin
  for e in select academic_year_id from public.student_enrollments where student_id = new.id loop
    perform app.generate_dues(new.id, e.academic_year_id);
  end loop;
  return null;
end $$;
create trigger fee_dues_on_student_change after update of admission_date, status on public.students
  for each row when (new.status = 'active') execute function app.dues_on_student_change();

create function app.dues_on_structure() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r   record;
  yr  uuid := coalesce(new.academic_year_id, old.academic_year_id);
  cl  uuid := coalesce(new.class_id, old.class_id);
begin
  for r in select e.student_id from public.student_enrollments e join public.sections s on s.id = e.section_id
           where e.academic_year_id = yr and s.class_id = cl loop
    perform app.generate_dues(r.student_id, yr);
  end loop;
  return null;
end $$;
create trigger fee_dues_on_structure after insert or update or delete on public.fee_structure
  for each row execute function app.dues_on_structure();

create function app.dues_on_override() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.generate_dues(coalesce(new.student_id, old.student_id), coalesce(new.academic_year_id, old.academic_year_id));
  return null;
end $$;
create trigger fee_dues_on_override after insert or update or delete on public.student_fee_plans
  for each row execute function app.dues_on_override();

create function app.dues_on_concession() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.apply_concessions(coalesce(new.student_id, old.student_id), coalesce(new.academic_year_id, old.academic_year_id));
  if tg_op = 'UPDATE' and (new.student_id, new.academic_year_id) is distinct from (old.student_id, old.academic_year_id) then
    perform app.apply_concessions(old.student_id, old.academic_year_id);
  end if;
  return null;
end $$;
create trigger fee_dues_on_concession after insert or update or delete on public.fee_concessions
  for each row execute function app.dues_on_concession();

-- Admin: regenerate a whole year (or one student) after plan/installment edits.
create function public.regenerate_fee_dues(p_year uuid, p_student uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for r in select student_id from public.student_enrollments
           where academic_year_id = p_year and (p_student is null or student_id = p_student) loop
    perform app.generate_dues(r.student_id, p_year);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Receipts (never deleted; Admin cancels with a reason)
-- ---------------------------------------------------------------------
create table public.fee_receipts (
  id               uuid primary key default gen_random_uuid(),
  receipt_no       text not null unique,
  financial_year   text not null,
  seq              integer not null check (seq > 0),
  receipt_date     date not null,
  student_id       uuid not null references public.students (id) on delete restrict,
  total_paise      bigint not null check (total_paise > 0),
  payment_mode     text not null check (payment_mode in ('cash', 'upi', 'cheque', 'bank_transfer')),
  reference_no     text,
  notes            text,
  collected_by     uuid not null references public.staff (id) on delete restrict,
  status           text not null default 'valid' check (status in ('valid', 'cancelled')),
  cancelled_by     uuid references public.staff (id) on delete restrict,
  cancelled_at     timestamptz,
  cancel_reason    text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (financial_year, seq),
  check (payment_mode = 'cash' or length(trim(coalesce(reference_no, ''))) > 0),
  check (status = 'valid' or (cancelled_at is not null and cancelled_by is not null and length(trim(coalesce(cancel_reason, ''))) >= 3))
);
create index fee_receipts_student_idx on public.fee_receipts (student_id);
create index fee_receipts_date_idx on public.fee_receipts (receipt_date);
create index fee_receipts_collected_idx on public.fee_receipts (collected_by);
create index fee_receipts_cancelled_by_idx on public.fee_receipts (cancelled_by);
select app.attach_std_triggers('public.fee_receipts');

create table public.fee_receipt_items (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.fee_receipts (id) on delete restrict,
  due_id       uuid not null references public.student_fee_dues (id) on delete restrict,
  fee_head_id  uuid not null references public.fee_heads (id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  fine_paise   bigint not null default 0 check (fine_paise >= 0),  -- reserved (late fee)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid
);
create index fee_receipt_items_receipt_idx on public.fee_receipt_items (receipt_id);
create index fee_receipt_items_due_idx on public.fee_receipt_items (due_id);
create index fee_receipt_items_head_idx on public.fee_receipt_items (fee_head_id);
select app.attach_std_triggers('public.fee_receipt_items');

-- Receipts and their items are never deleted by anyone signed in.
create function app.block_receipt_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    raise exception 'Receipts are never deleted. The Admin can cancel a receipt.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger fee_receipts_no_delete before delete on public.fee_receipts for each row execute function app.block_receipt_delete();
create trigger fee_receipt_items_no_delete before delete on public.fee_receipt_items for each row execute function app.block_receipt_delete();

-- Collect a payment. Fee duty (Admin included). Allocates to the oldest dues
-- first, or only to p_due_ids (still oldest first) if given. Blocks paying
-- more than is due. Receipt number: <prefix><FY>/<0001>, gap-free per
-- financial year (the counter row is locked until commit, so simultaneous
-- saves queue up; a failed save rolls its number back).
create function public.collect_fee(
  p_student_id   uuid,
  p_amount_paise bigint,
  p_mode         text,
  p_reference    text default null,
  p_notes        text default null,
  p_due_ids      uuid[] default null,
  p_receipt_date date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me      uuid := app.current_staff_id();
  rdate   date := app.today_ist();
  fy      text;
  n       bigint;
  rid     uuid;
  balance bigint;
  rem     bigint;
  take    bigint;
  d       record;
  prefix  text;
begin
  if not app.has_fee_access() or me is null then
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
  if p_receipt_date is not null and p_receipt_date <> rdate then
    if not app.is_admin() then
      raise exception 'Only the Admin can date a receipt other than today' using errcode = '42501';
    end if;
    rdate := p_receipt_date;
  end if;
  if p_due_ids is not null and exists (
       select 1 from unnest(p_due_ids) x
       where not exists (select 1 from public.student_fee_dues where id = x and student_id = p_student_id and voided_at is null)) then
    raise exception 'A chosen due does not belong to this student' using errcode = '23514';
  end if;

  -- lock this student's dues: two people can't pay the same due at once
  perform 1 from public.student_fee_dues where student_id = p_student_id and voided_at is null for update;

  select coalesce(sum(amount_paise - concession_paise - paid_paise), 0) into balance
    from public.student_fee_dues
   where student_id = p_student_id and voided_at is null
     and (p_due_ids is null or id = any (p_due_ids));
  if p_amount_paise > balance then
    raise exception 'Amount is more than what is due (due: % paise)', balance using errcode = '23514';
  end if;

  fy := app.fin_year(rdate);
  n := app.next_number('receipt:' || fy);
  select coalesce(receipt_no_prefix, '') into prefix from public.school_settings where id = 1;
  insert into public.fee_receipts (receipt_no, financial_year, seq, receipt_date, student_id, total_paise, payment_mode, reference_no, notes, collected_by,
                                   is_demo)
  values (prefix || fy || '/' || lpad(n::text, 4, '0'), fy, n, rdate, p_student_id, p_amount_paise, p_mode, nullif(trim(p_reference), ''),
          nullif(trim(p_notes), ''), me, (select is_demo from public.students where id = p_student_id))
  returning id into rid;

  rem := p_amount_paise;
  for d in select dd.* from public.student_fee_dues dd
            join public.academic_years y on y.id = dd.academic_year_id
            join public.fee_heads h on h.id = dd.fee_head_id
           where dd.student_id = p_student_id and dd.voided_at is null
             and dd.amount_paise - dd.concession_paise - dd.paid_paise > 0
             and (p_due_ids is null or dd.id = any (p_due_ids))
           order by dd.due_date, y.start_date, h.sort_order, dd.installment_seq loop
    exit when rem <= 0;
    take := least(rem, d.amount_paise - d.concession_paise - d.paid_paise);
    insert into public.fee_receipt_items (receipt_id, due_id, fee_head_id, amount_paise) values (rid, d.id, d.fee_head_id, take);
    update public.student_fee_dues set paid_paise = paid_paise + take where id = d.id;
    rem := rem - take;
  end loop;
  return rid;
end $$;

-- Admin cancels a receipt: dues get the money back as unpaid; the receipt
-- and its number stay (shown as cancelled).
create function public.cancel_fee_receipt(p_receipt_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r  public.fee_receipts;
  it record;
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
  for it in select due_id, amount_paise from public.fee_receipt_items where receipt_id = p_receipt_id loop
    update public.student_fee_dues set paid_paise = paid_paise - it.amount_paise where id = it.due_id;
  end loop;
  update public.fee_receipts
     set status = 'cancelled', cancelled_by = app.current_staff_id(), cancelled_at = now(), cancel_reason = trim(p_reason)
   where id = p_receipt_id;
  -- concessions may now apply to more of the restored dues
  perform app.apply_concessions(r.student_id, ay.id)
     from public.student_fee_dues dd join public.academic_years ay on ay.id = dd.academic_year_id
    where dd.id in (select due_id from public.fee_receipt_items where receipt_id = p_receipt_id)
    group by ay.id;
end $$;

revoke execute on function public.collect_fee(uuid, bigint, text, text, text, uuid[], date) from public, anon;
revoke execute on function public.cancel_fee_receipt(uuid, text) from public, anon;
revoke execute on function public.regenerate_fee_dues(uuid, uuid) from public, anon;
grant execute on function public.collect_fee(uuid, bigint, text, text, text, uuid[], date) to authenticated;
grant execute on function public.cancel_fee_receipt(uuid, text) to authenticated;
grant execute on function public.regenerate_fee_dues(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS: fee data is visible ONLY to Admin and the fee_collection duty.
-- Setup tables: Admin writes. Dues / receipts: written only by the
-- functions above (no write policies at all).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['fee_heads', 'fee_plans', 'fee_plan_installments', 'fee_structure', 'student_fee_plans', 'fee_concessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app.has_fee_access()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app.is_admin()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app.is_admin()))', t || '_delete', t);
  end loop;
  foreach t in array array['student_fee_dues', 'fee_receipts', 'fee_receipt_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app.has_fee_access()))', t || '_select', t);
  end loop;
end $$;

-- Plan / structure sanity: plan belongs to the same academic year
create function app.check_fee_structure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.default_plan_id is not null and not exists (select 1 from public.fee_plans where id = new.default_plan_id and academic_year_id = new.academic_year_id) then
    raise exception 'The default plan must belong to the same academic year' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger fee_structure_check before insert or update on public.fee_structure
  for each row execute function app.check_fee_structure();

create function app.check_student_fee_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fee_plans where id = new.plan_id and academic_year_id = new.academic_year_id) then
    raise exception 'The plan must belong to the same academic year' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger student_fee_plans_check before insert or update on public.student_fee_plans
  for each row execute function app.check_student_fee_plan();

revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- Fee heads (real config). Amounts per class are set in fee_structure.
-- ---------------------------------------------------------------------
insert into public.fee_heads (name, code, sort_order) values
  ('Tuition', 'TUITION', 1), ('Exam', 'EXAM', 2), ('Books', 'BOOKS', 3)
on conflict (name) do nothing;
