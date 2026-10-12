-- =====================================================================
-- Permission model v2: two active roles (admin, teacher) + per-teacher duties.
--   * computer_staff stays in the enum (future) but nobody can assign it.
--   * staff_permissions: duties granted by Admin; every grant/revoke audited.
--   * public.has_duty(duty): used by RLS and server code.
--       admin            -> every duty
--       computer_staff   -> every duty (dormant legacy role = old matrix)
--       teacher          -> only duties granted in staff_permissions
-- =====================================================================

create type public.staff_duty as enum (
  'student_records',
  'fee_collection',
  'all_class_attendance',
  'all_class_marks',
  'notices_diary',
  'timetable_edit',
  'certificates_idcards',
  'government_ids_view'
);

create table public.staff_permissions (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff (id) on delete cascade,
  duty       public.staff_duty not null,
  granted_by uuid default auth.uid(),
  granted_at timestamptz not null default now(),
  unique (staff_id, duty)
);
create index staff_permissions_staff_idx on public.staff_permissions (staff_id);

-- Grants (insert) and revokes (delete) go to the audit log.
create trigger audit after insert or update or delete on public.staff_permissions
  for each row execute function app.audit_row();

-- granted_by / granted_at are always set by the database, never by the client.
create function app.stamp_duty_grant() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.granted_by := auth.uid();
  new.granted_at := now();
  return new;
end $$;
create trigger stamp_grant before insert on public.staff_permissions
  for each row execute function app.stamp_duty_grant();

create function public.has_duty(p_duty public.staff_duty) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.current_app_role() in ('admin', 'computer_staff')
    or (app.current_app_role() = 'teacher'
        and exists (select 1 from public.staff_permissions p
                    where p.staff_id = app.current_staff_id() and p.duty = p_duty)),
    false)
$$;
revoke execute on function public.has_duty(public.staff_duty) from public, anon;
grant execute on function public.has_duty(public.staff_duty) to authenticated;

-- The signed-in user's effective duties (for menus / server checks).
create function public.my_duties() returns setof public.staff_duty
language sql stable security definer set search_path = '' as $$
  select d from unnest(enum_range(null::public.staff_duty)) d where public.has_duty(d)
$$;
revoke execute on function public.my_duties() from public, anon;
grant execute on function public.my_duties() to authenticated;

alter table public.staff_permissions enable row level security;
-- Admin sees all duties; a teacher sees their own.
create policy duty_select on public.staff_permissions for select to authenticated
  using ((select app.is_admin()) or staff_id = (select app.current_staff_id()));
-- Only Admin grants or revokes. No updates: revoke + grant instead.
create policy duty_insert on public.staff_permissions for insert to authenticated
  with check ((select app.is_admin()));
create policy duty_delete on public.staff_permissions for delete to authenticated
  using ((select app.is_admin()));

-- computer_staff: kept for the future, assignable by nobody (signed-in users).
-- Maintenance scripts (no signed-in user) may still convert old rows.
create function app.block_computer_staff_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.app_role = 'computer_staff'
     and (tg_op = 'INSERT' or old.app_role is distinct from 'computer_staff') then
    raise exception 'The Computer Staff role is not in use. Give a teacher duties instead.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger staff_block_computer_staff before insert or update of app_role on public.staff
  for each row execute function app.block_computer_staff_role();

-- Teacher assignments: teachers with the timetable_edit duty see all of them
-- (needed to build timetables); otherwise only sections they teach.
drop policy ta_select on public.teacher_assignments;
create policy ta_select on public.teacher_assignments for select to authenticated
  using ((select app.is_office())
         or (select public.has_duty('timetable_edit'))
         or ((select app.is_teacher()) and app.teaches_section(section_id)));
