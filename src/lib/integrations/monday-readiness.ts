import { sql } from "@vercel/postgres";

function hasMondayEnvConfigured() {
  return Boolean(
    process.env.MONDAY_CLIENT_ID?.trim() &&
      process.env.MONDAY_CLIENT_SECRET?.trim() &&
      process.env.MONDAY_REDIRECT_URI?.trim(),
  );
}

function isMondayFeatureEnabled() {
  return process.env.MONDAY_FEATURE_ENABLED === "1";
}

async function hasMondaySchemaReady() {
  try {
    const tableResult = await sql<{ exists: boolean }>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'monday_connections'
      ) as exists
    `;
    return Boolean(tableResult.rows[0]?.exists);
  } catch {
    return false;
  }
}

export async function getMondayReadiness() {
  const envReady = hasMondayEnvConfigured();
  const featureEnabled = isMondayFeatureEnabled();
  const schemaReady = await hasMondaySchemaReady();
  return {
    envReady,
    featureEnabled,
    schemaReady,
    fullyReady: envReady && featureEnabled && schemaReady,
  };
}
