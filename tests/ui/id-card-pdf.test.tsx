// @vitest-environment node
// ID cards on paper, in a real headless Chrome: the cards are exactly 86 x 54 mm, 10 to an A4 sheet, the back sheet is mirrored for double-sided printing,
// a long name stays inside its box, the Telugu name prints with a Telugu font, and each sheet is exactly one A4 page. Skipped when Chrome is not installed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
import { CardSheet } from "@/components/id-cards/sheet";
import type { CardData } from "@/features/id-cards/shared";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PHOTO = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='210' height='280'><rect width='210' height='280' fill='#9ab'/><circle cx='105' cy='100' r='50' fill='#567'/></svg>");
const NAMES = [
  ["Ravi Kumar", "రవి కుమార్"], ["Bandi Venkata Satya Sai Narayana Reddy Gangireddy Subrahmanya Pradeep Kumar", "బండి వెంకట సత్య సాయి నారాయణ రెడ్డి గంగిరెడ్డి సుబ్రహ్మణ్య ప్రదీప్ కుమార్"], ["Anu", null], ["Sita Maha Lakshmi Devi", "సీత మహా లక్ష్మి దేవి"], ["Abhiram Gangireddy", "అభిరామ్ గంగిరెడ్డి"],
  ["Nikhil Seelam", null], ["Akshaya Vemula", "అక్షయ వేములా"], ["Naveen Ramireddy", "నవీన్ రామిరెడ్డి"], ["Chandra Sekhar Venkata Ramana Murthy", "చంద్ర శేఖర్ వెంకట రమణ మూర్తి"], ["Z", null],
] as const;
const cards: CardData[] = NAMES.map(([name, te], i) => ({
  card_id: `c${i}`, number: `ID/2026-27/${String(i + 1).padStart(4, "0")}`, qr: `ID/2026-27/${String(i + 1).padStart(4, "0")}`, status: "issued", year: "2026-27", name, name_te: te, class: "Class 6", section: "A", admission_no: `DEMO-BULK-09-${String(i + 1).padStart(3, "0")}`,
  phone: "9000000001", blood_group: "O+", photo_path: "p", photo_pending: i === 9,
}));
const school = { name: "Krishna Chaitanya High School", address: "Vempalli Road, Yerraguntla, YSR Kadapa, Andhra Pradesh, 516309", phone: "9985698213", logoUrl: "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><circle cx='5' cy='5' r='5' fill='#c9a227'/></svg>") };
const FOOT = "Printed on 20 Oct 2026 by Demo Admin · Confidential - for school use";

const html = (body: string, script = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--font-noto-sans:"Helvetica Neue",Arial;--font-noto-telugu:"Noto Sans Telugu","Telugu MN","Telugu Sangam MN";--font-cinzel:Georgia}
@page{size:A4 portrait;margin:0} html,body{margin:0;padding:0} article{break-after:page}</style></head><body>${body}${script}</body></html>`;
const GEO = `<script>
const mm = (px) => px * 25.4 / 96;
addEventListener('load', () => { setTimeout(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: mm(b.left), y: mm(b.top), w: mm(b.width), h: mm(b.height) }; };
  const sheets = [...document.querySelectorAll('article')];
  const out = { sheets: sheets.map((a) => r(a)), cards: [], names: [], qr: [] };
  sheets.forEach((a, si) => {
    const ar = a.getBoundingClientRect();
    [...a.querySelectorAll('[data-slot]')].forEach((s, i) => { const c = s.firstElementChild; const b = c.getBoundingClientRect(); out.cards.push({ sheet: si, side: a.dataset.testid, i, x: mm(b.left - ar.left), y: mm(b.top - ar.top), w: mm(b.width), h: mm(b.height) }); });
    [...a.querySelectorAll('[data-testid=card-name]')].forEach((n) => { const p = n.parentElement; out.names.push({ over: p.scrollHeight - p.clientHeight, text: n.textContent.length, fs: getComputedStyle(n).fontSize }); });
    [...a.querySelectorAll('[data-testid=qr]')].forEach((q) => { const b = q.getBoundingClientRect(); out.qr.push({ w: mm(b.width), h: mm(b.height), text: q.dataset.text }); });
  });
  document.body.setAttribute('data-geo', JSON.stringify(out));
}, 300); });
</script>`;

const available = existsSync(CHROME);
describe.skipIf(!available)("ID card sheets in a real browser", () => {
  const dir = mkdtempSync(join(tmpdir(), "kchs-idc-"));
  const photos = { p: PHOTO };
  const body = renderToStaticMarkup(<><CardSheet cards={cards} side="front" school={school} photos={photos} footer={FOOT} principal="Dr. Principal" /><CardSheet cards={cards} side="back" school={school} photos={photos} footer={FOOT} principal="Dr. Principal" /></>);

  it("exact sizes: cards 86 x 54 mm, sheets 210 x 297 mm, in the right places (back mirrored), QR at least 14 mm, long names inside their box", () => {
    const f = join(dir, "geo.html");
    writeFileSync(f, html(body, GEO));
    const dom = execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=4000", "--dump-dom", `file://${f}`], { encoding: "utf8", timeout: 60000 });
    const m = dom.match(/data-geo="([^"]*)"/);
    expect(m).toBeTruthy();
    const g = JSON.parse(m![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    expect(g.sheets).toHaveLength(2);
    for (const s of g.sheets) { expect(Math.abs(s.w - 210)).toBeLessThan(0.2); expect(Math.abs(s.h - 297)).toBeLessThan(0.2); }
    expect(g.cards).toHaveLength(20);
    for (const c of g.cards) { expect(Math.abs(c.w - 86)).toBeLessThan(0.15); expect(Math.abs(c.h - 54)).toBeLessThan(0.15); }
    const front0 = g.cards.find((c: { side: string; i: number }) => c.side === "sheet-front" && c.i === 0);
    const back0 = g.cards.find((c: { side: string; i: number }) => c.side === "sheet-back" && c.i === 0);
    expect(Math.abs(front0.x - 19)).toBeLessThan(0.2); expect(Math.abs(front0.y - 13.5)).toBeLessThan(0.2);
    expect(Math.abs(back0.x - 105)).toBeLessThan(0.2);                                      // mirrored: behind the card at the other side
    expect(g.qr).toHaveLength(10);
    for (const q of g.qr) { expect(q.w).toBeGreaterThanOrEqual(14); expect(q.text).toMatch(/^ID\/2026-27\/\d{4}$/); }
    expect(g.names).toHaveLength(10);
    for (const n of g.names) { expect(n.over).toBeLessThanOrEqual(1); expect(parseFloat(n.fs)).toBeGreaterThan(0); }   // nothing overflows its box
    const long = g.names[1];
    expect(long.text).toBeGreaterThan(60);
    expect(Math.round(parseFloat(long.fs) * 72 / 96 * 10) / 10).toBeGreaterThanOrEqual(6.5);   // never below 6.5 pt
  }, 90000);

  it("one A4 page per sheet (front and back = 2 pages), with a Telugu font embedded for the Telugu names", () => {
    const f = join(dir, "pdf.html");
    const pdf = join(dir, "cards.pdf");
    writeFileSync(f, html(body));
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${f}`], { stdio: "ignore", timeout: 60000 });
    const bytes = readFileSync(pdf).toString("latin1");
    expect((bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2);
    const m = bytes.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(Math.round(Number(m![1]))).toBe(595); expect(Math.round(Number(m![2]))).toBe(842);
    expect(/BaseFont\s*\/[A-Z]{6}\+[A-Za-z]*Telugu/i.test(bytes)).toBe(true);
  }, 90000);
});
