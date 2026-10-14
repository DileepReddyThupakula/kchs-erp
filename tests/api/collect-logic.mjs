// UPI link / masking and the class-wise Collect fee list rules (pure functions).
import { buildUpiUri, maskUpi, UPI_ID_RE } from "../../src/features/fees/upi.ts";
import { filterCollectRows, summarize } from "../../src/features/fees/collect-list.ts";

export const name = "UPI link + class list rules";

const R = (o) => ({ studentId: o.id, name: o.name, adm: o.id, classId: o.c, sectionId: o.s, classLabel: "", classOrder: o.ord ?? 0, roll: null, phone: null, totalDue: o.due, overdue: o.over ?? 0, lastPayment: null });

export default async function run({ ok }) {
  const eq = (a, b, d) => ok(a === b, d, `got ${JSON.stringify(a)}`);
  const uri = buildUpiUri({ upiId: "kchs@okbank", payeeName: "Krishna Chaitanya High School", amountPaise: 123450, note: "Fee DEMO-0001" });
  ok(uri.startsWith("upi://pay?"), "link starts with upi://pay");
  ok(uri.includes("pa=kchs%40okbank") || uri.includes("pa=kchs@okbank"), "payee address present");
  ok(uri.includes("pn=Krishna%20Chaitanya%20High%20School"), "payee name present, spaces as %20");
  ok(uri.includes("am=1234.50"), "amount in rupees with 2 decimals");
  ok(uri.includes("cu=INR"), "currency INR");
  ok(uri.includes("tn=Fee%20DEMO-0001"), "note carries the admission number");
  ok(!buildUpiUri({ upiId: "a@b", payeeName: "X" }).includes("am="), "no amount when none given");
  eq(maskUpi("kchs.school@okbank"), "kc***@okbank", "UPI id masked like the audit log");
  eq(maskUpi(null), "", "mask of nothing");
  ok(UPI_ID_RE.test("school@okbank") && !UPI_ID_RE.test("not an id") && !UPI_ID_RE.test("a@b"), "UPI id pattern");

  const rows = [
    R({ id: "a", name: "Asha", c: "c1", s: "s1", due: 5000, over: 2000, ord: 1 }),
    R({ id: "b", name: "Bala", c: "c1", s: "s1", due: 9000, over: 0, ord: 1 }),
    R({ id: "c", name: "Chitra", c: "c1", s: "s2", due: 0, ord: 1 }),
    R({ id: "d", name: "Dev", c: "c2", s: "s3", due: 7000, over: 7000, ord: 2 }),
  ];
  eq(filterCollectRows(rows, {}).map((r) => r.studentId).join(","), "b,d,a", "default = pending dues only, largest balance first");
  eq(filterCollectRows(rows, { show: "all" }).length, 4, "all students includes paid-up ones");
  eq(filterCollectRows(rows, { show: "overdue" }).map((r) => r.studentId).join(","), "d,a", "overdue only");
  eq(filterCollectRows(rows, { classId: "c1" }).map((r) => r.studentId).join(","), "b,a", "class filter");
  eq(filterCollectRows(rows, { classId: "c1", sectionId: "s2" }).length, 0, "section with nobody owing is empty by default");
  eq(filterCollectRows(rows, { classId: "c1", sectionId: "s2", show: "all" }).length, 1, "…but visible under All students");
  const s = summarize(filterCollectRows(rows, { classId: "c1", show: "all" }));
  ok(s.students === 2 && s.outstanding === 14000 && s.overdue === 2000, "summary: students with dues, outstanding, overdue for the class", JSON.stringify(s));
}
