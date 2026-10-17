"use client";
import Link from "next/link";
import { useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCopy, Download, ExternalLink, Image as ImageIcon, Info, Printer, Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Drawer, Modal } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/card";
import { CardRenderer, diaryCardsFor, type CardSchool, type RenderedCard } from "@/components/notices/diary-card";
import { logShare, markNoticeSend, openNoticeSend } from "@/features/notices/actions";
import type { CombinedLine } from "@/features/notices/shared";
import { canShareFiles, copyPng, copyText, downloadBlob, getChannelPref, guideSeen, markGuideSeen, setChannelPref, shareFiles, waAppUrl, waUrl, type WaChannel } from "@/lib/share";

export type ShareClass = { sectionId: string; label: string; lines: CombinedLine[] };

/** What the website can and cannot do, in plain words. */
export function SharingHelp() {
  return (
    <div className="rounded-lg border border-gold-200 bg-gold-50 p-3 text-sm text-navy-900">
      <p className="flex items-center gap-1.5 font-semibold">
        <Info className="size-4" aria-hidden /> How sharing to WhatsApp works
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <li>A website cannot attach an image to WhatsApp or send anything by itself. Nothing is sent automatically.</li>
        <li>
          You: <b>copy the image</b> here → <b>open WhatsApp</b> (the text is already filled in) → <b>pick the group</b> → <b>paste</b> the image (Cmd+V on a Mac, Ctrl+V on Windows) → send.
        </li>
        <li>On phones that support it, “Share image + text” hands the picture straight to WhatsApp.</li>
        <li>This app records that WhatsApp was <i>opened</i>. It cannot know whether you sent the message.</li>
      </ul>
    </div>
  );
}

/**
 * Send the combined class diary (one class, or several for one school group).
 * Images are drawn here in the browser; text is built from the published lines.
 */
export type SendGroup = { key: string; label: string; status: string; openedBy: string | null; openedAt: string | null; markedBy: string | null; markedAt: string | null };

export function DiarySharePanel({
  open,
  onClose,
  school,
  date,
  classes,
  text,
  printHref,
  title,
  blockedReason,
  cards,
  cardNames,
  logKind = "diary",
  logSummary,
  noticeId,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  school: CardSchool;
  date: string;
  classes: ShareClass[];
  /** Notices: ready-made image cards and their names instead of the diary cards built from `classes`. */
  cards?: ReactElement[];
  cardNames?: { label: string; part: string }[];
  logKind?: "diary" | "notice";
  logSummary?: string;
  /** Notices: the per-group send checklist (one row per WhatsApp group). */
  noticeId?: string;
  groups?: SendGroup[];
  text: string;
  printHref?: string;
  title: string;
  /** Why sending is switched off (e.g. not published yet). Images and text are still shown as a preview. */
  blockedReason?: string;
}) {
  const [images, setImages] = useState<{ label: string; part: string; card: RenderedCard }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);
  const [guide, setGuide] = useState(false);
  const [pending, setPending] = useState<{ channel: WaChannel; groupKey?: string } | null>(null);
  const router = useRouter();
  const [pref, setPref] = useState<WaChannel>(() => getChannelPref());
  const per = useMemo(() => (cards ? [cards] : classes.map((c) => diaryCardsFor(school, c.label, date, c.lines))), [cards, classes, school, date]);
  const flat = useMemo(() => per.flat(), [per]);
  const renderKey = useMemo(() => JSON.stringify([cards ? text : classes, date, school.name, flat.length]), [cards, text, classes, date, school.name, flat.length]);
  const names = useMemo(() => (cardNames ? cardNames : classes.flatMap((c, i) => per[i].map((_, j) => ({ label: c.label, part: per[i].length > 1 ? ` (${j + 1}/${per[i].length})` : "" })))), [cardNames, classes, per]);
  const sectionId = !cards && classes.length === 1 ? classes[0].sectionId : null;
  const summary = (logSummary ?? `Diary ${date}: ${classes.map((c) => c.label).join(", ")}`).slice(0, 280);

  // copy / download / print / share are logged here; "open WhatsApp" for a notice group is logged by the checklist action
  const log = (channel: "app" | "web" | "share" | "copy" | "download" | "print") => void logShare({ kind: logKind, target: "group", sectionId, date, channel, summary });

  const fileName = (i: number) => `diary-${date}-${(names[i]?.label ?? "class").replace(/[^\w]+/g, "-")}${names[i]?.part ? `-${i + 1}` : ""}.png`;

  async function copyImage(i: number) {
    const ok = await copyPng(images[i].card.blob);
    if (ok) {
      toast.success("Image copied. In WhatsApp, click the message box and paste (Cmd+V / Ctrl+V).");
      log("copy");
    } else toast.error("Your browser would not copy the image. Use Download image and attach it in WhatsApp.");
  }
  function download(i: number) {
    downloadBlob(images[i].card.blob, fileName(i));
    log("download");
  }
  async function send(channel: WaChannel, groupKey?: string) {
    setChannelPref(channel);
    setPref(channel);
    // open first (inside the click), then copy the first image
    const url = channel === "web" ? waUrl("web", text) : waAppUrl(text);
    const copied = images.length ? copyPng(images[0].card.blob) : Promise.resolve(false);
    if (channel === "web") window.open(url, "_blank", "noopener");
    else window.location.href = url;
    if (groupKey && noticeId) void openNoticeSend(noticeId, groupKey, channel).then((r) => (r.ok ? router.refresh() : toast.error(r.error)));
    else log(channel);
    const ok = await copied;
    toast.success(ok ? "WhatsApp opened and the image is copied. Pick the group, then paste the image (Cmd+V / Ctrl+V)." : "WhatsApp opened. Image copy was blocked: use Copy image or Download image.", { duration: 9000 });
    if (images.length > 1) toast.message(`There are ${images.length} images. Paste this one, then use “Copy image” for the next.`, { duration: 9000 });
  }
  function start(channel: WaChannel, groupKey?: string) {
    if (!guideSeen()) {
      setPending({ channel, groupKey });
      setGuide(true);
    } else void send(channel, groupKey);
  }
  async function share() {
    const files = images.map((im, i) => new File([im.card.blob], fileName(i), { type: "image/png" }));
    if (!canShareFiles(files)) return void toast.error("This browser cannot share pictures directly. Use the WhatsApp buttons.");
    const r = await shareFiles(files, text, title);
    if (r === "shared") log("share");
    if (r === "failed") toast.error("Sharing did not work. Use the WhatsApp buttons.");
  }
  const canShare = typeof window !== "undefined" && images.length > 0 && canShareFiles(images.map((im, i) => new File([im.card.blob], fileName(i), { type: "image/png" })));

  return (
    <>
      <Drawer open={open} onClose={onClose} title={title} wide>
        {open && (
          <div className="flex h-full flex-col overflow-y-auto p-4">
            <div className="space-y-4">
              <SharingHelp />
              {blockedReason && (
                <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {blockedReason}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!groups && (
                  <>
                <Button disabled={busy || !!err || !!blockedReason} onClick={() => start(pref)}>
                  <Send className="size-4" /> Send on WhatsApp
                </Button>
                <Button variant="secondary" disabled={busy || !!err || !!blockedReason} onClick={() => start("app")}>
                  <ExternalLink className="size-4" /> Open in WhatsApp app
                </Button>
                <Button variant="secondary" disabled={busy || !!err || !!blockedReason} onClick={() => start("web")}>
                  <ExternalLink className="size-4" /> Open in WhatsApp Web
                </Button>
                  </>
                )}
                {canShare && !blockedReason && (
                  <Button variant="secondary" onClick={share}>
                    <Share2 className="size-4" /> Share image + text
                  </Button>
                )}
                <span className="text-xs text-muted">WhatsApp: {pref === "web" ? "Web" : "app"} (remembered)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    if (await copyText(text)) {
                      toast.success("Text copied.");
                      log("copy");
                    } else window.prompt("Copy this text:", text);
                  }}
                >
                  <ClipboardCopy className="size-4" /> Copy text
                </Button>
                {printHref && !blockedReason && (
                  <Link href={printHref} target="_blank" onClick={() => log("print")} className={buttonClasses("secondary", "sm")}>
                    <Printer className="size-4" aria-hidden /> Print
                  </Link>
                )}
              </div>
              {groups && groups.length > 0 && (
                <div>
                  <h3 className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
                    Send checklist <Badge tone="info">Sent to {groups.filter((g) => g.status === "marked_sent").length} of {groups.length} groups</Badge>
                  </h3>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="Open WhatsApp with">
                    <span className="text-muted">Open with:</span>
                    {(["app", "web"] as const).map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={pref === c} onClick={() => (setChannelPref(c), setPref(c))} className={`rounded-lg border px-3 py-1 ${pref === c ? "border-navy-900 bg-navy-900 text-gold-400" : "border-border bg-surface hover:bg-navy-50"}`}>
                        {c === "app" ? "WhatsApp app" : "WhatsApp Web"}
                      </button>
                    ))}
                  </div>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
                    {groups.map((g) => (
                      <li key={g.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{g.label}</span>
                          <span className="block text-xs text-muted">
                            {g.status === "marked_sent"
                              ? `Marked as sent by ${g.markedBy ?? "someone"} · ${g.markedAt ? new Date(g.markedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : ""}`
                              : g.status === "opened"
                                ? `WhatsApp opened by ${g.openedBy ?? "someone"} · ${g.openedAt ? new Date(g.openedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : ""}. Not marked as sent yet.`
                                : "Not sent yet"}
                          </span>
                        </span>
                        <Button size="sm" variant="secondary" disabled={busy || !!err || !!blockedReason} onClick={() => start(pref, g.key)}>
                          <Send className="size-4" /> Open WhatsApp
                        </Button>
                        <Button
                          size="sm"
                          variant={g.status === "marked_sent" ? "ghost" : "primary"}
                          onClick={async () => {
                            const r = await markNoticeSend(noticeId!, g.key, g.status !== "marked_sent");
                            if (!r.ok) return void toast.error(r.error);
                            toast.success(r.message ?? "Done.");
                            router.refresh();
                          }}
                        >
                          {g.status === "marked_sent" ? "Undo" : "Mark as sent"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted">“Mark as sent” is your own tick after you pressed send in WhatsApp. The app cannot know whether a message was delivered.</p>
                </div>
              )}
              <div>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-navy-900">
                  <ImageIcon className="size-4" aria-hidden /> Image{images.length > 1 ? "s" : ""}
                  {busy && <Badge tone="neutral">Drawing…</Badge>}
                </h3>
                {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {images.map((im, i) => (
                    <div key={i} className="rounded-lg border border-border bg-surface p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={im.card.url} alt={`Diary card, ${im.label}${im.part}`} className="w-full rounded border border-border" />
                      <p className="mt-1 text-xs text-muted">
                        {im.label}
                        {im.part}
                      </p>
                      <div className="mt-1 flex gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => copyImage(i)}>
                          <ClipboardCopy className="size-4" /> Copy image
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => download(i)}>
                          <Download className="size-4" /> Download image
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-navy-900">Message text (English first, then Telugu)</h3>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-cream-50 p-3 text-sm">{text}</pre>
              </div>
            </div>
          </div>
        )}
      </Drawer>
      {open && (
        <CardRenderer
          cards={flat}
          renderKey={renderKey}
          onDone={(r) => {
            setImages(r.map((card, i) => ({ label: names[i]?.label ?? "", part: names[i]?.part ?? "", card })));
            setErr("");
            setBusy(false);
          }}
          onError={(m) => {
            setErr(m);
            setBusy(false);
          }}
        />
      )}
      <Modal
        open={guide}
        onClose={() => setGuide(false)}
        title="Before WhatsApp opens"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGuide(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                markGuideSeen();
                setGuide(false);
                if (pending) void send(pending.channel, pending.groupKey);
              }}
            >
              Got it, open WhatsApp
            </Button>
          </>
        }
      >
        <ol className="list-decimal space-y-1.5 pl-5 text-foreground">
          <li>The picture is copied for you and WhatsApp opens with the text filled in.</li>
          <li>
            <b>Pick the group</b> (or chat) you want to send to.
          </li>
          <li>
            Click the message box and <b>paste the image with Cmd+V</b> (Ctrl+V on Windows).
          </li>
          <li>Check it, then press send. Nothing is sent until you do.</li>
        </ol>
        <p className="mt-2 text-sm">You will only see this once.</p>
      </Modal>
    </>
  );
}
