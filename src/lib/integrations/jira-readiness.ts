import { sql } from "@vercel/postgres";
import { getEnv } from "@/lib/env";

function hasJiraEnvConfigured() {
  const env = getEnv();
  return Boolean(env.JIRA_CLIENT_ID && env.JIRA_CLIENT_SECRET && env.JIRA_REDIRECT_URI);
}

function isJiraFeatureEnabled() {
  const env = getEnv();
  return env.JIRA_FEATURE_ENABLED === "1";
}

async function hasJiraSchemaReady() {
  try {
    const tableResult = await sql<{ exists: boolean }>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'jira_connections'
      ) as exists
    `;
    return Boolean(tableResult.rows[0]?.exists);
  } catch {
    return false;
  }
}

export async function getJiraReadiness() {
  const envReady = hasJiraEnvConfigured();
  const featureEnabled = isJiraFeatureEnabled();
  const schemaReady = await hasJiraSchemaReady();
  return {
    envReady,
    featureEnabled,
    schemaReady,
    fullyReady: envReady && featureEnabled && schemaReady,
  };
}
