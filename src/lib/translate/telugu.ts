/** Client-safe helper: does the text contain Telugu script? */
export const hasTelugu = (s: string) => /[\u0C00-\u0C7F]/.test(s);
