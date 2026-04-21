import { and, eq, inArray } from "drizzle-orm";
import { asanaFetch, refreshAsanaAccessToken } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, companies, projects, syncRuns, tasks, users } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/utils/crypto";

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

function isExpiredTokenError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("Asana API failed with 401");
}

async function fetchWorkspaceProjectsPaginatedWithAuth(
  workspaceGid: string,
  authFetch: <T>(path: string) => Promise<T>,
) {
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

    const page = await authFetch<AsanaProjectsResponse>(`/projects?${params.toString()}`);
    for (const project of page.data) {
      if (!project.archived) {
        allProjects.push(project);
      }
    }
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return allProjects;
}

async function fetchProjectTasksPaginatedWithAuth(
  projectGid: string,
  authFetch: <T>(path: string) => Promise<T>,
) {
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

    const page = await authFetch<AsanaTasksResponse>(`/tasks?${params.toString()}`);
    allTasks.push(...page.data);
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return allTasks;
}

/**
 * Sync Asana using **only this user's** OAuth token.
 * Projects: visible in workspaces the user can access.
 * Tasks/subtasks: in those projects, kept only if assignee is this Asana user (API does not allow project + assignee=me).
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
    let accessToken = decrypt(connection.accessTokenEncrypted);
    let refreshToken = connection.refreshTokenEncrypted
      ? decrypt(connection.refreshTokenEncrypted)
      : null;

    async function refreshAccessToken() {
      if (!refreshToken) {
        throw new Error("Asana token expired and no refresh token is available. Reconnect Asana.");
      }
      const refreshed = await refreshAsanaAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      await db
        .update(asanaConnections)
        .set({
          accessTokenEncrypted: encrypt(refreshed.access_token),
          refreshTokenEncrypted: encrypt(refreshed.refresh_token ?? refreshToken),
          expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
        })
        .where(eq(asanaConnections.userId, userId));
      refreshToken = refreshed.refresh_token ?? refreshToken;
    }

    async function asanaFetchWithRefresh<T>(path: string) {
      try {
        return await asanaFetch<T>(path, accessToken);
      } catch (error) {
        if (!isExpiredTokenError(error)) {
          throw error;
        }
      }

      await refreshAccessToken();
      try {
        return await asanaFetch<T>(path, accessToken);
      } catch (retryError) {
        if (isExpiredTokenError(retryError)) {
          throw new Error(
            "Asana token refresh succeeded but API still returned 401. Please reconnect Asana.",
          );
        }
        throw retryError;
      }
    }

    let meAsanaGid = connection.asanaUserId;
    if (!meAsanaGid || meAsanaGid === "unknown") {
      const me = await asanaFetchWithRefresh<{ data: { gid: string } }>("/users/me?opt_fields=gid");
      meAsanaGid = me.data.gid;
      await db
        .update(asanaConnections)
        .set({ asanaUserId: meAsanaGid })
        .where(eq(asanaConnections.userId, userId));
    }

    let projectsSynced = 0;
    let tasksSynced = 0;
    let subtasksSynced = 0;

    const workspaces = await asanaFetchWithRefresh<AsanaWorkspacesResponse>(
      "/workspaces?limit=100&opt_fields=gid,name",
    );
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

    // Drop stale cache from a previous Asana account / token (same SAASTimeTrack user).
    const staleProjectRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.syncedByUserId, userId));
    const staleProjectIds = staleProjectRows.map((row) => row.id);
    if (staleProjectIds.length > 0) {
      await db.update(tasks).set({ isActive: false }).where(inArray(tasks.projectId, staleProjectIds));
    }
    await db.update(projects).set({ isActive: false }).where(eq(projects.syncedByUserId, userId));

    for (const workspace of workspaces.data) {
      const workspaceProjects = await fetchWorkspaceProjectsPaginatedWithAuth(
        workspace.gid,
        asanaFetchWithRefresh,
      );

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

        const taskData = await fetchProjectTasksPaginatedWithAuth(project.gid, asanaFetchWithRefresh);
        const activeTasks = taskData.filter((task) => !task.completed);
        const assignedTasks = activeTasks.filter((task) => task.assignee?.gid === meAsanaGid);
        const assignedTopLevel = assignedTasks.filter((task) => !task.parent?.gid);
        const assignedSubtasks = assignedTasks.filter((task) => Boolean(task.parent?.gid));

        // Include unassigned parent tasks when they contain assigned subtasks, so UI can select those subtasks.
        const requiredParentIds = new Set(assignedSubtasks.map((task) => task.parent!.gid));
        const requiredParentTasks = activeTasks.filter((task) => requiredParentIds.has(task.gid));
        const seenParentIds = new Set(requiredParentTasks.map((task) => task.gid));
        const missingParentIds = [...requiredParentIds].filter((gid) => !seenParentIds.has(gid));

        const asanaTaskIdToLocalTaskId = new Map<string, string>();

        for (const task of [...assignedTopLevel, ...requiredParentTasks]) {
          const [upsertedTask] = await db
            .insert(tasks)
            .values({
              projectId: upsertedProject.id,
              asanaTaskId: task.gid,
              name: truncateName(task.name),
              assignedUserId: task.assignee?.gid === meAsanaGid ? userId : null,
              parentTaskId: null,
              isActive: true,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [tasks.projectId, tasks.asanaTaskId],
              set: {
                name: truncateName(task.name),
                assignedUserId: task.assignee?.gid === meAsanaGid ? userId : null,
                parentTaskId: null,
                isActive: true,
                lastSyncedAt: new Date(),
              },
            })
            .returning();
          asanaTaskIdToLocalTaskId.set(task.gid, upsertedTask.id);
          tasksSynced += 1;
        }

        for (const parentAsanaGid of missingParentIds) {
          const parentTask = await db.query.tasks.findFirst({
            where: and(eq(tasks.projectId, upsertedProject.id), eq(tasks.asanaTaskId, parentAsanaGid)),
          });
          if (parentTask) {
            asanaTaskIdToLocalTaskId.set(parentAsanaGid, parentTask.id);
          }
        }

        for (const task of assignedSubtasks) {
          const parentLocalId = asanaTaskIdToLocalTaskId.get(task.parent!.gid) ?? null;
          await db
            .insert(tasks)
            .values({
              projectId: upsertedProject.id,
              asanaTaskId: task.gid,
              name: truncateName(task.name),
              assignedUserId: userId,
              parentTaskId: parentLocalId,
              isActive: true,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [tasks.projectId, tasks.asanaTaskId],
              set: {
                name: truncateName(task.name),
                assignedUserId: userId,
                parentTaskId: parentLocalId,
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
