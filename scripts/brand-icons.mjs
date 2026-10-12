// Generates web-optimised logo copies, favicons and PWA icons from the
// school logo. The original file is never modified.
//   npm run brand:icons                       (uses public/brand/krishna-logo-original.png)
//   npm run brand:icons -- path/to/logo.png   (any square-ish logo)
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const src = process.argv[2] ?? join(root, "public/brand/krishna-logo-original.png");
const BG = { r: 255, g: 255, b: 255, alpha: 1 }; // logo artwork sits on white

async function square(size, out, scale = 1) {
  const inner = Math.round(size * scale);
  const logo = await sharp(src).resize(inner, inner, { fit: "contain", background: BG }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(join(root, out));
  console.log("  ✓", out);
}

console.log("Brand assets from", src);
// UI copies (login page / sidebar fallback when Settings has no logo)
await sharp(src).resize(512, 512).webp({ quality: 86 }).toFile(join(root, "public/brand/logo-512.webp"));
await sharp(src).resize(512, 512).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toFile(join(root, "public/brand/logo-512.png"));
console.log("  ✓ public/brand/logo-512.webp, logo-512.png");
// Browser tab + Apple touch icon (Next.js picks these up from src/app)
await square(64, "src/app/icon.png");
await square(180, "src/app/apple-icon.png", 0.92);
// PWA icons: "any" fill the square; "maskable" keep the logo inside the
// 80% safe zone so Android's circle/squircle masks don't clip it.
await square(192, "public/icons/icon-192.png");
await square(512, "public/icons/icon-512.png");
await square(192, "public/icons/maskable-192.png", 0.72);
await square(512, "public/icons/maskable-512.png", 0.72);
