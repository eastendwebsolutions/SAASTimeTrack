import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { sendResendEmail } from "@/lib/services/email/resend";
import {
  eventMessageFor,
  type TeamStatusEventType,
} from "@/lib/services/team-status";
import {
  getTeamStatusTeamsChannelConfig,
  recordTeamStatusTeamsChannelResult,
  type TeamStatusTeamsChannelConfig,
} from "@/lib/services/team-status/teams-channel-config";

function displayNameFromEmail(email: string) {
  const raw = email.split("@")[0] ?? email;
  return raw
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
}

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
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Teams webhook failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}

async function sendEmailToChannel(channelEmail: string, message: string, channelLabel: string | null) {
  const env = getEnv();
  const from = env.TEAM_STATUS_FROM_EMAIL ?? env.BILLING_FROM_EMAIL;
  if (!env.RESEND_API_KEY || !from) {
    throw new Error("Email delivery is not configured on the server (Resend).");
  }

  const label = channelLabel?.trim() || "Team Member Status";
  await sendResendEmail({
    to: [channelEmail],
    cc: [],
    subject: `WhoSaaS · ${label}`,
    html: `<p style="font-family:sans-serif;font-size:14px;line-height:1.5">${message.replace(/\n/g, "<br/>")}</p>`,
    attachments: [],
    from,
  });
}

export async function deliverTeamStatusTeamsChannelMessage(
  config: TeamStatusTeamsChannelConfig,
  message: string,
) {
  if (!config.enabled) return { skipped: true as const, reason: "disabled" };
  if (!config.destination?.trim()) {
    throw new Error("Teams channel destination is not configured.");
  }

  if (config.deliveryMethod === "webhook") {
    await postWebhook(config.destination.trim(), message);
  } else {
    await sendEmailToChannel(config.destination.trim(), message, config.channelLabel);
  }

  return { skipped: false as const };
}

export async function notifyTeamStatusTeamsChannel(input: {
  companyId: string;
  userId: string;
  eventType: TeamStatusEventType;
  eventTimeLabel: string;
}) {
  const config = await getTeamStatusTeamsChannelConfig(input.companyId);
  if (!config.enabled || !config.destination) {
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { email: true, displayName: true },
  });
  if (!user) return;

  const displayName = user.displayName?.trim() || displayNameFromEmail(user.email);
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

export async function sendTeamStatusTeamsChannelTest(companyId: string) {
  const config = await getTeamStatusTeamsChannelConfig(companyId);
  if (!config.destination?.trim()) {
    return { ok: false as const, error: "Add a channel email or webhook URL before sending a test." };
  }
  const message = `WhoSaaS test: Team status notifications are configured for this company.\n${new Date().toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}`;

  try {
    await deliverTeamStatusTeamsChannelMessage({ ...config, enabled: true }, message);
    await recordTeamStatusTeamsChannelResult(companyId, null);
    return { ok: true as const };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Test delivery failed";
    await recordTeamStatusTeamsChannelResult(companyId, errMessage);
    return { ok: false as const, error: errMessage };
  }
}
