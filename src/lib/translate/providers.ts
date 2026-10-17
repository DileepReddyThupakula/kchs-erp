import "server-only";
import type { Provider } from "./core";

/** Settings come from environment variables only (never sent to the browser, never logged). */
export function configuredProviderName(): "azure" | "google" | "mock" | null {
  const pick = (process.env.TRANSLATION_PROVIDER ?? "").toLowerCase();
  if (pick === "mock" && process.env.NODE_ENV !== "production") return "mock";
  const azure = !!process.env.AZURE_TRANSLATOR_KEY && !!process.env.AZURE_TRANSLATOR_REGION;
  const google = !!process.env.GOOGLE_TRANSLATE_API_KEY;
  if (pick === "azure") return azure ? "azure" : null;
  if (pick === "google") return google ? "google" : null;
  return azure ? "azure" : google ? "google" : null;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`translation service answered ${r.status}`); // never include headers or the key
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const azure: Provider = {
  name: "azure",
  async translate(html) {
    const base = (process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com").replace(/\/$/, "");
    const data = (await post(
      `${base}/translate?api-version=3.0&from=en&to=te&textType=html`,
      { "Ocp-Apim-Subscription-Key": process.env.AZURE_TRANSLATOR_KEY!, "Ocp-Apim-Subscription-Region": process.env.AZURE_TRANSLATOR_REGION! },
      [{ Text: html }],
    )) as { translations?: { text?: string }[] }[];
    const out = data?.[0]?.translations?.[0]?.text;
    if (!out) throw new Error("empty translation");
    return out;
  },
};

const google: Provider = {
  name: "google",
  async translate(html) {
    const data = (await post("https://translation.googleapis.com/language/translate/v2", { "X-goog-api-key": process.env.GOOGLE_TRANSLATE_API_KEY! }, { q: html, source: "en", target: "te", format: "html" })) as {
      data?: { translations?: { translatedText?: string }[] };
    };
    const out = data?.data?.translations?.[0]?.translatedText;
    if (!out) throw new Error("empty translation");
    return out;
  },
};

/** Development only (TRANSLATION_PROVIDER=mock): fake "Telugu" so the screens can be checked without an account. */
const mock: Provider = { name: "mock", translate: async (html) => `అనువాదం (పరీక్ష): ${html}` };

export function getProvider(): Provider | null {
  const n = configuredProviderName();
  return n === "azure" ? azure : n === "google" ? google : n === "mock" ? mock : null;
}
