import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // testTimeout: a render loop is the failure this suite guards against, so give up fast.
  test: { environment: "jsdom", include: ["tests/ui/**/*.test.tsx"], restoreMocks: true, testTimeout: 8000, teardownTimeout: 3000 },
});
