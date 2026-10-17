/**
 * Browser-side helpers for sharing to WhatsApp. LIMITS: a website cannot attach
 * an image to a WhatsApp message or send anything by itself. The person copies
 * the image, opens WhatsApp with the text pre-filled, picks the chat or group
 * and pastes (Cmd/Ctrl+V). Nothing here claims a message was delivered.
 */
export type WaChannel = "app" | "web";
const PREF_KEY = "kchs.wa-channel";
const GUIDE_KEY = "kchs.wa-guide-seen";

export function getChannelPref(): WaChannel {
  try {
    return localStorage.getItem(PREF_KEY) === "web" ? "web" : "app";
  } catch {
    return "app";
  }
}
export function setChannelPref(c: WaChannel) {
  try {
    localStorage.setItem(PREF_KEY, c);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}
export function guideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}
export function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Digits only; a 10-digit Indian number gets the country code (default 91). */
export function waNumber(raw: string, countryCode = "91"): string | null {
  const d = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10) return countryCode + d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** Link that opens WhatsApp with the text filled in. No number = WhatsApp's own chat / group picker. */
export function waUrl(channel: WaChannel, text: string, phone?: string | null): string {
  const t = encodeURIComponent(text);
  if (channel === "web") return `https://web.whatsapp.com/send?${phone ? `phone=${phone}&` : ""}text=${t}`;
  return phone ? `https://wa.me/${phone}?text=${t}` : `https://wa.me/?text=${t}`;
}
/** The desktop/phone app scheme (used by the "Open in WhatsApp app" button). */
export function waAppUrl(text: string, phone?: string | null): string {
  return `whatsapp://send?${phone ? `phone=${phone}&` : ""}text=${encodeURIComponent(text)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyPng(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return await (await fetch(url)).blob();
}

/** Phones and tablets only. Desktop browsers can also "share files" but then pass a local file path as text, so the button is hidden there. */
export function isPhoneOrTablet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** Web Share API with files: phones and tablets that support it. Check canShare first. */
export function canShareFiles(files: File[]): boolean {
  try {
    return isPhoneOrTablet() && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files });
  } catch {
    return false;
  }
}
export async function shareFiles(files: File[], text: string, title: string): Promise<"shared" | "cancelled" | "failed"> {
  try {
    await navigator.share({ files, text, title });
    return "shared";
  } catch (e) {
    return (e as Error).name === "AbortError" ? "cancelled" : "failed";
  }
}
