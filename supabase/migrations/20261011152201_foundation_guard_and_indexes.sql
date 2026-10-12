-- Module 1 follow-up:
--  * Last-admin guard applies to signed-in users only, so trusted
--    maintenance scripts (seed:wipe, SQL editor) can remove demo admins.
--  * Covering indexes for foreign keys (performance advisor).

create or replace function app.guard_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and old.app_role = 'admin' and old.status = 'active' and old.user_id is not null
     and (tg_op = 'DELETE' or new.app_role is distinct from 'admin'
          or new.status <> 'active' or new.user_id is null)
     and not exists (select 1 from public.staff s
                     where s.id <> old.id and s.app_role = 'admin'
                       and s.status = 'active' and s.user_id is not null) then
    raise exception 'Cannot remove the last active Admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create index if not exists class_subjects_class_idx on public.class_subjects (class_id);
create index if not exists class_subjects_subject_idx on public.class_subjects (subject_id);
create index if not exists sections_class_idx on public.sections (class_id);
create index if not exists teacher_assignments_subject_idx on public.teacher_assignments (subject_id);
