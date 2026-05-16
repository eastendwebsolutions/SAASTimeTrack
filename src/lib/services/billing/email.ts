import { sendResendEmail } from "@/lib/services/email/resend";
import type { InvoiceLineItem, UserBillingSnapshot } from "@/lib/validation/billing";
import { buildInvoiceHtml } from "./invoice";
import { buildInvoicePdf, invoicePdfFilename } from "./invoice-pdf";
import { formatSubmittedAtEasternLabel, getBillingPeriodLabel } from "./period";

export async function sendBillingSubmissionEmail({
  userName,
  userEmail,
  companyName,
  periodStart,
  periodEnd,
  submittedAt,
  userBody,
  defaultFooter,
  subject,
  to,
  cc,
  invoiceNumber,
  lineItems,
  billingSnapshot,
}: {
  userName: string;
  userEmail: string;
  companyName: string;
  periodStart: Date;
  periodEnd: Date;
  submittedAt: Date;
  userBody: string | null;
  defaultFooter: string | null;
  subject: string;
  to: string[];
  cc: string[];
  invoiceNumber: string;
  lineItems: InvoiceLineItem[];
  billingSnapshot: UserBillingSnapshot;
}) {
  const billingPeriod = getBillingPeriodLabel(periodStart, periodEnd);
  const submittedLabel = formatSubmittedAtEasternLabel(submittedAt);
  const snapshot = {
    ...billingSnapshot,
    userDisplayName: userName,
    userEmail,
  };

  const html = buildInvoiceHtml({
    invoiceNumber,
    periodLabel: billingPeriod,
    submittedLabel,
    companyName,
    billingSnapshot: snapshot,
    lineItems,
    userBody,
    defaultFooter,
  });

  const pdf = await buildInvoicePdf({
    invoiceNumber,
    periodLabel: billingPeriod,
    submittedLabel,
    companyName,
    billingSnapshot: snapshot,
    lineItems,
    userBody,
    defaultFooter,
  });

  return sendResendEmail({
    to,
    cc,
    subject,
    html,
    attachments: [
      {
        filename: invoicePdfFilename(invoiceNumber),
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });
}
