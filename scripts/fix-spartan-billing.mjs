/**
 * Ensures all spartanrestoration.com company rows have billing settings and the May 18–24, 2026 period.
 *
 * Usage: DATABASE_URL="postgresql://..." node scripts/fix-spartan-billing.mjs
 */

import pg from "pg";

const COMPANY_NAME = "spartanrestoration.com";
const TO_RECIPIENTS = ["spartanrestorationinc@bills.rippling.com"];
const PERIOD_START = new Date(Date.UTC(2026, 4, 18, 4, 0, 0));
const PERIOD_END = new Date(Date.UTC(2026, 4, 24, 4, 0, 0));
const PERIOD_LABEL = "May 18, 2026 to May 24, 2026";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const companies = await client.query("SELECT id, name FROM companies WHERE name = $1", [COMPANY_NAME]);
    let settingsUpserted = 0;
    let periodsUpserted = 0;

    for (const company of companies.rows) {
      await client.query(
        `
          INSERT INTO billing_settings (company_id, to_recipients_json, cc_recipients_json, bcc_recipients_json, overdue_banner_enabled)
          VALUES ($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb, true)
          ON CONFLICT (company_id) DO UPDATE SET
            to_recipients_json = EXCLUDED.to_recipients_json,
            updated_at = now()
        `,
        [company.id, JSON.stringify(TO_RECIPIENTS)],
      );
      settingsUpserted += 1;

      await client.query(
        `
          INSERT INTO billing_periods (company_id, period_start_date, period_end_date, timezone, label)
          VALUES ($1, $2, $3, 'America/New_York', $4)
          ON CONFLICT (company_id, period_start_date, period_end_date) DO UPDATE SET label = EXCLUDED.label
        `,
        [company.id, PERIOD_START, PERIOD_END, PERIOD_LABEL],
      );
      periodsUpserted += 1;
    }

    const users = await client.query(
      `
        SELECT u.email, u.company_id, bs.to_recipients_json IS NOT NULL AS has_settings
        FROM users u
        JOIN companies c ON c.id = u.company_id
        LEFT JOIN billing_settings bs ON bs.company_id = u.company_id
        WHERE lower(u.email) IN (
          lower('apaderes@restori.io'),
          lower('rbontog@restori.io'),
          lower('rdelrosario@spartanrestoration.com'),
          lower('bvillaneuva@restori.io'),
          lower('kromero@restori.io')
        )
      `,
    );

    await client.query("COMMIT");

    console.log("Spartan billing fix complete.");
    console.log("Companies updated:", companies.rowCount);
    console.log("Settings upserted:", settingsUpserted);
    console.log("Period upserted (May 18–24, 2026):", periodsUpserted);
    console.log("Affected users:", users.rows);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
