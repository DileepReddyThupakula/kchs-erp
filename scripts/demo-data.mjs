// DUMMY data only. Names and phone numbers are invented.
// Every demo row is marked so `seed:wipe` can remove exactly these rows:
//   staff.employee_code starts with DEMO-   |   login emails end with @demo.kchs.test
export const DEMO_EMAIL_DOMAIN = "demo.kchs.test";
export const DEMO_CODE_PREFIX = "DEMO-";

const phone = (n) => `90000${String(n).padStart(5, "0")}`;

// 19 teachers + 1 ayah (matches the school's real staff counts), plus one
// Admin login and one "office duties" teacher login for trying the app.
export const DEMO_STAFF = [
  ["DEMO-ADM", "Demo Admin", "male", "Headmaster", "Administration", "admin", "admin"],
  ["DEMO-CS", "Demo Office Teacher", "female", "Teacher (office duties)", "Office", "teacher", "office"],
  ["DEMO-T01", "Ramesh Babu K", "male", "School Assistant (Mathematics)", "High School", "teacher", "teacher1"],
  ["DEMO-T02", "Padmavathi S", "female", "School Assistant (English)", "High School", "teacher", "teacher2"],
  ["DEMO-T03", "Venkata Subbaiah P", "male", "School Assistant (Physical Science)", "High School"],
  ["DEMO-T04", "Sujatha Devi G", "female", "School Assistant (Biological Science)", "High School"],
  ["DEMO-T05", "Narasimha Rao B", "male", "School Assistant (Social Studies)", "High School"],
  ["DEMO-T06", "Lakshmi Kantham V", "female", "Telugu Pandit", "Languages"],
  ["DEMO-T07", "Farzana Begum Sk", "female", "Hindi Pandit", "Languages"],
  ["DEMO-T08", "Srinivasulu Reddy C", "male", "School Assistant (Mathematics)", "High School"],
  ["DEMO-T09", "Anitha Kumari D", "female", "School Assistant (English)", "High School"],
  ["DEMO-T10", "Mallikarjuna T", "male", "Physical Education Teacher", "Co-curricular"],
  ["DEMO-T11", "Swathi N", "female", "Secondary Grade Teacher", "Primary"],
  ["DEMO-T12", "Bhavani Shankar R", "male", "Secondary Grade Teacher", "Primary"],
  ["DEMO-T13", "Kalyani P", "female", "Secondary Grade Teacher", "Primary"],
  ["DEMO-T14", "Harika M", "female", "Secondary Grade Teacher", "Primary"],
  ["DEMO-T15", "Siva Prasad A", "male", "Secondary Grade Teacher", "Primary"],
  ["DEMO-T16", "Yamuna Rani K", "female", "Pre-primary Teacher", "Pre-primary"],
  ["DEMO-T17", "Divya Sree J", "female", "Pre-primary Teacher", "Pre-primary"],
  ["DEMO-T18", "Chandrakala L", "female", "Pre-primary Teacher", "Pre-primary"],
  ["DEMO-T19", "Raghavendra G", "male", "Computer / Work Education Teacher", "Co-curricular"],
  ["DEMO-AY1", "Venkatamma", "female", "Ayah", "Support"],
].map(([employee_code, full_name, gender, designation, department, app_role = null, login = null], i) => ({
  row: {
    employee_code,
    full_name,
    gender,
    designation,
    department,
    phone: phone(i + 1),
    date_of_joining: `20${String(10 + (i % 14)).padStart(2, "0")}-06-${String(1 + (i % 27)).padStart(2, "0")}`,
    qualification: designation.startsWith("School Assistant") ? "M.Sc., B.Ed." : designation === "Ayah" ? null : "B.A., B.Ed.",
    status: "active",
  },
  app_role,
  email: login ? `${login}@${DEMO_EMAIL_DOMAIN}` : null,
}));

/** Duties for demo teachers (employee code -> duties). */
export const DEMO_DUTIES = {
  "DEMO-CS": ["fee_collection", "student_records", "timetable_edit", "all_class_attendance", "notices_diary"],
};

/**
 * Demo class teachers (class name -> employee code) and subject teachers.
 * Pre-primary and primary class teachers teach all their class's subjects.
 */
export const DEMO_CLASS_TEACHERS = {
  Nursery: "DEMO-T16", LKG: "DEMO-T17", UKG: "DEMO-T18",
  "Class 1": "DEMO-T11", "Class 2": "DEMO-T12", "Class 3": "DEMO-T13", "Class 4": "DEMO-T14", "Class 5": "DEMO-T15",
  "Class 6": "DEMO-T06", "Class 7": "DEMO-T07", "Class 8": "DEMO-T02", "Class 9": "DEMO-T01", "Class 10": "DEMO-T03",
};
const HIGH = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
/** subject code -> (class name -> employee code); anything unlisted goes to the class teacher. */
export const DEMO_SUBJECT_TEACHERS = {
  TEL: Object.fromEntries(HIGH.map((c) => [c, "DEMO-T06"])),
  HIN: Object.fromEntries(HIGH.map((c) => [c, "DEMO-T07"])),
  ENG: { "Class 6": "DEMO-T09", "Class 7": "DEMO-T09", "Class 8": "DEMO-T02", "Class 9": "DEMO-T02", "Class 10": "DEMO-T02" },
  MAT: { "Class 6": "DEMO-T08", "Class 7": "DEMO-T08", "Class 8": "DEMO-T01", "Class 9": "DEMO-T01", "Class 10": "DEMO-T01" },
  PS: Object.fromEntries(HIGH.map((c) => [c, "DEMO-T03"])),
  BS: Object.fromEntries(HIGH.map((c) => [c, "DEMO-T04"])),
  SS: Object.fromEntries(HIGH.map((c) => [c, "DEMO-T05"])),
  PHE: Object.fromEntries(["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", ...HIGH].map((c) => [c, "DEMO-T10"])),
  WCE: Object.fromEntries(["Class 3", "Class 4", "Class 5", ...HIGH].map((c) => [c, "DEMO-T19"])),
};
