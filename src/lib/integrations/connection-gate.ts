import { sql } from "@vercel/postgres";

/** True if the app user has at least one OAuth connection row (Asana, Jira, or Monday). */
export async function userHasAnyIntegrationConnectionByClerkUserId(clerkUserId: string): Promise<boolean> {
  const userRows = await sql<{ id: string }>`
    select id from users where clerk_user_id = ${clerkUserId} limit 1
  `;
  const appUserId = userRows.rows[0]?.id;
  if (!appUserId) {
    return false;
  }

  const asanaRows = await sql`select 1 from asana_connections where user_id = ${appUserId} limit 1`;
  if (asanaRows.rows.length > 0) {
    return true;
  }

  try {
    const jiraRows = await sql`select 1 from jira_connections where user_id = ${appUserId} limit 1`;
    if (jiraRows.rows.length > 0) {
      return true;
    }
  } catch {
    // Table may not exist on older schemas.
  }

  try {
    const mondayRows = await sql`select 1 from monday_connections where user_id = ${appUserId} limit 1`;
    if (mondayRows.rows.length > 0) {
      return true;
    }
  } catch {
    // Table may not exist on older schemas.
  }

  return false;
}
