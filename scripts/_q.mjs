import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
// today's timetable: a Class 2 teacher period 1 (morning marker) and a free demo teacher
const r = await c.query(`
 select e.section_id, e.teacher_id, st.full_name orig, sec.name, cl.name cls
 from public.timetable_entries e join public.staff st on st.id=e.teacher_id
 join public.sections sec on sec.id=e.section_id join public.classes cl on cl.id=sec.class_id
 where e.weekday = extract(isodow from app.today_ist()) and e.period_no=1 and e.teacher_id is not null and cl.name='Class 3'
   and not exists (select 1 from public.attendance_sessions a where a.section_id=e.section_id and a.att_date=app.today_ist() and a.session='morning')`);
console.log(r.rows);
const f = await c.query(`select s.employee_code, s.full_name, s.user_id is not null as has_login from public.staff s where s.employee_code in ('DEMO-T02','DEMO-CS','DEMO-T01')`);
console.log(f.rows);
await c.end();
