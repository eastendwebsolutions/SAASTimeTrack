"use client";

import { useEffect } from "react";

type Props = {
  currentTimezone: string | null;
};

export function TimezoneSync({ currentTimezone }: Props) {
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected) return;
    if (currentTimezone && currentTimezone === detected) return;

    fetch("/api/users/timezone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: detected }),
    }).catch(() => {
      // Silent fallback: user can still update manually in profile settings.
    });
  }, [currentTimezone]);

  return null;
}
