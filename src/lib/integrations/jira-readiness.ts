import { sql } from "@vercel/postgres";

function hasJiraEnvConfigured() {
  return Boolean(
    process.env.JIRA_CLIENT_ID?.trim() &&
      process.env.JIRA_CLIENT_SECRET?.trim() &&
      process.env.JIRA_REDIRECT_URI?.trim(),
  );
}

function isJiraFeatureEnabled() {
  return process.env.JIRA_FEATURE_ENABLED === "1";
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
