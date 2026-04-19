import { and, eq } from "drizzle-orm";
import { asanaFetch } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, companies, projects, syncRuns, tasks, users } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

type AsanaWorkspacesResponse = { data: Array<{ gid: string; name: string }> };
type AsanaProjectsResponse = {
  data: Array<{ gid: string; name: string; archived?: boolean }>;
  next_page?: { offset?: string | null } | null;
};
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

async function fetchWorkspaceProjectsPaginated(workspaceGid: string, accessToken: string) {
  const allProjects: AsanaProjectsResponse["data"] = [];
  let offset: string | null = null;

  do {
    const params = new URLSearchParams({
      workspace: workspaceGid,
      archived: "false",
      limit: "100",
      opt_fields: "gid,name,archived",
    });
    if (offset) params.set("offset", offset);

    const page = await asanaFetch<AsanaProjectsResponse>(`/projects?${params.toString()}`, accessToken);
    for (const project of page.data) {
      if (!project.archived) {
        allProjects.push(project);
      }
    }
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return allProjects;
}

/** Tasks assigned to the connected user only (`assignee=me`). Paginated. */
async function fetchProjectTasksAssignedToMePaginated(projectGid: string, accessToken: string) {
  const allTasks: AsanaTasksResponse["data"] = [];
  let offset: string | null = null;

  do {
    const params = new URLSearchParams({
      project: projectGid,
      assignee: "me",
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

/**
 * Sync Asana using **only this user's** OAuth token.
 * Projects: visible in workspaces the user can access.
 * Tasks/subtasks: assigned to this user only (`assignee=me`).
 */
export async function syncUserAsanaData(userId: string, type: "initial" | "periodic" | "manual" = "manual") {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    throw new Error("User not found");
  }

  const connection = await db.query.asanaConnections.findFirst({
    where: eq(asanaConnections.userId, userId),
  });
  if (!connection) {
    throw new Error("Asana not connected for this user");
  }

  const run = await db
    .insert(syncRuns)
    .values({ companyId: user.companyId, userId, type, status: "running" })
    .returning();

  try {
    const accessToken = decrypt(connection.accessTokenEncrypted);
    let projectsSynced = 0;
    let tasksSynced = 0;
    let subtasksSynced = 0;

    const workspaces = await asanaFetch<AsanaWorkspacesResponse>("/workspaces?limit=100&opt_fields=gid,name", accessToken);
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

    for (const workspace of workspaces.data) {
      const workspaceProjects = await fetchWorkspaceProjectsPaginated(workspace.gid, accessToken);

      for (const project of workspaceProjects) {
        projectsSynced += 1;

        const [upsertedProject] = await db
          .insert(projects)
          .values({
            companyId: user.companyId,
            syncedByUserId: userId,
            asanaProjectId: project.gid,
            name: truncateName(project.name),
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [projects.syncedByUserId, projects.asanaProjectId],
            set: {
              name: truncateName(project.name),
              lastSyncedAt: new Date(),
              isActive: true,
            },
          })
          .returning();

        const taskData = await fetchProjectTasksAssignedToMePaginated(project.gid, accessToken);
        const openTasks = taskData.filter((task) => !task.completed);

        const topLevel = openTasks.filter((task) => !task.parent?.gid);
        const withParent = openTasks.filter((task) => Boolean(task.parent?.gid));

        for (const task of topLevel) {
          await db
            .insert(tasks)
            .values({
              projectId: upsertedProject.id,
              asanaTaskId: task.gid,
              name: truncateName(task.name),
              assignedUserId: userId,
              parentTaskId: null,
              isActive: true,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [tasks.projectId, tasks.asanaTaskId],
              set: {
                name: truncateName(task.name),
                assignedUserId: userId,
                parentTaskId: null,
                isActive: true,
                lastSyncedAt: new Date(),
              },
            });
          tasksSynced += 1;
        }

        for (const task of withParent) {
          const parentTask = await db.query.tasks.findFirst({
            where: and(eq(tasks.projectId, upsertedProject.id), eq(tasks.asanaTaskId, task.parent!.gid)),
          });

          await db
            .insert(tasks)
            .values({
              projectId: upsertedProject.id,
              asanaTaskId: task.gid,
              name: truncateName(task.name),
              assignedUserId: userId,
              parentTaskId: parentTask?.id ?? null,
              isActive: true,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [tasks.projectId, tasks.asanaTaskId],
              set: {
                name: truncateName(task.name),
                assignedUserId: userId,
                parentTaskId: parentTask?.id ?? null,
                isActive: true,
                lastSyncedAt: new Date(),
              },
            });
          tasksSynced += 1;
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
      .where(eq(syncRuns.id, run[0].id));
    throw error;
  }
}
