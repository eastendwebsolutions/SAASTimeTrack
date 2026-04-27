import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, teamStatusEvents, users } from "@/lib/db/schema";
import type { Role } from "@/lib/auth/rbac";

export const TEAM_STATUS_TIMEZONE = "America/New_York";
export const TEAM_STATUS_SOURCE = "web_dashboard";

export type TeamStatusEventType = "DAY_IN" | "DAY_OUT" | "BREAK_IN" | "BREAK_OUT";
export type TeamStatus = "Not Started" | "Working" | "On Break" | "Ended Day" | "Needs Review";

type DayState = "not_started" | "working" | "on_break" | "ended" | "error";

type TeamStatusEventRow = typeof teamStatusEvents.$inferSelect;

export type TeamStatusEvaluation = {
  status: TeamStatus;
  state: DayState;
  lastEventType: TeamStatusEventType | null;
  lastEventTimeUtc: string | null;
  lastEventTimeLocalLabel: string | null;
  activeWorkSeconds: number;
  needsReview: boolean;
};

export type TeamStatusAction = {
  eventType: TeamStatusEventType;
  enabled: boolean;
  reason?: string;
};

export type TeamStatusActions = {
  dayAction: TeamStatusAction;
  breakAction: TeamStatusAction;
};

export function formatEasternTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TEAM_STATUS_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function getNyParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TEAM_STATUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
  };
}

export function getNowInNy() {
  return getNyParts(new Date());
}

export function toNyDateKey(date: Date) {
  return getNyParts(date).dateKey;
}

export function nyDateKeyToTimestamp(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function yesterdayDateKey(todayDateKey: string) {
  const today = nyDateKeyToTimestamp(todayDateKey);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const year = String(yesterday.getFullYear()).padStart(4, "0");
  const month = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function eventMessageFor(type: TeamStatusEventType, userDisplayName: string) {
  if (type === "DAY_IN") return `${userDisplayName} has STARTED WORK today!`;
  if (type === "DAY_OUT") return `${userDisplayName} has ENDED WORK for the day!`;
  if (type === "BREAK_IN") return `${userDisplayName} has started their BREAK!`;
  return `${userDisplayName} has ended their BREAK!`;
}

function displayNameFromEmail(email: string) {
  const raw = email.split("@")[0] ?? email;
  return raw
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
}

function initialsFromEmail(email: string) {
  const name = displayNameFromEmail(email);
  const parts = name.split(" ").filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "U";
}

export function evaluateDayStatus(events: TeamStatusEventRow[], now = new Date()): TeamStatusEvaluation {
  let state: DayState = "not_started";
  let workStartedAt: Date | null = null;
  let activeWorkMs = 0;
  let needsReview = false;

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.eventTimestampUtc).getTime() - new Date(b.eventTimestampUtc).getTime(),
  );

  for (const event of sortedEvents) {
    const eventTime = new Date(event.eventTimestampUtc);
    switch (event.eventType) {
      case "DAY_IN":
        if (state !== "not_started") {
          needsReview = true;
          state = "error";
          continue;
        }
        state = "working";
        workStartedAt = eventTime;
        break;
      case "BREAK_IN":
        if (state !== "working" || !workStartedAt) {
          needsReview = true;
          state = "error";
          continue;
        }
        activeWorkMs += Math.max(0, eventTime.getTime() - workStartedAt.getTime());
        workStartedAt = null;
        state = "on_break";
        break;
      case "BREAK_OUT":
        if (state !== "on_break") {
          needsReview = true;
          state = "error";
          continue;
        }
        workStartedAt = eventTime;
        state = "working";
        break;
      case "DAY_OUT":
        if (state !== "working" || !workStartedAt) {
          needsReview = true;
          state = "error";
          continue;
        }
        activeWorkMs += Math.max(0, eventTime.getTime() - workStartedAt.getTime());
        workStartedAt = null;
        state = "ended";
        break;
      default:
        needsReview = true;
        state = "error";
    }
  }

  if (state === "working" && workStartedAt) {
    activeWorkMs += Math.max(0, now.getTime() - workStartedAt.getTime());
  }

  const lastEvent = sortedEvents.at(-1) ?? null;
  const status: TeamStatus =
    state === "error"
      ? "Needs Review"
      : state === "not_started"
        ? "Not Started"
        : state === "working"
          ? "Working"
          : state === "on_break"
            ? "On Break"
            : "Ended Day";

  return {
    status,
    state,
    lastEventType: (lastEvent?.eventType as TeamStatusEventType | undefined) ?? null,
    lastEventTimeUtc: lastEvent ? new Date(lastEvent.eventTimestampUtc).toISOString() : null,
    lastEventTimeLocalLabel: lastEvent ? formatEasternTimestamp(new Date(lastEvent.eventTimestampUtc)) : null,
    activeWorkSeconds: Math.floor(activeWorkMs / 1000),
    needsReview,
  };
}

export function getAvailableActions(status: TeamStatusEvaluation): TeamStatusActions {
  if (status.state === "error") {
    return {
      dayAction: { eventType: "DAY_OUT", enabled: false, reason: "Status sequence needs review." },
      breakAction: { eventType: "BREAK_IN", enabled: false, reason: "Status sequence needs review." },
    };
  }
  if (status.state === "not_started") {
    return {
      dayAction: { eventType: "DAY_IN", enabled: true },
      breakAction: { eventType: "BREAK_IN", enabled: false, reason: "Start your day first." },
    };
  }
  if (status.state === "working") {
    return {
      dayAction: { eventType: "DAY_OUT", enabled: true },
      breakAction: { eventType: "BREAK_IN", enabled: true },
    };
  }
  if (status.state === "on_break") {
    return {
      dayAction: { eventType: "DAY_OUT", enabled: false, reason: "End your break before ending your day." },
      breakAction: { eventType: "BREAK_OUT", enabled: true },
    };
  }
  return {
    dayAction: { eventType: "DAY_IN", enabled: false, reason: "Workday already ended." },
    breakAction: { eventType: "BREAK_IN", enabled: false, reason: "Workday already ended." },
  };
}

export async function getUserCurrentStatus(userId: string, localDateKey = getNowInNy().dateKey) {
  const dayDate = nyDateKeyToTimestamp(localDateKey);
  const events = await db.query.teamStatusEvents.findMany({
    where: and(eq(teamStatusEvents.userId, userId), eq(teamStatusEvents.eventLocalDate, dayDate)),
    orderBy: [asc(teamStatusEvents.eventTimestampUtc)],
  });
  const status = evaluateDayStatus(events);
  return {
    ...status,
    availableActions: getAvailableActions(status),
  };
}

export function isEventType(input: string): input is TeamStatusEventType {
  return input === "DAY_IN" || input === "DAY_OUT" || input === "BREAK_IN" || input === "BREAK_OUT";
}

export async function createTeamStatusEvent(params: {
  companyId: string;
  userId: string;
  eventType: TeamStatusEventType;
  createdByUserId: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const localDateKey = toNyDateKey(now);
  const current = await getUserCurrentStatus(params.userId, localDateKey);
  const actions = current.availableActions;
  const allowed = [actions.dayAction, actions.breakAction].find((action) => action.eventType === params.eventType);
  if (!allowed || !allowed.enabled) {
    return {
      ok: false as const,
      error: allowed?.reason ?? "Invalid status transition.",
      current,
    };
  }

  const [inserted] = await db
    .insert(teamStatusEvents)
    .values({
      companyId: params.companyId,
      userId: params.userId,
      eventType: params.eventType,
      eventTimestampUtc: now,
      eventTimezone: TEAM_STATUS_TIMEZONE,
      eventLocalDate: nyDateKeyToTimestamp(localDateKey),
      eventLocalTimeLabel: formatEasternTimestamp(now),
      source: TEAM_STATUS_SOURCE,
      createdByUserId: params.createdByUserId,
    })
    .returning();

  const updated = await getUserCurrentStatus(params.userId, localDateKey);
  return {
    ok: true as const,
    event: inserted,
    current: updated,
  };
}

export async function getScopeCompanyIds(actor: { role: Role; companyId: string }, requestedCompanyId?: string | null) {
  if (actor.role === "super_admin") {
    if (!requestedCompanyId) return [];
    return [requestedCompanyId];
  }
  return [actor.companyId];
}

export async function listTeamStatusFeed(params: {
  actor: { role: Role; companyId: string; userId: string };
  companyId?: string | null;
  userIds?: string[];
  eventTypes?: TeamStatusEventType[];
  startDate?: string | null;
  endDate?: string | null;
  defaultTodayYesterday?: boolean;
  limit?: number;
}) {
  const companyIds = await getScopeCompanyIds(params.actor, params.companyId);
  if (companyIds.length === 0) {
    return {
      events: [],
      users: [],
      companies: params.actor.role === "super_admin" ? await db.select().from(companies).orderBy(asc(companies.name)) : [],
      requiresCompanyFilter: params.actor.role === "super_admin",
    };
  }

  const todayKey = getNowInNy().dateKey;
  const defaultStart = yesterdayDateKey(todayKey);
  const startKey = params.startDate || (params.defaultTodayYesterday ? defaultStart : null);
  const endKey = params.endDate || (params.defaultTodayYesterday ? todayKey : null);

  const whereParts = [inArray(teamStatusEvents.companyId, companyIds)];
  if (params.actor.role !== "super_admin" && params.actor.role !== "company_admin") {
    if (params.userIds?.length) {
      whereParts.push(eq(users.companyId, params.actor.companyId));
    }
  }
  if (params.userIds?.length) whereParts.push(inArray(teamStatusEvents.userId, params.userIds));
  if (params.eventTypes?.length) whereParts.push(inArray(teamStatusEvents.eventType, params.eventTypes));
  if (startKey) whereParts.push(gte(teamStatusEvents.eventLocalDate, nyDateKeyToTimestamp(startKey)));
  if (endKey) whereParts.push(lte(teamStatusEvents.eventLocalDate, nyDateKeyToTimestamp(endKey)));

  const rows = await db
    .select({
      event: teamStatusEvents,
      user: {
        id: users.id,
        email: users.email,
      },
    })
    .from(teamStatusEvents)
    .innerJoin(users, eq(users.id, teamStatusEvents.userId))
    .where(and(...whereParts))
    .orderBy(desc(teamStatusEvents.eventTimestampUtc))
    .limit(params.limit ?? 250);

  const filteredRows =
    params.actor.role === "user"
      ? rows.filter((row) => row.user.id === params.actor.userId || row.event.companyId === params.actor.companyId)
      : rows;

  const userMap = new Map<string, { id: string; email: string; displayName: string; initials: string }>();
  for (const row of filteredRows) {
    if (!userMap.has(row.user.id)) {
      userMap.set(row.user.id, {
        id: row.user.id,
        email: row.user.email,
        displayName: displayNameFromEmail(row.user.email),
        initials: initialsFromEmail(row.user.email),
      });
    }
  }

  return {
    events: filteredRows.map((row) => ({
      id: row.event.id,
      companyId: row.event.companyId,
      userId: row.event.userId,
      eventType: row.event.eventType as TeamStatusEventType,
      eventTimestampUtc: new Date(row.event.eventTimestampUtc).toISOString(),
      eventTimestampLocalLabel: formatEasternTimestamp(new Date(row.event.eventTimestampUtc)),
      eventLocalDate: toNyDateKey(new Date(row.event.eventTimestampUtc)),
      message: eventMessageFor(row.event.eventType as TeamStatusEventType, displayNameFromEmail(row.user.email)),
      userDisplayName: displayNameFromEmail(row.user.email),
      userInitials: initialsFromEmail(row.user.email),
    })),
    users: Array.from(userMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    companies: params.actor.role === "super_admin" ? await db.select().from(companies).orderBy(asc(companies.name)) : [],
    requiresCompanyFilter: false,
  };
}

export async function listTeamStatusHistory(params: {
  actor: { role: Role; companyId: string; userId: string };
  companyId?: string | null;
  userIds?: string[];
  eventTypes?: TeamStatusEventType[];
  startDate?: string | null;
  endDate?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const feed = await listTeamStatusFeed({
    ...params,
    defaultTodayYesterday: false,
    limit: pageSize + offset,
  });
  const items = feed.events.slice(offset, offset + pageSize);
  return {
    ...feed,
    items,
    page,
    pageSize,
    total: feed.events.length,
  };
}

export async function getUserCountForScope(actor: { role: Role; companyId: string }, companyId?: string | null) {
  if (actor.role === "super_admin") {
    if (!companyId) return 0;
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.companyId, companyId));
    return row?.count ?? 0;
  }
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.companyId, actor.companyId));
  return row?.count ?? 0;
}
