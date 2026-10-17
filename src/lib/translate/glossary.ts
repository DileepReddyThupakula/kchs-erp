/**
 * School terms the translation must always render the same way. THE one place to edit:
 * the Gemini prompt is built from this list. All entries are VERIFY with a Telugu speaker.
 * Only add a term when you are sure of the Telugu.
 */
export type GlossaryTerm = { en: string; te: string };
export const GLOSSARY: GlossaryTerm[] = [
  { en: "Exercise", te: "అభ్యాసం" },
  { en: "Page", te: "పేజీ" },
  { en: "Homework", te: "ఇంటి పని" },
];
