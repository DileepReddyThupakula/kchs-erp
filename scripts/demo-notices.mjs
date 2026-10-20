// DEMO notices and diary: about two weeks of diary entries for several
// sections, and 6 notices (all staff + important, teachers only, two
// classes, named teachers, one expired, one draft) with a few read receipts.
// Everything is created through the real checked functions as the demo
// Admin, then marked is_demo so only it is removed.
//   npm run seed:demo-notices            (skips if demo notices exist)
//   npm run wipe:demo-notices -- --yes   (removes ONLY demo notices + diary)
// Needs DATABASE_URL and the demo logins (seed:demo).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("demo-notices.mjs");

const HOMEWORK = {
  TEL: ["Telugu: read lesson 5 aloud and write the meanings of 10 words.", "Telugu: copy the poem on page 32 neatly.", "Telugu: answer questions 1 to 4 at the end of the lesson."],
  ENG: ["English: write 5 sentences using the new words from Unit 4.", "English: learn the spellings given in class; dictation tomorrow.", "English: read the story on page 41 and answer in your notebook."],
  HIN: ["Hindi: write the alphabet practice page 18.", "Hindi: learn the new words and their meanings."],
  MAT: ["Maths: exercise 4.2, sums 1 to 8.", "Maths: learn the tables of 7 and 8.", "Maths: revise the formulas and solve the worksheet.", "Maths: complete the fractions worksheet."],
  EVS: ["EVS: draw and label the parts of a plant.", "EVS: collect 5 leaves and paste them in the notebook."],
  PS: ["Physical Science: learn the definitions on page 56.", "Physical Science: solve the numericals given in class."],
  BS: ["Biological Science: draw the diagram of the human heart.", "Biological Science: write short answers 1 to 5."],
  SS: ["Social Studies: read the lesson on the Mauryan empire and mark the map.", "Social Studies: write the answers to the in-text questions."],
  WCE: ["Work Education: bring chart paper for the project tomorrow."],
  ACE: ["Art: complete the drawing started in class."],
};
const REMARKS = ["Please sign the progress remark in the diary.", "Bring the signed diary tomorrow.", "Test on the completed portion tomorrow."];

export async function seedDemoNotices() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set (.env.local)");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const dry = process.env.DRY_RUN === "1";
  try {
    if (dry) {
      await db.query("begin");
      if (process.env.TEST_PRE_MIGRATION) await db.query(readFileSync(process.env.TEST_PRE_MIGRATION, "utf8"));
    }
    const { rows: has } = await db.query("select to_regclass('public.notices') as t");
    if (!has[0].t) return console.log("Notices tables not found: apply the notices migration first.");
    const { rows: done } = await db.query("select (select count(*) from public.notices where is_demo)::int + (select count(*) from public.diary_entries where is_demo)::int n");
    if (done[0].n > 0) return console.log(`Demo notices/diary already present (${done[0].n} rows). Wipe first to reseed.`);
    const { rows: y } = await db.query("select id, name from public.academic_years where is_current");
    if (!y.length) throw new Error("No current academic year");
    const { rows: users } = await db.query("select employee_code, id, user_id from public.staff where employee_code in ('DEMO-ADM','DEMO-T01','DEMO-T02','DEMO-T08') ");
    const by = Object.fromEntries(users.map((u) => [u.employee_code, u]));
    if (!by["DEMO-ADM"]?.user_id) throw new Error("Demo admin login missing (run seed:demo)");

    const as = async (userId, fn) => {
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      try {
        return await fn();
      } finally {
        await db.query("select set_config('request.jwt.claims', '', false)").catch(() => {});
      }
    };
    const adminId = by["DEMO-ADM"].user_id;

    const { rows: secs } = await db.query(
      `select s.id, s.class_id, c.name cls, c.sort_order from public.sections s join public.classes c on c.id = s.class_id where s.academic_year_id = $1 order by c.sort_order`,
      [y[0].id],
    );
    const { rows: subj } = await db.query(
      `select cs.class_id, su.id subject_id, su.code from public.class_subjects cs join public.subjects su on su.id = cs.subject_id where cs.academic_year_id = $1 and su.type = 'scholastic'`,
      [y[0].id],
    );
    const { rows: days } = await db.query(
      `select to_char(d, 'YYYY-MM-DD') as day from generate_series(app.today_ist() - 13, app.today_ist(), interval '1 day') d where app.is_school_day($1, d::date) order by 1`,
      [y[0].id],
    );
    const chosen = secs.filter((s) => ["Class 1", "Class 2", "Class 3", "Class 5", "Class 6", "Class 8", "Class 9", "Class 10"].includes(s.cls));
    let n = 0;
    const entryIds = [];
    let k = 0;
    for (const { day } of days) {
      for (const sec of chosen) {
        const own = subj.filter((x) => x.class_id === sec.class_id && HOMEWORK[x.code]);
        const picks = [0, 1, 2].map((i) => own[(k + i * 2 + sec.sort_order) % Math.max(own.length, 1)]).filter(Boolean);
        const uniq = [...new Map(picks.map((p) => [p.subject_id, p])).values()];
        const items = uniq.map((p) => ({ subject_id: p.subject_id, body: HOMEWORK[p.code][(k + sec.sort_order) % HOMEWORK[p.code].length] }));
        if ((k + sec.sort_order) % 4 === 0) items.push({ subject_id: null, body: REMARKS[(k + sec.sort_order) % REMARKS.length] });
        if (!items.length) continue;
        const ids = await as(adminId, async () =>
          (await db.query("select public.save_diary_day($1::date, $2::uuid[], $3::jsonb, true) as ids", [day, [sec.id], JSON.stringify(items)])).rows[0].ids,
        );
        entryIds.push(...ids);
        n += ids.length;
      }
      k++;
    }
    // one draft entry (only Admin and the duty teachers see it)
    const draftIds = await as(adminId, async () =>
      (await db.query("select public.save_diary_day(app.today_ist(), $1::uuid[], $2::jsonb, false) as ids", [[chosen[0].id], JSON.stringify([{ subject_id: null, body: "Draft: PTM reminder to be sent after approval." }])])).rows[0].ids,
    );
    entryIds.push(...draftIds);

    // notices
    const { rows: cls } = await db.query("select id, name from public.classes where name in ('Class 9','Class 10')");
    const T = (code) => by[code]?.id;
    const notices = [
      { title: "Annual Day rehearsals from Monday", body: "All staff: rehearsals for the Annual Day start on Monday after lunch.\nClass teachers please send the participant lists to the office by Friday.\n\n- Principal", audience: "all", important: true, publish_date: -2, expires_on: 14, publish: true },
      { title: "Staff meeting on Saturday", body: "A teachers' meeting will be held on Saturday at 3:30 pm in the staff room.\nAgenda: unit tests, syllabus coverage, attendance.", audience: "roles", roles: ["teacher"], publish_date: -1, expires_on: 5, publish: true },
      { title: "Pre-final exam invigilation duty", body: "Teachers of Class 9 and Class 10: the invigilation chart is attached with the office copy.\nPlease collect question papers 15 minutes before each exam.", audience: "classes", class_ids: cls.map((c) => c.id), publish_date: -3, expires_on: 10, publish: true },
      { title: "Submit marks sheets by Friday", body: "Please submit the unit test marks sheets to the Headmaster's office by Friday 4 pm.", audience: "teachers", staff_ids: ["DEMO-T01", "DEMO-T02", "DEMO-T08"].map(T).filter(Boolean), publish_date: -1, expires_on: 4, publish: true },
      { title: "Expired: Sports day volunteers", body: "Volunteers for Sports Day are no longer needed. Thank you to everyone who offered.", audience: "all", publish_date: -20, expires_on: -5, publish: true },
      { title: "Draft: Fee reminder circular", body: "Fee reminder for parents. To be reviewed before publishing.", audience: "all", publish_date: 0, publish: false },
    ];
    const noticeIds = [];
    for (const nt of notices) {
      const payload = { title: nt.title, body: nt.body, audience: nt.audience, roles: nt.roles ?? [], class_ids: nt.class_ids ?? [], staff_ids: nt.staff_ids ?? [], important: !!nt.important };
      const id = await as(adminId, async () => {
        const r = await db.query("select public.save_notice(jsonb_build_object('title', $1::text, 'body', $2::text, 'audience', $3::text, 'roles', $4::jsonb, 'class_ids', $5::jsonb, 'staff_ids', $6::jsonb, 'important', $7::boolean, 'publish_date', (app.today_ist() + $8::int), 'expires_on', case when $9::int is null then null else (app.today_ist() + $9::int) end)) as id",
          [payload.title, payload.body, payload.audience, JSON.stringify(payload.roles), JSON.stringify(payload.class_ids), JSON.stringify(payload.staff_ids), payload.important, nt.publish_date, nt.expires_on ?? null]);
        const nid = r.rows[0].id;
        if (nt.publish) await db.query("select public.publish_notice($1)", [nid]);
        return nid;
      });
      noticeIds.push(id);
    }
    // a few read receipts
    const readers = [["DEMO-T01", [0, 3]], ["DEMO-T02", [0]], ["DEMO-T08", [1]]];
    for (const [code, idx] of readers) {
      const u = by[code];
      if (!u?.user_id) continue;
      for (const i of idx) await as(u.user_id, () => db.query("select public.mark_notice_read($1)", [noticeIds[i]]));
    }
    await db.query("update public.diary_entries set is_demo = true where id = any($1::uuid[])", [entryIds]);
    await db.query("update public.notices set is_demo = true where id = any($1::uuid[])", [noticeIds]);
    if (dry) {
      const { rows: q } = await db.query(
        `select (select count(*) from public.diary_entries where is_demo) diary, (select count(*) from public.notices where is_demo) notices,
                (select count(*) from public.notice_reads) reads, (select string_agg(circular_no, ', ' order by circular_seq) from public.notices where is_demo) numbers`,
      );
      console.log("DRY RUN (rolled back):", q[0]);
      await db.query("rollback");
    }
    console.log(`Demo diary: ${n} entries (+1 draft) over ${days.length} school days for ${chosen.length} sections; demo notices: ${notices.length}.`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

export async function wipeDemoNotices() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: has } = await db.query("select to_regclass('public.notices') as t");
    if (!has[0].t) return console.log("Notices tables not found: nothing to wipe.");
    const d = await db.query("delete from public.diary_entries where is_demo");
    const n = await db.query("delete from public.notices where is_demo");
    // give back the circular numbers the demo notices used (the series stays gap-free)
    await db.query(
      `update public.number_sequences q set last_value = coalesce((
         select max(n.circular_seq) from public.notices n join public.academic_years y on y.id = n.academic_year_id
         where 'circular:' || y.name = q.key), 0)
       where q.key like 'circular:%'`,
    );
    console.log(`Removed ${d.rowCount} demo diary entries and ${n.rowCount} demo notices (with attachments and read receipts). Circular numbering reset to the last real notice.`);
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === "seed") await seedDemoNotices();
  else if (cmd === "wipe") {
    if (!process.argv.includes("--yes")) {
      console.error("This deletes the DEMO notices and diary. Re-run with: npm run wipe:demo-notices -- --yes");
      process.exit(2);
    }
    await wipeDemoNotices();
  } else {
    console.error("usage: demo-notices.mjs seed | wipe --yes");
    process.exit(2);
  }
}
