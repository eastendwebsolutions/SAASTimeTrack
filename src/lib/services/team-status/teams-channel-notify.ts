import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { sendResendEmail } from "@/lib/services/email/resend";
import {
  eventMessageFor,
  type TeamStatusEventType,
} from "@/lib/services/team-status";
import { resolveUserDisplayName } from "@/lib/services/user-display-name";
import {
  getTeamStatusTeamsChannelConfig,
  recordTeamStatusTeamsChannelResult,
  type TeamStatusTeamsChannelConfig,
} from "@/lib/services/team-status/teams-channel-config";

function buildTeamsMessage(input: {
  displayName: string;
  eventType: TeamStatusEventType;
  eventTimeLabel: string;
  channelLabel: string | null;
}) {
  const headline = eventMessageFor(input.eventType, input.displayName);
  const channel = input.channelLabel?.trim() ? ` (${input.channelLabel})` : "";
  return `${headline}\n${input.eventTimeLabel}${channel}`;
}

async function postWebhook(url: string, message: string) {
  const payloads: unknown[] = [
    { text: message },
    {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: "WhoSaaS Team Status",
      themeColor: "5B5BD6",
      text: message.replace(/\n/g, "<br>"),
    },
  ];

  let lastError: Error | null = null;
  for (const body of payloads) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (response.ok) return;
    const responseBody = await response.text().catch(() => "");
    lastError = new Error(
      `Teams webhook failed (${response.status})${responseBody ? `: ${responseBody.slice(0, 200)}` : ""}`,
    );
  }
  throw lastError ?? new Error("Teams webhook failed.");
}

async function sendEmailToChannel(channelEmail: string, message: string, channelLabel: string | null) {
  const env = getEnv();
  const from = env.TEAM_STATUS_FROM_EMAIL ?? env.BILLING_FROM_EMAIL;
  if (!env.RESEND_API_KEY || !from) {
    throw new Error("Email delivery is not configured on the server (Resend).");
  }

  const label = channelLabel?.trim() || "Team Member Status";
  const messageId = await sendResendEmail({
    to: [channelEmail],
    cc: [],
    subject: label,
    html: `<p style="font-family:sans-serif;font-size:14px;line-height:1.5">${message.replace(/\n/g, "<br/>")}</p>`,
    text: message,
    attachments: [],
    from,
    fromDisplayName: "WhoSaaS Team Status",
  });

  console.info("[teams-channel] Resend accepted email", {
    toDomain: channelEmail.split("@")[1] ?? "unknown",
    messageId,
  });

  return messageId;
}

export type TeamsChannelDeliveryResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      deliveryMethod: "email" | "webhook";
      destinationHint: string | null;
      providerMessageId: string | null;
    };

export async function deliverTeamStatusTeamsChannelMessage(
  config: TeamStatusTeamsChannelConfig,
  message: string,
): Promise<TeamsChannelDeliveryResult> {
  if (!config.enabled) return { skipped: true, reason: "disabled" };
  if (!config.destination?.trim()) {
    throw new Error("Teams channel destination is not configured.");
  }

  if (config.deliveryMethod === "webhook") {
    await postWebhook(config.destination.trim(), message);
    return {
      skipped: false,
      deliveryMethod: "webhook",
      destinationHint: config.destinationHint,
      providerMessageId: null,
    };
  }

  const providerMessageId = await sendEmailToChannel(config.destination.trim(), message, config.channelLabel);
  return {
    skipped: false,
    deliveryMethod: "email",
    destinationHint: config.destinationHint,
    providerMessageId,
  };
}

export async function notifyTeamStatusTeamsChannel(input: {
  companyId: string;
  userId: string;
  eventType: TeamStatusEventType;
  eventTimeLabel: string;
}) {
  const config = await getTeamStatusTeamsChannelConfig(input.companyId);
  if (!config.enabled) {
    return;
  }
  if (!config.destination?.trim()) {
    await recordTeamStatusTeamsChannelResult(
      input.companyId,
      "Teams channel is enabled but no destination email or webhook is saved.",
    );
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { email: true, displayName: true },
  });
  if (!user) return;

  const displayName = resolveUserDisplayName({
    email: user.email,
    dbDisplayName: user.displayName,
  });
  const message = buildTeamsMessage({
    displayName,
    eventType: input.eventType,
    eventTimeLabel: input.eventTimeLabel,
    channelLabel: config.channelLabel,
  });

  try {
    await deliverTeamStatusTeamsChannelMessage(config, message);
    await recordTeamStatusTeamsChannelResult(input.companyId, null);
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Teams delivery failed";
    await recordTeamStatusTeamsChannelResult(input.companyId, errMessage);
    throw error;
  }
}

export const TEAMS_EMAIL_DELIVERY_NOTE =
  "Resend accepted the message. If nothing appears in Teams Posts, open the channel → ⋯ → Get email address and confirm “Anyone can send emails to this address” is on. Your Microsoft 365 admin may also need to allow external senders to Teams channel addresses (whosaas.com). Check the Resend dashboard for bounces. If email stays blocked, switch Delivery method to Workflow webhook.";

export async function sendTeamStatusTeamsChannelTest(companyId: string) {
  const config = await getTeamStatusTeamsChannelConfig(companyId);
  if (!config.destination?.trim()) {
    return { ok: false as const, error: "Add a channel email or webhook URL before sending a test." };
  }
  const message = `WhoSaaS test: Team status notifications are configured for this company.\n${new Date().toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}`;

  try {
    const delivery = await deliverTeamStatusTeamsChannelMessage({ ...config, enabled: true }, message);
    if (delivery.skipped) {
      return { ok: false as const, error: `Delivery skipped: ${delivery.reason}` };
    }
    await recordTeamStatusTeamsChannelResult(companyId, null);
    return {
      ok: true as const,
      deliveryMethod: delivery.deliveryMethod,
      destinationHint: delivery.destinationHint,
      providerMessageId: delivery.providerMessageId,
      teamsNote: delivery.deliveryMethod === "email" ? TEAMS_EMAIL_DELIVERY_NOTE : null,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Test delivery failed";
    await recordTeamStatusTeamsChannelResult(companyId, errMessage);
    return { ok: false as const, error: errMessage };
  }
}
