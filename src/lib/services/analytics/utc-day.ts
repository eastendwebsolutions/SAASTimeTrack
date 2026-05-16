/** Normalize to UTC calendar day at 00:00:00 (matches reporting `timestamp without time zone` convention). */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfUtcDay(d: Date): Date {
  const start = startOfUtcDay(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function addUtcDays(d: Date, days: number): Date {
  const x = startOfUtcDay(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
