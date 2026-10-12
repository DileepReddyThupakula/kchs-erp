"use client";
import { useEffect, useRef } from "react";
import { LogoBadge } from "./logo-badge";

/**
 * Logo that tilts gently toward the mouse (CSS 3D transform, one rAF per
 * frame at most). Touch devices and reduced-motion users get no tilt;
 * the idle float comes from CSS (.logo-float) and also stops for reduced motion.
 */
export function TiltLogo({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduced) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5; // -0.5 … 0.5
        const y = e.clientY / window.innerHeight - 0.5;
        el.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 16}deg)`;
      });
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      el.style.transform = "";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", reset);
    };
  }, []);

  return (
    <div className="logo-float [perspective:900px]">
      <div ref={ref} className="transition-transform duration-300 ease-out [transform-style:preserve-3d]">
        <div className="rounded-full shadow-[0_30px_60px_-15px_rgb(0_0_0/0.6),0_0_0_10px_rgb(230_169_36/0.12),0_0_80px_rgb(230_169_36/0.25)]">
          <LogoBadge src={src} alt={alt} priority sizes="(min-width: 1024px) 320px, 144px" className="size-36 ring-4 sm:size-44 lg:size-80" />
        </div>
      </div>
    </div>
  );
}
