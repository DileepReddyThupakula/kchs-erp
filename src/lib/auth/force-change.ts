/** A new or reset login carries `must_change_password` in its app metadata (only the server can set it). Until the person chooses their own password,
 *  every page and action except the change-password screen sends them there. */
export const MUST_CHANGE_KEY = "must_change_password";
export const CHANGE_PASSWORD_PATH = "/change-password";

export function mustChangePassword(claims: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return claims?.app_metadata?.[MUST_CHANGE_KEY] === true;
}

/** Where to send this person instead of the page they asked for, or null to let them through. */
export function forcedChangeRedirect(claims: { app_metadata?: Record<string, unknown> | null } | null | undefined, path: string): string | null {
  if (!mustChangePassword(claims)) return null;
  return path === CHANGE_PASSWORD_PATH || path.startsWith(`${CHANGE_PASSWORD_PATH}/`) ? null : CHANGE_PASSWORD_PATH;
}
