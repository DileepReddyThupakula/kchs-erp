// Money formatting / parsing / amount-in-words (pure functions, no database).
import { amountInWords, formatPaise, parseRupees, rupeesInput } from "../../src/lib/money.ts";

export const name = "money helpers (Indian format, words, parsing)";

export default async function run({ ok }) {
  const eq = (a, b, d) => ok(a === b, d, `got ${JSON.stringify(a)}`);
  eq(formatPaise(12345600), "₹1,23,456", "₹1,23,456 Indian grouping");
  eq(formatPaise(100000), "₹1,000", "whole rupees have no decimals");
  eq(formatPaise(83338), "₹833.38", "paise shown when present");
  eq(formatPaise(0), "₹0", "zero");
  eq(formatPaise(100, { fixed: true }), "₹1.00", "fixed decimals for receipts");
  eq(formatPaise(10000000000), "₹10,00,00,000", "crore grouping");
  eq(parseRupees("8,250"), 825000, "parse 8,250");
  eq(parseRupees("₹ 1234.5"), 123450, "parse ₹ 1234.5");
  eq(parseRupees("12.345"), null, "reject 3 decimals");
  eq(parseRupees("abc"), null, "reject text");
  eq(parseRupees("-5"), null, "reject negative");
  eq(rupeesInput(825000), "8250", "input text whole");
  eq(rupeesInput(83338), "833.38", "input text with paise");
  eq(amountInWords(123450), "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only", "words with paise");
  eq(amountInWords(1500000), "Rupees Fifteen Thousand Only", "words round amount");
  eq(amountInWords(12345600), "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only", "words use lakh");
  eq(amountInWords(2000000000), "Rupees Two Crore Only", "words use crore");
  eq(amountInWords(100), "Rupees One Only", "words for ₹1");
}
