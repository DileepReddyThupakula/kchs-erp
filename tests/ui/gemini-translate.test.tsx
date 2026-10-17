// Gemini provider with a MOCKED fetch: no network, no key.
import { describe, expect, it } from "vitest";
import { GEMINI_SYSTEM_PROMPT, geminiTranslate } from "@/lib/translate/gemini";
import { protectNumbers, translateToTelugu, type Provider, type Store } from "@/lib/translate/core";

const KEY = "SECRET-KEY-123";
type Reply = { status?: number; text?: string; throws?: boolean };
function mockFetch(replies: Reply[]) {
  const calls: { url: string; headers: Record<string, string>; body: { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[] } }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    const r = replies[calls.length - 1] ?? { status: 500 };
    if (r.throws) throw new Error("network down");
    if ((r.status ?? 200) !== 200) return new Response("{}", { status: r.status });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: r.text }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const cfg = (f: typeof fetch) => ({ apiKey: KEY, model: "primary-model", fallbackModel: "fallback-model", fetchImpl: f });
const wrap = (f: typeof fetch): Provider => ({ name: "gemini", translate: async (html) => (await geminiTranslate(html, cfg(f))).text });
const store = (cap = 1_000_000) => {
  let used = 0;
  const cache = new Map<string, string>();
  return { cache, store: { cacheGet: async (h) => cache.get(h) ?? null, cachePut: async (h, t) => void cache.set(h, t), reserve: async (n) => (used + n > cap ? false : ((used += n), true)) } as Store };
};
const TE = (n: string) => `<span class="notranslate" translate="no">${n}</span>`;

describe("Gemini provider", () => {
  it("sends a translate-only prompt, the key in a header (not the URL), and returns the primary model's text", async () => {
    const m = mockFetch([{ text: "తెలుగు పాఠం" }]);
    const r = await geminiTranslate("Read lesson", cfg(m.impl));
    expect(r).toEqual({ text: "తెలుగు పాఠం", model: "primary-model" });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].url).toContain("/models/primary-model:generateContent");
    expect(m.calls[0].url).not.toContain(KEY);
    expect(m.calls[0].headers["x-goog-api-key"]).toBe(KEY);
    const prompt = m.calls[0].body.systemInstruction.parts[0].text;
    expect(prompt).toBe(GEMINI_SYSTEM_PROMPT);
    for (const must of ["Translate only", "add nothing", "page numbers", "exercise numbers", "names", "Latin script", "English to Telugu"]) expect(prompt).toContain(must);
  });
  it("retries once on the fallback model when the primary is rate limited", async () => {
    const m = mockFetch([{ status: 429 }, { text: "తెలుగు" }]);
    const r = await geminiTranslate("Read", cfg(m.impl));
    expect(r.model).toBe("fallback-model");
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1].url).toContain("fallback-model");
  });
  it("also falls back on a network error or an empty answer", async () => {
    expect((await geminiTranslate("x1", cfg(mockFetch([{ throws: true }, { text: "తె" }]).impl))).model).toBe("fallback-model");
    expect((await geminiTranslate("x1", cfg(mockFetch([{ text: "  " }, { text: "తె" }]).impl))).model).toBe("fallback-model");
  });
  it("when both fail it throws without leaking the key, and the line stays pending", async () => {
    const m = mockFetch([{ status: 503 }, { status: 500 }]);
    await expect(geminiTranslate("Read", cfg(m.impl))).rejects.toThrow(/gemini answered/);
    await expect(geminiTranslate("Read", cfg(mockFetch([{ status: 503 }, { status: 500 }]).impl))).rejects.not.toThrow(new RegExp(KEY));
    const r = await translateToTelugu("Read lesson 5", { purpose: "diary", provider: wrap(mockFetch([{ status: 503 }, { status: 500 }]).impl), store: store().store });
    expect(r).toEqual({ ok: false, reason: "failed" });
  });
});

describe("Gemini through the translation rules", () => {
  it("accepts a good translation that keeps the numbers and caches it", async () => {
    const m = mockFetch([{ text: `గణితం: అభ్యాసం ${TE("5.1")}, ప్రశ్నలు ${TE("1-6")}` }]);
    const s = store();
    const r = await translateToTelugu("Maths: Exercise 5.1, questions 1-6", { purpose: "diary", provider: wrap(m.impl), store: s.store });
    expect(r.ok).toBe(true);
    expect(s.cache.size).toBe(1);
    expect(m.calls[0].body.contents[0].parts[0].text).toBe(protectNumbers("Maths: Exercise 5.1, questions 1-6"));
    const again = await translateToTelugu("Maths: Exercise 5.1, questions 1-6", { purpose: "diary", provider: wrap(m.impl), store: s.store });
    expect(again.ok && again.cached).toBe(true);
    expect(m.calls).toHaveLength(1);
  });
  it("rejects a translation that changed a number", async () => {
    const m = mockFetch([{ text: `అభ్యాసం ${TE("5.2")}` }]);
    expect(await translateToTelugu("Do exercise 5.1", { purpose: "diary", provider: wrap(m.impl), store: store().store })).toEqual({ ok: false, reason: "validation" });
  });
  it("skips text that already has Telugu: nothing is sent", async () => {
    const m = mockFetch([]);
    expect(await translateToTelugu("గణితం పాఠం 5", { purpose: "diary", provider: wrap(m.impl), store: store().store })).toEqual({ ok: false, reason: "has_telugu" });
    expect(m.calls).toHaveLength(0);
  });
  it("stops at the monthly cap before calling Gemini", async () => {
    const m = mockFetch([{ text: "తెలుగు" }]);
    expect(await translateToTelugu("A sentence longer than ten characters", { purpose: "diary", provider: wrap(m.impl), store: store(10).store })).toEqual({ ok: false, reason: "cap" });
    expect(m.calls).toHaveLength(0);
  });
  it("student-specific purposes are refused before anything is sent", async () => {
    const m = mockFetch([{ text: "తెలుగు" }]);
    for (const purpose of ["fee_due", "absence", "marks"]) await expect(translateToTelugu("Ravi owes 5000", { purpose, provider: wrap(m.impl), store: store().store })).rejects.toThrow();
    expect(m.calls).toHaveLength(0);
  });
});

import { GLOSSARY } from "@/lib/translate/glossary";
import { sameNumbers } from "@/lib/translate/core";
describe("number check and glossary", () => {
  it("accepts the same numbers in a different order (Telugu word order differs)", () => {
    expect(sameNumbers("Exercise 5.1, questions 1-6 on page 18.", "అభ్యాసం 5.1, పేజీ 18 లోని ప్రశ్నలు 1-6.")).toBe(true);
    expect(sameNumbers("questions 1-6", "ప్రశ్నలు 1–6")).toBe(true);
  });
  it("still rejects a changed, missing or extra number", () => {
    expect(sameNumbers("page 18", "పేజీ 19")).toBe(false);
    expect(sameNumbers("page 18 and 5", "పేజీ 18")).toBe(false);
    expect(sameNumbers("page 18", "పేజీ 18, 18")).toBe(false);
  });
  it("puts the glossary into the prompt, from the one list", async () => {
    const m = mockFetch([{ text: "తె" }]);
    await geminiTranslate("Page 3", cfg(m.impl));
    const prompt = m.calls[0].body.systemInstruction.parts[0].text;
    for (const g of GLOSSARY) expect(prompt).toContain(`${g.en} = ${g.te}`);
    expect(GLOSSARY.map((g) => g.en)).toEqual(["Exercise", "Page", "Homework"]);
  });
  it("a custom glossary replaces it (editable in one place)", async () => {
    const m = mockFetch([{ text: "తె" }]);
    await geminiTranslate("Page 3", { ...cfg(m.impl), glossary: [{ en: "Quiz", te: "క్విజ్" }] });
    const prompt = m.calls[0].body.systemInstruction.parts[0].text;
    expect(prompt).toContain("Quiz = క్విజ్");
    expect(prompt).not.toContain("Exercise =");
  });
});
