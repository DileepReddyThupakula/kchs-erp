-- Speed pass 2: every page used to ask the database three separate things before it did anything else
-- (who am I, which duties do I hold, which academic years exist). One call now. SECURITY INVOKER, so the rules are exactly those of the
-- separate queries: a person sees only their own ACTIVE staff row (a deactivated or removed person gets null and is sent to the login page).
create or replace function public.session_context() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'staff', (select jsonb_build_object('id', s.id, 'full_name', s.full_name, 'app_role', s.app_role, 'status', s.status) from public.staff s where s.user_id = auth.uid()),
    'duties', coalesce((select jsonb_agg(d) from public.my_duties() d), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(to_jsonb(y) order by y.start_date desc) from public.academic_years y), '[]'::jsonb))
$$;
revoke execute on function public.session_context() from public, anon;
grant execute on function public.session_context() to authenticated;
