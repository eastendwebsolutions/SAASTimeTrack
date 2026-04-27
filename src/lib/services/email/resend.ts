import { Resend } from "resend";
import { getEnv } from "@/lib/env";

export type ResendAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export async function sendResendEmail({
  to,
  cc,
  subject,
  html,
  attachments,
}: {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  attachments: ResendAttachment[];
}) {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.BILLING_FROM_EMAIL) {
    throw new Error("Missing RESEND_API_KEY or BILLING_FROM_EMAIL");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.BILLING_FROM_EMAIL,
    to,
    cc,
    subject,
    html,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data?.id ?? null;
}

