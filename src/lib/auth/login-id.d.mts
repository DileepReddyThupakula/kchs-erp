export const HIDDEN_DOMAIN: string;
export type LoginKind = "email" | "mobile" | "username";
export type ParsedLoginId = { ok: true; kind: LoginKind; canonical: string; authEmail: string } | { ok: false; error: string };
export function parseLoginId(raw: unknown): ParsedLoginId;
export function loginLabel(parsed: Extract<ParsedLoginId, { ok: true }>): string;
export function maskLoginId(stored: string): string;
export function loginKey(parsed: Extract<ParsedLoginId, { ok: true }>, secret: string | undefined): string;
export function isHiddenAddress(email: unknown): boolean;
