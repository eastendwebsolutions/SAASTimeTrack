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
  bcc,
  subject,
  html,
  attachments,
  from,
}: {
  to: string[];
  cc: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments: ResendAttachment[];
  from?: string;
}) {
  const env = getEnv();
  const fromAddress = from ?? env.BILLING_FROM_EMAIL;
  if (!env.RESEND_API_KEY || !fromAddress) {
    throw new Error("Missing RESEND_API_KEY or outbound from email");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: fromAddress,
    to,
    cc: cc.length ? cc : undefined,
    bcc: bcc?.length ? bcc : undefined,
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

