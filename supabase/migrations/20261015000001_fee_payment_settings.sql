-- =====================================================================
-- Fees: payment modes + school UPI / QR settings
--   * Reference number: required ONLY for cheque (cheque number); UPI and
--     bank transfer are optional unless Admin turns on "Require reference
--     for UPI" (fee_settings.require_upi_reference, default off).
--   * fee_settings: UPI id, payee name, optional uploaded static QR image.
--     Only Admin can change it; every change is audit-logged with the UPI id
--     partly masked; the last editor's name and time are kept on the row.
--   * payment-qr: private storage bucket for the uploaded QR image.
-- =====================================================================

-- old rule: every non-cash payment needed a reference
do $$
declare
  c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.fee_receipts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%payment_mode%' and pg_get_constraintdef(oid) ilike '%reference_no%' loop
    execute format('alter table public.fee_receipts drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.fee_receipts add constraint fee_receipts_cheque_ref_check
  check (payment_mode <> 'cheque' or length(trim(coalesce(reference_no, ''))) > 0);

create table public.fee_settings (
  id                   smallint primary key default 1 check (id = 1),
  upi_id               text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$'),
  payee_name           text check (payee_name is null or length(trim(payee_name)) between 2 and 80),
  qr_path              text,
  require_upi_reference boolean not null default false,
  changed_by_name      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  updated_by           uuid
);
insert into public.fee_settings (id) values (1);

create function app.mask_upi(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null or p = '' then null
              else left(split_part(p, '@', 1), 2) || '***@' || split_part(p, '@', 2) end
$$;

create trigger stamp before insert or update on public.fee_settings for each row execute function app.stamp_row();

create function app.fee_settings_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.changed_by_name := coalesce((select full_name from public.staff where id = app.current_staff_id()), new.changed_by_name);
  return new;
end $$;
create trigger fee_settings_before before update on public.fee_settings for each row execute function app.fee_settings_before();

create function app.fee_settings_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.upi_id, new.payee_name, new.qr_path, new.require_upi_reference)
     is distinct from (old.upi_id, old.payee_name, old.qr_path, old.require_upi_reference) then
    insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
    values (auth.uid(), app.current_app_role()::text, 'fee_settings.update', 'fee_settings', '1', jsonb_build_object(
      'upi_id_old', app.mask_upi(old.upi_id), 'upi_id_new', app.mask_upi(new.upi_id),
      'payee_changed', new.payee_name is distinct from old.payee_name,
      'payee_new', new.payee_name,
      'qr_image_changed', new.qr_path is distinct from old.qr_path,
      'require_upi_reference_old', old.require_upi_reference, 'require_upi_reference_new', new.require_upi_reference));
  end if;
  return null;
end $$;
create trigger fee_settings_audit after update on public.fee_settings for each row execute function app.fee_settings_audit();

alter table public.fee_settings enable row level security;
create policy fee_settings_select on public.fee_settings for select to authenticated using ((select app.has_fee_access()));
create policy fee_settings_update on public.fee_settings for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
-- no insert / delete policies: the single row always exists

create function app.check_payment_reference(p_mode text, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_mode = 'cheque' and length(trim(coalesce(p_ref, ''))) = 0 then
    raise exception 'The cheque number is required' using errcode = '23514';
  end if;
  if p_mode = 'upi' and length(trim(coalesce(p_ref, ''))) = 0
     and coalesce((select require_upi_reference from public.fee_settings where id = 1), false) then
    raise exception 'The UPI transaction reference is required (Admin setting in Fee setup)' using errcode = '23514';
  end if;
end $$;
revoke execute on function app.check_payment_reference(text, text) from public, authenticated, anon;

create or replace function public.collect_fee(
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
  perform app.check_payment_reference(p_mode, p_reference);
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

create or replace function public.create_misc_receipt(
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
  perform app.check_payment_reference(p_mode, p_reference);
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

revoke execute on function public.collect_fee(uuid, bigint, text, text, text, uuid[], date) from public, anon;
revoke execute on function public.create_misc_receipt(uuid, bigint, text, text, uuid, text, text, date) from public, anon;
grant execute on function public.collect_fee(uuid, bigint, text, text, text, uuid[], date) to authenticated;
grant execute on function public.create_misc_receipt(uuid, bigint, text, text, uuid, text, text, date) to authenticated;

-- QR image: private bucket; fee access reads, Admin writes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', false, 2097152, '{image/png,image/jpeg,image/webp}')
on conflict (id) do nothing;
create policy payment_qr_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-qr' and (select app.has_fee_access()));
create policy payment_qr_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr' and (select app.is_admin()));
create policy payment_qr_update on storage.objects for update to authenticated
  using (bucket_id = 'payment-qr' and (select app.is_admin())) with check (bucket_id = 'payment-qr' and (select app.is_admin()));
create policy payment_qr_delete on storage.objects for delete to authenticated
  using (bucket_id = 'payment-qr' and (select app.is_admin()));

revoke all on all tables in schema public from anon;
