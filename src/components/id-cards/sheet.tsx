import { CardBack, CardFront, type CardSchool } from "./card-face";
import { cardSlot, CARD_H, CARD_W, COLS, MARGIN_X, MARGIN_Y, PER_SHEET, ROWS, SHEET_H, SHEET_W, type CardData } from "@/features/id-cards/shared";

const MARK = "0.12mm solid #666";

/** Thin cut marks in the margins only (never on a card), at every cut line. */
function CutMarks() {
  const xs = Array.from({ length: COLS + 1 }, (_, i) => MARGIN_X + i * CARD_W);
  const ys = Array.from({ length: ROWS + 1 }, (_, i) => MARGIN_Y + i * CARD_H);
  return (
    <>
      {xs.map((x) => (
        <span key={`vx${x}`}>
          <i data-mark style={{ position: "absolute", left: `${x}mm`, top: "6mm", height: `${MARGIN_Y - 6 - 1}mm`, borderLeft: MARK }} />
          <i data-mark style={{ position: "absolute", left: `${x}mm`, top: `${SHEET_H - MARGIN_Y + 1}mm`, height: `${MARGIN_Y - 6 - 1}mm`, borderLeft: MARK }} />
        </span>
      ))}
      {ys.map((y) => (
        <span key={`hy${y}`}>
          <i data-mark style={{ position: "absolute", top: `${y}mm`, left: "6mm", width: `${MARGIN_X - 6 - 1}mm`, borderTop: MARK }} />
          <i data-mark style={{ position: "absolute", top: `${y}mm`, left: `${SHEET_W - MARGIN_X + 1}mm`, width: `${MARGIN_X - 6 - 1}mm`, borderTop: MARK }} />
        </span>
      ))}
    </>
  );
}

/** One A4 sheet of up to 10 cards (2 x 5), the front or the mirrored back, with cut marks and the footer. */
export function CardSheet({ cards, side, school, photos, footer, principal }: { cards: CardData[]; side: "front" | "back"; school: CardSchool; photos: Record<string, string>; footer: string; principal?: string | null }) {
  return (
    <article data-testid={`sheet-${side}`} data-count={cards.length} style={{ width: `${SHEET_W}mm`, height: `${SHEET_H}mm`, position: "relative", background: "#fff", breakAfter: "page", overflow: "hidden" }}>
      <CutMarks />
      {cards.slice(0, PER_SHEET).map((c, i) => {
        const p = cardSlot(i, side);
        return (
          <div key={(c.card_id ?? "p") + i} data-slot={`${p.row}-${p.col}`} style={{ position: "absolute", left: `${p.x}mm`, top: `${p.y}mm`, width: `${CARD_W}mm`, height: `${CARD_H}mm` }}>
            {side === "front" ? <CardFront card={c} school={school} photoUrl={c.photo_path ? photos[c.photo_path] : null} /> : <CardBack card={c} school={school} principal={principal} />}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: `${SHEET_H - 9}mm`, textAlign: "center", fontSize: "6.5pt", color: "#444" }}>{footer} · {side === "front" ? "Front" : "Back"}</div>
    </article>
  );
}
