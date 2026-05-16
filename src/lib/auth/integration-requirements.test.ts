import { describe, expect, it } from "vitest";
import { requiresPersonalIntegration } from "@/lib/auth/integration-requirements";

describe("requiresPersonalIntegration", () => {
  it("exempts super_admin", () => {
    expect(requiresPersonalIntegration("super_admin")).toBe(false);
  });

  it("requires integration for other roles", () => {
    expect(requiresPersonalIntegration("user")).toBe(true);
    expect(requiresPersonalIntegration("company_admin")).toBe(true);
  });
});
