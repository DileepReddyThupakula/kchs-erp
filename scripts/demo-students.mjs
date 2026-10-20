// DEMO students: ~60 dummy students across the current year's sections.
// Every row is marked is_demo = true; admission numbers start with DEMO-;
// IDs are obviously fake (Aadhaar 9999…, PEN DEMO-PEN-…, Child ID DEMO-CID-…).
//   npm run seed:demo-students                 (safe to re-run: skips if present)
//   npm run wipe:demo-students -- --yes        (removes ONLY demo students)
// Needs DATABASE_URL (rows, encrypted IDs) and Supabase URL + service key
// (placeholder document files in private storage).
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { wipeDemoFees } from "./demo-fees.mjs";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("demo-students.mjs");

const SURNAMES = [
  "Gandluri", "Pasupuleti", "Kommu", "Bandi", "Chinthala", "Dasari", "Gangireddy", "Kalluri", "Mandla", "Nallapu",
  "Obulreddy", "Pothula", "Ramireddy", "Sanapala", "Talari", "Vemula", "Yerrapu", "Bommisetty", "Gajjala", "Jangam",
  "Kuruva", "Madduri", "Nadimpalli", "Peddireddy", "Rachamallu", "Sirigiri", "Thummala", "Uppara", "Akkala", "Boya",
  "Eddula", "Galla", "Inukonda", "Kanchi", "Lingala", "Mekala", "Nalla", "Seelam", "Vanga", "Yeduguri",
  "Shaik", "Syed", "Pathan", "Joseph", "Thomas",
];
const BOYS = ["Arjun", "Charan", "Karthik", "Sai Kiran", "Venkatesh", "Mahesh", "Ravi Teja", "Nikhil", "Praveen", "Harsha", "Sandeep", "Vamsi", "Abhiram", "Tarun", "Rohith", "Manoj", "Sathvik", "Yashwanth", "Akhil", "Bharath", "Pavan", "Naveen", "Lokesh", "Siddharth", "Kalyan", "Varun", "Dinesh", "Gopi", "Raghav", "Teja"];
const GIRLS = ["Ananya", "Bhavya", "Deepika", "Harika", "Keerthi", "Lahari", "Meghana", "Navya", "Pooja", "Sahithi", "Sravya", "Tejaswini", "Varshini", "Yamini", "Akshaya", "Bhargavi", "Charitha", "Divya", "Hasini", "Jahnavi", "Kavya", "Likhitha", "Mounika", "Nandini", "Pranavi", "Rishitha", "Sindhu", "Vaishnavi", "Vennela", "Sneha"];
const FATHERS = ["Srinivasa Rao", "Venkata Ramana", "Nagaraju", "Subba Reddy", "Ramesh", "Suresh", "Chandra Sekhar", "Prasad", "Krishna Murthy", "Siva Kumar", "Narayana", "Obulesu", "Ramanjaneyulu", "Sudhakar", "Madhusudhan"];
const MOTHERS = ["Lakshmi", "Padma", "Sujatha", "Radha", "Saraswathi", "Vijaya", "Kalpana", "Sunitha", "Madhavi", "Aruna", "Swarupa", "Rani", "Jyothi", "Hymavathi", "Sailaja"];
const MUSLIM = { boys: ["Imran", "Sameer", "Arif"], girls: ["Ayesha", "Fathima", "Sana"], fathers: ["Khaja Hussain", "Mahaboob Basha", "Rafi"], mothers: ["Shabana", "Nasreen", "Reshma"] };
const STREETS = ["Vempalli Road", "Gandhi Nagar", "Station Road", "Kamalapuram Road", "Nehru Street", "Ambedkar Colony", "Ganesh Nagar", "Bazar Street"];
const OCCUPATIONS = ["Farmer", "Shopkeeper", "Driver", "Teacher", "Mason", "Electrician", "Govt. employee", "Tailor", "Daily wage worker", "Business"];
const CASTE_CATEGORIES = ["OC", "BC-A", "BC-B", "BC-C", "BC-D", "BC-E", "SC", "ST"];
const UDISE_CATEGORY = { OC: "General", SC: "SC", ST: "ST" };
const BLOOD = ["A+", "B+", "O+", "AB+", "O-", "B-"];
// students per class (sums to 60)
const PER_CLASS = { Nursery: 5, LKG: 5, UKG: 4, "Class 1": 5, "Class 2": 5, "Class 3": 4, "Class 4": 4, "Class 5": 4, "Class 6": 5, "Class 7": 5, "Class 8": 5, "Class 9": 5, "Class 10": 4 };

const pad = (n, w = 4) => String(n).padStart(w, "0");
const pick = (arr, i) => arr[i % arr.length];

/** Deterministic demo dataset: families first (15 with two children = siblings). */
export function buildDemoStudents(classOrder) {
  const slots = [];
  for (const [cls, n] of Object.entries(PER_CLASS)) for (let i = 0; i < n; i++) slots.push(cls);
  // 45 families: the first 15 have two children placed in different classes
  const families = SURNAMES.map((surname, f) => {
    const muslim = surname === "Shaik" || surname === "Syed" || surname === "Pathan";
    const christian = surname === "Joseph" || surname === "Thomas";
    const cc = muslim ? "BC-E" : christian ? "SC" : pick(CASTE_CATEGORIES, f * 3);
    return {
      f,
      surname,
      muslim,
      christian,
      casteCategory: cc,
      father: `${surname} ${muslim ? pick(MUSLIM.fathers, f) : pick(FATHERS, f)}`,
      mother: `${surname} ${muslim ? pick(MUSLIM.mothers, f) : pick(MOTHERS, f + 4)}`,
      phone: `90001${pad(f * 2 + 10, 5)}`,
      phone2: `90002${pad(f * 2 + 11, 5)}`,
      address: `D.No ${10 + f}-${(f % 9) + 1}-${20 + f * 3}, ${pick(STREETS, f)}, Yerraguntla`,
      occupation: pick(OCCUPATIONS, f),
    };
  });
  const children = [];
  families.forEach((fam) => children.push(fam));
  families.slice(0, 15).forEach((fam) => children.push(fam)); // second child
  // slot i (classes in order) gets child i: first-borns fill Nursery…Class 7,
  // second children of families 0–14 fill Class 7…10, so siblings never share a class
  return slots.map((cls, i) => {
    const fam = children[i];
    const isSecond = i >= families.length;
    const girl = (i + (isSecond ? 1 : 0)) % 2 === 1;
    const given = fam.muslim ? pick(girl ? MUSLIM.girls : MUSLIM.boys, i) : pick(girl ? GIRLS : BOYS, i * 5 + fam.f);
    const order = classOrder[cls] ?? 0;
    const birthYear = 2026 - (3 + order);
    const n = i + 1;
    const missingGov = n % 9 === 0; // a few incomplete records for the "missing fields" filter
    return {
      n,
      family: fam,
      cls,
      admission_no: `DEMO-${pad(n)}`,
      full_name: `${fam.surname} ${given}`,
      gender: girl ? "female" : "male",
      date_of_birth: `${birthYear}-${pad(((n * 5) % 12) + 1, 2)}-${pad(((n * 11) % 27) + 1, 2)}`,
      admission_date: `${Math.max(2020, birthYear + 3)}-06-${pad((n % 20) + 1, 2)}`,
      aadhaar: missingGov ? null : `9999${pad(n, 8)}`,
      ration: n % 3 === 0 ? `DEMORC${pad(n, 6)}` : null,
      details: Object.fromEntries(
        Object.entries({
          name_as_per_aadhaar: `${fam.surname} ${given}`.toUpperCase(),
          child_id: `DEMO-CID-${pad(n)}`,
          pen: `DEMO-PEN-${pad(n)}`,
          nationality: "Indian",
          blood_group: pick(BLOOD, n),
          identification_mark_1: n % 2 ? "A mole on the right hand" : "A scar on the left knee",
          social_category: missingGov ? undefined : UDISE_CATEGORY[fam.casteCategory] ?? "OBC",
          caste_category: missingGov ? undefined : fam.casteCategory,
          caste: missingGov ? undefined : "DEMO caste",
          religion: fam.muslim ? "Muslim" : fam.christian ? "Christian" : "Hindu",
          mother_tongue: fam.muslim ? "Urdu" : "Telugu",
          first_language: order <= 2 ? "English" : "Telugu",
          second_language: order >= 8 ? "Hindi" : "English",
          rte_admission: n % 10 === 0,
          cwsn: n === 17,
          impairment_type: n === 17 ? "Low vision" : undefined,
          prev_year_status: order === 0 ? "Anganwadi / ECCE" : "Same school",
          facilities_received: order >= 3 ? ["Free textbooks", "Uniform", "Mid-day meal"] : undefined,
        }).filter(([, v]) => v !== undefined),
      ),
      hasDocs: n % 4 !== 0, // every 4th student is missing documents
    };
  });
}

export async function seedDemoStudents() {
  const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!DATABASE_URL || !url || !key) throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)");
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const { rows: existing } = await db.query("select count(*)::int as n from public.students where is_demo");
    if (existing[0].n > 0) {
      console.log(`Demo students already present (${existing[0].n}); nothing to do. Wipe first to reseed.`);
      return;
    }
    const { rows: yr } = await db.query("select id, name from public.academic_years where is_current");
    if (!yr.length) throw new Error("No current academic year (run npm run seed:school first)");
    const { rows: secs } = await db.query(
      `select s.id, c.name as class_name, c.sort_order from public.sections s join public.classes c on c.id = s.class_id
       where s.academic_year_id = $1 order by c.sort_order, s.name`,
      [yr[0].id],
    );
    const sectionOf = {};
    for (const s of secs) sectionOf[s.class_name] ??= s.id;
    const classOrder = Object.fromEntries(secs.map((s) => [s.class_name, s.sort_order]));
    const students = buildDemoStudents(classOrder);

    await db.query("begin");
    const guardianIds = new Map();
    for (const st of students) {
      const fam = st.family;
      if (!guardianIds.has(fam.f)) {
        const g1 = await db.query(
          `insert into public.guardians (full_name, phone, alt_phone, occupation, address, pincode, is_demo) values ($1,$2,$3,$4,$5,'516309',true) returning id`,
          [fam.father, fam.phone, fam.phone2, fam.occupation, fam.address],
        );
        const g2 = await db.query(
          `insert into public.guardians (full_name, phone, occupation, address, pincode, is_demo) values ($1,$2,'Homemaker',$3,'516309',true) returning id`,
          [fam.mother, fam.phone2, fam.address],
        );
        guardianIds.set(fam.f, [g1.rows[0].id, g2.rows[0].id]);
      }
      const { rows } = await db.query(
        `insert into public.students (admission_no, full_name, gender, date_of_birth, admission_date, address, village_town, district, pincode, is_demo)
         values ($1,$2,$3,$4,$5,$6,'Yerraguntla','YSR Kadapa','516309',true) returning id`,
        [st.admission_no, st.full_name, st.gender, st.date_of_birth, st.admission_date, fam.address],
      );
      st.id = rows[0].id;
      const [father, mother] = guardianIds.get(fam.f);
      await db.query(
        `insert into public.student_guardians (student_id, guardian_id, relation, is_primary) values ($1,$2,'father',true), ($1,$3,'mother',false)`,
        [st.id, father, mother],
      );
      await db.query(`insert into public.student_profiles (student_id, details) values ($1, $2)`, [st.id, st.details]);
      if (st.aadhaar) await db.query(`select app.store_secure_value($1, 'aadhaar_no', $2)`, [st.id, st.aadhaar]);
      if (st.ration) await db.query(`select app.store_secure_value($1, 'ration_card_no', $2)`, [st.id, st.ration]);
      const sectionId = sectionOf[st.cls];
      if (sectionId) {
        await db.query(`insert into public.student_enrollments (student_id, academic_year_id, section_id) values ($1,$2,$3)`, [st.id, yr[0].id, sectionId]);
      }
    }
    // roll numbers: alphabetical within each section
    await db.query(`
      update public.student_enrollments e set roll_no = r.rn
      from (select e2.id, row_number() over (partition by e2.section_id order by s.full_name) as rn
            from public.student_enrollments e2 join public.students s on s.id = e2.student_id
            where e2.academic_year_id = $1) r
      where e.id = r.id and e.roll_no is null`, [yr[0].id]);
    await db.query("commit");

    // placeholder documents (tiny PDFs saying DEMO) for most students
    const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from("student-documents");
    const pdf = Buffer.from(
      "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 40 40 Td (DEMO DOCUMENT) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    );
    let docs = 0;
    for (const st of students.filter((s) => s.hasDocs)) {
      for (const type of ["birth_certificate", "aadhaar_copy"]) {
        const path = `${st.id}/${type}-demo.pdf`;
        const { error } = await storage.upload(path, pdf, { contentType: "application/pdf", upsert: true });
        if (error) throw new Error(`upload ${path}: ${error.message}`);
        await db.query(
          `insert into public.student_documents (student_id, doc_type, file_path, file_name, mime_type, size_bytes) values ($1,$2,$3,$4,'application/pdf',$5)`,
          [st.id, type, path, `${type}-demo.pdf`, pdf.length],
        );
        docs++;
      }
    }
    const siblings = students.filter((s) => s.n > SURNAMES.length).length;
    console.log(`Demo students: ${students.length} in ${yr[0].name} (${siblings} sibling pairs share guardians), ${docs} placeholder documents.`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

export async function wipeDemoStudents() {
  const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!DATABASE_URL || !url || !key) throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)");
  // fee data references students: remove demo fee data first
  await wipeDemoFees();
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query("select id from public.students where is_demo");
    // files first (private buckets), through the Storage API
    const storage = createClient(url, key, { auth: { persistSession: false } }).storage;
    for (const bucket of ["student-documents", "student-photos"]) {
      for (const { id } of rows) {
        const { data } = await storage.from(bucket).list(id);
        if (data?.length) await storage.from(bucket).remove(data.map((f) => `${id}/${f.name}`));
      }
    }
    await db.query("begin");
    await db.query("delete from public.student_fee_dues where student_id in (select id from public.students where is_demo)");
    const s = await db.query("delete from public.students where is_demo");
    const g = await db.query(
      "delete from public.guardians g where g.is_demo and not exists (select 1 from public.student_guardians sg where sg.guardian_id = g.id)",
    );
    await db.query("commit");
    console.log(`Removed ${s.rowCount} demo students and ${g.rowCount} demo guardians. Real students untouched.`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

const cmd = process.argv[2];
if (cmd === "seed") await seedDemoStudents();
if (cmd === "wipe") {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes all DEMO students (is_demo = true). Re-run with: npm run wipe:demo-students -- --yes");
    process.exit(2);
  }
  await wipeDemoStudents();
}
