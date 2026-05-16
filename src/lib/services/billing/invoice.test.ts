import { describe, expect, it } from "vitest";
import { sumInvoiceLineItems } from "./invoice";

describe("invoice utilities", () => {
  it("sums line item amounts", () => {
    expect(
      sumInvoiceLineItems([
        { description: "Work", amount: 100 },
        { description: "Expenses", amount: 25.5 },
      ]),
    ).toBe(125.5);
  });
});
