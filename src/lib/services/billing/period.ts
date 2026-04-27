import { BILLING_TIMEZONE } from "@/lib/validation/billing";

const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const labelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIMEZONE,
  month: "long",
  day: "numeric",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIMEZONE,
  weekday: "short",
});

function getNyDateParts(input: Date) {
  const parts = datePartsFormatter.formatToParts(input);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function addUtcDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnlyUtc(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

function weekdayIndexShort(weekday: string) {
  const map = new Map([
    ["Sun", 0],
    ["Mon", 1],
    ["Tue", 2],
    ["Wed", 3],
    ["Thu", 4],
    ["Fri", 5],
    ["Sat", 6],
  ]);
  return map.get(weekday) ?? 0;
}

export function getBillingWeekBounds(now = new Date()) {
  const nyDate = toDateOnlyUtc(getNyDateParts(now));
  const weekday = weekdayIndexShort(weekdayFormatter.format(now));
  const daysFromSaturday = (weekday + 1) % 7;
  const periodStart = addUtcDays(nyDate, -daysFromSaturday);
  const periodEnd = addUtcDays(periodStart, 6);

  return { periodStart, periodEnd };
}

export function getMostRecentCompletedBillingWeek(now = new Date()) {
  const { periodStart, periodEnd } = getBillingWeekBounds(now);
  const nowNyDate = toDateOnlyUtc(getNyDateParts(now));
  const hasWeekEnded = nowNyDate > periodEnd;

  if (hasWeekEnded) {
    return { periodStart, periodEnd };
  }

  return {
    periodStart: addUtcDays(periodStart, -7),
    periodEnd: addUtcDays(periodEnd, -7),
  };
}

export function getBillingPeriodLabel(periodStart: Date, periodEnd: Date) {
  return `${labelFormatter.format(periodStart)} to ${labelFormatter.format(periodEnd)}`;
}

export function buildBillingSubject(userDisplayName: string, periodStart: Date, periodEnd: Date) {
  return `${userDisplayName} - Billing Submission for ${getBillingPeriodLabel(periodStart, periodEnd)}`;
}

export function formatSubmittedAtEasternLabel(input: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BILLING_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(input);
}

export function getPeriodKey(periodStart: Date, periodEnd: Date) {
  return `${periodStart.toISOString().slice(0, 10)}:${periodEnd.toISOString().slice(0, 10)}`;
}

