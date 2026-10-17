"use client";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { toBlob } from "html-to-image";
import { BookOpen, Calculator, FlaskConical, Globe2, Languages, Lightbulb, Leaf, MessageSquareText, Monitor, Palette, Trophy, HeartHandshake, type LucideIcon } from "lucide-react";
import { cleanLines, fmtLong, weekdayOf, type CombinedLine } from "@/features/notices/shared";

export type CardSchool = { name: string; logoUrl: string; motto: string | null };

/** One distinct, readable colour per row (white text on the band, dark text on the tint). */
const PALETTE = ["#1d4ed8", "#047857", "#b45309", "#7e22ce", "#be123c", "#0e7490", "#4d7c0f", "#c2410c"];

const ICONS: [RegExp, LucideIcon][] = [
  [/math|ganit|గణిత/i, Calculator],
  [/science|physic|chem|bio/i, FlaskConical],
  [/social|history|geograph|civic/i, Globe2],
  [/evs|environment/i, Leaf],
  [/comput/i, Monitor],
  [/art|draw|craft/i, Palette],
  [/sport|pt\b|physical|game/i, Trophy],
  [/moral|value|ethic/i, HeartHandshake],
  [/gk|general knowledge|quiz/i, Lightbulb],
  [/telugu|hindi|english|sanskrit|urdu|language|grammar|reading|writing/i, Languages],
];
export function iconFor(subject: string): LucideIcon {
  return ICONS.find(([re]) => re.test(subject))?.[1] ?? BookOpen;
}

/** Up to ~8 subjects fit one image; more are split into two (the class remark goes on the last). */
export function chunkLines(lines: CombinedLine[]): CombinedLine[][] {
  const subj = lines.filter((l) => l.subject);
  const remark = lines.filter((l) => !l.subject);
  if (subj.length <= 8) return [[...subj, ...remark]];
  const half = Math.ceil(subj.length / 2);
  return [subj.slice(0, half), [...subj.slice(half), ...remark]];
}

export const CARD_WIDTH = 1080;

/** The colourful diary card. Laid out at 1080 px wide; the height grows with the content. */
export function DiaryCard({ school, classLabel, date, lines, part, parts, offset }: { school: CardSchool; classLabel: string; date: string; lines: CombinedLine[]; part: number; parts: number; offset: number }) {
  let n = offset;
  return (
    <div style={{ width: CARD_WIDTH, background: "#fffaf0", fontFamily: "var(--font-noto-sans), var(--font-noto-telugu), system-ui, sans-serif", color: "#0b1b33" }}>
      <div style={{ background: "#011a37", color: "#fff", padding: "36px 48px 28px", display: "flex", alignItems: "center", gap: 28, borderBottom: "8px solid #e6a924" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={school.logoUrl} alt="" crossOrigin="anonymous" width={120} height={120} style={{ objectFit: "contain", background: "#fff", borderRadius: 60, padding: 6 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-cinzel), serif", fontWeight: 700, fontSize: 38, letterSpacing: 1, lineHeight: 1.15, textTransform: "uppercase" }}>{school.name}</div>
          <div style={{ marginTop: 10, fontSize: 28, color: "#f5d98d", fontWeight: 600 }}>Daily Diary{parts > 1 ? ` (${part}/${parts})` : ""}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 48px", background: "#faecc6", borderBottom: "2px solid #e6a924" }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#011a37" }}>{classLabel}</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#011a37" }}>{fmtLong(date).replace(/^[A-Za-z]+,\s*/, "")}</div>
          <div style={{ fontSize: 24, color: "#6b4710", fontWeight: 600 }}>{weekdayOf(date)}</div>
        </div>
      </div>
      <div style={{ padding: "28px 36px 12px", display: "grid", gap: 18 }}>
        {lines.map((l, i) => {
          const remark = !l.subject;
          const color = remark ? "#475569" : PALETTE[n++ % PALETTE.length];
          const Icon = remark ? MessageSquareText : iconFor(l.subject!);
          return (
            <div key={i} style={{ display: "flex", borderRadius: 22, overflow: "hidden", background: "#fff", border: `3px solid ${color}`, boxShadow: "0 3px 0 rgba(0,0,0,.06)" }}>
              <div style={{ width: 200, flexShrink: 0, background: color, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "18px 8px", textAlign: "center" }}>
                <Icon size={54} strokeWidth={2} aria-hidden />
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, overflowWrap: "break-word" }}>{remark ? "Class remark" : l.subject}</div>
                {!remark && l.subjectTe && <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, opacity: 0.95 }}>{l.subjectTe}</div>}
                {remark && <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>తరగతి సూచన</div>}
              </div>
              <div style={{ flex: 1, padding: "18px 26px", background: `${color}12`, minWidth: 0 }}>
                <div style={{ fontSize: 32, lineHeight: 1.4, fontWeight: 500, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{l.body}</div>
                {l.bodyTe && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `2px dashed ${color}88` }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color, marginRight: 12 }}>తెలుగు</span>
                    <span style={{ fontSize: 30, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{l.bodyTe}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!lines.length && <div style={{ fontSize: 30, textAlign: "center", padding: 40, color: "#64748b" }}>No diary entries for this day.</div>}
      </div>
      <div style={{ margin: "14px 0 0", padding: "18px 48px 24px", background: "#011a37", color: "#f5d98d", textAlign: "center", fontSize: 24, fontStyle: "italic", fontWeight: 600 }}>
        {school.motto || school.name}
      </div>
    </div>
  );
}

export type RenderedCard = { blob: Blob; url: string };

/**
 * Renders the given DiaryCard elements off-screen and turns each into a PNG (2x).
 * `renderKey` changes whenever the content does. Fonts (Noto Sans Telugu) are waited for,
 * so Telugu text is drawn with the real font.
 */
export function CardRenderer({ cards, renderKey, onDone, onError }: { cards: ReactElement[]; renderKey: string; onDone: (r: RenderedCard[]) => void; onError: (m: string) => void }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let dead = false;
    const urls: string[] = [];
    (async () => {
      try {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = () => r(null); })));
        const out: RenderedCard[] = [];
        for (const el of refs.current.slice(0, cards.length)) {
          if (!el) continue;
          const blob = await toBlob(el, { pixelRatio: 2, cacheBust: true, backgroundColor: "#fffaf0", width: CARD_WIDTH });
          if (!blob) throw new Error("The image could not be drawn.");
          const url = URL.createObjectURL(blob);
          urls.push(url);
          out.push({ blob, url });
        }
        if (!dead) onDone(out);
      } catch (e) {
        if (!dead) onError((e as Error).message || "The image could not be drawn.");
      }
    })();
    return () => {
      dead = true;
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey, tick]);
  void setTick;
  return (
    <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, width: CARD_WIDTH, pointerEvents: "none" }}>
      {cards.map((c, i) => (
        <div key={i} ref={(el) => void (refs.current[i] = el)} style={{ width: CARD_WIDTH }}>
          {c}
        </div>
      ))}
    </div>
  );
}

/** Build the DiaryCard elements for one class (split into two images when long). */
export function diaryCardsFor(school: CardSchool, classLabel: string, date: string, lines: CombinedLine[]): ReactElement[] {
  const chunks = chunkLines(cleanLines(lines));
  let offset = 0;
  return chunks.map((c, i) => {
    const el = <DiaryCard key={i} school={school} classLabel={classLabel} date={date} lines={c} part={i + 1} parts={chunks.length} offset={offset} />;
    offset += c.filter((l) => l.subject).length;
    return el;
  });
}
