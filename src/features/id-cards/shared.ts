/** ID cards: types and the pure layout rules shared by the screens, the print sheets and the tests. No database calls. */
export type CardData = {
  card_id: string | null; number: string | null; qr: string | null; status: string; year: string;
  name: string; name_te: string | null; class: string; section: string; admission_no: string;
  phone: string | null; blood_group: string | null; photo_path: string | null; photo_pending: boolean;
};
export type SchoolHdr = { name: string; address: string; udise_code: string | null; affiliation_no: string | null; logo_path: string | null; principal_name: string | null; missing: string[] };
export type Bundle = { school: SchoolHdr; settings: { show_phone: boolean; show_blood_group: boolean }; cards: CardData[] };
export type Candidate = {
  student_id: string; name: string; admission_no: string; class: string; section: string; roll_no: number | null; status: string;
  has_photo: boolean; photo_path: string | null; card_number: string | null; card_id: string | null; problem: string | null;
};
export type SectionOption = { id: string; label: string; class_id: string; class: string; students: number };

// the card and the sheet (mm)
export const CARD_W = 86;
export const CARD_H = 54;
export const COLS = 2;
export const ROWS = 5;
export const PER_SHEET = COLS * ROWS;
export const SHEET_W = 210;
export const SHEET_H = 297;
export const MARGIN_X = (SHEET_W - COLS * CARD_W) / 2;   // 19 mm
export const MARGIN_Y = (SHEET_H - ROWS * CARD_H) / 2;   // 13.5 mm
export const QR_MM = 16;                                  // at least 14 mm, with a 2 mm quiet border around it

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Where card number i (0-9) of a sheet goes. The BACK sheet is mirrored left-right so that, printed double-sided (flip on the long edge), each back lines up behind its front. */
export function cardSlot(i: number, side: "front" | "back"): { x: number; y: number; row: number; col: number } {
  const row = Math.floor(i / COLS);
  const col = i % COLS;
  const c = side === "back" ? COLS - 1 - col : col;
  return { x: MARGIN_X + c * CARD_W, y: MARGIN_Y + row * CARD_H, row, col: c };
}

/** The order the pages come out: sheet 1 front, sheet 1 back, sheet 2 front, ... (or only fronts, or only backs). */
export function sheetOrder(cardCount: number, sides: "both" | "front" | "back"): { sheet: number; side: "front" | "back" }[] {
  const n = Math.max(1, Math.ceil(cardCount / PER_SHEET));
  const out: { sheet: number; side: "front" | "back" }[] = [];
  for (let s = 0; s < n; s++) {
    if (sides !== "back") out.push({ sheet: s, side: "front" });
    if (sides !== "front") out.push({ sheet: s, side: "back" });
  }
  return out;
}

/**
 * A long name shrinks (down to a minimum size) and then wraps; it is never cut off or allowed to overflow.
 * `widthMm` is the room for the text, `factor` the average letter width in em (Telugu letters are wider than English ones).
 */
export function fitName(text: string, widthMm: number, opts: { max?: number; min?: number; factor?: number } = {}): { pt: number; wrap: boolean } {
  const max = opts.max ?? 10.5;
  const min = opts.min ?? 6.5;
  const factor = opts.factor ?? 0.2;
  const chars = Math.max(1, [...text].length);
  const fits = widthMm / (chars * factor);          // the size at which it fits on one line
  if (fits >= max) return { pt: max, wrap: false };
  if (fits >= min) return { pt: Math.round(fits * 10) / 10, wrap: false };
  return { pt: min, wrap: true };
}

export const FRONT_FOOTER_NOTE = "Confidential - for school use";
