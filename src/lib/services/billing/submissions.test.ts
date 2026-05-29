import { describe, expect, it } from "vitest";
import { canSubmitForLatestSubmission, suggestInvoiceNumberForPeriod } from "./submissions";

describe("billing submission rules", () => {
  it("allows first submission when no history exists", () => {
    expect(canSubmitForLatestSubmission(null)).toBe(true);
  });

  it("blocks when latest submission is submitted", () => {
    expect(canSubmitForLatestSubmission({ status: "submitted", emailStatus: "sent" })).toBe(false);
  });

  it("allows when latest submission needs resubmission", () => {
    expect(canSubmitForLatestSubmission({ status: "needs_resubmission", emailStatus: "sent" })).toBe(true);
  });

  it("allows retry after failed email", () => {
    expect(canSubmitForLatestSubmission({ status: "failed", emailStatus: "failed" })).toBe(true);
  });
});

describe("suggestInvoiceNumberForPeriod", () => {
  const basePeriod = {
    id: "period-1",
    companyId: "company-1",
    periodStartDate: new Date("2026-05-23T00:00:00.000Z"),
    periodEndDate: new Date("2026-05-29T00:00:00.000Z"),
    timezone: "America/New_York",
    label: "May 23–29, 2026",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("increments the user's last invoice for a new submittable week", () => {
    expect(
      suggestInvoiceNumberForPeriod(
        { period: basePeriod, latestSubmission: null, canSubmit: true },
        "INV-001",
      ),
    ).toBe("INV-002");
  });

  it("reuses the existing number for resubmission weeks", () => {
    expect(
      suggestInvoiceNumberForPeriod(
        {
          period: basePeriod,
          canSubmit: true,
          latestSubmission: {
            id: "sub-1",
            companyId: "company-1",
            userId: "user-1",
            billingPeriodId: "period-1",
            invoiceNumber: "INV-2026-014",
            status: "needs_resubmission",
            emailStatus: "sent",
            submissionAttemptNumber: 1,
            subject: "Invoice",
            bodyContent: null,
            adminNote: null,
            invoiceLineItemsJson: [],
            emailStatusMessage: null,
            submittedAtUtc: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        "INV-2026-099",
      ),
    ).toBe("INV-2026-014");
  });

  it("returns null when submission is not allowed", () => {
    expect(
      suggestInvoiceNumberForPeriod(
        {
          period: basePeriod,
          canSubmit: false,
          latestSubmission: {
            id: "sub-1",
            companyId: "company-1",
            userId: "user-1",
            billingPeriodId: "period-1",
            invoiceNumber: "INV-001",
            status: "submitted",
            emailStatus: "sent",
            submissionAttemptNumber: 1,
            subject: "Invoice",
            bodyContent: null,
            adminNote: null,
            invoiceLineItemsJson: [],
            emailStatusMessage: null,
            submittedAtUtc: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        "INV-001",
      ),
    ).toBeNull();
  });
});
