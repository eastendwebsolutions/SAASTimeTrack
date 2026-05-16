import { parseRetrospectiveFilters } from "@/lib/services/reports/retrospective-validation";
import type { DeveloperEffectivenessFilters } from "@/lib/services/reports/types";

export function parseDeveloperEffectivenessFilters(searchParams: URLSearchParams): DeveloperEffectivenessFilters {
  const base = parseRetrospectiveFilters(searchParams);
  const adoption = searchParams.get("adoptionScoreMin");
  const delivery = searchParams.get("deliveryScoreMin");
  return {
    ...base,
    reportingJobRole: searchParams.get("reportingJobRole") ?? undefined,
    adoptionScoreMin: adoption && adoption.length > 0 ? Number(adoption) : undefined,
    deliveryScoreMin: delivery && delivery.length > 0 ? Number(delivery) : undefined,
    tableSort: searchParams.get("tableSort") ?? undefined,
    tableSortDir: searchParams.get("tableSortDir") === "desc" ? "desc" : "asc",
  };
}
