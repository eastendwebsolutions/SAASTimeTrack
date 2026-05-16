/**
 * Clears all billing submission history and periods so every company
 * starts fresh for the most recent completed billing week (Sat–Fri, America/New_York).
 *
 * Usage: DATABASE_URL="postgresql://..." node scripts/reset-billing-submissions.mjs
 */

import pg from "pg";

const BILLING_TIMEZONE = "America/New_York";

const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const labelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIMEZONE,
  month: "long",
  day: "numeric",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BILLING_TIMEZONE,
  weekday: "short",
});

function getNyDateParts(input) {
  const parts = datePartsFormatter.formatToParts(input);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function addUtcDays(base, days) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnlyUtc(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

function weekdayIndexShort(weekday) {
  const map = new Map([
    ["Sun", 0],
    ["Mon", 1],
    ["Tue", 2],
    ["Wed", 3],
    ["Thu", 4],
    ["Fri", 5],
    ["Sat", 6],
  ]);
  return map.get(weekday) ?? 0;
}

function getBillingWeekBounds(now = new Date()) {
  const nyDate = toDateOnlyUtc(getNyDateParts(now));
  const weekday = weekdayIndexShort(weekdayFormatter.format(now));
  const daysFromSaturday = (weekday + 1) % 7;
  const periodStart = addUtcDays(nyDate, -daysFromSaturday);
  const periodEnd = addUtcDays(periodStart, 6);
  return { periodStart, periodEnd };
}

function getMostRecentCompletedBillingWeek(now = new Date()) {
  const { periodStart, periodEnd } = getBillingWeekBounds(now);
  const nowNyDate = toDateOnlyUtc(getNyDateParts(now));
  const hasWeekEnded = nowNyDate > periodEnd;

  if (hasWeekEnded) {
    return { periodStart, periodEnd };
  }

  return {
    periodStart: addUtcDays(periodStart, -7),
    periodEnd: addUtcDays(periodEnd, -7),
  };
}

function getBillingPeriodLabel(periodStart, periodEnd) {
  return `${labelFormatter.format(periodStart)} to ${labelFormatter.format(periodEnd)}`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const { periodStart, periodEnd } = getMostRecentCompletedBillingWeek();
  const periodLabel = getBillingPeriodLabel(periodStart, periodEnd);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const before = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM billing_submission_files) AS files,
        (SELECT COUNT(*)::int FROM billing_submissions) AS submissions,
        (SELECT COUNT(*)::int FROM billing_periods) AS periods
    `);

    await client.query("DELETE FROM billing_submission_files");
    await client.query("DELETE FROM billing_submissions");
    await client.query("DELETE FROM billing_periods");

    const companies = await client.query("SELECT id, name FROM companies ORDER BY name");
    for (const company of companies.rows) {
      await client.query(
        `
          INSERT INTO billing_periods (company_id, period_start_date, period_end_date, timezone, label)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (company_id, period_start_date, period_end_date) DO NOTHING
        `,
        [company.id, periodStart, periodEnd, BILLING_TIMEZONE, periodLabel],
      );
    }

    await client.query("COMMIT");

    const after = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM billing_submission_files) AS files,
        (SELECT COUNT(*)::int FROM billing_submissions) AS submissions,
        (SELECT COUNT(*)::int FROM billing_periods) AS periods
    `);

    console.log("Billing reset complete.");
    console.log("Target period:", periodLabel);
    console.log("Period bounds (UTC):", periodStart.toISOString(), "→", periodEnd.toISOString());
    console.log("Before:", before.rows[0]);
    console.log("After:", after.rows[0]);
    console.log("Companies with fresh period row:", companies.rowCount);
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
