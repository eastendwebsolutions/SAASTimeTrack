import { describe, expect, it } from "vitest";
import { resolveReportScope } from "./scope";
import type { RetrospectiveFilters } from "./types";

const baseFilters: RetrospectiveFilters = {
  integrationType: "asana",
  workspaceId: "ws_1",
  periodMode: "sprint",
  sprintId: "spr_1",
  teamMemberIds: null,
};

describe("resolveReportScope", () => {
  it("locks standard users to self", () => {
    const scope = resolveReportScope({ id: "u1", companyId: "c1", role: "user" }, baseFilters);
    expect(scope.lockedUserId).toBe("u1");
    expect(scope.companyId).toBe("c1");
  });

  it("locks company admins to own company", () => {
    const scope = resolveReportScope({ id: "u1", companyId: "c1", role: "company_admin" }, { ...baseFilters, companyId: "other" });
    expect(scope.lockedUserId).toBeUndefined();
    expect(scope.companyId).toBe("c1");
  });

  it("allows super admin to choose company", () => {
    const scope = resolveReportScope({ id: "u1", companyId: "c1", role: "super_admin" }, { ...baseFilters, companyId: "c2" });
    expect(scope.companyId).toBe("c2");
  });
});
