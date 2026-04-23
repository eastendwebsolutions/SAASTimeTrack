import { users } from "@/lib/db/schema";

export const INTEGRATION_PROVIDERS = ["asana", "jira"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(value: string | null | undefined): value is IntegrationProvider {
  return value === "asana" || value === "jira";
}

export function getActiveProviderForUser(user: typeof users.$inferSelect): IntegrationProvider {
  return user.activeIntegrationProvider === "jira" ? "jira" : "asana";
}
