// Translation rules with a MOCKED provider: no network, no account.
import { describe, expect, it } from "vitest";
import { ALLOWED_PURPOSES, hasTelugu, md5, numberTokens, planEntryTranslation, protectNumbers, restoreText, translateToTelugu, type Provider, type Store } from "@/lib/translate/core";

function memStore(cap = 1_000_000) {
  const cache = new Map<string, string>();
  let used = 0;
  const store: Store = {
    cacheGet: async (h) => cache.get(h) ?? null,
    cachePut: async (h, te) => void cache.set(h, te),
    reserve: async (n) => (used + n > cap ? false : ((used += n), true)),
  };
  return { store, cache, used: () => used };
}
function fake(opts: { fail?: boolean; mangle?: boolean } = {}) {
  const calls: string[] = [];
  const provider: Provider = {
    name: "fake",
    translate: async (html) => {
      calls.push(html);
      if (opts.fail) throw new Error("down");
      // pretend-translate the words, keep the protected number spans (or break them on purpose)
      const out = html.replace(/[A-Za-z]+/g, (w) => (w === "span" || w === "class" || w === "notranslate" || w === "translate" || w === "no" || w === "br" ? w : "తెలుగు"));
      return opts.mangle ? out.replace(/>[0-9.]+</g, ">99<") : out;
    },
  };
  return { provider, calls };
}

describe("translation rules", () => {
  it("translates English to Telugu and keeps exercise, page and range numbers unchanged", async () => {
    const { provider, calls } = fake();
    const { store } = memStore();
    const r = await translateToTelugu("Maths: Exercise 5.1, questions 1-6, page 18", { purpose: "diary", provider, store });
    expect(r.ok).toBe(true);
    if (r.ok) expect(numberTokens(r.te)).toEqual(["5.1", "1-6", "18"]);
    expect(calls[0]).toContain('class="notranslate"');
  });
  it("uses the cache: the same text is not sent twice and costs nothing", async () => {
    const { provider, calls } = fake();
    const m = memStore();
    await translateToTelugu("Read lesson 5", { purpose: "diary", provider, store: m.store });
    const used = m.used();
    const again = await translateToTelugu("  Read   lesson 5 ", { purpose: "diary", provider, store: m.store });
    expect(again.ok && again.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect(m.used()).toBe(used);
  });
  it("stops at the monthly cap and does not call the provider", async () => {
    const { provider, calls } = fake();
    const m = memStore(10);
    const r = await translateToTelugu("This text is longer than ten characters", { purpose: "diary", provider, store: m.store });
    expect(r).toEqual({ ok: false, reason: "cap" });
    expect(calls).toHaveLength(0);
  });
  it("counts characters used", async () => {
    const { provider } = fake();
    const m = memStore();
    await translateToTelugu("Learn tables", { purpose: "notice", provider, store: m.store });
    expect(m.used()).toBe("Learn tables".length);
  });
  it("a provider failure is reported, not thrown, and nothing is cached", async () => {
    const m = memStore();
    const r = await translateToTelugu("Read lesson 5", { purpose: "diary", provider: fake({ fail: true }).provider, store: m.store });
    expect(r).toEqual({ ok: false, reason: "failed" });
    expect(m.cache.size).toBe(0);
  });
  it("without a configured provider the answer is not_configured (manual fallback)", async () => {
    expect(await translateToTelugu("Read lesson 5", { purpose: "diary", provider: null, store: memStore().store })).toEqual({ ok: false, reason: "not_configured" });
  });
  it("rejects a translation that changed a number", async () => {
    const r = await translateToTelugu("Do exercise 5.1", { purpose: "diary", provider: fake({ mangle: true }).provider, store: memStore().store });
    expect(r).toEqual({ ok: false, reason: "validation" });
  });
  it("skips text that already contains Telugu and empty text", async () => {
    const { provider, calls } = fake();
    expect(await translateToTelugu("గణితం: పాఠం 5", { purpose: "diary", provider, store: memStore().store })).toEqual({ ok: false, reason: "has_telugu" });
    expect(await translateToTelugu("   ", { purpose: "diary", provider, store: memStore().store })).toEqual({ ok: false, reason: "empty" });
    expect(calls).toHaveLength(0);
  });
  it("only general diary and notice text may be translated: student-specific purposes are refused before anything is sent", async () => {
    const { provider, calls } = fake();
    expect([...ALLOWED_PURPOSES]).toEqual(["diary", "notice"]);
    for (const purpose of ["fee_due", "absence", "marks", "report_card", "anything"]) {
      await expect(translateToTelugu("Ravi owes 5000", { purpose, provider, store: memStore().store })).rejects.toThrow();
    }
    expect(calls).toHaveLength(0);
  });
  it("escapes markup in the text and restores it", () => {
    expect(restoreText(protectNumbers("a < b & c 5\nline 2"))).toBe("a < b & c 5\nline 2");
    expect(hasTelugu("abc")).toBe(false);
  });
});

describe("when a line is translated", () => {
  const base = { body: "Maths: ex 5.1", body_te: null as string | null, te_status: "pending" as const, te_src_hash: null as string | null };
  it("translates a pending line", () => expect(planEntryTranslation(base)).toBe("translate"));
  it("never touches reviewed Telugu", () => expect(planEntryTranslation({ ...base, te_status: "reviewed" as never, body_te: "x" })).toBe("reviewed"));
  it("does not translate again when the English has not changed", () => expect(planEntryTranslation({ ...base, te_status: "auto" as never, body_te: "తె", te_src_hash: md5("Maths: ex 5.1") })).toBe("unchanged"));
  it("translates again when the English changed", () => expect(planEntryTranslation({ ...base, te_status: "auto" as never, body_te: "తె", te_src_hash: md5("old text") })).toBe("translate"));
  it("skips English that already holds Telugu", () => expect(planEntryTranslation({ ...base, body: "గణితం 5" })).toBe("has_telugu"));
});
