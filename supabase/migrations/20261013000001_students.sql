-- =====================================================================
-- Module: Students (Part 1: database)
--   students                  core record (never hard-deleted; status)
--   student_profiles          government / UDISE fields (jsonb, validated
--                             against student_field_definitions)
--   student_secure_values     encrypted IDs (Aadhaar, ration card, UDID, and
--                             any sensitive field Admin adds later)
--   guardians, student_guardians (siblings share guardians)
--   student_enrollments       one row per student per academic year
--   student_documents, student_document_types (private storage)
--   number_sequences          admission numbers (and receipts later)
-- Access (DECISIONS.md R13-R18, R20):
--   Admin: everything (but students are never deleted by anyone signed in)
--   student_records duty: add/edit/import, no delete, no status change
--   section duties (e.g. fee_collection): look up any student (basic fields)
--   government_ids_view duty: reveal IDs of students they can already see
--   other teachers: students of their own sections only, basic fields +
--   guardian phone/address; never government fields or IDs
-- =====================================================================

-- ---------------------------------------------------------------------
-- Encryption key: random, generated inside Supabase Vault at migration
-- time. It never appears in code, files or logs.
-- ---------------------------------------------------------------------
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'student_pii_key',
                           'Encrypts student government IDs (student_secure_values)')
where not exists (select 1 from vault.secrets where name = 'student_pii_key');

create function app.pii_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'student_pii_key'
$$;
revoke execute on function app.pii_key() from public, authenticated, anon;

-- ---------------------------------------------------------------------
-- Number sequences (gap-free per key, safe under concurrency)
-- ---------------------------------------------------------------------
create table public.number_sequences (
  key        text primary key,
  last_value bigint not null default 0
);
alter table public.number_sequences enable row level security; -- no policies: functions only

create function app.next_number(p_key text) returns bigint
language sql volatile security definer set search_path = '' as $$
  insert into public.number_sequences (key, last_value) values (p_key, 1)
  on conflict (key) do update set last_value = public.number_sequences.last_value + 1
  returning last_value
$$;
revoke execute on function app.next_number(text) from public, authenticated, anon;

-- ---------------------------------------------------------------------
-- Field definitions: the government / optional fields. New optional
-- fields are added here as rows (no rebuild). sensitive = stored
-- encrypted in student_secure_values; reveal_with_duty = the
-- government_ids_view duty may reveal it (otherwise Admin only).
-- ---------------------------------------------------------------------
create table public.student_field_definitions (
  key              text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label            text not null,
  field_group      text not null check (field_group in ('identity', 'social', 'disability', 'enrolment', 'previous_school', 'facilities', 'other')),
  field_type       text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select', 'multiselect')),
  options          text[],
  pattern          text,
  help             text,
  required_for_gov boolean not null default false,
  sensitive        boolean not null default false,
  reveal_with_duty boolean not null default false,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  check (field_type not in ('select', 'multiselect') or options is not null),
  check (not sensitive or field_type = 'text'),
  check (not reveal_with_duty or sensitive)
);
select app.attach_std_triggers('public.student_field_definitions');

create table public.student_document_types (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label      text not null,
  required   boolean not null default false,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
select app.attach_std_triggers('public.student_document_types');

-- ---------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------
create table public.students (
  id             uuid primary key default gen_random_uuid(),
  admission_no   text not null unique,
  full_name      text not null check (length(trim(full_name)) >= 2),
  gender         text not null check (gender in ('male', 'female', 'other')),
  date_of_birth  date not null check (date_of_birth > '1990-01-01'),
  admission_date date not null default current_date,
  address        text,
  village_town   text,
  district       text,
  pincode        text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  photo_path     text,
  status         text not null default 'active' check (status in ('active', 'left', 'tc_issued', 'passed_out')),
  status_date    date,
  status_reason  text,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid
);
create index students_name_idx on public.students (lower(full_name));
create index students_status_idx on public.students (status);
select app.attach_std_triggers('public.students');

-- Admission number: given, or generated as <prefix><0001>
create function app.student_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.admission_no is null or trim(new.admission_no) = '' then
    new.admission_no := coalesce((select admission_no_prefix from public.school_settings where id = 1), '')
                        || lpad(app.next_number('admission_no')::text, 4, '0');
  end if;
  new.admission_no := upper(trim(new.admission_no));
  return new;
end $$;
create trigger student_defaults before insert on public.students
  for each row execute function app.student_defaults();

-- Status: only Admin may set or change it (signed-in users); scripts may.
-- Students are never hard-deleted by a signed-in user.
create function app.guard_student_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Students are never deleted. The Admin can change the status instead.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.status <> 'active' then
    raise exception 'Only the Admin can set a student''s status' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.status, new.status_date, new.status_reason) is distinct from (old.status, old.status_date, old.status_reason) then
    raise exception 'Only the Admin can change a student''s status' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo then
    raise exception 'is_demo cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger students_guard_status before insert or update or delete on public.students
  for each row execute function app.guard_student_status();

-- ---------------------------------------------------------------------
-- Government profile (non-sensitive fields, validated against definitions)
-- ---------------------------------------------------------------------
create table public.student_profiles (
  student_id uuid primary key references public.students (id) on delete cascade,
  details    jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
select app.attach_std_triggers('public.student_profiles');

create function app.validate_student_details() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k   text;
  v   jsonb;
  def public.student_field_definitions;
begin
  for k, v in select * from jsonb_each(new.details) loop
    select * into def from public.student_field_definitions where key = k;
    if not found or not def.is_active then
      raise exception 'Unknown student field "%"', k using errcode = '23514';
    end if;
    if def.sensitive then
      raise exception 'Field "%" is sensitive and must be stored encrypted (use set_student_secure_value)', k using errcode = '23514';
    end if;
    continue when v = 'null'::jsonb;
    case def.field_type
      when 'number' then
        if jsonb_typeof(v) <> 'number' then raise exception '"%" must be a number', def.label using errcode = '23514'; end if;
      when 'boolean' then
        if jsonb_typeof(v) <> 'boolean' then raise exception '"%" must be yes/no', def.label using errcode = '23514'; end if;
      when 'date' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception '"%" must be a date (YYYY-MM-DD)', def.label using errcode = '23514';
        end if;
      when 'select' then
        if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (def.options)) then
          raise exception '"%" must be one of: %', def.label, array_to_string(def.options, ', ') using errcode = '23514';
        end if;
      when 'multiselect' then
        if jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements_text(v) x where not (x = any (def.options))) then
          raise exception '"%" has a value that is not allowed', def.label using errcode = '23514';
        end if;
      else -- text
        if jsonb_typeof(v) <> 'string' then raise exception '"%" must be text', def.label using errcode = '23514'; end if;
        if def.pattern is not null and (v #>> '{}') !~ def.pattern then
          raise exception '"%" is not in the expected format', def.label using errcode = '23514';
        end if;
    end case;
  end loop;
  return new;
end $$;
create trigger student_profiles_validate before insert or update of details on public.student_profiles
  for each row execute function app.validate_student_details();

-- ---------------------------------------------------------------------
-- Encrypted IDs. value_enc is never readable through the API (column
-- privilege revoked); only value_last4 (masked) is. Full values only via
-- reveal_student_secure_values() for Admin / government_ids_view.
-- ---------------------------------------------------------------------
create table public.student_secure_values (
  student_id  uuid not null references public.students (id) on delete cascade,
  field_key   text not null references public.student_field_definitions (key) on update cascade,
  value_enc   bytea not null,
  value_last4 text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  primary key (student_id, field_key)
);
create index student_secure_values_key_idx on public.student_secure_values (field_key);
-- audit log stores [REDACTED] for the ciphertext; last 4 digits are the masked value
select app.attach_std_triggers('public.student_secure_values', '{value_enc}');
revoke select on public.student_secure_values from authenticated;
grant select (student_id, field_key, value_last4, updated_at) on public.student_secure_values to authenticated;

-- Internal: encrypt + store (callers check permissions). Not exposed.
create function app.store_secure_value(p_student uuid, p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  def    public.student_field_definitions;
  clean  text := regexp_replace(coalesce(p_value, ''), '\s', '', 'g');
begin
  select * into def from public.student_field_definitions where key = p_key;
  if not found or not def.sensitive or not def.is_active then
    raise exception 'Unknown sensitive field "%"', p_key using errcode = '23514';
  end if;
  if clean = '' then
    delete from public.student_secure_values where student_id = p_student and field_key = p_key;
    return;
  end if;
  if def.pattern is not null and clean !~ def.pattern then
    raise exception '"%" is not in the expected format', def.label using errcode = '23514';
  end if;
  insert into public.student_secure_values (student_id, field_key, value_enc, value_last4)
  values (p_student, p_key, extensions.pgp_sym_encrypt(clean, app.pii_key()), right(clean, 4))
  on conflict (student_id, field_key) do update
    set value_enc = excluded.value_enc, value_last4 = excluded.value_last4;
end $$;
revoke execute on function app.store_secure_value(uuid, text, text) from public, authenticated, anon;

-- ---------------------------------------------------------------------
-- Guardians (siblings share a guardian row) and links
-- ---------------------------------------------------------------------
create table public.guardians (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(trim(full_name)) >= 2),
  phone       text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  alt_phone   text check (alt_phone is null or alt_phone ~ '^[6-9][0-9]{9}$'),
  email       text,
  occupation  text,
  education   text,
  address     text,
  pincode     text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
create index guardians_phone_idx on public.guardians (phone);
select app.attach_std_triggers('public.guardians');

create table public.student_guardians (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete restrict,
  relation    text not null check (relation in ('father', 'mother', 'guardian', 'grandparent', 'sibling', 'other')),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  unique (student_id, guardian_id)
);
create unique index student_guardians_one_primary on public.student_guardians (student_id) where is_primary;
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);
select app.attach_std_triggers('public.student_guardians');

-- ---------------------------------------------------------------------
-- Enrolments: one row per student per academic year
-- ---------------------------------------------------------------------
create table public.student_enrollments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  section_id       uuid not null references public.sections (id) on delete restrict,
  roll_no          integer check (roll_no is null or roll_no > 0),
  status           text not null default 'active' check (status in ('active', 'promoted', 'detained', 'left')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (student_id, academic_year_id)
);
create unique index student_enrollments_roll on public.student_enrollments (section_id, roll_no) where roll_no is not null;
create index student_enrollments_section_idx on public.student_enrollments (section_id);
create index student_enrollments_year_idx on public.student_enrollments (academic_year_id);
select app.attach_std_triggers('public.student_enrollments');

create function app.check_enrollment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sections where id = new.section_id and academic_year_id = new.academic_year_id) then
    raise exception 'The section does not belong to that academic year' using errcode = '23514';
  end if;
  -- enrolment status (promoted / detained / left) is a status change: Admin only
  if auth.uid() is not null and not app.is_admin() then
    if (tg_op = 'INSERT' and new.status <> 'active') or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
      raise exception 'Only the Admin can change an enrolment status' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger student_enrollments_check before insert or update on public.student_enrollments
  for each row execute function app.check_enrollment();

-- ---------------------------------------------------------------------
-- Documents (private bucket; short-lived signed links made server-side)
-- ---------------------------------------------------------------------
create table public.student_documents (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  doc_type    text not null references public.student_document_types (code) on update cascade,
  file_path   text not null unique,
  file_name   text not null,
  mime_type   text not null,
  size_bytes  integer not null check (size_bytes > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
create index student_documents_student_idx on public.student_documents (student_id);
select app.attach_std_triggers('public.student_documents');

-- ---------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------
create function app.can_manage_students() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_office() or public.has_duty('student_records')
$$;

-- Read the basic record: Admin, student_records, any section-wide duty
-- (its module needs student lookup), or a teacher of one of the student's
-- sections (class teacher or subject teacher, any year).
create function app.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_manage_students() or app.has_section_duty()
      or exists (select 1 from public.student_enrollments e
                 where e.student_id = p_student and app.teaches_section(e.section_id))
$$;

create function app.uuid_or_null(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

grant execute on function app.can_manage_students(), app.can_view_student(uuid), app.uuid_or_null(text) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.student_field_definitions enable row level security;
create policy sfd_select on public.student_field_definitions for select to authenticated using ((select app.is_staff_user()));
create policy sfd_insert on public.student_field_definitions for insert to authenticated with check ((select app.is_admin()));
create policy sfd_update on public.student_field_definitions for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy sfd_delete on public.student_field_definitions for delete to authenticated using ((select app.is_admin()));

alter table public.student_document_types enable row level security;
create policy sdt_select on public.student_document_types for select to authenticated using ((select app.is_staff_user()));
create policy sdt_insert on public.student_document_types for insert to authenticated with check ((select app.is_admin()));
create policy sdt_update on public.student_document_types for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy sdt_delete on public.student_document_types for delete to authenticated using ((select app.is_admin()));

alter table public.students enable row level security;
create policy stu_select on public.students for select to authenticated using (app.can_view_student(id));
create policy stu_insert on public.students for insert to authenticated with check ((select app.can_manage_students()));
create policy stu_update on public.students for update to authenticated using ((select app.can_manage_students())) with check ((select app.can_manage_students()));
-- no delete policy: students are never hard-deleted through the app

alter table public.student_profiles enable row level security;
create policy sp_select on public.student_profiles for select to authenticated using ((select app.can_manage_students()));
create policy sp_insert on public.student_profiles for insert to authenticated with check ((select app.can_manage_students()));
create policy sp_update on public.student_profiles for update to authenticated using ((select app.can_manage_students())) with check ((select app.can_manage_students()));

-- masked values: Admin, student_records, or government_ids_view for students they can see
alter table public.student_secure_values enable row level security;
create policy ssv_select on public.student_secure_values for select to authenticated
  using ((select app.can_manage_students()) or ((select public.has_duty('government_ids_view')) and app.can_view_student(student_id)));
create policy ssv_delete on public.student_secure_values for delete to authenticated using ((select app.is_admin()));
-- inserts/updates only through set_student_secure_value()

alter table public.guardians enable row level security;
create policy g_select on public.guardians for select to authenticated
  using ((select app.can_manage_students()) or (select app.has_section_duty())
         or exists (select 1 from public.student_guardians sg where sg.guardian_id = guardians.id and app.can_view_student(sg.student_id)));
create policy g_insert on public.guardians for insert to authenticated with check ((select app.can_manage_students()));
create policy g_update on public.guardians for update to authenticated using ((select app.can_manage_students())) with check ((select app.can_manage_students()));
create policy g_delete on public.guardians for delete to authenticated using ((select app.is_admin()));

alter table public.student_guardians enable row level security;
create policy sg_select on public.student_guardians for select to authenticated using (app.can_view_student(student_id));
create policy sg_insert on public.student_guardians for insert to authenticated with check ((select app.can_manage_students()));
create policy sg_update on public.student_guardians for update to authenticated using ((select app.can_manage_students())) with check ((select app.can_manage_students()));
create policy sg_delete on public.student_guardians for delete to authenticated using ((select app.is_admin()));

alter table public.student_enrollments enable row level security;
create policy se_select on public.student_enrollments for select to authenticated
  using ((select app.can_manage_students()) or (select app.has_section_duty()) or app.teaches_section(section_id));
create policy se_insert on public.student_enrollments for insert to authenticated with check ((select app.can_manage_students()));
create policy se_update on public.student_enrollments for update to authenticated using ((select app.can_manage_students())) with check ((select app.can_manage_students()));
create policy se_delete on public.student_enrollments for delete to authenticated using ((select app.is_admin()));

alter table public.student_documents enable row level security;
create policy sd_select on public.student_documents for select to authenticated using ((select app.can_manage_students()));
create policy sd_insert on public.student_documents for insert to authenticated with check ((select app.can_manage_students()));
create policy sd_update on public.student_documents for update to authenticated using ((select app.can_manage_students())) with check ((select app.can_manage_students()));
create policy sd_delete on public.student_documents for delete to authenticated using ((select app.is_admin()));

-- ---------------------------------------------------------------------
-- RPCs for encrypted IDs
-- ---------------------------------------------------------------------
create function public.set_student_secure_value(p_student_id uuid, p_field_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_manage_students() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'student not found' using errcode = 'P0002';
  end if;
  perform app.store_secure_value(p_student_id, p_field_key, p_value);
end $$;

-- Full values: Admin (every sensitive field) or government_ids_view (fields
-- marked reveal_with_duty, for students they can see). Every reveal is
-- logged — field names only, never values.
create function public.reveal_student_secure_values(p_student_id uuid)
returns table (field_key text, label text, value text)
language plpgsql security definer set search_path = '' as $$
declare
  admin boolean := app.is_admin();
  duty  boolean := public.has_duty('government_ids_view') and not app.is_admin() and app.can_view_student(p_student_id);
  keys  text[];
begin
  if not (admin or duty) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select v.field_key, d.label, extensions.pgp_sym_decrypt(v.value_enc, app.pii_key())
    from public.student_secure_values v
    join public.student_field_definitions d on d.key = v.field_key
    where v.student_id = p_student_id and (admin or d.reveal_with_duty)
    order by d.sort_order;
  select array_agg(v.field_key) into keys
  from public.student_secure_values v join public.student_field_definitions d on d.key = v.field_key
  where v.student_id = p_student_id and (admin or d.reveal_with_duty);
  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
  values (auth.uid(), app.current_app_role()::text, 'student.ids_revealed', 'students', p_student_id::text,
          jsonb_build_object('fields', coalesce(keys, '{}')));
end $$;

revoke execute on function public.set_student_secure_value(uuid, text, text) from public, anon;
revoke execute on function public.reveal_student_secure_values(uuid) from public, anon;
grant execute on function public.set_student_secure_value(uuid, text, text) to authenticated;
grant execute on function public.reveal_student_secure_values(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: student photos and documents (private buckets)
-- Object path: <student_id>/<file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('student-photos', 'student-photos', false, 2097152, '{image/jpeg,image/png,image/webp}'),
  ('student-documents', 'student-documents', false, 5242880, '{application/pdf,image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

create policy student_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and app.can_view_student(app.uuid_or_null((storage.foldername(name))[1])));
create policy student_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and (select app.can_manage_students()));
create policy student_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and (select app.can_manage_students()))
  with check (bucket_id = 'student-photos' and (select app.can_manage_students()));
create policy student_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and (select app.is_admin()));

create policy student_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'student-documents' and (select app.can_manage_students()));
create policy student_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-documents' and (select app.can_manage_students()));
create policy student_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'student-documents' and (select app.is_admin()));

-- ---------------------------------------------------------------------
-- Login page motto (T20): public_branding() now returns it too
-- ---------------------------------------------------------------------
drop function public.public_branding();
create function public.public_branding() returns table (name text, short_name text, logo_path text, motto text)
language sql stable security definer set search_path = '' as $$
  select name, short_name, logo_path, nullif(trim(extra ->> 'motto'), '') from public.school_settings where id = 1
$$;
revoke execute on function public.public_branding() from public;
grant execute on function public.public_branding() to anon, authenticated;

revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- Seed: field definitions (the government / UDISE+ / AP fields that are
-- not core columns) and document types. ⚠ VERIFY: DECISIONS.md section 5.
-- ---------------------------------------------------------------------
insert into public.student_field_definitions (key, label, field_group, field_type, options, pattern, help, required_for_gov, sensitive, reveal_with_duty, sort_order) values
  -- identity
  ('name_as_per_aadhaar', 'Name as per Aadhaar', 'identity', 'text', null, null, null, true, false, false, 10),
  ('aadhaar_no', 'Aadhaar number', 'identity', 'text', null, '^[2-9][0-9]{11}$', '12 digits', true, true, true, 11),
  ('child_id', 'AP Child ID / Student ID', 'identity', 'text', null, null, 'From AP Child Info', true, false, false, 12),
  ('pen', 'UDISE+ PEN', 'identity', 'text', null, null, 'Permanent Education Number, given by UDISE+', false, false, false, 13),
  ('apaar_id', 'APAAR ID', 'identity', 'text', null, null, null, false, false, false, 14),
  ('nationality', 'Nationality', 'identity', 'select', '{Indian,Other}', null, null, true, false, false, 15),
  ('blood_group', 'Blood group', 'identity', 'select', '{A+,A-,B+,B-,AB+,AB-,O+,O-}', null, null, false, false, false, 16),
  ('height_cm', 'Height (cm)', 'identity', 'number', null, null, null, false, false, false, 17),
  ('weight_kg', 'Weight (kg)', 'identity', 'number', null, null, null, false, false, false, 18),
  ('identification_mark_1', 'Identification mark 1', 'identity', 'text', null, null, null, true, false, false, 19),
  ('identification_mark_2', 'Identification mark 2', 'identity', 'text', null, null, null, false, false, false, 20),
  -- social
  ('social_category', 'Social category (UDISE)', 'social', 'select', '{General,SC,ST,OBC}', null, null, true, false, false, 30),
  ('caste_category', 'Caste category (AP)', 'social', 'select', '{OC,BC-A,BC-B,BC-C,BC-D,BC-E,SC,ST}', null, null, true, false, false, 31),
  ('caste', 'Caste', 'social', 'text', null, null, null, true, false, false, 32),
  ('sub_caste', 'Sub-caste', 'social', 'text', null, null, null, false, false, false, 33),
  ('religion', 'Religion', 'social', 'select', '{Hindu,Muslim,Christian,Sikh,Buddhist,Jain,Other}', null, null, true, false, false, 34),
  ('minority', 'Minority group', 'social', 'boolean', null, null, null, false, false, false, 35),
  ('mother_tongue', 'Mother tongue', 'social', 'select', '{Telugu,Urdu,Hindi,Tamil,Kannada,English,Other}', null, null, true, false, false, 36),
  ('bpl', 'BPL beneficiary', 'social', 'boolean', null, null, null, false, false, false, 37),
  ('aay', 'Antyodaya (AAY) beneficiary', 'social', 'boolean', null, null, null, false, false, false, 38),
  ('ration_card_no', 'Ration / rice card number', 'social', 'text', null, '^[A-Za-z0-9]{6,20}$', null, false, true, true, 39),
  ('ews', 'EWS / disadvantaged group', 'social', 'boolean', null, null, null, false, false, false, 40),
  ('annual_family_income', 'Annual family income (₹)', 'social', 'number', null, null, null, false, false, false, 41),
  -- disability (CWSN)
  ('cwsn', 'Child with special needs', 'disability', 'boolean', null, null, null, true, false, false, 50),
  ('impairment_type', 'Impairment type', 'disability', 'select',
    '{Blindness,Low vision,Leprosy cured,Hearing impairment,Locomotor disability,Dwarfism,Intellectual disability,Mental illness,Autism spectrum disorder,Cerebral palsy,Muscular dystrophy,Chronic neurological condition,Specific learning disability,Multiple sclerosis,Speech and language disability,Thalassemia,Haemophilia,Sickle cell disease,Multiple disabilities,Acid attack victim,Parkinson''s disease}',
    null, 'RPwD Act 2016 categories', false, false, false, 51),
  ('disability_percent', 'Disability percentage', 'disability', 'number', null, null, null, false, false, false, 52),
  ('udid_no', 'UDID / disability certificate number', 'disability', 'text', null, '^[A-Za-z0-9/-]{6,30}$', null, false, true, true, 53),
  ('screened_sld_asd_adhd', 'Screened for SLD / ASD / ADHD', 'disability', 'select', '{Not screened,No condition found,SLD,ASD,ADHD}', null, null, false, false, false, 54),
  ('cwsn_facilities', 'CWSN facilities received', 'disability', 'text', null, null, null, false, false, false, 55),
  -- enrolment
  ('first_language', 'First language', 'enrolment', 'select', '{Telugu,English,Hindi,Urdu,Sanskrit,Other}', null, null, true, false, false, 60),
  ('second_language', 'Second language', 'enrolment', 'select', '{Telugu,English,Hindi,Urdu,Sanskrit,Other}', null, null, false, false, false, 61),
  ('third_language', 'Third language', 'enrolment', 'select', '{Telugu,English,Hindi,Urdu,Sanskrit,Other}', null, null, false, false, false, 62),
  ('rte_admission', 'Admitted under RTE 12(1)(c)', 'enrolment', 'boolean', null, null, null, true, false, false, 63),
  ('out_of_school_mainstreamed', 'Out-of-school child mainstreamed', 'enrolment', 'boolean', null, null, null, false, false, false, 64),
  -- previous school
  ('prev_year_status', 'Status in previous year', 'previous_school', 'select', '{Same school,Other school,Anganwadi / ECCE,Not in school}', null, null, true, false, false, 70),
  ('prev_class', 'Class studied in previous year', 'previous_school', 'text', null, null, null, false, false, false, 71),
  ('prev_school_name', 'Previous school name', 'previous_school', 'text', null, null, null, false, false, false, 72),
  ('prev_school_udise', 'Previous school UDISE code', 'previous_school', 'text', null, '^[0-9]{11}$', '11 digits', false, false, false, 73),
  ('tc_number', 'TC number', 'previous_school', 'text', null, null, null, false, false, false, 74),
  ('tc_date', 'TC date', 'previous_school', 'date', null, null, null, false, false, false, 75),
  ('prev_result', 'Previous year result', 'previous_school', 'select', '{Passed / promoted,Detained / failed,Not applicable}', null, null, false, false, false, 76),
  ('prev_marks_percent', 'Previous year % marks', 'previous_school', 'number', null, null, null, false, false, false, 77),
  ('prev_days_attended', 'Previous year days attended', 'previous_school', 'number', null, null, null, false, false, false, 78),
  -- facilities (no transport: the school has no buses)
  ('facilities_received', 'Facilities received', 'facilities', 'multiselect', '{Free textbooks,Uniform,Hostel,Bicycle,Mid-day meal}', null, null, false, false, false, 80),
  ('gifted', 'Gifted / talented', 'facilities', 'boolean', null, null, null, false, false, false, 81),
  ('competitions', 'Took part in competitions / Olympiads', 'facilities', 'boolean', null, null, null, false, false, false, 82),
  ('ncc_nss_scouts', 'NCC / NSS / Scouts & Guides', 'facilities', 'boolean', null, null, null, false, false, false, 83),
  ('digital_capable', 'Can use digital devices', 'facilities', 'boolean', null, null, null, false, false, false, 84),
  ('internet_at_home', 'Internet access at home', 'facilities', 'boolean', null, null, null, false, false, false, 85);

insert into public.student_document_types (code, label, required, sort_order) values
  ('birth_certificate', 'Birth certificate', true, 1),
  ('aadhaar_copy', 'Aadhaar card copy', true, 2),
  ('transfer_certificate', 'Transfer certificate (TC)', false, 3),
  ('caste_certificate', 'Caste certificate', false, 4),
  ('income_certificate', 'Income certificate', false, 5),
  ('disability_certificate', 'Disability certificate', false, 6),
  ('previous_marks_memo', 'Previous marks memo', false, 7),
  ('other', 'Other', false, 99);
