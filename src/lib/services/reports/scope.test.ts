import { describe, expect, it, vi } from "vitest";
import { resolveReportScope } from "./scope";
import type { RetrospectiveFilters } from "./types";

vi.mock("@/lib/services/workspace-options", () => ({
  resolveWorkspaceScopedCompanyIdsForSuperAdmin: vi.fn(async (selectedCompanyId?: string | null) =>
    selectedCompanyId ? [selectedCompanyId, "c_shared"] : ["c1"],
  ),
}));

const baseFilters: RetrospectiveFilters = {
  integrationType: "asana",
  workspaceId: "ws_1",
  periodMode: "sprint",
  sprintId: "spr_1",
  teamMemberIds: null,
};

describe("resolveReportScope", () => {
  it("locks standard users to self", async () => {
    const scope = await resolveReportScope({ id: "u1", companyId: "c1", role: "user" }, baseFilters);
    expect(scope.lockedUserId).toBe("u1");
    expect(scope.companyId).toBe("c1");
    expect(scope.companyIds).toEqual(["c1"]);
  });

  it("locks company admins to own company", async () => {
    const scope = await resolveReportScope({ id: "u1", companyId: "c1", role: "company_admin" }, { ...baseFilters, companyId: "other" });
    expect(scope.lockedUserId).toBeUndefined();
    expect(scope.companyId).toBe("c1");
    expect(scope.companyIds).toEqual(["c1"]);
  });

  it("allows super admin to choose workspace scoped companies", async () => {
    const scope = await resolveReportScope({ id: "u1", companyId: "c1", role: "super_admin" }, { ...baseFilters, companyId: "c2" });
    expect(scope.companyId).toBe("c2");
    expect(scope.companyIds).toEqual(["c2", "c_shared"]);
  });
});
