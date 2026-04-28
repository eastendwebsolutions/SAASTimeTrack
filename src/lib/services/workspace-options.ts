import { asc } from "drizzle-orm";
import { db } from "@/lib/db";

export type WorkspaceOption = {
  id: string; // representative company id for existing API compatibility
  label: string;
  workspaceId: string | null;
  companyIds: string[];
};

export function buildWorkspaceOptions(
  rows: Array<{ id: string; name: string; asanaWorkspaceId: string | null }>,
): WorkspaceOption[] {
  const nullWorkspaceNameCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.asanaWorkspaceId?.trim()) continue;
    const nameKey = row.name.trim().toLowerCase();
    nullWorkspaceNameCounts.set(nameKey, (nullWorkspaceNameCounts.get(nameKey) ?? 0) + 1);
  }

  const grouped = new Map<string, { workspaceId: string | null; companies: Array<{ id: string; name: string }> }>();

  for (const row of rows) {
    const workspaceId = row.asanaWorkspaceId?.trim() || null;
    const nullWorkspaceNameKey = row.name.trim().toLowerCase();
    const shouldGroupByName = !workspaceId && (nullWorkspaceNameCounts.get(nullWorkspaceNameKey) ?? 0) > 1;
    const key = workspaceId ?? (shouldGroupByName ? `name:${nullWorkspaceNameKey}` : `company:${row.id}`);
    const existing = grouped.get(key) ?? { workspaceId, companies: [] };
    existing.companies.push({ id: row.id, name: row.name });
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .map((group) => {
      const sortedCompanies = [...group.companies].sort((a, b) => a.name.localeCompare(b.name));
      const primary = sortedCompanies[0];
      const label =
        group.workspaceId && sortedCompanies.length > 1
          ? `${primary.name} Workspace (${sortedCompanies.length} companies)`
          : group.workspaceId
            ? `${primary.name} Workspace`
            : primary.name;

      return {
        id: primary.id,
        label,
        workspaceId: group.workspaceId,
        companyIds: sortedCompanies.map((company) => company.id),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function listWorkspaceOptionsForSuperAdmin() {
  const rows = await db.query.companies.findMany({
    columns: {
      id: true,
      name: true,
      asanaWorkspaceId: true,
    },
    orderBy: (table) => [asc(table.name)],
  });
  return buildWorkspaceOptions(rows);
}

export async function resolveWorkspaceScopedCompanyIdsForSuperAdmin(selectedCompanyId?: string | null) {
  const options = await listWorkspaceOptionsForSuperAdmin();
  if (!options.length) return [];
  if (!selectedCompanyId) return options[0].companyIds;
  const selected = options.find((option) => option.id === selectedCompanyId || option.companyIds.includes(selectedCompanyId));
  return selected?.companyIds ?? [selectedCompanyId];
}

