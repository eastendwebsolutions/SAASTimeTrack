import { sql } from "@vercel/postgres";
import { getEnv } from "@/lib/env";

function hasMondayEnvConfigured() {
  const env = getEnv();
  return Boolean(env.MONDAY_CLIENT_ID && env.MONDAY_CLIENT_SECRET && env.MONDAY_REDIRECT_URI);
}

function isMondayFeatureEnabled() {
  const env = getEnv();
  return env.MONDAY_FEATURE_ENABLED === "1";
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
