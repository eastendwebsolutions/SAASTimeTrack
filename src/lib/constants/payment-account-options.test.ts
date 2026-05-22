import { describe, expect, it } from "vitest";
import { formatPaymentAccountLine, formatPaymentAccountLineFromSnapshot } from "./payment-account-options";

describe("payment account formatting", () => {
  it("uses the selected account type as the label", () => {
    expect(formatPaymentAccountLine("US GCash", "+63 912 345 6789")).toBe("US GCash: +63 912 345 6789");
  });

  it("supports legacy paypal snapshots", () => {
    expect(formatPaymentAccountLineFromSnapshot({ paypalAddress: "pay@example.com" })).toBe("PayPal: pay@example.com");
  });
});
