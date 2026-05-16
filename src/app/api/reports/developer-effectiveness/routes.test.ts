import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/current-user", () => ({
  getOrCreateCurrentUser: vi.fn(),
}));

vi.mock("@/lib/services/analytics/effectiveness-query", () => ({
  getDeveloperEffectivenessFiltersData: vi.fn(),
  getDeveloperEffectivenessSummary: vi.fn(),
}));

import { GET as getFilters } from "./filters/route";
import { GET as getSummary } from "./summary/route";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getDeveloperEffectivenessFiltersData, getDeveloperEffectivenessSummary } from "@/lib/services/analytics/effectiveness-query";

const adminUser = {
  id: "11111111-1111-1111-1111-111111111111",
  companyId: "22222222-2222-2222-2222-222222222222",
  role: "company_admin" as const,
  email: "admin@example.com",
};

const plainUser = {
  id: "33333333-3333-3333-3333-333333333333",
  companyId: "22222222-2222-2222-2222-222222222222",
  role: "user" as const,
  email: "user@example.com",
};

function summaryUrl() {
  const p = new URLSearchParams({
    integrationType: "asana",
    workspaceId: "ws_ext_1",
    periodMode: "date_range",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  });
  return `http://localhost/api/reports/developer-effectiveness/summary?${p.toString()}`;
}

describe("developer-effectiveness routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /filters", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(getOrCreateCurrentUser).mockResolvedValue(null);
      const res = await getFilters(new NextRequest("http://localhost/api/reports/developer-effectiveness/filters"));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 403 for standard user role", async () => {
      vi.mocked(getOrCreateCurrentUser).mockResolvedValue(plainUser as never);
      const res = await getFilters(new NextRequest("http://localhost/api/reports/developer-effectiveness/filters"));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 200 for company_admin with filter payload", async () => {
      vi.mocked(getOrCreateCurrentUser).mockResolvedValue(adminUser as never);
      const payload = {
        companies: [{ id: adminUser.companyId, name: "Acme" }],
        integrationTypes: ["asana"],
        workspaces: [],
        users: [],
        statuses: [],
        role: "company_admin",
        weightProfiles: [],
        datePresets: ["last_30"] as const,
      };
      vi.mocked(getDeveloperEffectivenessFiltersData).mockResolvedValue(payload as never);

      const res = await getFilters(new NextRequest("http://localhost/api/reports/developer-effectiveness/filters"));
      expect(res.status).toBe(200);
      expect(getDeveloperEffectivenessFiltersData).toHaveBeenCalledWith(adminUser, undefined);
      const body = await res.json();
      expect(body.companies).toHaveLength(1);
    });
  });

  describe("GET /summary", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(getOrCreateCurrentUser).mockResolvedValue(null);
      const res = await getSummary(new NextRequest(summaryUrl()));
      expect(res.status).toBe(401);
    });

    it("returns 403 for standard user role", async () => {
      vi.mocked(getOrCreateCurrentUser).mockResolvedValue(plainUser as never);
      const res = await getSummary(new NextRequest(summaryUrl()));
      expect(res.status).toBe(403);
    });

    it("returns 200 for company_admin when service succeeds", async () => {
      vi.mocked(getOrCreateCurrentUser).mockResolvedValue(adminUser as never);
      const summaryPayload = {
        period: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-31T00:00:00.000Z" },
        cards: [{ key: "delivery_eff", label: "Delivery", value: 72, prev: 70, tooltip: "t" }],
      };
      vi.mocked(getDeveloperEffectivenessSummary).mockResolvedValue(summaryPayload as never);

      const res = await getSummary(new NextRequest(summaryUrl()));
      expect(res.status).toBe(200);
      expect(getDeveloperEffectivenessSummary).toHaveBeenCalled();
      const body = await res.json();
      expect(body.cards).toHaveLength(1);
    });
  });
});
