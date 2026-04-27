import { describe, expect, it } from "vitest";
import { evaluateDayStatus, getAvailableActions } from "./team-status";

function event(eventType: "DAY_IN" | "DAY_OUT" | "BREAK_IN" | "BREAK_OUT", iso: string) {
  return {
    id: crypto.randomUUID(),
    companyId: "c1",
    userId: "u1",
    eventType,
    eventTimestampUtc: new Date(iso),
    eventTimezone: "America/New_York",
    eventLocalDate: new Date("2026-04-27T00:00:00"),
    eventLocalTimeLabel: null,
    source: "web_dashboard",
    note: null,
    createdByUserId: "u1",
    createdAt: new Date(iso),
    updatedAt: new Date(iso),
  };
}

describe("team status state machine", () => {
  it("marks user working after DAY_IN", () => {
    const status = evaluateDayStatus([event("DAY_IN", "2026-04-27T12:00:00.000Z")], new Date("2026-04-27T13:00:00.000Z"));
    expect(status.status).toBe("Working");
    expect(status.activeWorkSeconds).toBe(3600);
  });

  it("tracks break durations and returns working after BREAK_OUT", () => {
    const status = evaluateDayStatus(
      [
        event("DAY_IN", "2026-04-27T12:00:00.000Z"),
        event("BREAK_IN", "2026-04-27T14:00:00.000Z"),
        event("BREAK_OUT", "2026-04-27T14:30:00.000Z"),
      ],
      new Date("2026-04-27T15:00:00.000Z"),
    );
    expect(status.status).toBe("Working");
    expect(status.activeWorkSeconds).toBe(9000);
  });

  it("marks ended day on valid DAY_OUT", () => {
    const status = evaluateDayStatus(
      [event("DAY_IN", "2026-04-27T12:00:00.000Z"), event("DAY_OUT", "2026-04-27T16:00:00.000Z")],
      new Date("2026-04-27T18:00:00.000Z"),
    );
    expect(status.status).toBe("Ended Day");
    expect(status.activeWorkSeconds).toBe(14400);
  });

  it("marks invalid sequences as needs review", () => {
    const status = evaluateDayStatus([event("BREAK_OUT", "2026-04-27T12:00:00.000Z")], new Date("2026-04-27T12:05:00.000Z"));
    expect(status.status).toBe("Needs Review");
    expect(status.needsReview).toBe(true);
  });
});

describe("team status actions", () => {
  it("returns DAY_IN as first action for not started", () => {
    const evaluated = evaluateDayStatus([], new Date("2026-04-27T13:00:00.000Z"));
    const actions = getAvailableActions(evaluated);
    expect(actions.dayAction.eventType).toBe("DAY_IN");
    expect(actions.dayAction.enabled).toBe(true);
    expect(actions.breakAction.enabled).toBe(false);
  });

  it("blocks DAY_OUT while on break", () => {
    const evaluated = evaluateDayStatus(
      [event("DAY_IN", "2026-04-27T12:00:00.000Z"), event("BREAK_IN", "2026-04-27T12:30:00.000Z")],
      new Date("2026-04-27T13:00:00.000Z"),
    );
    const actions = getAvailableActions(evaluated);
    expect(actions.dayAction.eventType).toBe("DAY_OUT");
    expect(actions.dayAction.enabled).toBe(false);
    expect(actions.breakAction.eventType).toBe("BREAK_OUT");
    expect(actions.breakAction.enabled).toBe(true);
  });
});
