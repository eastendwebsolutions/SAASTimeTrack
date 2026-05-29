import { describe, expect, it } from "vitest";
import { formatCityRegionZip, suggestNextInvoiceNumber, sumInvoiceLineItems } from "./invoice";

describe("invoice utilities", () => {
  it("suggests the next invoice number while preserving format", () => {
    expect(suggestNextInvoiceNumber("INV-001")).toBe("INV-002");
    expect(suggestNextInvoiceNumber("INV-2026-014")).toBe("INV-2026-015");
    expect(suggestNextInvoiceNumber("INV-2026-009")).toBe("INV-2026-010");
  });

  it("returns null when the last invoice number has no incrementable digits", () => {
    expect(suggestNextInvoiceNumber(null)).toBeNull();
    expect(suggestNextInvoiceNumber("")).toBeNull();
    expect(suggestNextInvoiceNumber("INVOICE")).toBeNull();
  });

  it("formats city line with US state, other state, or both", () => {
    expect(
      formatCityRegionZip({ city: "East Moriches", state: "New York", province: null, zip: "11940" }),
    ).toBe("East Moriches, New York, 11940");
    expect(formatCityRegionZip({ city: "Toronto", state: "", province: "Ontario", zip: "M5V 2T6" })).toBe(
      "Toronto, Ontario, M5V 2T6",
    );
  });

  it("sums line item amounts", () => {
    expect(
      sumInvoiceLineItems([
        { description: "Work", amount: 100 },
        { description: "Expenses", amount: 25.5 },
      ]),
    ).toBe(125.5);
  });
});
