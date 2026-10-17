import type { CircularSchool } from "@/components/notices/circular-sheet";
import { schoolIdLine } from "@/components/notices/circular-sheet";
import { fmtNum, fmtPct, RESULT_TEXT } from "@/features/exams/shared";

export type CardData = {
  duplicate: boolean;
  mode: "marks" | "grades" | "remarks";
  year: string;
  group: { id: string; name: string; kind: "part" | "term" | "final"; start_date: string | null; end_date: string | null };
  student: { id: string; name: string; admission_no: string; roll_no: number | null; class: string; section: string };
  components: { id: string; name: string; max: number }[];
  children: { id: string; name: string; kind: string }[];
  child_totals: Record<string, { scored: number; max: number; pct: number; grade: string | null; result: string }>;
  subjects: {
    subject_id: string;
    name: string;
    name_te: string | null;
    marks: Record<string, { status: "marked" | "absent" | "na"; marks: number | null }> | null;
    child_results: Record<string, { scored: number; max: number; grade: string | null; passed: boolean }> | null;
    scored: number | null;
    max_marks: number | null;
    pct: number | null;
    grade: string | null;
    grade_point: number | null;
    passed: boolean | null;
    missing: number | null;
  }[];
  co_scholastic: { subject_id: string; name: string; name_te: string | null; grade: string | null; grade_label: string | null; remark: string | null }[];
  total: { scored: number; max: number; pct: number; grade: string | null; grade_point: number | null; result: "pass" | "fail" | "incomplete"; failed: number } | null;
  remark: { en: string; te: string | null } | null;
};
export type CardAttendance = { working: number; present: number; absent: number; pct: number | null; unmarked: number } | null;

const FONT = "var(--font-noto-sans), var(--font-noto-telugu), system-ui, sans-serif";
const SERIF = "var(--font-cinzel), Georgia, serif";
const cell = { border: "0.3mm solid #111", padding: "1mm 1.6mm" } as const;
const th = { ...cell, background: "#eceae2", fontWeight: 700, textAlign: "center" as const };
const longDate = (iso: string | null) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");

/** One report card page (D4): header and logo, student, marks table (each exam, total, grade), co-scholastic grades, attendance, remarks, result, signatures. Black ink carries all the information. */
export function ReportCardSheet({ data, school, attendance }: { data: CardData; school: CircularSchool; attendance: CardAttendance }) {
  const { student: st, group: g } = data;
  const isFinal = g.kind === "final";
  const marksMode = data.mode === "marks";
  const cols = isFinal ? data.children : data.components;
  const idLine = schoolIdLine(school);
  return (
    <article style={{ width: "210mm", height: "297mm", boxSizing: "border-box", padding: "9mm 12mm", background: "#fff", color: "#111", fontFamily: FONT, fontSize: "10pt", position: "relative", display: "flex", flexDirection: "column", gap: "2.6mm", overflow: "hidden", breakAfter: "page" }}>
      {data.duplicate && (
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <span style={{ transform: "rotate(-24deg)", fontSize: "54pt", fontWeight: 900, letterSpacing: "0.2em", color: "rgba(0,0,0,0.12)", border: "1.2mm solid rgba(0,0,0,0.12)", padding: "2mm 8mm" }}>DUPLICATE</span>
        </div>
      )}
      <header style={{ display: "flex", alignItems: "center", gap: "4mm", borderBottom: "0.6mm solid #111", paddingBottom: "2.5mm" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={school.logoUrl} alt="" style={{ width: "20mm", height: "20mm", objectFit: "contain" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "16pt", letterSpacing: "0.04em", textTransform: "uppercase", color: "#011a37" }}>{school.name}</div>
          {school.address && <div style={{ fontSize: "9pt" }}>{school.address}</div>}
          {idLine && <div style={{ fontSize: "8.5pt" }}>{idLine}</div>}
        </div>
        <div style={{ width: "20mm" }} />
      </header>
      <div style={{ textAlign: "center", fontWeight: 700, letterSpacing: "0.18em", fontSize: "12pt" }}>
        REPORT CARD · {g.name.toUpperCase()} · {data.year}
        {data.duplicate && <span style={{ marginLeft: "3mm", fontSize: "9pt", letterSpacing: "0.1em" }}>(DUPLICATE COPY)</span>}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
        <tbody>
          <tr>
            <td style={cell}>
              <b>Student:</b> {st.name}
            </td>
            <td style={cell}>
              <b>Admission no:</b> {st.admission_no}
            </td>
          </tr>
          <tr>
            <td style={cell}>
              <b>Class:</b> {st.class} – {st.section}
              &nbsp;&nbsp;<b>Roll no:</b> {st.roll_no ?? "—"}
            </td>
            <td style={cell}>
              <b>{isFinal ? "Exam" : "Term"}:</b> {g.name}
              {!isFinal && g.start_date && g.end_date ? ` (${longDate(g.start_date)} to ${longDate(g.end_date)})` : ""}
            </td>
          </tr>
        </tbody>
      </table>

      {marksMode ? (
        <section>
          <div style={{ fontWeight: 700, marginBottom: "1mm" }}>Scholastic areas</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Subject</th>
                {cols.map((c) => (
                  <th key={c.id} style={th}>
                    {c.name}
                    {"max" in c && <div style={{ fontWeight: 400 }}>/{fmtNum(c.max)}</div>}
                  </th>
                ))}
                <th style={th}>Total</th>
                <th style={th}>%</th>
                <th style={th}>Grade</th>
                <th style={th}>Result</th>
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => (
                <tr key={s.subject_id}>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    {s.name}
                    {s.name_te && <div style={{ fontWeight: 400, fontSize: "8pt" }}>{s.name_te}</div>}
                  </td>
                  {isFinal
                    ? data.children.map((c) => {
                        const r = s.child_results?.[c.id];
                        return (
                          <td key={c.id} style={{ ...cell, textAlign: "center" }}>
                            {r ? `${fmtNum(r.scored)}/${fmtNum(r.max)}` : "—"}
                          </td>
                        );
                      })
                    : data.components.map((c) => {
                        const m = s.marks?.[c.id];
                        return (
                          <td key={c.id} style={{ ...cell, textAlign: "center" }}>
                            {!m ? "—" : m.status === "absent" ? "AB" : m.status === "na" ? "N/A" : fmtNum(m.marks)}
                          </td>
                        );
                      })}
                  <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{s.scored == null ? "—" : `${fmtNum(s.scored)}/${fmtNum(s.max_marks)}`}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{s.pct == null ? "—" : fmtPct(s.pct)}</td>
                  <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{s.grade ?? "—"}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{s.passed == null ? "—" : s.passed ? "Pass" : "Fail"}</td>
                </tr>
              ))}
              {data.total && (
                <tr>
                  <td style={{ ...cell, fontWeight: 700 }} colSpan={1 + cols.length}>
                    Grand total
                  </td>
                  <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>
                    {fmtNum(data.total.scored)}/{fmtNum(data.total.max)}
                  </td>
                  <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{fmtPct(data.total.pct)}</td>
                  <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{data.total.grade ?? "—"}</td>
                  <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{RESULT_TEXT[data.total.result]}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: "8pt", marginTop: "0.8mm" }}>AB = absent (counted as 0). N/A = not applicable (left out). {data.total && `Grade point average: ${data.total.grade_point ?? "—"}.`}</div>
        </section>
      ) : null}

      {data.co_scholastic.length > 0 && (
        <section>
          <div style={{ fontWeight: 700, marginBottom: "1mm" }}>{marksMode ? "Co-scholastic areas" : "Assessment"}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Area</th>
                <th style={th}>Grade</th>
                <th style={{ ...th, textAlign: "left" }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {data.co_scholastic.map((c) => (
                <tr key={c.subject_id}>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    {c.name}
                    {c.name_te && <span style={{ fontWeight: 400, fontSize: "8pt" }}> · {c.name_te}</span>}
                  </td>
                  <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>
                    {c.grade ?? "—"}
                    {c.grade_label && <span style={{ fontWeight: 400, fontSize: "8pt" }}> ({c.grade_label})</span>}
                  </td>
                  <td style={cell}>{c.remark ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <div style={{ fontWeight: 700, marginBottom: "1mm" }}>Attendance</div>
        {attendance ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
            <tbody>
              <tr>
                <td style={cell}>
                  Working days: <b>{fmtNum(attendance.working)}</b>
                </td>
                <td style={cell}>
                  Days present: <b>{fmtNum(attendance.present)}</b> <span style={{ fontSize: "8pt" }}>(half days count 0.5)</span>
                </td>
                <td style={cell}>
                  Days absent: <b>{fmtNum(attendance.absent)}</b>
                </td>
                <td style={cell}>
                  Attendance: <b>{attendance.pct == null ? "—" : fmtPct(attendance.pct)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: "9pt" }}>Attendance is not available.</div>
        )}
        {attendance && attendance.unmarked > 0 && <div style={{ fontSize: "8pt", marginTop: "0.6mm" }}>Note: {attendance.unmarked} attendance session(s) of this period were not marked, so these figures may be incomplete.</div>}
      </section>

      <section style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: "1mm" }}>Class teacher&apos;s remarks</div>
        <div style={{ border: "0.3mm solid #111", padding: "2mm", minHeight: "16mm", whiteSpace: "pre-wrap", fontSize: "9.5pt" }}>
          {data.remark ? (
            <>
              <div>{data.remark.en}</div>
              {data.remark.te && <div style={{ marginTop: "1.5mm" }}>{data.remark.te}</div>}
            </>
          ) : null}
        </div>
        {data.total && marksMode && (
          <div style={{ marginTop: "2mm", fontSize: "11pt", fontWeight: 700 }}>
            Result: {RESULT_TEXT[data.total.result].toUpperCase()}
            {data.total.result === "fail" && data.total.failed > 0 ? ` (${data.total.failed} subject${data.total.failed === 1 ? "" : "s"} below the pass mark)` : ""}
          </div>
        )}
      </section>

      <footer style={{ display: "flex", justifyContent: "space-between", gap: "6mm", marginTop: "8mm", fontSize: "9pt" }}>
        {["Class teacher", "Principal", "Parent / Guardian"].map((t) => (
          <div key={t} style={{ flex: 1, borderTop: "0.4mm solid #111", paddingTop: "0.8mm", textAlign: "center" }}>
            {t}
          </div>
        ))}
      </footer>
      <div style={{ textAlign: "center", fontSize: "7.5pt" }}>This is a computer-generated report card.</div>
    </article>
  );
}
