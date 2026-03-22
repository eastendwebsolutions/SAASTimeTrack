"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  initialTimezone: string;
};

function getTimezones() {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return ["UTC"];
}

export function TimezonePreferenceForm({ initialTimezone }: Props) {
  const options = useMemo(() => getTimezones(), []);
  const [timezone, setTimezone] = useState(initialTimezone || "UTC");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSave() {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/users/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save timezone");
      }
      setMessage("Timezone saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save timezone.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm text-zinc-300" htmlFor="user-timezone">
        Timezone
      </label>
      <select
        id="user-timezone"
        className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm"
        value={timezone}
        onChange={(event) => setTimezone(event.target.value)}
      >
        {options.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save timezone"}
        </Button>
        {message ? <p className="text-sm text-zinc-400">{message}</p> : null}
      </div>
    </div>
  );
}
