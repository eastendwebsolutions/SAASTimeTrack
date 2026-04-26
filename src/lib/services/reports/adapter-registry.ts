import type { IntegrationProvider } from "@/lib/integrations/provider";
import { AsanaReportingAdapter } from "@/lib/services/reports/adapters/asana-reporting-adapter";
import type { IntegrationReportingAdapter } from "@/lib/services/reports/integration-reporting-adapter";

const asanaAdapter = new AsanaReportingAdapter();

export function getReportingAdapter(provider: IntegrationProvider): IntegrationReportingAdapter {
  switch (provider) {
    case "asana":
      return asanaAdapter;
    case "jira":
    case "monday":
      // MVP fallback: contract exists, but data sync is not implemented yet.
      return {
        provider,
        async getWorkspaces() {
          return [];
        },
        async getSprints() {
          return [];
        },
        async getTasks() {
          return [];
        },
        normalizeTask(task) {
          return task;
        },
        normalizeSprint(sprint) {
          return sprint;
        },
      };
    default:
      return asanaAdapter;
  }
}
