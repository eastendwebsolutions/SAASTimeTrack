import { db } from "@/lib/db";
import { asanaConnections, jiraConnections, mondayConnections, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const INTEGRATION_PROVIDERS = ["asana", "jira", "monday"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return INTEGRATION_PROVIDERS.includes(value as IntegrationProvider);
}

export async function getActiveProviderForUser(userId: string): Promise<IntegrationProvider> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { activeIntegrationProvider: true },
  });

  const preferred = user?.activeIntegrationProvider;
  if (preferred === "jira") {
    const connected = await db.query.jiraConnections.findFirst({ where: eq(jiraConnections.userId, userId), columns: { id: true } });
    if (connected) return "jira";
  }
  if (preferred === "monday") {
    const connected = await db.query.mondayConnections.findFirst({
      where: eq(mondayConnections.userId, userId),
      columns: { id: true },
    });
    if (connected) return "monday";
  }

  const asana = await db.query.asanaConnections.findFirst({ where: eq(asanaConnections.userId, userId), columns: { id: true } });
  if (asana) return "asana";
  const jira = await db.query.jiraConnections.findFirst({ where: eq(jiraConnections.userId, userId), columns: { id: true } });
  if (jira) return "jira";
  const monday = await db.query.mondayConnections.findFirst({
    where: eq(mondayConnections.userId, userId),
    columns: { id: true },
  });
  if (monday) return "monday";
  return "asana";
}
