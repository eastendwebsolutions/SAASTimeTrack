import { addDays, addMonths, addWeeks, differenceInCalendarDays, isSameDay } from "date-fns";

export type ComparablePeriod = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  isSelected: boolean;
};

function formatYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildDateRangeComparisonPeriods(start: Date, end: Date): ComparablePeriod[] {
  const diffDays = differenceInCalendarDays(end, start) + 1;
  const monthlyCandidate = start.getDate() === 1 && end.getDate() >= 28;
  const periods: ComparablePeriod[] = [];

  for (let i = 4; i >= 0; i -= 1) {
    let pStart: Date;
    let pEnd: Date;
    if (diffDays === 7) {
      pStart = addWeeks(start, -i);
      pEnd = addWeeks(end, -i);
    } else if (monthlyCandidate) {
      pStart = addMonths(start, -i);
      pEnd = addMonths(end, -i);
    } else {
      pStart = addDays(start, -(i * diffDays));
      pEnd = addDays(end, -(i * diffDays));
    }

    periods.push({
      key: `${formatYmd(pStart)}_${formatYmd(pEnd)}`,
      label: `${formatYmd(pStart)} - ${formatYmd(pEnd)}`,
      start: pStart,
      end: pEnd,
      isSelected: i === 0,
    });
  }

  return periods;
}

export function coercePeriodKeyFromDate(date: Date, periods: ComparablePeriod[]) {
  const match = periods.find((period) => date >= period.start && date <= period.end);
  return match?.key ?? periods.find((period) => isSameDay(period.end, date))?.key ?? null;
}
