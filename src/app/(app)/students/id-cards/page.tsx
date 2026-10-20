import Link from "next/link";
import { Camera, IdCard, ListChecks, Settings2, Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { PageHeader } from "@/components/ui/card";
import { FindByCardNumber } from "@/components/id-cards/find-card";

export const metadata = { title: "ID cards" };

type Tile = { href: string; title: string; text: string; icon: React.ReactNode };

/** The ID cards hub. A person sees only what they may use: the settings are the Admin's; everything else belongs to the Admin and the office person with the duty. */
export default async function IdCardsHub() {
  const me = await requirePage("/students/id-cards");
  const admin = me.role === "admin";
  const tiles: Tile[] = [
    { href: "/students/id-cards/issue", title: "Issue cards", text: "One student, one section or a whole class. See the sheet before the numbers are given.", icon: <Printer className="size-5" aria-hidden /> },
    { href: "/students/id-cards/photos", title: "Photos", text: "Upload many photos at once (named by admission number) and see who still has none.", icon: <Camera className="size-5" aria-hidden /> },
    { href: "/students/id-cards/register", title: "Register", text: "Every card by number. Replace a lost card, print or export the list.", icon: <ListChecks className="size-5" aria-hidden /> },
    ...(admin ? [{ href: "/students/id-cards/settings", title: "Settings", text: "Number prefix, and whether the back shows the parent phone and the blood group.", icon: <Settings2 className="size-5" aria-hidden /> }] : []),
  ];
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "ID cards" }]} icon={<IdCard />} title="ID cards" description="Student ID cards, 86 × 54 mm, ten to an A4 sheet. Every issue, print, replacement and lookup is recorded." />
      <FindByCardNumber canOpenStudent={admin} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
