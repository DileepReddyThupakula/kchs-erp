-- Module 1 follow-up: Supabase security advisor fixes.

-- staff_directory: a SECURITY DEFINER view is flagged by the linter.
-- Replace it with a function returning only non-sensitive columns,
-- and only to active staff users.
drop view public.staff_directory;

create function public.staff_directory()
returns table (id uuid, full_name text, designation text, department text, status text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.full_name, s.designation, s.department, s.status
  from public.staff s
  where app.is_staff_user()
  order by s.full_name
$$;
revoke execute on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated;

alter function app.attach_std_triggers(regclass, text[]) set search_path = '';
alter function app.block_audit_mutation() set search_path = '';
