import { db } from "@/lib/db";
import { asanaConnections, jiraConnections, mondayConnections, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";

export const INTEGRATION_PROVIDERS = ["asana", "jira", "monday"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return INTEGRATION_PROVIDERS.includes(value as IntegrationProvider);
}

async function hasAsanaConnection(userId: string) {
  try {
    return Boolean(await db.query.asanaConnections.findFirst({ where: eq(asanaConnections.userId, userId), columns: { id: true } }));
  } catch {
    return false;
  }
}

async function hasJiraConnection(userId: string) {
  try {
    return Boolean(await db.query.jiraConnections.findFirst({ where: eq(jiraConnections.userId, userId), columns: { id: true } }));
  } catch {
    return false;
  }
}

async function hasMondayConnection(userId: string) {
  try {
    return Boolean(
      await db.query.mondayConnections.findFirst({
        where: eq(mondayConnections.userId, userId),
        columns: { id: true },
      }),
    );
  } catch {
    return false;
  }
}

export async function getActiveProviderForUser(userId: string): Promise<IntegrationProvider> {
  let preferred: IntegrationProvider | null = null;
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { activeIntegrationProvider: true },
    });
    preferred = user?.activeIntegrationProvider ?? null;
  } catch (error) {
    if (!isMissingIntegrationSchemaError(error)) throw error;
  }

  if (preferred === "jira") {
    const connected = await hasJiraConnection(userId);
    if (connected) return "jira";
  }
  if (preferred === "monday") {
    const connected = await hasMondayConnection(userId);
    if (connected) return "monday";
  }

  const asana = await hasAsanaConnection(userId);
  if (asana) return "asana";
  const jira = await hasJiraConnection(userId);
  if (jira) return "jira";
  const monday = await hasMondayConnection(userId);
  if (monday) return "monday";
  return "asana";
}
