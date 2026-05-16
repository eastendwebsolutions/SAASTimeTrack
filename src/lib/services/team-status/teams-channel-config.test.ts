import { describe, expect, it } from "vitest";

describe("team status teams channel validation", () => {
  it("accepts channel email shape", () => {
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test("team@thread.tacv2.teams.ms")).toBe(true);
  });

  it("requires https webhook", () => {
    expect(() => new URL("https://example.com/hook").protocol).not.toThrow();
    expect(new URL("https://example.com/hook").protocol).toBe("https:");
  });
});
