import { describe, expect, it } from "vitest";
import { canSubmitForLatestSubmission } from "./submissions";

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

