import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, projects, tasks } from "@/lib/db/schema";
import { getAsanaAccessTokenForUser } from "@/lib/services/poker-planning/asana";
import type { IntegrationProvider } from "@/lib/integrations/provider";
import { withProjectsProviderColumnFallback } from "@/lib/integrations/projects-provider-fallback";

function calendarYmdInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function countAssignedFromDb(userId: string, provider: IntegrationProvider) {
  const [row] = await withProjectsProviderColumnFallback(
    () =>
      db
        .select({ n: count() })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(
          and(
            eq(tasks.assignedUserId, userId),
            eq(tasks.isActive, true),
            eq(projects.syncedByUserId, userId),
            eq(projects.provider, provider),
          ),
        ),
    () =>
      db
        .select({ n: count() })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(and(eq(tasks.assignedUserId, userId), eq(tasks.isActive, true), eq(projects.syncedByUserId, userId))),
  );
  return Number(row?.n ?? 0);
}

async function fetchAsanaOpenAssignedWithDueStats(args: { userId: string; workspaceGid: string; timeZone: string }) {
  const { request } = await getAsanaAccessTokenForUser(args.userId);
  const todayYmd = calendarYmdInTimeZone(new Date(), args.timeZone);
  let totalOpen = 0;
  let dueToday = 0;
  let offset: string | null = null;

  do {
    const params = new URLSearchParams({
      workspace: args.workspaceGid,
      assignee: "me",
      limit: "100",
      completed_since: "now",
      opt_fields: "gid,due_on,due_at,completed",
    });
    if (offset) params.set("offset", offset);

    const page = await request<{
      data: Array<{ gid: string; due_on?: string | null; due_at?: string | null; completed?: boolean }>;
      next_page?: { offset?: string | null } | null;
    }>(`/tasks?${params.toString()}`);

    for (const task of page.data) {
      if (task.completed) continue;
      totalOpen += 1;
      const dueOn = task.due_on?.trim();
      if (dueOn && dueOn === todayYmd) {
        dueToday += 1;
        continue;
      }
      if (task.due_at) {
        const parsed = Date.parse(task.due_at);
        if (Number.isFinite(parsed) && calendarYmdInTimeZone(new Date(parsed), args.timeZone) === todayYmd) {
          dueToday += 1;
        }
      }
    }
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return { totalOpenAssigned: totalOpen, dueToday };
}

export type IntegrationTaskWidget = {
  provider: IntegrationProvider;
  assignedTotal: number;
  dueToday: number | null;
  liveDueDates: boolean;
  error?: string;
};

export async function getDashboardIntegrationTaskWidget(args: {
  userId: string;
  companyId: string;
  provider: IntegrationProvider;
  timeZone: string;
}): Promise<IntegrationTaskWidget> {
  const assignedTotal = await countAssignedFromDb(args.userId, args.provider);

  if (args.provider !== "asana") {
    return {
      provider: args.provider,
      assignedTotal,
      dueToday: null,
      liveDueDates: false,
    };
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, args.companyId),
    columns: { asanaWorkspaceId: true },
  });
  const workspaceGid = company?.asanaWorkspaceId?.trim();
  if (!workspaceGid) {
    return {
      provider: args.provider,
      assignedTotal,
      dueToday: null,
      liveDueDates: false,
      error: "Company workspace is not set yet. Run a sync from Time Entry, then reopen the dashboard.",
    };
  }

  try {
    const live = await fetchAsanaOpenAssignedWithDueStats({
      userId: args.userId,
      workspaceGid,
      timeZone: args.timeZone,
    });
    return {
      provider: args.provider,
      assignedTotal: live.totalOpenAssigned,
      dueToday: live.dueToday,
      liveDueDates: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Asana task due dates.";
    return {
      provider: args.provider,
      assignedTotal,
      dueToday: null,
      liveDueDates: false,
      error: message,
    };
  }
}
