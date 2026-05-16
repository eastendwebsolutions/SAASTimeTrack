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
import { validateTeamsChannelDestination } from "@/lib/services/team-status/teams-channel-validation";

const saveSchema = z.object({
  enabled: z.boolean(),
  deliveryMethod: z.enum(["email", "webhook"]),
  channelLabel: z.string().max(255).nullable().optional(),
  destination: z.string().max(2000).nullable().optional(),
  clearDestination: z.boolean().optional(),
});

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
      destinationConfigured: Boolean(config.destination?.trim()),
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
    const rawDestination =
      parsed.data.destination !== undefined && parsed.data.destination !== null
        ? parsed.data.destination
        : parsed.data.clearDestination
          ? null
          : existing.destination;

    let normalizedDestination: string | null = rawDestination?.trim() || null;
    if (normalizedDestination) {
      try {
        normalizedDestination = validateTeamsChannelDestination(parsed.data.deliveryMethod, normalizedDestination);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid destination" },
          { status: 400 },
        );
      }
    }

    const warnings: string[] = [];
    let enabledToSave = parsed.data.enabled;

    if (enabledToSave && !normalizedDestination) {
      return NextResponse.json(
        { error: "Add a channel email or webhook URL before enabling notifications." },
        { status: 400 },
      );
    }

    if (
      enabledToSave &&
      parsed.data.deliveryMethod === "email" &&
      !isTeamStatusTeamsEmailDeliveryReady()
    ) {
      enabledToSave = false;
      warnings.push(
        "Channel email was saved, but notifications were left off because email delivery is not configured on the server yet (Resend). Turn on Enable after Resend is ready, or use webhook delivery.",
      );
    }

    await upsertTeamStatusTeamsChannelConfig({
      companyId: user.companyId,
      enabled: enabledToSave,
      deliveryMethod: parsed.data.deliveryMethod,
      channelLabel: parsed.data.channelLabel ?? null,
      destination: normalizedDestination,
      clearDestination: Boolean(parsed.data.clearDestination),
    });

    const config = await getTeamStatusTeamsChannelConfig(user.companyId);
    const { destination: _destination, ...publicConfig } = config;
    return NextResponse.json({
      ...publicConfig,
      destinationConfigured: Boolean(config.destination?.trim()),
      message: warnings.length
        ? warnings.join(" ")
        : "Team status Teams channel settings saved.",
      warning: warnings[0] ?? null,
    });
  } catch (error) {
    console.error("[team-status-teams PUT]", error);
    const message = error instanceof Error ? error.message : "Unable to save settings.";
    const status = message === TEAM_STATUS_TEAMS_SCHEMA_ERROR ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
