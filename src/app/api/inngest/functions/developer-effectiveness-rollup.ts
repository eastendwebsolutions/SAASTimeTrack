import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { runDeveloperEffectivenessRollupsForUtcDay } from "@/lib/services/analytics/effectiveness-rollups";
import { startOfUtcDay } from "@/lib/services/analytics/utc-day";
import { inngest } from "./client";

/**
 * Nightly warehouse rollups: PM task snapshots, delivery + timesheet daily metrics.
 * Cursor analytics use a separate optional sync function.
 */
export const developerEffectivenessRollup = inngest.createFunction(
  { id: "developer-effectiveness-rollup", triggers: [{ cron: "15 6 * * *" }] },
  async () => {
    const allCompanies = await db.query.companies.findMany({ columns: { id: true } });
    const companyIds = allCompanies.map((c) => c.id);
    if (companyIds.length === 0) return { companyCount: 0 };

    const targetDay = startOfUtcDay(subDays(new Date(), 1));
    return runDeveloperEffectivenessRollupsForUtcDay(companyIds, targetDay);
  },
);
