import { describe, expect, it } from "vitest";
import { buildInvoicePdf, invoicePdfFilename } from "./invoice-pdf";

const sampleSnapshot = {
  firstName: "Bryan",
  lastName: "Spano",
  address: "PO Box 441",
  address2: null,
  city: "East Moriches",
  state: "New York",
  province: null,
  zip: "11940",
  country: "United States",
  phone: "516-901-2681",
  paymentAccountType: "PayPal",
  paymentAccountAddress: "test@example.com",
  userDisplayName: "Bryan Spano",
  userEmail: "bryan@example.com",
};

describe("invoice PDF", () => {
  it("builds a valid PDF buffer", async () => {
    const pdf = await buildInvoicePdf({
      invoiceNumber: "INV-2026-014",
      periodLabel: "May 8, 2026 to May 14, 2026",
      submittedLabel: "May 16, 2026 10:00 AM ET",
      billToRecipients: ["billing@acme.com", "ap@acme.com"],
      billingSnapshot: sampleSnapshot,
      lineItems: [{ description: "Billing Period: May 8, 2026 to May 14, 2026", amount: 1500 }],
      userBody: null,
      defaultFooter: null,
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });

  it("sanitizes attachment filenames", () => {
    expect(invoicePdfFilename("INV 2026/014")).toBe("Invoice-INV_2026_014.pdf");
  });
});
