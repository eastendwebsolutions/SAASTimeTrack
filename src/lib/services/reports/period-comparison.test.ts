import { describe, expect, it } from "vitest";
import { buildDateRangeComparisonPeriods } from "./period-comparison";

describe("buildDateRangeComparisonPeriods", () => {
  it("returns 5 weekly comparable windows", () => {
    const start = new Date("2026-02-02T00:00:00.000Z");
    const end = new Date("2026-02-08T23:59:59.999Z");
    const periods = buildDateRangeComparisonPeriods(start, end);
    expect(periods).toHaveLength(5);
    expect(periods[4].isSelected).toBe(true);
  });

  it("returns 5 custom duration windows", () => {
    const start = new Date("2026-03-03T00:00:00.000Z");
    const end = new Date("2026-03-09T23:59:59.999Z");
    const periods = buildDateRangeComparisonPeriods(start, end);
    expect(periods[0].start < periods[4].start).toBe(true);
  });
});
