import QRCode from "qrcode";
import { CARD_H, CARD_W, fitName, QR_MM, type CardData, type SchoolHdr } from "@/features/id-cards/shared";

const FONT = "var(--font-noto-sans), var(--font-noto-telugu), system-ui, sans-serif";
const TE = "var(--font-noto-telugu), var(--font-noto-sans), system-ui, sans-serif";
const SERIF = "var(--font-cinzel), Georgia, serif";
const NAVY = "#011a37";

export type CardSchool = { name: string; address: string; phone: string | null; logoUrl: string };

/** The QR as an SVG made of squares. It holds ONLY the card number. */
export function QrSvg({ text, mm = QR_MM }: { text: string; mm?: number }) {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return (
    <svg data-testid="qr" data-text={text} viewBox={`0 0 ${n} ${n}`} width={`${mm}mm`} height={`${mm}mm`} shapeRendering="crispEdges" role="img" aria-label={`QR code: ${text}`}>
      <path d={d} fill="#000" />
    </svg>
  );
}

const box = (): React.CSSProperties => ({ width: `${CARD_W}mm`, height: `${CARD_H}mm`, boxSizing: "border-box", overflow: "hidden", background: "#fff", color: "#111", fontFamily: FONT, position: "relative" });

/** Front: logo, school name, photo, name (Telugu name only if saved), class and section, admission number, validity, card number. Nothing else. */
export function CardFront({ card, school, photoUrl }: { card: CardData; school: CardSchool; photoUrl?: string | null }) {
  const en = fitName(card.name, 52, { factor: 0.2 });
  const te = card.name_te ? fitName(card.name_te, 52, { factor: 0.3, max: 9, min: 6.5 }) : null;
  return (
    <div data-testid="card-front" style={box()}>
      <div style={{ height: "11mm", background: NAVY, color: "#fff", display: "flex", alignItems: "center", gap: "2mm", padding: "0 3mm" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={school.logoUrl} alt="" style={{ width: "8mm", height: "8mm", objectFit: "contain", background: "#fff", borderRadius: "1mm" }} />
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "7.4pt", letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.15 }}>{school.name}</div>
      </div>
      <div style={{ position: "absolute", left: "4mm", top: "14mm", width: "21mm", height: "28mm", border: "0.25mm solid #111", background: "#eee", overflow: "hidden", display: "grid", placeItems: "center" }}>
        {photoUrl && !card.photo_pending ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-testid="card-photo" src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span data-testid="photo-pending" style={{ fontSize: "6pt", color: "#555", textAlign: "center", padding: "1mm" }}>Photo pending</span>
        )}
      </div>
      <div style={{ position: "absolute", left: "28mm", top: "13.5mm", width: "54mm", height: "27mm", overflow: "hidden" }}>
        <div data-testid="card-name" style={{ fontSize: `${en.pt}pt`, fontWeight: 700, lineHeight: 1.15, color: NAVY, wordBreak: "break-word" }}>{card.name}</div>
        {te && <div data-testid="card-name-te" lang="te" style={{ fontFamily: TE, fontSize: `${te.pt}pt`, fontWeight: 600, lineHeight: 1.2, marginTop: "0.6mm", wordBreak: "break-word" }}>{card.name_te}</div>}
        <div style={{ fontSize: "8pt", marginTop: "1.6mm" }}>Class: <b>{card.class} – {card.section}</b></div>
        <div style={{ fontSize: "8pt", marginTop: "0.6mm" }}>Adm. No: <b>{card.admission_no}</b></div>
        <div style={{ fontSize: "8pt", marginTop: "0.6mm" }}>Valid: <b>{card.year}</b></div>
      </div>
      <div data-testid="card-number" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "7mm", borderTop: "0.25mm solid #111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8pt", fontWeight: 700, letterSpacing: "0.06em" }}>{card.number ?? "ID/····/····"}</div>
    </div>
  );
}

/** Back: blood group and parent phone (each only if saved and switched on), the school address and phone, "If found…", a blank signature box, the QR (the card number only). Never an address of the student. */
export function CardBack({ card, school, principal }: { card: CardData; school: CardSchool; principal?: string | null }) {
  return (
    <div data-testid="card-back" style={box()}>
      <div style={{ position: "absolute", left: "4mm", top: "3mm", width: "58mm", fontSize: "7.2pt", lineHeight: 1.35 }}>
        {card.blood_group && <div data-testid="back-blood">Blood group: <b>{card.blood_group}</b></div>}
        {card.phone && <div data-testid="back-phone">Parent phone: <b>{card.phone}</b></div>}
        <div style={{ marginTop: card.blood_group || card.phone ? "1.2mm" : 0, fontWeight: 700 }}>If found, please return to the school</div>
        <div>{school.name}</div>
        {school.address && <div>{school.address}</div>}
        {school.phone && <div>Phone: {school.phone}</div>}
      </div>
      <div data-testid="qr-box" style={{ position: "absolute", right: "3mm", top: "3mm", width: `${QR_MM + 4}mm`, height: `${QR_MM + 4}mm`, background: "#fff", display: "grid", placeItems: "center" }}>
        {card.qr ? <QrSvg text={card.qr} /> : <span style={{ fontSize: "6pt", color: "#777" }}>QR after issue</span>}
      </div>
      <div style={{ position: "absolute", left: "4mm", bottom: "3mm", width: "42mm", height: "11mm", border: "0.25mm dashed #111", display: "grid", alignItems: "end", justifyItems: "center", fontSize: "6pt", paddingBottom: "0.8mm" }} data-testid="signature-box">
        Signature of the Principal{principal ? ` (${principal})` : ""}
      </div>
      <div style={{ position: "absolute", right: "3mm", bottom: "3mm", fontSize: "6.5pt", fontWeight: 700 }}>{card.number ?? ""}</div>
    </div>
  );
}
