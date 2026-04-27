import { sendResendEmail } from "@/lib/services/email/resend";
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
  files,
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
  files: Array<{ fileName: string; content: Buffer; contentType: string }>;
}) {
  const billingPeriod = getBillingPeriodLabel(periodStart, periodEnd);
  const submittedLabel = formatSubmittedAtEasternLabel(submittedAt);
  const html = `
    <div>
      <p><strong>User:</strong> ${escapeHtml(userName)} (${escapeHtml(userEmail)})</p>
      <p><strong>Company:</strong> ${escapeHtml(companyName)}</p>
      <p><strong>Billing Period:</strong> ${escapeHtml(billingPeriod)}</p>
      <p><strong>Submitted:</strong> ${escapeHtml(submittedLabel)}</p>
      ${userBody ? `<p><strong>User Message:</strong><br/>${escapeHtml(userBody)}</p>` : ""}
      <p><strong>Attached Files:</strong></p>
      <ul>
        ${files.map((file) => `<li>${escapeHtml(file.fileName)}</li>`).join("")}
      </ul>
      ${defaultFooter ? `<hr/><p>${escapeHtml(defaultFooter)}</p>` : ""}
    </div>
  `;

  return sendResendEmail({
    to,
    cc,
    subject,
    html,
    attachments: files.map((file) => ({
      filename: file.fileName,
      content: file.content,
      contentType: file.contentType,
    })),
  });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

