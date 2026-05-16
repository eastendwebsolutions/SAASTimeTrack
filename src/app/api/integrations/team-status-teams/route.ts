import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canManageCompanySettings } from "@/lib/auth/rbac";
import {
  getTeamStatusTeamsChannelConfig,
  TEAM_STATUS_TEAMS_SCHEMA_ERROR,
  upsertTeamStatusTeamsChannelConfig,
} from "@/lib/services/team-status/teams-channel-config";
import { isTeamStatusTeamsEmailDeliveryReady } from "@/lib/services/team-status/teams-channel-env";

const saveSchema = z.object({
  enabled: z.boolean(),
  deliveryMethod: z.enum(["email", "webhook"]),
  channelLabel: z.string().max(255).nullable().optional(),
  destination: z.string().max(2000).nullable().optional(),
  clearDestination: z.boolean().optional(),
});

function validateDestination(method: "email" | "webhook", destination: string) {
  const trimmed = destination.trim();
  if (method === "email") {
    const at = trimmed.indexOf("@");
    if (at <= 0 || at === trimmed.length - 1) {
      throw new Error("Enter a valid Microsoft Teams channel email address.");
    }
    return;
  }
  const url = new URL(trimmed);
  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS.");
  }
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCompanySettings(user.role)) {
    return NextResponse.json({ error: "Company admin access required" }, { status: 403 });
  }

  try {
    const config = await getTeamStatusTeamsChannelConfig(user.companyId);
    const { destination: _destination, ...publicConfig } = config;

    return NextResponse.json({
      ...publicConfig,
      resendReady: isTeamStatusTeamsEmailDeliveryReady(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Teams settings.";
    const status = message === TEAM_STATUS_TEAMS_SCHEMA_ERROR ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCompanySettings(user.role)) {
    return NextResponse.json({ error: "Company admin access required" }, { status: 403 });
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }

  try {
    const existing = await getTeamStatusTeamsChannelConfig(user.companyId);
    const destination =
      parsed.data.destination !== undefined && parsed.data.destination !== null
        ? parsed.data.destination
        : parsed.data.clearDestination
          ? null
          : existing.destination;

    if (destination?.trim()) {
      try {
        validateDestination(parsed.data.deliveryMethod, destination);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid destination" },
          { status: 400 },
        );
      }
    }

    if (parsed.data.enabled) {
      if (!destination?.trim()) {
        return NextResponse.json(
          { error: "Add a channel email or webhook URL before enabling notifications." },
          { status: 400 },
        );
      }
      if (parsed.data.deliveryMethod === "email" && !isTeamStatusTeamsEmailDeliveryReady()) {
        return NextResponse.json(
          {
            error:
              "Email delivery is not configured on the server (RESEND_API_KEY and BILLING_FROM_EMAIL or TEAM_STATUS_FROM_EMAIL). Save the channel address now and enable after email is configured, or use webhook delivery.",
          },
          { status: 400 },
        );
      }
    }

    await upsertTeamStatusTeamsChannelConfig({
      companyId: user.companyId,
      enabled: parsed.data.enabled,
      deliveryMethod: parsed.data.deliveryMethod,
      channelLabel: parsed.data.channelLabel ?? null,
      destination: destination?.trim() || null,
      clearDestination: Boolean(parsed.data.clearDestination),
    });

    const config = await getTeamStatusTeamsChannelConfig(user.companyId);
    const { destination: _destination, ...publicConfig } = config;
    return NextResponse.json({
      ...publicConfig,
      message: "Team status Teams channel settings saved.",
    });
  } catch (error) {
    console.error("[team-status-teams PUT]", error);
    const message = error instanceof Error ? error.message : "Unable to save settings.";
    const status = message === TEAM_STATUS_TEAMS_SCHEMA_ERROR ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
