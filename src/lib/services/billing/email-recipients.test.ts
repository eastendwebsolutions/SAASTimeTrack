import { describe, expect, it } from "vitest";
import { buildSubmissionEmailRecipients } from "./email-recipients";

describe("buildSubmissionEmailRecipients", () => {
  it("always CCs the submitter when not already on To or Bcc", () => {
    const result = buildSubmissionEmailRecipients({
      submitterEmail: "contractor@example.com",
      toRecipients: ["ap@company.com"],
      ccRecipients: ["manager@company.com"],
      bccRecipients: [],
    });
    expect(result.cc).toEqual(["manager@company.com", "contractor@example.com"]);
  });

  it("does not duplicate submitter when already on To", () => {
    const result = buildSubmissionEmailRecipients({
      submitterEmail: "ap@company.com",
      toRecipients: ["ap@company.com"],
      ccRecipients: [],
      bccRecipients: [],
    });
    expect(result.cc).toEqual([]);
  });

  it("does not duplicate submitter when already on Bcc", () => {
    const result = buildSubmissionEmailRecipients({
      submitterEmail: "audit@company.com",
      toRecipients: ["ap@company.com"],
      ccRecipients: [],
      bccRecipients: ["audit@company.com"],
    });
    expect(result.cc).not.toContain("audit@company.com");
  });
});
