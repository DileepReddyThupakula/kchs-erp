import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // testTimeout: a render loop is the failure this suite guards against; 15 s is still quick to fail, and it keeps a busy machine (browser PDF checks run in the same pass) from giving false alarms.
  test: { environment: "jsdom", include: ["tests/ui/**/*.test.tsx"], setupFiles: ["tests/ui/setup.ts"], restoreMocks: true, testTimeout: 15000, teardownTimeout: 3000 },
});
