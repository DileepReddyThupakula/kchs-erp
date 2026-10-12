-- Loaded by scripts/test-db.mjs before every test file, inside a transaction
-- that is always rolled back. Everything here lives in pg_temp.

create temp table _results (n serial, ok boolean not null, description text not null, detail text);
grant all on _results to authenticated, anon;
grant all on sequence _results_n_seq to authenticated, anon;

-- Fixture users: one per role + a second teacher + an inactive admin.
create function pg_temp.fixture_user(p_id uuid, p_email text) returns uuid
language sql as $$
  insert into auth.users (id, email, aud, role) values (p_id, p_email, 'authenticated', 'authenticated') returning id
$$;

-- Switch the current transaction to an authenticated user (null = anon).
create function pg_temp.login_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  if p_user is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;

create function pg_temp.logout() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.ok(p_ok boolean, p_desc text, p_detail text default null) returns void
language sql as $$
  insert into _results (ok, description, detail) values (coalesce(p_ok, false), p_desc, p_detail)
$$;

-- Statement must succeed.
create function pg_temp.lives(p_sql text, p_desc text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.ok(true, p_desc);
exception when others then
  perform pg_temp.ok(false, p_desc, sqlstate || ': ' || sqlerrm);
end $$;

-- Statement must fail (any error, or a specific SQLSTATE).
create function pg_temp.throws(p_sql text, p_desc text, p_state text default null) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.ok(false, p_desc, 'expected an error, statement succeeded');
exception when others then
  perform pg_temp.ok(p_state is null or sqlstate = p_state, p_desc,
                     case when p_state is not null and sqlstate <> p_state
                          then 'got ' || sqlstate || ': ' || sqlerrm end);
end $$;

-- Statement (INSERT/UPDATE/DELETE) must affect exactly n rows.
-- RLS silently filters UPDATE/DELETE, so "denied" means 0 rows.
create function pg_temp.affects(p_sql text, p_n integer, p_desc text) returns void
language plpgsql as $$
declare
  v integer;
begin
  execute p_sql;
  get diagnostics v = row_count;
  perform pg_temp.ok(v = p_n, p_desc, case when v <> p_n then 'affected ' || v || ' rows' end);
exception when others then
  perform pg_temp.ok(p_n = 0 and sqlstate = '42501', p_desc, sqlstate || ': ' || sqlerrm);
end $$;

-- A SELECT count(*) query must equal n.
create function pg_temp.counts(p_sql text, p_n bigint, p_desc text) returns void
language plpgsql as $$
declare
  v bigint;
begin
  execute p_sql into v;
  perform pg_temp.ok(v = p_n, p_desc, case when v is distinct from p_n then 'got ' || v end);
exception when others then
  perform pg_temp.ok(false, p_desc, sqlstate || ': ' || sqlerrm);
end $$;

-- Temp functions are executable by PUBLIC by default; no grant needed.
