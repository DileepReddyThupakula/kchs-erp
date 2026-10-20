-- Security self-audit fixes (SEC4+): branding bucket without SVG, failed sign-in log with IP and per-IP throttle (server only),
-- a fixed search_path on the audit truncate guard, and notes on the three tables that are deliberately deny-all.

-- ---------------------------------------------------------------- 1. branding bucket: PNG and JPG only
-- an SVG can carry script; if any setting still points at one, the setting is cleared (the uploaded file is not touched)
update public.school_settings set logo_path = null where lower(logo_path) like '%.svg';
update public.school_settings set principal_signature_path = null where lower(principal_signature_path) like '%.svg';
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg'] where id = 'branding';

-- ---------------------------------------------------------------- 2. audit truncate guard: fixed search_path
create or replace function app.block_audit_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end $$;

-- ---------------------------------------------------------------- 3. deny-all tables, on purpose
comment on table public.number_sequences  is 'Gap-free number counters. Row-level security is ON with NO policy on purpose: only the database functions (security definer) touch it; the app and the API can read or write nothing.';
comment on table public.translation_cache is 'Cache of machine translations of non-student text. Row-level security ON with NO policy on purpose (deny-all): only the server, with the service key, reads and writes it.';
comment on table public.translation_usage is 'Monthly count of translated characters. Row-level security ON with NO policy on purpose (deny-all): only the server, with the service key, reads and writes it.';

-- ---------------------------------------------------------------- 4. failed sign-ins: IP + browser, throttled per IP, callable by the server only
-- The old version could be called by anyone signed out, with any values, and shared one limit: one attacker could use up the
-- allowance and hide real failures. The new one can only be called by the app server (service key), which supplies the IP.
drop function if exists public.log_failed_login(text);
create or replace function public.log_failed_login(p_email text, p_ip text default null, p_user_agent text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e  text := lower(trim(coalesce(p_email, '')));
  ip text := nullif(left(trim(coalesce(p_ip, '')), 45), '');
  ua text := nullif(left(regexp_replace(coalesce(p_user_agent, ''), '[[:cntrl:]]', '', 'g'), 200), '');
begin
  if e = '' or length(e) > 200 or e !~ '^[^@\s]+@[^@\s]+$' then return; end if;
  -- throttle so the log cannot be flooded: per IP first (10 a minute, 60 an hour), then per address (20 an hour), and a high overall ceiling
  if ip is not null then
    if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'ip' = ip and occurred_at > now() - interval '1 minute') >= 10 then return; end if;
    if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'ip' = ip and occurred_at > now() - interval '1 hour') >= 60 then return; end if;
  end if;
  if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'email' = e and occurred_at > now() - interval '1 hour') >= 20 then return; end if;
  if (select count(*) from public.audit_logs where action = 'auth.login_failed' and occurred_at > now() - interval '1 minute') >= 300 then return; end if;
  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
  values (null, null, 'auth.login_failed', 'auth', null,
          jsonb_strip_nulls(jsonb_build_object('email', e, 'known_account', exists (select 1 from public.staff s where lower(s.email) = e), 'ip', ip, 'user_agent', ua)));
end $$;
revoke execute on function public.log_failed_login(text, text, text) from public, anon, authenticated;
grant execute on function public.log_failed_login(text, text, text) to service_role;
create index if not exists audit_logs_failed_ip_idx on public.audit_logs ((details ->> 'ip'), occurred_at desc) where action = 'auth.login_failed';
