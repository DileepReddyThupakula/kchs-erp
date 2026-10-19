import { bodySentence, DUPLICATE_REASON_LABEL, fmtDate, showsDraftMark, showsDuplicateMark, tcLines, type Bundle, type Lang, type LineOptions } from "@/features/certificates/shared";

export type SheetSchool = { name: string; address: string; phone: string | null; udise: string | null; recognition: string | null; logoUrl: string };

const FONT = "var(--font-noto-sans), var(--font-noto-telugu), system-ui, sans-serif";
const SERIF = "var(--font-cinzel), Georgia, serif";
const TE = { fontFamily: "var(--font-noto-telugu), var(--font-noto-sans), system-ui, sans-serif" } as const;
const box = { border: "0.3mm solid #111" } as const;

function Both({ en, te, lang, size = "10.5pt", bold = false, align = "left" }: { en: string; te?: string; lang: Lang; size?: string; bold?: boolean; align?: "left" | "center" | "right" }) {
  // a value that is the same in both languages (a date, a class, a number) is printed once, not twice
  if (lang === "both" && (te === undefined || te === en)) lang = "en";
  return (
    <>
      {lang !== "te" && <div style={{ fontSize: size, fontWeight: bold ? 700 : 400, textAlign: align }}>{en}</div>}
      {lang !== "en" && <div lang="te" style={{ ...TE, fontSize: size, fontWeight: bold ? 700 : 400, textAlign: align }}>{te ?? en}</div>}
    </>
  );
}

/**
 * One certificate on one A4 page. Blank boxes for the signature and the seal (nothing is signed or stamped by the system), the school's
 * letterhead from School settings, an empty place for a future QR code, a DRAFT mark while the TC layout is a draft, a DUPLICATE mark
 * (with the date and the reason) on every reprint. Black ink carries all the information.
 */
export function CertificateSheet({ bundle, lang, school, footer, options }: { bundle: Bundle; lang: Lang; school: SheetSchool; footer: string; options?: LineOptions }) {
  const b = bundle;
  const draft = showsDraftMark(b);
  const dup = showsDuplicateMark(b);
  const texts = b.texts;
  const tx = (k: string) => texts[k] ?? { en: k, te: k, te_checked: false };
  const idLine = [school.phone && `Phone: ${school.phone}`, school.udise && `UDISE: ${school.udise}`, school.recognition && `Recognition No: ${school.recognition}`].filter(Boolean).join("  ·  ");
  const issueDate = b.certificate?.issue_date;
  return (
    <article data-testid="certificate-sheet" style={{ width: "210mm", height: "297mm", boxSizing: "border-box", padding: "10mm 14mm", background: "#fff", color: "#111", fontFamily: FONT, fontSize: "10.5pt", position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", breakAfter: "page" }}>
      {draft && (
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <span data-testid="draft-mark" style={{ transform: "rotate(-30deg)", fontSize: "30pt", fontWeight: 900, letterSpacing: "0.08em", color: "rgba(0,0,0,0.14)", border: "1.2mm solid rgba(0,0,0,0.14)", padding: "3mm 8mm", textAlign: "center", lineHeight: 1.2 }}>DRAFT layout<br />not for issue</span>
        </div>
      )}
      {dup && (
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <span data-testid="duplicate-mark" style={{ transform: "rotate(-24deg)", fontSize: "54pt", fontWeight: 900, letterSpacing: "0.2em", color: "rgba(0,0,0,0.12)", border: "1.2mm solid rgba(0,0,0,0.12)", padding: "2mm 8mm", marginTop: draft ? "70mm" : 0 }}>{tx("duplicate").en}</span>
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

      <div style={{ textAlign: "center", margin: "3mm 0 2mm" }}>
        <Both en={b.title_en} te={b.title_te} lang={lang} size="14pt" bold align="center" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10pt", marginBottom: "2.5mm" }}>
        <span>No: <b>{b.certificate?.number ?? "— (preview: no number yet)"}</b></span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {b.kind === "tc" && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {tcLines(b, options).map((l, i) => (
                <tr key={l.key}>
                  <td style={{ ...box, padding: "0.9mm 2mm", width: "9mm", textAlign: "center" }}>{i + 1}</td>
                  <td style={{ ...box, padding: "0.9mm 2mm", width: "70mm" }}><Both en={l.label.en} te={l.label.te} lang={lang} size="9.5pt" /></td>
                  <td style={{ ...box, padding: "0.9mm 2mm", fontWeight: 600 }}><Both en={l.value.en} te={l.value.te} lang={lang} size="10pt" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {b.kind !== "tc" && (
          <div style={{ lineHeight: 1.7, margin: "4mm 0" }}>
            {lang !== "te" && <p style={{ margin: "0 0 4mm" }}>{bodySentence(b, "en")}</p>}
            {lang !== "en" && <p lang="te" style={{ ...TE, margin: "0 0 4mm" }}>{bodySentence(b, "te")}</p>}
          </div>
        )}
        {b.kind === "study" && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "3mm" }}>
            <thead>
              <tr>{["col_year", "col_class", "col_medium"].map((k) => <th key={k} style={{ ...box, background: "#eceae2", padding: "1.4mm 2mm", textAlign: "left" }}><Both en={tx(k).en} te={tx(k).te} lang={lang} size="10pt" bold /></th>)}</tr>
            </thead>
            <tbody>
              {(b.payload.history ?? []).map((h) => (
                <tr key={h.year}><td style={{ ...box, padding: "1.4mm 2mm" }}>{h.year}</td><td style={{ ...box, padding: "1.4mm 2mm" }}>{h.class} – {h.section}</td><td style={{ ...box, padding: "1.4mm 2mm" }}>{h.medium ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {b.kind === "tc" && <p style={{ marginTop: "4mm", fontSize: "10pt" }}><Both en={tx("declaration").en} te={tx("declaration").te} lang={lang} size="10pt" /></p>}
        {dup && b.duplicate && (
          <p data-testid="duplicate-note" style={{ marginTop: "3mm", fontSize: "9.5pt", border: "0.3mm dashed #111", padding: "1.5mm 2.5mm" }}>
            {tx("duplicate").en} copy no. {b.duplicate.copy_no}, printed on {fmtDate(b.duplicate.printed_at)}. Reason: {DUPLICATE_REASON_LABEL[b.duplicate.reason ?? ""] ?? b.duplicate.reason}{b.duplicate.reason_note ? ` (${b.duplicate.reason_note})` : ""}.
          </p>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "6mm", alignItems: "flex-end", margin: "6mm 0 2mm" }}>
        <div style={{ fontSize: "9.5pt" }}>
          <div>{tx("place").en}: <b>{b.certificate?.place ?? ""}</b>{b.certificate?.place ? "" : "____________"}</div>
          <div style={{ marginTop: "1mm" }}>{tx("date_of_issue").en}: <b>{issueDate ? fmtDate(issueDate) : "____________"}</b></div>
        </div>
        <div data-testid="seal-box" style={{ width: "34mm", height: "26mm", border: "0.3mm dashed #111", display: "grid", placeItems: "end center", fontSize: "8pt", paddingBottom: "1mm" }}>{tx("seal").en}{lang !== "en" && <span lang="te" style={TE}> / {tx("seal").te}</span>}</div>
        {b.kind === "tc" && (
          <>
            <div style={{ width: "32mm", textAlign: "center", fontSize: "8.5pt" }}><div style={{ borderTop: "0.3mm solid #111", paddingTop: "1mm", marginTop: "18mm" }}>{tx("sig_class_teacher").en}{lang !== "en" && <div lang="te" style={TE}>{tx("sig_class_teacher").te}</div>}</div></div>
            <div style={{ width: "32mm", textAlign: "center", fontSize: "8.5pt" }}><div style={{ borderTop: "0.3mm solid #111", paddingTop: "1mm", marginTop: "18mm" }}>{tx("sig_clerk").en}{lang !== "en" && <div lang="te" style={TE}>{tx("sig_clerk").te}</div>}</div></div>
          </>
        )}
        <div style={{ width: "50mm", textAlign: "center", fontSize: "9pt" }}>
          <div style={{ borderTop: "0.3mm solid #111", paddingTop: "1mm", marginTop: "18mm" }}>
            <b>{tx("sig_principal").en}</b>{lang !== "en" && <div lang="te" style={TE}>{tx("sig_principal").te}</div>}
            {school.name && b.school.principal_name && <div>{b.school.principal_name}</div>}
          </div>
        </div>
      </div>
      {/* reserved for a future QR verification code (not built): leave this corner empty */}
      <div aria-hidden data-testid="qr-reserved" style={{ position: "absolute", right: "14mm", bottom: "10mm", width: "18mm", height: "18mm" }} />
      <footer style={{ borderTop: "0.3mm solid #999", marginTop: "3mm", paddingTop: "1.2mm", fontSize: "7.5pt", color: "#444" }}>{footer}</footer>
    </article>
  );
}
