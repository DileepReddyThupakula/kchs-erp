// DEMO timetable: a conflict-free weekly timetable for every section of the
// current academic year, built from the demo teacher assignments, plus one
// demo substitution. Rows are marked is_demo so only they are removed.
//   npm run seed:demo-timetable            (skips if demo entries exist)
//   npm run wipe:demo-timetable -- --yes   (removes ONLY demo timetable data)
// Also sets periods_per_week on DEMO teachers' assignments where it is empty
// (the weekly target the timetable is checked against).
// Needs DATABASE_URL. Uses the default bell schedule (8 periods, Mon-Sat).
import { pathToFileURL } from "node:url";
import pg from "pg";

// weekly periods per subject code, by class band (demo values)
const PRE = { TEL: 6, ENG: 6, MAT: 6, GA: 4, RHY: 4, DRW: 4, ACE: 2, WCE: 2, PHE: 3, VELS: 2 };
const LOW = { TEL: 8, ENG: 8, MAT: 8, ACE: 3, WCE: 3, PHE: 3, VELS: 2 };
const MID = { ...LOW, EVS: 6 };
const HIGH = { TEL: 6, HIN: 5, ENG: 6, MAT: 7, PS: 5, BS: 4, SS: 5, ACE: 2, WCE: 2, PHE: 2, VELS: 2 };
function bandFor(cls) {
  if (["Nursery", "LKG", "UKG"].includes(cls)) return PRE;
  const n = Number(cls.replace("Class ", ""));
  return n <= 2 ? LOW : n <= 5 ? MID : HIGH;
}

// small deterministic PRNG so the demo timetable is the same every time
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemoTimetable() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set (.env.local)");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  // DRY_RUN=1 with TEST_PRE_MIGRATION=<file>: run the unapplied migration and the
  // whole seed inside one transaction, report, and roll everything back.
  const dry = process.env.DRY_RUN === "1";
  try {
    if (dry) {
      await db.query("begin");
      if (process.env.TEST_PRE_MIGRATION) await db.query((await import("node:fs")).readFileSync(process.env.TEST_PRE_MIGRATION, "utf8"));
    }
    const { rows: has } = await db.query("select to_regclass('public.timetable_entries') as t");
    if (!has[0].t) return console.log("Timetable tables not found: apply the timetable migration first.");
    const { rows: done } = await db.query("select count(*)::int n from public.timetable_entries where is_demo");
    if (done[0].n > 0) return console.log(`Demo timetable already present (${done[0].n} entries). Wipe first to reseed.`);
    const { rows: y } = await db.query("select id, name from public.academic_years where is_current");
    if (!y.length) throw new Error("No current academic year");
    const { rows: periods } = await db.query(
      `select p.period_no from public.bell_periods p join public.bell_schedules b on b.id = p.schedule_id where b.is_default and p.kind = 'teaching' order by 1`,
    );
    const P = periods.map((r) => r.period_no);
    const DAYS = [1, 2, 3, 4, 5, 6];
    const { rows: secs } = await db.query(
      `select s.id, s.name, c.name as cls, c.sort_order from public.sections s join public.classes c on c.id = s.class_id
       where s.academic_year_id = $1 order by c.sort_order`,
      [y[0].id],
    );
    const { rows: asg } = await db.query(
      `select a.id, a.section_id, a.subject_id, a.staff_id, su.code, st.employee_code
       from public.teacher_assignments a join public.subjects su on su.id = a.subject_id join public.staff st on st.id = a.staff_id
       where st.employee_code like 'DEMO-%'`,
    );
    const busy = new Set(); // staffId|day|period
    const rows = [];
    const rand = rng(20261016);
    let short = 0;
    // sections with the most shared teachers first (high school), then the rest
    const order = [...secs].sort((a, b) => b.sort_order - a.sort_order);
    for (const sec of order) {
      const band = bandFor(sec.cls);
      const units = asg
        .filter((a) => a.section_id === sec.id && band[a.code])
        .map((a) => ({ ...a, left: band[a.code] }));
      const grid = new Map(); // day|period -> entry
      const dayHas = new Map(); // subject|day -> count
      const place = (u) => {
        let best = null;
        for (const d of DAYS) {
          for (const p of P) {
            if (grid.has(`${d}|${p}`) || busy.has(`${u.staff_id}|${d}|${p}`)) continue;
            let score = rand() * 2;
            score += (dayHas.get(`${u.subject_id}|${d}`) ?? 0) * 10;
            const prev = grid.get(`${d}|${p - 1}`);
            if (prev && prev.subject_id === u.subject_id) score += 4;
            if (!best || score < best.score) best = { d, p, score };
          }
        }
        if (!best) return false;
        grid.set(`${best.d}|${best.p}`, { section_id: sec.id, weekday: best.d, period_no: best.p, subject_id: u.subject_id, teacher_id: u.staff_id, activity: null });
        busy.add(`${u.staff_id}|${best.d}|${best.p}`);
        dayHas.set(`${u.subject_id}|${best.d}`, (dayHas.get(`${u.subject_id}|${best.d}`) ?? 0) + 1);
        return true;
      };
      // round-robin: one period of each subject at a time spreads them over the week
      let progress = true;
      while (progress) {
        progress = false;
        for (const u of [...units].sort((a, b) => b.left - a.left)) {
          if (u.left > 0) {
            if (place(u)) {
              progress = true;
              u.left -= 1;
            } else {
              short += u.left;
              u.left = 0;
            }
          }
        }
      }
      // fill the rest: Games x2 (different days), Library x2, then Free
      const free = [];
      for (const d of DAYS) for (const p of P) if (!grid.has(`${d}|${p}`)) free.push([d, p]);
      const fill = [];
      for (const [label, n] of [["Games", 2], ["Library", 2]]) {
        for (let i = 0; i < n; i++) fill.push(label);
      }
      const daysUsed = new Set();
      const pick = (label) => {
        // prefer a day where this activity is not yet used
        let idx = free.findIndex(([d]) => !daysUsed.has(`${label}|${d}`));
        if (idx < 0) idx = 0;
        return free.splice(idx, 1)[0];
      };
      for (const label of fill) {
        if (!free.length) break;
        const [d, p] = pick(label);
        daysUsed.add(`${label}|${d}`);
        grid.set(`${d}|${p}`, { section_id: sec.id, weekday: d, period_no: p, subject_id: null, teacher_id: null, activity: label });
      }
      for (const [d, p] of free) grid.set(`${d}|${p}`, { section_id: sec.id, weekday: d, period_no: p, subject_id: null, teacher_id: null, activity: "Free" });
      for (const e of grid.values()) rows.push(e);
      // weekly targets for demo assignments that have none yet
      for (const u of asg.filter((a) => a.section_id === sec.id && band[a.code])) {
        await db.query("update public.teacher_assignments set periods_per_week = $2 where id = $1 and periods_per_week is null", [u.id, band[u.code]]);
      }
    }
    if (!dry) await db.query("begin");
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const vals = [];
      const params = [];
      chunk.forEach((r, j) => {
        const b = j * 6;
        vals.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, true)`);
        params.push(r.section_id, r.weekday, r.period_no, r.subject_id, r.teacher_id, r.activity);
      });
      await db.query(
        `insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id, activity, is_demo) values ${vals.join(",")}`,
        params,
      );
    }
    if (!dry) await db.query("commit");

    // one demo substitution on the next school day: first teacher with a P2 class, covered by a free teacher
    const { rows: nd } = await db.query(
      `select to_char(d, 'YYYY-MM-DD') as day from generate_series(app.today_ist() + 1, app.today_ist() + 14, interval '1 day') d
       where app.is_school_day($1, d::date) order by 1 limit 1`,
      [y[0].id],
    );
    let subNote = "";
    if (nd.length) {
      const day = nd[0].day;
      const wd = Number(
        (await db.query("select extract(isodow from $1::date)::int as w", [day])).rows[0].w,
      );
      const { rows: cand } = await db.query(
        `select e.section_id, e.period_no, e.teacher_id from public.timetable_entries e
         where e.is_demo and e.weekday = $1 and e.period_no = 2 and e.teacher_id is not null order by e.section_id limit 1`,
        [wd],
      );
      if (cand.length) {
        const { rows: free } = await db.query(
          `select s.id from public.staff s
           where s.employee_code like 'DEMO-T%' and s.id <> $2
             and not exists (select 1 from public.timetable_entries e where e.teacher_id = s.id and e.weekday = $1 and e.period_no = 2)
           order by s.employee_code limit 1`,
          [wd, cand[0].teacher_id],
        );
        if (free.length) {
          await db.query(
            `insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id, reason, is_demo)
             values ($1, $2, 2, $3, $4, 'Demo: teacher on leave', true)`,
            [day, cand[0].section_id, cand[0].teacher_id, free[0].id],
          );
          subNote = ` and 1 demo substitution on ${day}`;
        }
      }
    }
    if (dry) {
      const { rows: q } = await db.query(
        `select (select count(*) from public.timetable_entries where is_demo) entries,
                (select count(*) from public.timetable_period_counts where status = 'under') under_,
                (select count(*) from public.timetable_period_counts where status = 'over') over_,
                (select count(*) from public.timetable_period_counts where status = 'ok') ok_`,
      );
      console.log("DRY RUN (rolled back):", q[0]);
      await db.query("rollback");
    }
    console.log(`Demo timetable: ${rows.length} entries for ${secs.length} sections${subNote}.${short ? ` (${short} subject periods could not be placed)` : ""}`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

export async function wipeDemoTimetable() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: has } = await db.query("select to_regclass('public.timetable_entries') as t");
    if (!has[0].t) return console.log("Timetable tables not found: nothing to wipe.");
    // demo substitutions, plus any substitution (made by hand in the app) that points at a demo period
    const subs = await db.query(
      `delete from public.timetable_substitutions s
       where s.is_demo or exists (select 1 from public.timetable_entries e
                                  where e.is_demo and e.section_id = s.section_id and e.period_no = s.period_no
                                    and e.weekday = extract(isodow from s.sub_date))`,
    );
    const ent = await db.query("delete from public.timetable_entries where is_demo");
    console.log(`Removed ${ent.rowCount} demo timetable entries and ${subs.rowCount} demo substitutions. Bell schedules kept.`);
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === "seed") await seedDemoTimetable();
  else if (cmd === "wipe") {
    if (!process.argv.includes("--yes")) {
      console.error("This deletes the DEMO timetable. Re-run with: npm run wipe:demo-timetable -- --yes");
      process.exit(2);
    }
    await wipeDemoTimetable();
  } else {
    console.error("usage: demo-timetable.mjs seed | wipe --yes");
    process.exit(2);
  }
}
