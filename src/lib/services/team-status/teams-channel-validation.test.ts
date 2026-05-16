import { describe, expect, it } from "vitest";
import { isTeamsChannelEmail, validateTeamsChannelDestination } from "@/lib/services/team-status/teams-channel-validation";

describe("isTeamsChannelEmail", () => {
  it("accepts Restori amer.teams.ms channel addresses", () => {
    expect(isTeamsChannelEmail("56474809.Restori.onmicrosoft.com@amer.teams.ms")).toBe(true);
  });

  it("accepts thread.tacv2 channel addresses", () => {
    expect(isTeamsChannelEmail("team-member-status@thread.tacv2.teams.ms")).toBe(true);
  });

  it("rejects plain addresses without teams domain", () => {
    expect(isTeamsChannelEmail("user@example.com")).toBe(false);
  });
});

describe("validateTeamsChannelDestination", () => {
  it("normalizes a valid teams channel email", () => {
    expect(
      validateTeamsChannelDestination("email", " 56474809.Restori.onmicrosoft.com@amer.teams.ms "),
    ).toBe("56474809.Restori.onmicrosoft.com@amer.teams.ms");
  });
});
