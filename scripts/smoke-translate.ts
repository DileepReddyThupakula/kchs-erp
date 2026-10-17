// Smoke test for the Gemini translation, with your real key (read from .env.local).
//   npm run smoke:translate
// Sends ONE safe sample sentence and prints only the Telugu result and the model used.
import { geminiTranslate } from "../src/lib/translate/gemini";
import { numberTokens, protectNumbers, restoreText, sameNumbers } from "../src/lib/translate/core";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in .env.local");
  process.exit(1);
}
const sample = "Maths: Exercise 5.1, questions 1-6 on page 18. Bring your PTM form on Friday.";
try {
  const r = await geminiTranslate(protectNumbers(sample), { apiKey, model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", fallbackModel: process.env.GEMINI_FALLBACK_MODEL || undefined });
  const te = restoreText(r.text);
  console.log("Sent (English):", sample);
  console.log("Sent (as protected):", protectNumbers(sample));
  console.log("Model used:", r.model);
  console.log("Telugu:", te);
  console.log("Numbers in the English:", numberTokens(sample).join("  |  "));
  console.log("Numbers in the Telugu: ", numberTokens(te).join("  |  "));
  console.log("Numbers kept:", sameNumbers(sample, te) ? "yes" : "NO (this would be rejected)");
} catch (e) {
  console.error("Failed:", (e as Error).message); // the message never contains the key
  process.exit(1);
}
