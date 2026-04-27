import { z } from "zod";

export const BILLING_TIMEZONE = "America/New_York";
export const BILLING_ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv"] as const;
export const BILLING_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "text/plain",
]);

export const billingSettingsSchema = z.object({
  companyId: z.string().uuid().optional(),
  toRecipients: z.array(z.email()).min(1, "At least one TO recipient is required."),
  ccRecipients: z.array(z.email()).default([]),
  defaultBodyFooter: z.string().max(5000).optional().nullable(),
  submissionInstructions: z.string().max(5000).optional().nullable(),
  overdueBannerEnabled: z.boolean().default(true),
  expectedSubmissionCutoffTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected cutoff must be HH:mm.")
    .optional()
    .nullable(),
});

export const adminBillingStatusUpdateSchema = z.object({
  status: z.enum(["accepted", "needs_resubmission"]),
  adminNote: z.string().max(5000).optional().nullable(),
  requestedCorrection: z.string().max(5000).optional().nullable(),
  dueDateUtcIso: z.string().datetime().optional().nullable(),
});

export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0) return "";
  return fileName.slice(idx).toLowerCase();
}

