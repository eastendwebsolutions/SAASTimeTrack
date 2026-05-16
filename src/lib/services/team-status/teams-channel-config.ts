import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companySettings } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/utils/crypto";

export type TeamStatusTeamsDeliveryMethod = "email" | "webhook";

export type TeamStatusTeamsChannelConfig = {
  companyId: string;
  enabled: boolean;
  deliveryMethod: TeamStatusTeamsDeliveryMethod;
  channelLabel: string | null;
  destination: string | null;
  destinationHint: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
};

function maskDestination(value: string, method: TeamStatusTeamsDeliveryMethod) {
  if (method === "email") {
    const [local, domain] = value.split("@");
    if (!domain) return "••••••••";
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}•••@${domain}`;
  }
  try {
    const url = new URL(value);
    return `${url.origin}/••••••`;
  } catch {
    return "••••••••";
  }
}

function parseDeliveryMethod(value: string | null | undefined): TeamStatusTeamsDeliveryMethod {
  return value === "webhook" ? "webhook" : "email";
}

export async function getTeamStatusTeamsChannelConfig(companyId: string): Promise<TeamStatusTeamsChannelConfig> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.companyId, companyId),
    columns: {
      companyId: true,
      teamStatusTeamsEnabled: true,
      teamStatusTeamsDeliveryMethod: true,
      teamStatusTeamsChannelLabel: true,
      teamStatusTeamsDestinationEncrypted: true,
      teamStatusTeamsLastTestedAt: true,
      teamStatusTeamsLastError: true,
    },
  });

  const deliveryMethod = parseDeliveryMethod(row?.teamStatusTeamsDeliveryMethod);
  let destination: string | null = null;
  if (row?.teamStatusTeamsDestinationEncrypted) {
    try {
      destination = decrypt(row.teamStatusTeamsDestinationEncrypted);
    } catch {
      destination = null;
    }
  }

  return {
    companyId,
    enabled: row?.teamStatusTeamsEnabled ?? false,
    deliveryMethod,
    channelLabel: row?.teamStatusTeamsChannelLabel ?? null,
    destination,
    destinationHint: destination ? maskDestination(destination, deliveryMethod) : null,
    lastTestedAt: row?.teamStatusTeamsLastTestedAt?.toISOString() ?? null,
    lastError: row?.teamStatusTeamsLastError ?? null,
  };
}

export async function upsertTeamStatusTeamsChannelConfig(input: {
  companyId: string;
  enabled: boolean;
  deliveryMethod: TeamStatusTeamsDeliveryMethod;
  channelLabel: string | null;
  destination: string | null;
  clearDestination?: boolean;
}) {
  const existing = await db.query.companySettings.findFirst({
    where: eq(companySettings.companyId, input.companyId),
    columns: { companyId: true, teamStatusTeamsDestinationEncrypted: true },
  });

  let destinationEncrypted = existing?.teamStatusTeamsDestinationEncrypted ?? null;
  if (input.clearDestination) {
    destinationEncrypted = null;
  } else if (input.destination?.trim()) {
    destinationEncrypted = encrypt(input.destination.trim());
  }

  const values = {
    companyId: input.companyId,
    teamStatusTeamsEnabled: input.enabled,
    teamStatusTeamsDeliveryMethod: input.deliveryMethod,
    teamStatusTeamsChannelLabel: input.channelLabel?.trim() || null,
    teamStatusTeamsDestinationEncrypted: destinationEncrypted,
  };

  if (existing) {
    await db.update(companySettings).set(values).where(eq(companySettings.companyId, input.companyId));
  } else {
    await db.insert(companySettings).values(values);
  }
}

export async function recordTeamStatusTeamsChannelResult(companyId: string, error: string | null) {
  await db
    .update(companySettings)
    .set({
      teamStatusTeamsLastTestedAt: new Date(),
      teamStatusTeamsLastError: error,
    })
    .where(eq(companySettings.companyId, companyId));
}
