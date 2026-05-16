import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canManageCompanySettings } from "@/lib/auth/rbac";
import { getEnv } from "@/lib/env";
import {
  getTeamStatusTeamsChannelConfig,
  upsertTeamStatusTeamsChannelConfig,
} from "@/lib/services/team-status/teams-channel-config";

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
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

  const config = await getTeamStatusTeamsChannelConfig(user.companyId);
  const env = getEnv();
  const { destination: _destination, ...publicConfig } = config;

  return NextResponse.json({
    ...publicConfig,
    resendReady: Boolean(env.RESEND_API_KEY && (env.TEAM_STATUS_FROM_EMAIL ?? env.BILLING_FROM_EMAIL)),
  });
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

  const existing = await getTeamStatusTeamsChannelConfig(user.companyId);
  const destination =
    parsed.data.destination !== undefined && parsed.data.destination !== null
      ? parsed.data.destination
      : parsed.data.clearDestination
        ? null
        : existing.destination;

  if (parsed.data.enabled) {
    if (!destination?.trim()) {
      return NextResponse.json(
        { error: "Add a channel email or webhook URL before enabling notifications." },
        { status: 400 },
      );
    }
    try {
      validateDestination(parsed.data.deliveryMethod, destination);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid destination" },
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
}
