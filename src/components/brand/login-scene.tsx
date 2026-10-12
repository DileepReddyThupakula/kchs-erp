// Decorative drifting outlines for the login background. Pure SVG + CSS
// (see .drift in globals.css); hidden from screen readers; disabled when the
// user prefers reduced motion.
const Star = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
    <path d="m12 2.8 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);
const Book = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
    <path d="M12 6.5C10 5 6.5 4.5 3 5.2v13c3.5-.7 7 0 9 1.5 2-1.5 5.5-2.2 9-1.5v-13c-3.5-.7-7-.2-9 1.3Z" />
    <path d="M12 6.5v13.2" />
  </svg>
);
const Cap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
    <path d="M2 9.5 12 5l10 4.5L12 14z" />
    <path d="M6 11.3v4.4c3.5 2.6 8.5 2.6 12 0v-4.4M20.5 10v5" />
  </svg>
);
const Feather = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M4 21C9 15 13 10 18 3" />
    <ellipse cx="15.5" cy="7.5" rx="3.6" ry="5.4" transform="rotate(35 15.5 7.5)" />
    <ellipse cx="15.5" cy="7.5" rx="1.5" ry="2.3" transform="rotate(35 15.5 7.5)" />
  </svg>
);

type Item = { C: () => React.ReactElement; top: string; left: string; size: number; dur: number; dx: number; dy: number; rot: number };
const ITEMS: Item[] = [
  { C: Star, top: "8%", left: "6%", size: 22, dur: 26, dx: 24, dy: 30, rot: 25 },
  { C: Book, top: "18%", left: "78%", size: 46, dur: 34, dx: -30, dy: 26, rot: -10 },
  { C: Cap, top: "70%", left: "8%", size: 52, dur: 30, dx: 34, dy: -28, rot: 8 },
  { C: Feather, top: "62%", left: "86%", size: 60, dur: 38, dx: -26, dy: -36, rot: -14 },
  { C: Star, top: "84%", left: "48%", size: 18, dur: 22, dx: 18, dy: -22, rot: 40 },
  { C: Star, top: "30%", left: "40%", size: 14, dur: 24, dx: -16, dy: 18, rot: -30 },
  { C: Book, top: "88%", left: "70%", size: 34, dur: 32, dx: 22, dy: -18, rot: 12 },
  { C: Feather, top: "6%", left: "52%", size: 40, dur: 36, dx: 28, dy: 22, rot: 18 },
  { C: Cap, top: "42%", left: "92%", size: 30, dur: 28, dx: -20, dy: 24, rot: -8 },
  { C: Star, top: "52%", left: "22%", size: 16, dur: 20, dx: 14, dy: 16, rot: 22 },
];

export function LoginScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {ITEMS.map(({ C, top, left, size, dur, dx, dy, rot }, i) => (
        <span
          key={i}
          className="drift"
          style={
            {
              top,
              left,
              width: size,
              height: size,
              "--dur": `${dur}s`,
              "--dx": `${dx}px`,
              "--dy": `${dy}px`,
              "--rot": `${rot}deg`,
              animationDelay: `${-i * 3}s`,
            } as React.CSSProperties
          }
        >
          <C />
        </span>
      ))}
      {/* soft gold glow behind the logo */}
      <div className="absolute left-[8%] top-1/2 size-[34rem] -translate-y-1/2 rounded-full bg-gold-400/10 blur-3xl max-lg:left-1/2 max-lg:top-24 max-lg:size-72 max-lg:-translate-x-1/2" />
    </div>
  );
}
