import Link from "next/link";
import { AlertTriangle, BookText, FileBadge, GraduationCap, ListChecks, Settings2, UserCheck } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { KIND_LABEL } from "@/features/certificates/shared";

export const metadata = { title: "Certificates" };

type Tile = { href: string; title: string; text: string; icon: React.ReactNode };

/** The certificates hub. A person sees only what they may use: the TC and the settings are the Admin's; bonafide, study and their registers also belong to an office person with the duty. */
export default async function CertificatesHub() {
  const me = await requirePage("/students/certificates");
  const admin = me.role === "admin";
  const supabase = await createClient();
  const { data: tmpl } = admin ? await supabase.from("certificate_templates").select("kind, layout_draft").eq("kind", "tc").maybeSingle() : { data: null };
  const tiles: Tile[] = [
    ...(admin ? [{ href: "/students/certificates/issue/tc", title: "Issue a TC", text: "Transfer certificate with the checks. Changes the student to “TC issued”.", icon: <FileBadge className="size-5" aria-hidden /> }] : []),
    { href: "/students/certificates/issue/bonafide", title: "Issue a bonafide certificate", text: "For a student who is still at the school: scholarship, passport, bank.", icon: <UserCheck className="size-5" aria-hidden /> },
    { href: "/students/certificates/issue/study", title: "Issue a study certificate", text: "The classes the student studied here, from the class history.", icon: <GraduationCap className="size-5" aria-hidden /> },
    { href: "/students/certificates/register", title: "Register", text: "Every certificate by number, per type and year. Print or export.", icon: <ListChecks className="size-5" aria-hidden /> },
    ...(admin ? [{ href: "/students/certificates/settings", title: "Settings", text: "Number prefix and start, wording, Telugu checks, the TC draft switch.", icon: <Settings2 className="size-5" aria-hidden /> }] : []),
  ];
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "Certificates" }]} icon={<BookText />} title="Certificates" description="Transfer, bonafide and study certificates with their own numbers. Every issue and every print is recorded." />
      {admin && tmpl?.layout_draft && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>The {KIND_LABEL.tc} layout is a DRAFT: you can preview it, but a real TC cannot be issued until you compare it with a real TC and switch the draft off in <Link href="/students/certificates/settings" className="underline">Settings</Link>.</span>
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="flex h-full gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-navy-200 hover:bg-navy-50">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-900 text-gold-400">{t.icon}</span>
              <span><span className="block font-semibold text-navy-900">{t.title}</span><span className="block text-sm text-muted">{t.text}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
