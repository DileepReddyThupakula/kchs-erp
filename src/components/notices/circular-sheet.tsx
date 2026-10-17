import type { CSSProperties } from "react";

export type CircularSchool = { name: string; address: string; phone: string | null; udise: string | null; recognition: string | null; logoUrl: string };
export type CircularData = {
  school: CircularSchool;
  circularNo: string | null;
  dateLong: string;
  /** the heading after "To:" (e.g. "Parents and students of Class 6, Class 7"). Never student names. */
  toLine: string;
  title: string;
  body: string;
  titleTe?: string | null;
  bodyTe?: string | null;
  draft?: boolean;
};
export type CircularLayout = "a4" | "image";
/** "all": the whole circular. For long image circulars: "first" = header, English; "second" = Telugu, signature. */
export type CircularPart = "all" | "first" | "second";

const FONT = "var(--font-noto-sans), var(--font-noto-telugu), system-ui, sans-serif";
const SERIF = "var(--font-cinzel), Georgia, serif";
const NAVY = "#011a37";
const GOLD = "#e6a924";

/** Sizes for the two layouts: A4 print (mm / pt) and the portrait image (px, 1080 wide). */
const SIZE = {
  a4: { w: "210mm", min: "297mm", bandPad: "7mm 12mm", logo: "22mm", name: "19pt", sub: "9pt", rule: "1.6mm", body: "6mm 14mm", gap: "4.5mm", text: "11pt", small: "9.5pt", title: "11pt", label: "7.5pt", foot: "8.5pt", stamp: "22mm", sig: "62mm", footPad: "3mm 12mm" },
  image: { w: "1080px", min: "0", bandPad: "36px 48px", logo: "130px", name: "40px", sub: "21px", rule: "9px", body: "32px 52px", gap: "26px", text: "30px", small: "25px", title: "27px", label: "20px", foot: "21px", stamp: "120px", sig: "300px", footPad: "18px 48px" },
} as const;

/** Only the facts that are set in School settings: nothing is printed for a missing UDISE or recognition number. */
export function schoolIdLine(s: CircularSchool): string {
  return [s.phone && `Phone: ${s.phone}`, s.udise && `UDISE: ${s.udise}`, s.recognition && `Recognition No: ${s.recognition}`].filter(Boolean).join("  ·  ");
}

/**
 * THE circular, used for the screen preview, the A4 print and the WhatsApp image.
 * Navy band with logo, gold rule, reference block, subject line, English and Telugu in separate
 * bordered blocks (readable in black and white), blank signature line and blank stamp circle.
 * It never prints a stored signature.
 */
export function CircularSheet({ data, layout, part = "all" }: { data: CircularData; layout: CircularLayout; part?: CircularPart }) {
  const z = SIZE[layout];
  const { school } = data;
  const idLine = schoolIdLine(school);
  const hasTe = !!(data.titleTe || data.bodyTe);
  const showEn = part !== "second";
  const showTe = part !== "first";
  const block: CSSProperties = { border: "1.5px solid #111", borderRadius: 5, padding: layout === "a4" ? "4mm 5mm" : "22px 26px", position: "relative", whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
  const label: CSSProperties = { position: "absolute", top: layout === "a4" ? "-2.6mm" : "-15px", left: layout === "a4" ? "4mm" : "22px", background: "#fff", border: "1px solid #111", borderRadius: 3, padding: "0 6px", fontSize: z.label, fontWeight: 700, letterSpacing: ".06em", lineHeight: 1.5 };
  const compact = part === "second";

  return (
    <div style={{ width: z.w, minHeight: z.min, background: "#fff", color: "#111", fontFamily: FONT, display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ background: NAVY, color: "#fff", display: "flex", alignItems: "center", gap: layout === "a4" ? "5mm" : 22, padding: compact ? (layout === "a4" ? "4mm 12mm" : "22px 48px") : z.bandPad }}>
        {!compact && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={school.logoUrl} alt="" crossOrigin="anonymous" style={{ width: z.logo, height: z.logo, objectFit: "contain", background: "#fff", borderRadius: "50%", padding: 3, flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", lineHeight: 1.15, fontSize: compact ? (layout === "a4" ? "14pt" : "30px") : z.name }}>{school.name}</div>
          {!compact && school.address && <div style={{ fontSize: z.sub, marginTop: 4, opacity: 0.95 }}>{school.address}</div>}
          {!compact && idLine && <div style={{ fontSize: z.sub, marginTop: 2, opacity: 0.95 }}>{idLine}</div>}
        </div>
      </div>
      <div style={{ height: z.rule, background: GOLD }} />

      <div style={{ padding: z.body, display: "grid", gap: z.gap, flex: 1, alignContent: "start", fontSize: z.text, lineHeight: 1.6 }}>
        {part !== "second" && <div style={{ textAlign: "center", fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", fontSize: z.title }}>Circular{data.draft ? " (draft: not yet published)" : ""}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 24px", borderTop: "1px solid #111", borderBottom: "1px solid #111", padding: "6px 0", fontSize: layout === "a4" ? z.small : z.small }}>
          <div>
            <b>Circular No:</b> {data.circularNo ?? "(given when published)"}
          </div>
          <div style={{ textAlign: "right" }}>
            <b>Date:</b> {data.dateLong}
          </div>
          {!compact && (
            <div style={{ gridColumn: "1 / -1" }}>
              <b>To:</b> {data.toLine}
            </div>
          )}
        </div>
        {part !== "second" && <div style={{ borderLeft: `${layout === "a4" ? "1.4mm" : "8px"} solid ${NAVY}`, padding: "3px 10px", fontWeight: 700, background: "#f1efe7" }}>Subject: {data.title}</div>}

        {showEn && (
          <div style={block}>
            <span style={label}>ENGLISH</span>
            {data.body}
          </div>
        )}
        {part === "first" && hasTe && <div style={{ textAlign: "center", fontSize: z.small, fontStyle: "italic" }}>తెలుగు on the next image →</div>}
        {showTe && hasTe && (
          <div style={block}>
            <span style={label}>తెలుగు</span>
            {data.titleTe && <div style={{ fontWeight: 700, marginBottom: 6 }}>{data.titleTe}</div>}
            {data.bodyTe}
          </div>
        )}

        {showTe && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: layout === "a4" ? "8mm" : 24 }}>
            <div style={{ width: z.stamp, height: z.stamp, border: "1.5px dashed #777", borderRadius: "50%" }} aria-label="space for the school stamp" />
            <div style={{ width: z.sig, borderTop: "1.5px solid #111", paddingTop: 3, textAlign: "center", fontWeight: 700 }}>Principal</div>
          </div>
        )}
      </div>

      {showTe && (
        <div style={{ borderTop: `3px double ${NAVY}`, padding: z.footPad, textAlign: "center", fontSize: z.foot, color: "#222" }}>
          {[school.name, school.address, school.phone].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}
