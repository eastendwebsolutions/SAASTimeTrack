import { describe, expect, it } from "vitest";
import { displayNameFromEmail, looksLikeClerkOpaqueId, resolveUserDisplayName } from "@/lib/services/user-display-name";

describe("resolveUserDisplayName", () => {
  it("detects opaque Clerk user ids", () => {
    expect(looksLikeClerkOpaqueId("user_3DnoPyCVvmlpfLy7Hy6zVu2eUY")).toBe(true);
    expect(looksLikeClerkOpaqueId("Bryan Spano")).toBe(false);
  });

  it("falls back to email when Clerk only returns an opaque id", () => {
    expect(
      resolveUserDisplayName({
        email: "bspano@restori.io",
        clerkDisplayName: "user_3DnoPyCVvmlpfLy7Hy6zVu2eUY",
      }),
    ).toBe("Bspano");
  });

  it("prefers database display name", () => {
    expect(
      resolveUserDisplayName({
        email: "bspano@restori.io",
        dbDisplayName: "Bryan Spano",
        clerkDisplayName: "user_3DnoPyCVvmlpfLy7Hy6zVu2eUY",
      }),
    ).toBe("Bryan Spano");
  });

  it("derives readable names from email", () => {
    expect(displayNameFromEmail("bspano@restori.io")).toBe("Bspano");
  });
});
