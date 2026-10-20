// Runs before `next build` and `next start` (package.json "prebuild" / "prestart"). Next.js AUTOMATICALLY loads .env.production and
// .env.production.local for those commands and they win over .env.local: a file with that name would point your local build at the
// wrong project. The production settings file is called .env.kchs-production, which Next never loads.
import fs from "node:fs";
const bad = [".env.production", ".env.production.local"].filter((f) => fs.existsSync(f));
if (bad.length) {
  console.error(`\nSTOP: ${bad.join(", ")} exists. Next.js would load it for a build or start and aim this app at the wrong project.\nRename it to .env.kchs-production (the name the safety guard and the scripts use), then run this again.\n`);
  process.exit(1);
}
