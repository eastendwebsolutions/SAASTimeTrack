#!/usr/bin/env node
/**
 * Merge duplicate companies that share the same Asana workspace into one canonical row.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/merge-asana-workspace-companies.mjs [--dry-run] [--workspace=GID]
 *
 * Default workspace: Spartan/Restori production tenant (1213325661139504).
 */

import pg from "pg";

const DEFAULT_WORKSPACE = "1213325661139504";
const dryRun = process.argv.includes("--dry-run");
const workspaceArg = process.argv.find((a) => a.startsWith("--workspace="));
const workspaceId = workspaceArg?.split("=")[1] ?? DEFAULT_WORKSPACE;

const TABLES_WITH_COMPANY_ID = [
  "users",
  "billing_submissions",
  "projects",
  "time_entries",
  "timesheets",
  "audit_logs",
  "poker_planning_sessions",
  "team_status_snapshots",
  "integration_connections",
];

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.length > 0;
}

async function dedupeBillingPeriods(client, canonicalId, duplicateIds) {
  const { rows: duplicatePeriods } = await client.query(
    `SELECT id, period_start_date, period_end_date FROM billing_periods WHERE company_id = ANY($1::uuid[])`,
    [duplicateIds],
  );

  let remappedSubmissions = 0;
  let deletedPeriods = 0;
  let movedPeriods = 0;

  for (const period of duplicatePeriods) {
    const { rows: canonicalMatches } = await client.query(
      `
      SELECT id FROM billing_periods
      WHERE company_id = $1
        AND period_start_date = $2
        AND period_end_date = $3
      LIMIT 1
      `,
      [canonicalId, period.period_start_date, period.period_end_date],
    );

    if (canonicalMatches.length) {
      const canonicalPeriodId = canonicalMatches[0].id;
      const remap = await client.query(
        `UPDATE billing_submissions SET billing_period_id = $1 WHERE billing_period_id = $2`,
        [canonicalPeriodId, period.id],
      );
      remappedSubmissions += remap.rowCount ?? 0;
      const del = await client.query(`DELETE FROM billing_periods WHERE id = $1`, [period.id]);
      deletedPeriods += del.rowCount ?? 0;
      continue;
    }

    const move = await client.query(`UPDATE billing_periods SET company_id = $1 WHERE id = $2`, [
      canonicalId,
      period.id,
    ]);
    movedPeriods += move.rowCount ?? 0;
  }

  console.log(
    `Billing periods: remapped ${remappedSubmissions} submissions, deleted ${deletedPeriods} duplicates, moved ${movedPeriods}`,
  );
}

async function dedupeOnePerCompanyTables(client, table, canonicalId, duplicateIds) {
  if (!(await tableExists(client, table))) return;
  const del = await client.query(`DELETE FROM ${table} WHERE company_id = ANY($1::uuid[])`, [duplicateIds]);
  if (del.rowCount > 0) {
    console.log(`Deleted duplicate ${table}: ${del.rowCount} rows (kept canonical ${canonicalId})`);
  }
}

async function pickCanonical(client, companyIds) {
  const { rows } = await client.query(
    `
    SELECT c.id,
           (SELECT count(*)::int FROM users u WHERE u.company_id = c.id) AS user_count,
           (SELECT count(*)::int FROM billing_settings bs WHERE bs.company_id = c.id) AS billing_settings_count,
           (SELECT count(*)::int FROM billing_submissions bsub WHERE bsub.company_id = c.id) AS submission_count
    FROM companies c
    WHERE c.id = ANY($1::uuid[])
    ORDER BY user_count DESC, billing_settings_count DESC, submission_count DESC, c.created_at ASC
    LIMIT 1
    `,
    [companyIds],
  );
  return rows[0]?.id;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rows: companies } = await client.query(
      `SELECT id, name, asana_workspace_id FROM companies WHERE asana_workspace_id = $1 ORDER BY created_at`,
      [workspaceId],
    );

    if (companies.length <= 1) {
      console.log(`No merge needed (${companies.length} company for workspace ${workspaceId}).`);
      return;
    }

    const companyIds = companies.map((c) => c.id);
    const canonicalId = await pickCanonical(client, companyIds);
    const duplicateIds = companyIds.filter((id) => id !== canonicalId);

    console.log({ workspaceId, canonicalId, duplicateCount: duplicateIds.length, dryRun });
    for (const c of companies) {
      const { rows: users } = await client.query(`SELECT email FROM users WHERE company_id = $1`, [c.id]);
      console.log(`  ${c.id === canonicalId ? "*" : " "} ${c.id} -> ${users.map((u) => u.email).join(", ") || "(no users)"}`);
    }

    if (dryRun) {
      console.log("Dry run — no changes written.");
      return;
    }

    await client.query("BEGIN");

    await dedupeBillingPeriods(client, canonicalId, duplicateIds);
    await dedupeOnePerCompanyTables(client, "billing_settings", canonicalId, duplicateIds);
    await dedupeOnePerCompanyTables(client, "company_settings", canonicalId, duplicateIds);

    for (const table of TABLES_WITH_COMPANY_ID) {
      if (!(await tableExists(client, table))) continue;
      const result = await client.query(
        `UPDATE ${table} SET company_id = $1 WHERE company_id = ANY($2::uuid[])`,
        [canonicalId, duplicateIds],
      );
      if (result.rowCount > 0) {
        console.log(`Updated ${table}: ${result.rowCount} rows`);
      }
    }

    const deleted = await client.query(`DELETE FROM companies WHERE id = ANY($1::uuid[])`, [duplicateIds]);
    console.log(`Deleted ${deleted.rowCount} duplicate companies`);

    await client.query("COMMIT");
    console.log("Merge complete.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
