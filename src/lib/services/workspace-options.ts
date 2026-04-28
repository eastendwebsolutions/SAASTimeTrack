import { asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportingWorkspaces, users } from "@/lib/db/schema";

export type WorkspaceOption = {
  id: string; // representative company id for existing API compatibility
  label: string;
  workspaceId: string | null;
  companyIds: string[];
};

export function buildWorkspaceOptions(
  rows: Array<{
    id: string;
    name: string;
    asanaWorkspaceId: string | null;
    reportingWorkspaceIds?: string[];
    reportingWorkspaceNamesById?: Record<string, string>;
  }>,
): WorkspaceOption[] {
  const nullWorkspaceNameCounts = new Map<string, number>();
  for (const row of rows) {
    const hasWorkspace =
      Boolean(row.asanaWorkspaceId?.trim()) || Boolean(row.reportingWorkspaceIds && row.reportingWorkspaceIds.length > 0);
    if (hasWorkspace) continue;
    const nameKey = row.name.trim().toLowerCase();
    nullWorkspaceNameCounts.set(nameKey, (nullWorkspaceNameCounts.get(nameKey) ?? 0) + 1);
  }

  const grouped = new Map<
    string,
    { workspaceId: string | null; workspaceName: string | null; companies: Array<{ id: string; name: string }> }
  >();

  for (const row of rows) {
    const reportingWorkspaceIds = [...new Set((row.reportingWorkspaceIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const fallbackWorkspaceId = row.asanaWorkspaceId?.trim() || null;
    const workspaceIds = reportingWorkspaceIds.length ? reportingWorkspaceIds : fallbackWorkspaceId ? [fallbackWorkspaceId] : [];

    const nullWorkspaceNameKey = row.name.trim().toLowerCase();
    const shouldGroupByName = workspaceIds.length === 0 && (nullWorkspaceNameCounts.get(nullWorkspaceNameKey) ?? 0) > 1;

    if (workspaceIds.length === 0) {
      const key = shouldGroupByName ? `name:${nullWorkspaceNameKey}` : `company:${row.id}`;
      const existing = grouped.get(key) ?? { workspaceId: null, workspaceName: null, companies: [] };
      existing.companies.push({ id: row.id, name: row.name });
      grouped.set(key, existing);
      continue;
    }

    for (const workspaceId of workspaceIds) {
      const key = `workspace:${workspaceId}`;
      const workspaceName = row.reportingWorkspaceNamesById?.[workspaceId] ?? null;
      const existing = grouped.get(key) ?? { workspaceId, workspaceName, companies: [] };
      if (!existing.workspaceName && workspaceName) existing.workspaceName = workspaceName;
      existing.companies.push({ id: row.id, name: row.name });
      grouped.set(key, existing);
    }
  }

  return [...grouped.values()]
    .map((group) => {
      const dedupedCompanies = Array.from(
        new Map(group.companies.map((company) => [company.id, company])).values(),
      );
      const sortedCompanies = dedupedCompanies.sort((a, b) => a.name.localeCompare(b.name));
      const primary = sortedCompanies[0];
      const label =
        group.workspaceId && sortedCompanies.length > 1
          ? `${group.workspaceName ?? primary.name} Workspace (${sortedCompanies.length} companies)`
          : group.workspaceId
            ? `${group.workspaceName ?? primary.name} Workspace`
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
  const [rows, asanaWorkspaces, activeCompanyRows] = await Promise.all([
    db.query.companies.findMany({
      columns: {
        id: true,
        name: true,
        asanaWorkspaceId: true,
      },
      orderBy: (table) => [asc(table.name)],
    }),
    db.query.reportingWorkspaces.findMany({
      where: eq(reportingWorkspaces.integrationType, "asana"),
      columns: {
        companyId: true,
        externalWorkspaceId: true,
        workspaceName: true,
      },
    }),
    db
      .select({
        companyId: users.companyId,
        userCount: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.companyId)
      .having(gt(sql<number>`count(*)::int`, 0)),
  ]);

  const activeCompanyIds = new Set(activeCompanyRows.map((row) => row.companyId));
  const byCompany = new Map<string, { ids: string[]; namesById: Record<string, string> }>();
  for (const row of asanaWorkspaces) {
    const existing = byCompany.get(row.companyId) ?? { ids: [], namesById: {} };
    if (!existing.ids.includes(row.externalWorkspaceId)) {
      existing.ids.push(row.externalWorkspaceId);
    }
    if (!existing.namesById[row.externalWorkspaceId] && row.workspaceName) {
      existing.namesById[row.externalWorkspaceId] = row.workspaceName;
    }
    byCompany.set(row.companyId, existing);
  }

  const enrichedRows = rows
    .filter((row) => activeCompanyIds.has(row.id))
    .map((row) => ({
      ...row,
      reportingWorkspaceIds: byCompany.get(row.id)?.ids ?? [],
      reportingWorkspaceNamesById: byCompany.get(row.id)?.namesById ?? {},
    }));

  return buildWorkspaceOptions(enrichedRows);
}

export async function resolveWorkspaceScopedCompanyIdsForSuperAdmin(selectedCompanyId?: string | null) {
  const options = await listWorkspaceOptionsForSuperAdmin();
  if (!options.length) return [];
  if (!selectedCompanyId) return options[0].companyIds;
  const selected = options.find((option) => option.id === selectedCompanyId || option.companyIds.includes(selectedCompanyId));
  return selected?.companyIds ?? [selectedCompanyId];
}

