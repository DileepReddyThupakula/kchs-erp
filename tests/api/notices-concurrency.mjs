// Circular numbers under SIMULTANEOUS publishing (real parallel connections):
// no duplicates, no gaps, and a publish that rolls back leaves no hole.
// Throwaway academic year (2092); removed afterwards. Skips until the migration is applied.
import pg from "pg";

export const name = "notices: circular numbering under simultaneous publishing (parallel connections)";

const YEAR = "TEST-NDCONC-2092";

async function cleanup(db) {
  await db.query(`delete from public.notices where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.number_sequences where key = $1`, [`circular:${YEAR}`]);
  await db.query(`delete from public.academic_years where name = $1`, [YEAR]);
}

async function asUser(url, userId, fn) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await c.query("select set_config('role', 'authenticated', true)");
    const r = await fn(c);
    return { ok: true, value: r.value, commit: async () => c.query("commit").then(() => c.end()), rollback: async () => c.query("rollback").then(() => c.end()) };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    await c.end().catch(() => {});
    return { ok: false, error: e };
  }
}

export default async function run({ ok, skip }) {
  const url = process.env.DATABASE_URL;
  if (!url) return skip("DATABASE_URL missing");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { rows: has } = await db.query(`select to_regclass('public.notices') as t`);
    if (!has[0].t) return skip("notices migration not applied yet");
    const { rows: adm } = await db.query(`select user_id from public.staff where employee_code = 'DEMO-ADM' and user_id is not null`);
    if (!adm.length) return skip("demo admin missing (seed:demo)");
    await cleanup(db);
    await db.query(`insert into public.academic_years (name, start_date, end_date) values ($1, '2092-04-01', '2093-03-31')`, [YEAR]);

    // 9 drafts created through the function (as the Admin)
    const ids = [];
    for (let i = 1; i <= 9; i++) {
      const r = await asUser(url, adm[0].user_id, (c) =>
        c.query(`select public.save_notice($1::jsonb) as id`, [JSON.stringify({ title: `Concurrency ${i}`, body: "Test circular", audience: "all", publish_date: "2092-06-10" })]).then((x) => ({ value: x.rows[0].id })),
      );
      if (!r.ok) throw r.error;
      await r.commit();
      ids.push(r.value);
    }

    // 8 publish at the same moment; the 9th publishes and then ROLLS BACK
    const jobs = ids.slice(0, 8).map((id) =>
      asUser(url, adm[0].user_id, (c) => c.query(`select public.publish_notice($1) as no`, [id]).then((x) => ({ value: x.rows[0].no }))).then(async (r) => {
        if (r.ok) await r.commit();
        return r;
      }),
    );
    const rolled = asUser(url, adm[0].user_id, (c) => c.query(`select public.publish_notice($1) as no`, [ids[8]]).then((x) => ({ value: x.rows[0].no }))).then(async (r) => {
      if (r.ok) await new Promise((res) => setTimeout(res, 300));
      if (r.ok) await r.rollback();
      return r;
    });
    const results = await Promise.all([...jobs, rolled]);
    ok(results.every((r) => r.ok), "eight simultaneous publishes (and one that rolls back) all ran", results.find((r) => !r.ok)?.error?.message);

    const { rows } = await db.query(`select circular_seq, circular_no from public.notices where academic_year_id = (select id from public.academic_years where name = $1) and circular_seq is not null order by circular_seq`, [YEAR]);
    ok(rows.length === 8, "exactly eight notices are numbered (the rolled-back one is not)", String(rows.length));
    ok(rows.every((r, i) => r.circular_seq === i + 1), "numbers are 1 to 8 with no gap", rows.map((r) => r.circular_seq).join(","));
    ok(new Set(rows.map((r) => r.circular_no)).size === 8, "no duplicate circular numbers");
    ok(rows[0].circular_no.endsWith(`/${YEAR}/001`), "format is prefix/year/001", rows[0].circular_no);

    // the next publish continues at 9 (no hole left by the rollback)
    const r9 = await asUser(url, adm[0].user_id, (c) => c.query(`select public.publish_notice($1) as no`, [ids[8]]).then((x) => ({ value: x.rows[0].no })));
    if (r9.ok) await r9.commit();
    ok(r9.ok && r9.value.endsWith("/009"), "the next circular is 009 (the rollback left no hole)", r9.value ?? r9.error?.message);
  } finally {
    await cleanup(db).catch(() => {});
    await db.end();
  }
}
