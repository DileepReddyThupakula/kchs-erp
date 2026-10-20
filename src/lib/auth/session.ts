import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type AppRole, type Capability, type Duty } from "./permissions";
import type { AcademicYear } from "@/types/database";

export type CurrentStaff = {
  userId: string;
  email: string | undefined;
  staffId: string;
  fullName: string;
  role: AppRole;
  /** Effective duties (Admin: all of them). */
  duties: Duty[];
};

/**
 * Who am I, my duties and the academic years: ONE database call per page (it used to be three). The database applies the same rules as before:
 * a person sees only their own active staff row; a deactivated or removed person gets nothing.
 */
export type SessionContext = {
  staff: { id: string; full_name: string; app_role: AppRole | null; status: string } | null;
  duties: Duty[];
  years: AcademicYear[];
};
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("session_context");
  return (data as unknown as SessionContext | null) ?? null;
});

/** The signed-in staff member, or null if not signed in / no active role. */
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createClient();
  // the token's signature is verified locally (no network); the database checks the person on every query
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) return null;
  const userId = claims.sub;

  const ctx = await getSessionContext();
  const staff = ctx?.staff;
  if (!staff || staff.status !== "active" || !staff.app_role) return null;

  return {
    userId,
    email: typeof claims.email === "string" ? claims.email : undefined,
    staffId: staff.id,
    fullName: staff.full_name,
    role: staff.app_role,
    duties: ctx.duties ?? [],
  };
});
export async function requireStaff(): Promise<CurrentStaff> {
  const me = await getCurrentStaff();
  if (!me) redirect("/login?error=no-access");
  return me;
}

/**
 * For server actions / pages: unless the capability is held, go to the
 * not-allowed page. Call this BEFORE loading any data, so nothing leaks.
 */
export async function requireCapability(capability: Capability): Promise<CurrentStaff> {
  const me = await requireStaff();
  if (!can(me, capability)) redirect("/not-allowed");
  return me;
}

/** Teacher-only pages ("My classes" etc.). Admin uses the full setup pages. */
export async function requireTeacher(): Promise<CurrentStaff> {
  const me = await requireStaff();
  if (me.role !== "teacher") redirect("/not-allowed");
  return me;
}
