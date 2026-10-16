"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { AttachmentsPanel } from "@/components/notices/attachments-panel";
import { saveNotice } from "@/features/notices/actions";
import { AUDIENCE_LABEL, ROLE_OPTIONS, fmtShort, type Audience } from "@/features/notices/shared";
import type { FileLink } from "@/features/notices/queries";

export type NoticeDraft = {
  id: string | null;
  title: string;
  body: string;
  audience: Audience;
  roles: string[];
  classIds: string[];
  staffIds: string[];
  publishDate: string;
  expiresOn: string;
  important: boolean;
  status: "draft" | "published";
  circularNo: string | null;
};

/** Create / edit a notice with a live preview of the circular. */
export function NoticeForm({ initial, classes, teachers, files, school, today }: { initial: NoticeDraft; classes: { id: string; name: string }[]; teachers: { id: string; name: string; designation: string }[]; files: FileLink[]; school: string; today: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [preview, setPreview] = useState(true);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "publish">("");
  const [error, setError] = useState("");
  const set = <K extends keyof NoticeDraft>(k: K, val: NoticeDraft[K]) => setV((x) => ({ ...x, [k]: val }));
  const toggle = (k: "roles" | "classIds" | "staffIds", id: string) => set(k, v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id]);
  const published = v.status === "published";

  const audienceLine =
    v.audience === "all"
      ? "All staff"
      : v.audience === "roles"
        ? v.roles.map((r) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r).join(", ") || "—"
        : v.audience === "classes"
          ? "Teachers of " + (v.classIds.map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(", ") || "—")
          : v.staffIds.map((id) => teachers.find((t) => t.id === id)?.name).filter(Boolean).join(", ") || "—";

  async function save(publish: boolean) {
    setError("");
    setBusy(publish ? "publish" : "save");
    const r = await saveNotice(
      { id: v.id ?? undefined, title: v.title, body: v.body, audience: v.audience, roles: v.roles as ("admin" | "teacher")[], classIds: v.classIds, staffIds: v.staffIds, publishDate: v.publishDate || undefined, expiresOn: v.expiresOn || null, important: v.important },
      publish,
    );
    setBusy("");
    if (!r.ok) return setError(r.error);
    toast.success(r.message ?? "Saved.");
    if (!v.id) router.replace(`/notices/${r.id}/edit`);
    else router.refresh();
    if (publish) router.push(`/notices/${r.id}`);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-4">
        <Card className="space-y-3">
          <Field label="Title" name="n-title">
            <Input id="n-title" value={v.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Text" name="n-body" hint="Plain text. Press Enter for a new line; leave a blank line between paragraphs.">
            <Textarea id="n-body" rows={9} value={v.body} onChange={(e) => set("body", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-navy-900">
            <input type="checkbox" className="size-4 accent-navy-700" checked={v.important} onChange={(e) => set("important", e.target.checked)} />
            Important (pinned at the top of the dashboards until it expires)
          </label>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-navy-900">Who is it for?</h2>
          <div role="radiogroup" aria-label="Audience" className="flex flex-wrap gap-2">
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={v.audience === a} onClick={() => set("audience", a)} className={`rounded-lg border px-3 py-1.5 text-sm ${v.audience === a ? "border-navy-900 bg-navy-900 font-medium text-gold-400" : "border-border bg-surface text-navy-800 hover:bg-navy-50"}`}>
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
          {v.audience === "roles" && (
            <div className="flex flex-wrap gap-4">
              {ROLE_OPTIONS.map((r) => (
                <label key={r.value} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="size-4 accent-navy-700" checked={v.roles.includes(r.value)} onChange={() => toggle("roles", r.value)} /> {r.label}
                </label>
              ))}
            </div>
          )}
          {v.audience === "classes" && (
            <div>
              <p className="mb-1 text-xs text-muted">The notice reaches the teachers (class teachers and subject teachers) of these classes.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {classes.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="size-4 accent-navy-700" checked={v.classIds.includes(c.id)} onChange={() => toggle("classIds", c.id)} /> {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {v.audience === "teachers" && (
            <div className="space-y-2">
              <Input aria-label="Find a teacher" placeholder="Find a teacher" value={find} onChange={(e) => setFind(e.target.value)} className="max-w-xs" />
              <div className="grid max-h-56 gap-1 overflow-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                {teachers
                  .filter((t) => t.name.toLowerCase().includes(find.toLowerCase()))
                  .map((t) => (
                    <label key={t.id} className="inline-flex items-center gap-1.5 text-sm">
                      <input type="checkbox" className="size-4 accent-navy-700" checked={v.staffIds.includes(t.id)} onChange={() => toggle("staffIds", t.id)} />
                      <span>
                        {t.name} <span className="text-xs text-muted">{t.designation}</span>
                      </span>
                    </label>
                  ))}
              </div>
              <p className="text-xs text-muted">{v.staffIds.length} selected</p>
            </div>
          )}
        </Card>

        <Card className="grid gap-3 sm:grid-cols-2">
          <Field label="Publish date" name="n-pub" hint="The notice becomes visible on this date.">
            <Input id="n-pub" type="date" value={v.publishDate} onChange={(e) => set("publishDate", e.target.value)} />
          </Field>
          <Field label="Expiry date (optional)" name="n-exp" hint="After this date it is hidden from the audience.">
            <Input id="n-exp" type="date" min={v.publishDate} value={v.expiresOn} onChange={(e) => set("expiresOn", e.target.value)} />
          </Field>
        </Card>

        <Card>
          <AttachmentsPanel kind="notice" parentId={v.id} files={files} canEdit />
        </Card>

        {error && (
          <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {published ? (
            <Button loading={busy === "save"} disabled={!!busy} onClick={() => save(false)}>
              Save changes
            </Button>
          ) : (
            <>
              <Button loading={busy === "publish"} disabled={!!busy} onClick={() => save(true)}>
                Save and publish
              </Button>
              <Button variant="secondary" loading={busy === "save"} disabled={!!busy} onClick={() => save(false)}>
                Save as draft
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setPreview((p) => !p)} className="xl:hidden">
            {preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {preview ? "Hide" : "Show"} preview
          </Button>
          {published && <span className="text-xs text-muted">Published as {v.circularNo}. Changes are visible at once.</span>}
        </div>
      </div>

      {preview && (
        <aside aria-label="Preview" className="xl:sticky xl:top-20 xl:self-start">
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Preview {v.important && <Badge tone="gold">Important</Badge>}
          </p>
          <div className="rounded-lg border-2 border-navy-900 bg-white p-4 text-black shadow-sm" style={{ outline: "1px solid #b8962e", outlineOffset: "-5px" }}>
            <p className="border-b border-black pb-1 text-center font-display text-sm font-bold uppercase tracking-wide text-navy-950">{school}</p>
            <div className="mt-2 flex justify-between text-xs">
              <span>
                <b>Circular No:</b> {v.circularNo ?? "(given when published)"}
              </span>
              <span>
                <b>Date:</b> {fmtShort(v.publishDate || today)}
              </span>
            </div>
            <h3 className="my-3 text-center text-sm font-bold uppercase underline">{v.title || "Title"}</h3>
            <p className="whitespace-pre-wrap text-xs leading-relaxed">{v.body || "The notice text appears here."}</p>
            <p className="mt-4 text-xs">
              <b>To:</b> {audienceLine}
            </p>
            <p className="mt-10 text-right text-xs">
              <span className="inline-block w-28 border-t border-black pt-0.5 text-center">Principal</span>
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
