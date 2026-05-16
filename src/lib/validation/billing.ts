import { z } from "zod";
import { COUNTRY_VALUE_SET, US_STATE_VALUE_SET } from "@/lib/constants/geo-options";

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

export const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(1, "Line item description is required.").max(500),
  amount: z.number().positive("Amount must be greater than zero.").max(10_000_000),
});

export const billingSubmissionCreateSchema = z.object({
  invoiceNumber: z.string().trim().min(1, "Invoice number is required.").max(100),
  lineItems: z.array(invoiceLineItemSchema).min(1, "At least one line item is required.").max(50),
  bodyContent: z.string().max(5000).optional().nullable(),
});

export const userBillingProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(120),
  lastName: z.string().trim().min(1, "Last name is required.").max(120),
  address: z.string().trim().min(1, "Address is required.").max(255),
  address2: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().min(1, "City is required.").max(120),
  state: z
    .string()
    .trim()
    .min(1, "State is required.")
    .refine((value) => US_STATE_VALUE_SET.has(value), { message: "Select a valid U.S. state." }),
  province: z.string().trim().max(120).optional().nullable(),
  zip: z.string().trim().min(1, "Zip is required.").max(32),
  country: z
    .string()
    .trim()
    .min(1, "Country is required.")
    .refine((value) => COUNTRY_VALUE_SET.has(value), { message: "Select a valid country." }),
  phone: z.string().trim().min(1, "Phone is required.").max(50),
  paypalAddress: z.string().trim().min(1, "PayPal address is required.").max(255),
});

export const REQUIRED_USER_BILLING_FIELD_LABELS = [
  "First name",
  "Last name",
  "Address",
  "City",
  "State",
  "Zip",
  "Country",
  "Phone",
  "PayPal address",
] as const;

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;
export type UserBillingProfileInput = z.infer<typeof userBillingProfileSchema>;

export type UserBillingSnapshot = UserBillingProfileInput & {
  userDisplayName: string;
  userEmail: string;
};

export const billingSettingsSchema = z.object({
  companyId: z.string().uuid().optional(),
  toRecipients: z.array(z.email()).min(1, "At least one TO recipient is required."),
  ccRecipients: z.array(z.email()).default([]),
  bccRecipients: z.array(z.email()).default([]),
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
