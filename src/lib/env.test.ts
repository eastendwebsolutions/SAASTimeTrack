import { describe, expect, it } from "vitest";
import { parseOptionalEmailEnv } from "@/lib/env";

describe("parseOptionalEmailEnv", () => {
  it("returns undefined for empty values", () => {
    expect(parseOptionalEmailEnv(undefined)).toBeUndefined();
    expect(parseOptionalEmailEnv("")).toBeUndefined();
    expect(parseOptionalEmailEnv("   ")).toBeUndefined();
  });

  it("returns valid emails", () => {
    expect(parseOptionalEmailEnv("billing@whosaas.com")).toBe("billing@whosaas.com");
  });

  it("returns undefined for invalid emails instead of throwing", () => {
    expect(parseOptionalEmailEnv("not-an-email")).toBeUndefined();
    expect(parseOptionalEmailEnv("WhoSaaS <noreply@whosaas.com>")).toBeUndefined();
  });
});
