import { and, eq, inArray } from "drizzle-orm";
import { asanaFetch } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, companies, projects, syncRuns, tasks, users } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

type AsanaWorkspacesResponse = { data: Array<{ gid: string; name: string }> };
type AsanaProjectsResponse = { data: Array<{ gid: string; name: string; archived?: boolean }> };
type AsanaTasksResponse = {
  data: Array<{
    gid: string;
    name: string;
    completed?: boolean;
    parent?: { gid: string } | null;
    assignee?: { gid: string } | null;
  }>;
  next_page?: { offset?: string | null } | null;
};

function truncateName(name: string, maxLength = 255) {
  return name.length <= maxLength ? name : name.slice(0, maxLength);
}

async function fetchProjectTasksPaginated(projectGid: string, accessToken: string) {
  const allTasks: AsanaTasksResponse["data"] = [];
  let offset: string | null = null;

  do {
    const params = new URLSearchParams({
      project: projectGid,
      limit: "100",
      completed_since: "now",
      opt_fields: "gid,name,completed,parent.gid,assignee.gid",
    });

    if (offset) {
      params.set("offset", offset);
    }

    const page = await asanaFetch<AsanaTasksResponse>(`/tasks?${params.toString()}`, accessToken);
    allTasks.push(...page.data);
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return allTasks;
}

export async function syncUserAsanaData(userId: string, type: "initial" | "periodic" | "manual" = "manual") {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    throw new Error("User not found");
  }

  const run = await db
    .insert(syncRuns)
    .values({ companyId: user.companyId, userId, type, status: "running" })
    .returning();

  try {
    const companyUsers = await db.query.users.findMany({
      where: eq(users.companyId, user.companyId),
      columns: { id: true },
    });
    const companyUserIds = companyUsers.map((companyUser) => companyUser.id);
    const companyConnections = companyUserIds.length
      ? await db.query.asanaConnections.findMany({
          where: inArray(asanaConnections.userId, companyUserIds),
        })
      : [];

    const preferredConnection =
      companyConnections.find((connection) => connection.userId === userId) ?? companyConnections[0];
    if (!preferredConnection) {
      throw new Error("Asana not connected");
    }

    const accessToken = decrypt(preferredConnection.accessTokenEncrypted);
    let projectsSynced = 0;
    let tasksSynced = 0;
    let subtasksSynced = 0;

    const workspaces = await asanaFetch<AsanaWorkspacesResponse>("/workspaces?limit=50&opt_fields=gid,name", accessToken);
    const primaryWorkspace = workspaces.data[0];
    if (primaryWorkspace) {
      await db
        .update(companies)
        .set({
          name: truncateName(primaryWorkspace.name),
          asanaWorkspaceId: primaryWorkspace.gid,
        })
        .where(eq(companies.id, user.companyId));
    }

    const projectsResponse = await asanaFetch<AsanaProjectsResponse>(
      "/projects?opt_fields=gid,name,archived",
      accessToken,
    );

    for (const project of projectsResponse.data) {
      if (project.archived) {
        continue;
      }
      projectsSynced += 1;

      const [upsertedProject] = await db
        .insert(projects)
        .values({
          companyId: user.companyId,
          asanaProjectId: project.gid,
          name: truncateName(project.name),
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [projects.companyId, projects.asanaProjectId],
          set: { name: truncateName(project.name), lastSyncedAt: new Date(), isActive: true },
        })
        .returning();

      const taskData = await fetchProjectTasksPaginated(project.gid, accessToken);

      for (const task of taskData) {
        if (task.completed) {
          continue;
        }

        const parentTask = task.parent?.gid
          ? await db.query.tasks.findFirst({
              where: eq(tasks.asanaTaskId, task.parent.gid),
            })
          : null;

        await db
          .insert(tasks)
          .values({
            projectId: upsertedProject.id,
            asanaTaskId: task.gid,
            name: truncateName(task.name),
            assignedUserId: null,
            parentTaskId: parentTask?.id ?? null,
            isActive: true,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: tasks.asanaTaskId,
            set: {
              name: truncateName(task.name),
              assignedUserId: null,
              parentTaskId: parentTask?.id ?? null,
              isActive: true,
              lastSyncedAt: new Date(),
            },
          });

        tasksSynced += 1;
        if (task.parent?.gid) {
          subtasksSynced += 1;
        }
      }
    }

    await db
      .update(syncRuns)
      .set({
        status: "success",
        endedAt: new Date(),
        projectsSynced,
        tasksSynced,
        subtasksSynced,
      })
      .where(eq(syncRuns.id, run[0].id));
    return { projectsSynced, tasksSynced, subtasksSynced };
  } catch (error) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        endedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown sync error",
      })
      .where(and(eq(syncRuns.id, run[0].id)));
    throw error;
  }
}
