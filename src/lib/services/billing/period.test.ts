import { describe, expect, it } from "vitest";
import {
  getBillingPeriodBounds,
  getBillingPeriodLabel,
  getMostRecentCompletedBillingWeek,
  getSpartanRestorationInauguralBillingWeek,
} from "./period";

describe("billing period utilities", () => {
  it("returns previous completed week when current week is in progress", () => {
    const now = new Date("2026-05-01T16:00:00.000Z");
    const { periodStart, periodEnd } = getMostRecentCompletedBillingWeek(now);
    expect(periodStart.toISOString().slice(0, 10)).toBe("2026-04-18");
    expect(periodEnd.toISOString().slice(0, 10)).toBe("2026-04-24");
  });

  it("uses May 18–24 2026 for Spartan Restoration companies", () => {
    const { periodStart, periodEnd } = getBillingPeriodBounds("spartanrestoration.com");
    expect(periodStart).toEqual(getSpartanRestorationInauguralBillingWeek().periodStart);
    expect(periodEnd).toEqual(getSpartanRestorationInauguralBillingWeek().periodEnd);
    expect(getBillingPeriodLabel(periodStart, periodEnd)).toBe("May 18, 2026 to May 24, 2026");
  });

  it("formats billing labels using long month names", () => {
    const label = getBillingPeriodLabel(new Date("2026-04-25T00:00:00.000Z"), new Date("2026-05-01T00:00:00.000Z"));
    expect(label).toContain("2026");
    expect(label).toContain("to");
  });
});

