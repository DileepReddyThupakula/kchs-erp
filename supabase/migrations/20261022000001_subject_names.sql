-- Subject names for the diary / notices screens.
-- The scope rule lets a teacher read only the subjects they teach, but a class
-- teacher reading the diary of their own section must still see the NAME of
-- every subject that has a line there. Names are not sensitive; the function
-- returns id + name only, to any signed-in staff member.
create function public.subject_names() returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name from public.subjects s where app.is_staff_user() order by s.name
$$;
revoke execute on function public.subject_names() from public, anon;
grant execute on function public.subject_names() to authenticated;
