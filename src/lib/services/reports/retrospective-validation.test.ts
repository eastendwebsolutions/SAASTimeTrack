import { describe, expect, it } from "vitest";
import { parseRetrospectiveFilters } from "./retrospective-validation";

describe("parseRetrospectiveFilters", () => {
  it("parses sprint mode", () => {
    const params = new URLSearchParams({
      integrationType: "asana",
      workspaceId: "ws_1",
      periodMode: "sprint",
      sprintId: "sprint_1",
      teamMemberIds: "u1,u2",
    });
    const parsed = parseRetrospectiveFilters(params);
    expect(parsed.periodMode).toBe("sprint");
    expect(parsed.sprintId).toBe("sprint_1");
    expect(parsed.teamMemberIds).toEqual(["u1", "u2"]);
  });

  it("parses date range mode", () => {
    const params = new URLSearchParams({
      integrationType: "asana",
      workspaceId: "ws_1",
      periodMode: "date_range",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      teamMemberIds: "all",
    });
    const parsed = parseRetrospectiveFilters(params);
    expect(parsed.periodMode).toBe("date_range");
    expect(parsed.startDate?.toISOString().startsWith("2026-01-01")).toBe(true);
    expect(parsed.teamMemberIds).toBeNull();
  });
});
