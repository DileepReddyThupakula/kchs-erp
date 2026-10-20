/** Real-content checks for every upload: what the first bytes of the file say it is, not what the browser or the file name claims. */

export type FileKind = "png" | "jpeg" | "webp" | "pdf";
const INFO: Record<FileKind, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  webp: { mime: "image/webp", ext: "webp" },
  pdf: { mime: "application/pdf", ext: "pdf" },
};
export const IMAGES: FileKind[] = ["png", "jpeg", "webp"];
export const PHOTOS: FileKind[] = ["png", "jpeg"];
export const DOCUMENTS: FileKind[] = ["pdf", "png", "jpeg", "webp"];
export const LOGOS: FileKind[] = ["png", "jpeg"];

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** The kind of file these first bytes are, or null. */
export function sniff(b: Uint8Array): FileKind | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  return null;
}

export type Checked = { ok: true; kind: FileKind; mime: string; ext: string } | { ok: false; error: string };

const LABEL: Record<FileKind, string> = { png: "PNG", jpeg: "JPG", webp: "WEBP", pdf: "PDF" };
export function allowedText(allowed: FileKind[]) {
  const names = allowed.map((k) => LABEL[k]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
}

/** Reads the first bytes of an uploaded file and accepts it only if it really is one of the allowed kinds. */
export async function checkUpload(file: File, allowed: FileKind[]): Promise<Checked> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const kind = sniff(head);
  if (!kind || !allowed.includes(kind)) return { ok: false, error: `This file is not a real ${allowedText(allowed)} file.` };
  return { ok: true, kind, ...INFO[kind] };
}

/** The same check on bytes already read (stored files). */
export function checkBytes(b: Uint8Array, allowed: FileKind[]): Checked {
  const kind = sniff(b.subarray(0, 16));
  if (!kind || !allowed.includes(kind)) return { ok: false, error: `This file is not a real ${allowedText(allowed)} file.` };
  return { ok: true, kind, ...INFO[kind] };
}

/** A file name that is safe to store and show: no folders, no odd characters, at most 80 characters, keeps a short extension. */
export function safeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFKC");
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9 _()-]+/g, "_").replace(/^[._ -]+|[._ -]+$/g, "").slice(0, 60);
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  return `${stem || "file"}${ext ? `.${ext}` : ""}`;
}

/** A short code that is safe inside a storage path (document type codes come from a form). */
export const safePathPart = (s: string) => /^[A-Za-z0-9_-]{1,40}$/.test(s);
