/** The photo rules (IC6). The database enforces the same rules (app.photo_problem); this copy is for early, friendly messages. */
export const PHOTO_MIN_W = 300;
export const PHOTO_MIN_H = 400;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png"];

export function photoProblem(w: number | null | undefined, h: number | null | undefined, bytes: number, mime: string): string | null {
  if (!PHOTO_TYPES.includes(mime)) return "Use a JPEG or PNG photo.";
  if (!bytes) return "The photo is empty.";
  if (bytes > PHOTO_MAX_BYTES) return "The photo is bigger than 5 MB.";
  if (!w || !h || w < PHOTO_MIN_W || h < PHOTO_MIN_H) return "The photo is too small: it must be at least 300 x 400 pixels.";
  if (w / h > 1.34 || w / h < 0.5) return "The photo is the wrong shape. Crop it to a passport-size portrait.";
  return null;
}
