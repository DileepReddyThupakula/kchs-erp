"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/** Date picker for the attendance list (past days only). */
export function DatePicker({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  return (
    <Field label="Date" name="att-date">
      <Input id="att-date" type="date" value={value} max={max} onChange={(e) => e.target.value && router.push(`/attendance?date=${e.target.value}`)} className="w-44" />
    </Field>
  );
}

export function SectionPicker({ sections, date }: { sections: { id: string; label: string }[]; date: string }) {
  const router = useRouter();
  const [section, setSection] = useState("");
  const [session, setSession] = useState("morning");
  return (
    <>
      <Field label="Section" name="att-section">
        <Select id="att-section" value={section} onChange={(e) => setSection(e.target.value)} className="min-w-44">
          <option value="">— choose —</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Session" name="att-session">
        <Select id="att-session" value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="morning">Morning</option>
          <option value="afternoon">Afternoon</option>
        </Select>
      </Field>
      <Button disabled={!section} onClick={() => router.push(`/attendance?section=${section}&session=${session}&date=${date}`)}>
        Open
      </Button>
    </>
  );
}
