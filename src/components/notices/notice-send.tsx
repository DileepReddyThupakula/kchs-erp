"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircularSheet, type CircularData } from "@/components/notices/circular-sheet";
import { DiarySharePanel, type SendGroup } from "@/components/notices/share-panel";
import type { CardSchool } from "@/components/notices/diary-card";

/** The image is about 1080 px wide; if the circular is taller than this it is split into two images. */
export const MAX_IMAGE_HEIGHT = 1900;

/** "Send on WhatsApp" for a published notice (Admin and the duty only): image(s), bilingual text, per-group checklist. */
export function NoticeSend({ noticeId, data, cardSchool, text, groups, date }: { noticeId: string; data: CircularData; cardSchool: CardSchool; text: string; groups: SendGroup[]; date: string }) {
  const [open, setOpen] = useState(false);
  const [split, setSplit] = useState(false);
  const probe = useRef<HTMLDivElement>(null);
  const hasTe = !!(data.titleTe || data.bodyTe);

  // measure the full circular as it will be drawn; taller than the limit -> two images
  useEffect(() => {
    let dead = false;
    document.fonts.ready.then(() => {
      if (!dead && probe.current) setSplit(hasTe && probe.current.scrollHeight > MAX_IMAGE_HEIGHT);
    });
    return () => {
      dead = true;
    };
  }, [data, hasTe]);

  const cards = useMemo(
    () => (split ? [<CircularSheet key="1" data={data} layout="image" part="first" />, <CircularSheet key="2" data={data} layout="image" part="second" />] : [<CircularSheet key="1" data={data} layout="image" />]),
    [split, data],
  );
  const cardNames = split ? [{ label: data.circularNo ?? "Circular", part: " (1/2)" }, { label: data.circularNo ?? "Circular", part: " (2/2)" }] : [{ label: data.circularNo ?? "Circular", part: "" }];
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Send className="size-4" /> Send on WhatsApp
      </Button>
      <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, width: 1080, pointerEvents: "none" }}>
        <div ref={probe}>
          <CircularSheet data={data} layout="image" />
        </div>
      </div>
      <DiarySharePanel
        open={open}
        onClose={() => setOpen(false)}
        school={cardSchool}
        date={date}
        classes={[]}
        cards={cards}
        cardNames={cardNames}
        logKind="notice"
        logSummary={`Circular ${data.circularNo ?? ""}: ${data.title}`}
        noticeId={noticeId}
        groups={groups}
        text={text}
        printHref={`/print/notice/${noticeId}`}
        title={`Send circular ${data.circularNo ?? ""}`}
      />
    </>
  );
}
