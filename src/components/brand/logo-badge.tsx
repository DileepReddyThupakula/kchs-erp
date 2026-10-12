import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The school logo sits on a white circular badge with a gold ring, so its
 * white background never shows as a square on dark (navy) areas.
 * Size it with className (e.g. "size-10"); `sizes` tells Next which width to fetch.
 */
export function LogoBadge({
  src,
  alt,
  sizes,
  priority = false,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-gold-500/80", className)}>
      <Image src={src} alt={alt} fill priority={priority} sizes={sizes} className="scale-[0.94] object-contain" />
    </span>
  );
}
