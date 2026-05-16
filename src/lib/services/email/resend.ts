import { Resend } from "resend";
import { getEnv } from "@/lib/env";

export type ResendAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

/** Resend accepts `Name <addr@domain>`; plain addresses are wrapped for deliverability. */
export function formatResendFromAddress(address: string, displayName = "WhoSaaS") {
  const trimmed = address.trim();
  if (trimmed.includes("<") && trimmed.includes(">")) return trimmed;
  return `${displayName} <${trimmed}>`;
}

export async function sendResendEmail({
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  attachments,
  from,
  fromDisplayName,
}: {
  to: string[];
  cc: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments: ResendAttachment[];
  from?: string;
  fromDisplayName?: string;
}) {
  const env = getEnv();
  const fromAddress = from ?? env.BILLING_FROM_EMAIL;
  if (!env.RESEND_API_KEY || !fromAddress) {
    throw new Error("Missing RESEND_API_KEY or outbound from email");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: formatResendFromAddress(fromAddress, fromDisplayName),
    to,
    cc: cc.length ? cc : undefined,
    bcc: bcc?.length ? bcc : undefined,
    subject,
    html,
    text: text ?? html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
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

