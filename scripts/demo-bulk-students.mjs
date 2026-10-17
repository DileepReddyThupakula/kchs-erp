// DEMO bulk students: tops each class up to the school's real strength (439 in total) with dummy students, so lists,
// paging and search can be measured with a realistic number of rows. Every row is is_demo = true, admission no DEMO-BULK-...
//   npm run seed:demo-bulk                (skips classes already at strength; safe to re-run)
//   npm run wipe:demo-bulk -- --yes       (removes ONLY the DEMO-BULK students and their guardians)
import pg from "pg";
import { pathToFileURL } from "node:url";

const STRENGTH = { Nursery: 46, LKG: 36, UKG: 30, "Class 1": 32, "Class 2": 31, "Class 3": 28, "Class 4": 23, "Class 5": 16, "Class 6": 37, "Class 7": 46, "Class 8": 37, "Class 9": 40, "Class 10": 37 };
const SURNAMES = ["Gandluri", "Pasupuleti", "Kommu", "Bandi", "Chinthala", "Dasari", "Gangireddy", "Kalluri", "Mandla", "Nallapu", "Obulreddy", "Pothula", "Ramireddy", "Sanapala", "Talari", "Vemula", "Gajjala", "Kuruva", "Madduri", "Shaik", "Syed", "Seelam", "Boya", "Vanga", "Yeduguri", "Mekala", "Lingala"];
const BOYS = ["Arjun", "Charan", "Karthik", "Sai Kiran", "Venkatesh", "Mahesh", "Ravi Teja", "Nikhil", "Praveen", "Harsha", "Sandeep", "Vamsi", "Abhiram", "Tarun", "Rohith", "Manoj", "Sathvik", "Yashwanth", "Akhil", "Bharath", "Pavan", "Naveen", "Lokesh", "Varun", "Dinesh", "Gopi", "Raghav", "Teja"];
const GIRLS = ["Ananya", "Bhavya", "Deepika", "Harika", "Keerthi", "Lahari", "Meghana", "Navya", "Pooja", "Sahithi", "Sravya", "Tejaswini", "Varshini", "Yamini", "Akshaya", "Bhargavi", "Charitha", "Divya", "Hasini", "Jahnavi", "Kavya", "Likhitha", "Mounika", "Nandini", "Pranavi", "Rishitha", "Sindhu", "Vaishnavi", "Vennela", "Sneha"];
const FATHERS = ["Srinivasa Rao", "Venkata Ramana", "Nagaraju", "Subba Reddy", "Ramesh", "Suresh", "Chandra Sekhar", "Prasad", "Krishna Murthy", "Siva Kumar", "Narayana", "Obulesu", "Sudhakar", "Madhusudhan"];
const MOTHERS = ["Lakshmi", "Padma", "Sujatha", "Radha", "Saraswathi", "Vijaya", "Kalpana", "Sunitha", "Madhavi", "Aruna", "Swarupa", "Rani", "Jyothi", "Sailaja"];
const STREETS = ["Vempalli Road", "Gandhi Nagar", "Station Road", "Kamalapuram Road", "Nehru Street", "Ambedkar Colony", "Ganesh Nagar", "Bazar Street"];

export async function seedBulk() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: yr } = await db.query("select id from public.academic_years where is_current");
    if (!yr.length) throw new Error("No current academic year");
    const { rows: secs } = await db.query(
      `select s.id, c.name cls, c.sort_order from public.sections s join public.classes c on c.id = s.class_id where s.academic_year_id = $1 order by c.sort_order, s.name`, [yr[0].id]);
    const first = new Map();
    for (const s of secs) if (!first.has(s.cls)) first.set(s.cls, s);
    let added = 0;
    for (const [cls, sec] of first) {
      const want = STRENGTH[cls];
      if (!want) continue;
      const have = (await db.query("select count(*)::int n, coalesce(max(roll_no),0)::int mx from public.student_enrollments e join public.sections s on s.id = e.section_id where s.class_id = (select class_id from public.sections where id = $1) and e.academic_year_id = $2", [sec.id, yr[0].id])).rows[0];
      const clsNo = String(sec.sort_order).padStart(2, "0");
      for (let i = 1; have.n + i - 1 < want; i++) {
        const girl = i % 2 === 0;
        const k = i * 7 + sec.sort_order * 13;
        const name = `${(girl ? GIRLS : BOYS)[k % (girl ? GIRLS : BOYS).length]} ${SURNAMES[(k * 3) % SURNAMES.length]}`;
        const addr = `${(k % 40) + 1}-${(k % 17) + 1}, ${STREETS[k % STREETS.length]}, Yerraguntla`;
        const phone = `9${String(100000000 + ((k * 7919 + sec.sort_order * 104729) % 899999999)).padStart(9, "0")}`;
        const dob = `${2026 - 3 - Math.max(0, sec.sort_order) - (cls === "Nursery" ? 0 : 1)}-${String((k % 12) + 1).padStart(2, "0")}-${String((k % 27) + 1).padStart(2, "0")}`;
        await db.query(
          `with st as (insert into public.students (admission_no, full_name, gender, date_of_birth, admission_date, address, village_town, district, pincode, is_demo)
                       values ($1,$2,$3,$4,'2022-06-01',$5,'Yerraguntla','YSR Kadapa','516309',true) returning id),
                f as (insert into public.guardians (full_name, phone, occupation, address, pincode, is_demo) values ($6,$7,'Farmer',$5,'516309',true) returning id),
                m as (insert into public.guardians (full_name, phone, occupation, address, pincode, is_demo) values ($8,null,'Homemaker',$5,'516309',true) returning id),
                l as (insert into public.student_guardians (student_id, guardian_id, relation, is_primary) select st.id, f.id, 'father', true from st, f union all select st.id, m.id, 'mother', false from st, m)
           insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) select st.id, $9, $10, $11 from st`,
          [`DEMO-BULK-${clsNo}-${String(i).padStart(3, "0")}`, name, girl ? "female" : "male", dob, addr, `${FATHERS[k % FATHERS.length]} ${name.split(" ").slice(-1)[0]}`, phone, `${MOTHERS[(k * 5) % MOTHERS.length]} ${name.split(" ").slice(-1)[0]}`, yr[0].id, sec.id, have.mx + i],
        );
        added++;
      }
      console.log(`${cls}: ${want} students`);
    }
    console.log(`Added ${added} demo students (DEMO-BULK-...).`);
  } finally {
    await db.end();
  }
}

export async function wipeBulk() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("delete from public.student_fee_dues where student_id in (select id from public.students where admission_no like 'DEMO-BULK-%')");
    const s = await db.query("delete from public.students where is_demo and admission_no like 'DEMO-BULK-%'");
    const g = await db.query("delete from public.guardians g where g.is_demo and not exists (select 1 from public.student_guardians sg where sg.guardian_id = g.id)");
    await db.query("commit");
    console.log(`Removed ${s.rowCount} bulk demo students and ${g.rowCount} guardians.`);
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "wipe") {
    if (!process.argv.includes("--yes")) console.error("Re-run with: npm run wipe:demo-bulk -- --yes");
    else await wipeBulk();
  } else await seedBulk();
}
