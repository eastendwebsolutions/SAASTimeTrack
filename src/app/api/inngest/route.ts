import { serve } from "inngest/next";
import { inngest } from "@/app/api/inngest/functions/client";
import { cursorAnalyticsSync } from "@/app/api/inngest/functions/cursor-analytics-sync";
import { developerEffectivenessRollup } from "@/app/api/inngest/functions/developer-effectiveness-rollup";
import { periodicAsanaSync } from "@/app/api/inngest/functions/periodic-asana-sync";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [periodicAsanaSync, developerEffectivenessRollup, cursorAnalyticsSync],
});
