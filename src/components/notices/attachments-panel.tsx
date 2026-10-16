"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ImageIcon, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeAttachment, uploadAttachment } from "@/features/notices/actions";
import type { FileLink } from "@/features/notices/queries";

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Attachments of a diary entry or notice (PDF / images, private storage, 5-minute links). */
export function AttachmentsPanel({ kind, parentId, files, canEdit }: { kind: "diary" | "notice"; parentId: string | null; files: FileLink[]; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!parentId) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("parent", parentId);
    fd.set("file", file);
    const r = await uploadAttachment(fd);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message ?? "Attached.");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-navy-900">
        <Paperclip className="size-4" aria-hidden /> Attachments
      </h3>
      {files.length === 0 && <p className="text-sm text-muted">No attachments.</p>}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-3 py-2">
            {f.mime === "application/pdf" ? <FileText className="size-4 shrink-0 text-red-700" aria-hidden /> : <ImageIcon className="size-4 shrink-0 text-navy-500" aria-hidden />}
            <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-navy-700 hover:underline">
              {f.name}
            </a>
            <span className="text-xs text-muted">{kb(f.size)}</span>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${f.name}`}
                onClick={async () => {
                  const r = await removeAttachment(kind, f.id);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("File removed.");
                  router.refresh();
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canEdit &&
        (parentId ? (
          <div>
            <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" id={`att-${kind}`} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
              <Paperclip className="size-4" /> Add a PDF or image (up to 5 MB)
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">Save the {kind === "notice" ? "notice" : "entry"} first, then you can attach files.</p>
        ))}
    </div>
  );
}
