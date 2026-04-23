import { and, eq, inArray } from "drizzle-orm";
import { asanaFetch, refreshAsanaAccessToken } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, companies, jiraConnections, mondayConnections, projects, syncRuns, tasks, users } from "@/lib/db/schema";
import { jiraRequest, refreshJiraAccessToken } from "@/lib/jira/client";
import { fetchMondayMe, mondayGraphqlRequest, refreshMondayAccessToken } from "@/lib/monday/client";
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
    memberships?: Array<{ project?: { gid: string } | null }> | null;
  }>;
  next_page?: { offset?: string | null } | null;
};

type AsanaSubtasksResponse = {
  data: Array<{
    gid: string;
    name: string;
    completed?: boolean;
    parent?: { gid: string } | null;
    assignee?: { gid: string } | null;
  }>;
  next_page?: { offset?: string | null } | null;
};

type SyncDiagnostics = {
  workspaceAssignedFetched: number;
  assignedSubtasksCandidate: number;
  assignedSubtasksResolvedToProject: number;
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
      limit: "100",
      completed_since: "now",
      opt_fields: "gid,name,completed,parent.gid,assignee.gid",
    });

    if (offset) {
      params.set("offset", offset);
    }

    const page = await authFetch<AsanaTasksResponse>(`/projects/${projectGid}/tasks?${params.toString()}`);
    allTasks.push(...page.data);
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return allTasks;
}

async function fetchTaskSubtasksPaginatedWithAuth(
  taskGid: string,
  authFetch: <T>(path: string) => Promise<T>,
) {
  const allSubtasks: AsanaSubtasksResponse["data"] = [];
  let offset: string | null = null;

  do {
    const params = new URLSearchParams({
      limit: "100",
      opt_fields: "gid,name,completed,parent.gid,assignee.gid",
    });
    if (offset) {
      params.set("offset", offset);
    }

    const page = await authFetch<AsanaSubtasksResponse>(`/tasks/${taskGid}/subtasks?${params.toString()}`);
    allSubtasks.push(...page.data);
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return allSubtasks;
}

async function fetchWorkspaceAssignedTasksPaginatedWithAuth(
  workspaceGid: string,
  authFetch: <T>(path: string) => Promise<T>,
) {
  const allTasks: AsanaTasksResponse["data"] = [];
  let offset: string | null = null;

  do {
    const params = new URLSearchParams({
      workspace: workspaceGid,
      assignee: "me",
      limit: "100",
      completed_since: "now",
      opt_fields: "gid,name,completed,parent.gid,assignee.gid,memberships.project.gid",
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

async function fetchTaskByGidWithAuth(taskGid: string, authFetch: <T>(path: string) => Promise<T>) {
  const response = await authFetch<{
    data: {
      gid: string;
      name: string;
      completed?: boolean;
      parent?: { gid: string } | null;
      assignee?: { gid: string } | null;
      memberships?: Array<{ project?: { gid: string } | null }> | null;
    };
  }>(`/tasks/${taskGid}?opt_fields=gid,name,completed,parent.gid,assignee.gid,memberships.project.gid`);
  return response.data;
}

async function fetchProjectByGidWithAuth(projectGid: string, authFetch: <T>(path: string) => Promise<T>) {
  const response = await authFetch<{
    data: {
      gid: string;
      name: string;
      archived?: boolean;
    };
  }>(`/projects/${projectGid}?opt_fields=gid,name,archived`);
  return response.data;
}

/**
 * Sync Asana using **only this user's** OAuth token.
 * Projects: visible in workspaces the user can access.
 * Tasks/subtasks: in those projects, kept only if assignee is this Asana user (API does not allow project + assignee=me).
 */
export async function syncUserAsanaData(userId: string, type: "initial" | "periodic" | "manual" = "manual") {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, companyId: true } });
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

    const me = await asanaFetchWithRefresh<{ data: { gid: string } }>("/users/me?opt_fields=gid");
    const meAsanaGid = me.data.gid;
    if (connection.asanaUserId !== meAsanaGid) {
      await db
        .update(asanaConnections)
        .set({ asanaUserId: meAsanaGid })
        .where(eq(asanaConnections.userId, userId));
    }

    let projectsSynced = 0;
    let tasksSynced = 0;
    let subtasksSynced = 0;
    const diagnostics: SyncDiagnostics = {
      workspaceAssignedFetched: 0,
      assignedSubtasksCandidate: 0,
      assignedSubtasksResolvedToProject: 0,
    };

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
      .where(and(eq(projects.syncedByUserId, userId), eq(projects.provider, "asana")));
    const staleProjectIds = staleProjectRows.map((row) => row.id);
    if (staleProjectIds.length > 0) {
      await db.update(tasks).set({ isActive: false }).where(inArray(tasks.projectId, staleProjectIds));
    }
    await db
      .update(projects)
      .set({ isActive: false })
      .where(and(eq(projects.syncedByUserId, userId), eq(projects.provider, "asana")));

    for (const workspace of workspaces.data) {
      const workspaceProjects = await fetchWorkspaceProjectsPaginatedWithAuth(
        workspace.gid,
        asanaFetchWithRefresh,
      );
      const workspaceAssignedTasks = await fetchWorkspaceAssignedTasksPaginatedWithAuth(
        workspace.gid,
        asanaFetchWithRefresh,
      );
      diagnostics.workspaceAssignedFetched += workspaceAssignedTasks.length;
      const combinedAssignedTasks = workspaceAssignedTasks;

      const parentProjectCache = new Map<string, string | null>();
      const projectByGid = new Map<string, { gid: string; name: string; archived?: boolean }>();
      for (const project of workspaceProjects) {
        projectByGid.set(project.gid, project);
      }
      const workspaceAssignedTopLevelByProject = new Map<string, AsanaTasksResponse["data"]>();
      const workspaceAssignedSubtasksByProject = new Map<string, AsanaTasksResponse["data"]>();

      for (const task of combinedAssignedTasks) {
        if (task.completed) continue;
        if (task.parent?.gid) {
          diagnostics.assignedSubtasksCandidate += 1;
        }
        let projectGid = task.memberships?.[0]?.project?.gid ?? null;
        if (!projectGid) {
          if (task.parent?.gid) {
            const parentGid = task.parent.gid;
            if (parentProjectCache.has(parentGid)) {
              projectGid = parentProjectCache.get(parentGid) ?? null;
            } else {
              try {
                const parentTask = await fetchTaskByGidWithAuth(parentGid, asanaFetchWithRefresh);
                projectGid = parentTask.memberships?.[0]?.project?.gid ?? null;
                parentProjectCache.set(parentGid, projectGid);
              } catch {
                parentProjectCache.set(parentGid, null);
              }
            }
          }
        }
        if (!projectGid) continue;

        if (!projectByGid.has(projectGid)) {
          try {
            const project = await fetchProjectByGidWithAuth(projectGid, asanaFetchWithRefresh);
            if (!project.archived) {
              projectByGid.set(project.gid, project);
            }
          } catch {
            // Ignore inaccessible project.
          }
        }
        if (!projectByGid.has(projectGid)) continue;
        if (task.parent?.gid) {
          diagnostics.assignedSubtasksResolvedToProject += 1;
        }

        if (task.parent?.gid) {
          const current = workspaceAssignedSubtasksByProject.get(projectGid) ?? [];
          current.push(task);
          workspaceAssignedSubtasksByProject.set(projectGid, current);
        } else {
          const current = workspaceAssignedTopLevelByProject.get(projectGid) ?? [];
          current.push(task);
          workspaceAssignedTopLevelByProject.set(projectGid, current);
        }
      }

      for (const project of projectByGid.values()) {
        projectsSynced += 1;

        const [upsertedProject] = await db
          .insert(projects)
          .values({
            companyId: user.companyId,
            syncedByUserId: userId,
            provider: "asana",
            asanaProjectId: project.gid,
            name: truncateName(project.name),
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [projects.syncedByUserId, projects.asanaProjectId],
            set: {
              provider: "asana",
              name: truncateName(project.name),
              lastSyncedAt: new Date(),
              isActive: true,
            },
          })
          .returning();

        const taskData = await fetchProjectTasksPaginatedWithAuth(project.gid, asanaFetchWithRefresh);
        const activeTasks = taskData.filter((task) => !task.completed);
        const topLevelTasks = activeTasks.filter((task) => !task.parent?.gid);
        const inlineAssignedSubtasks = activeTasks.filter(
          (task) => Boolean(task.parent?.gid) && task.assignee?.gid === meAsanaGid,
        );

        const fetchedAssignedSubtasks: AsanaTasksResponse["data"] = [];
        for (const parentTask of topLevelTasks) {
          const subtasks = await fetchTaskSubtasksPaginatedWithAuth(parentTask.gid, asanaFetchWithRefresh);
          for (const subtask of subtasks) {
            if (!subtask.completed && subtask.assignee?.gid === meAsanaGid) {
              fetchedAssignedSubtasks.push(subtask);
            }
          }
        }

        const workspaceAssignedSubtasks = workspaceAssignedSubtasksByProject.get(project.gid) ?? [];
        const workspaceAssignedTopLevel = workspaceAssignedTopLevelByProject.get(project.gid) ?? [];
        const assignedSubtasksByGid = new Map<string, AsanaTasksResponse["data"][number]>();
        for (const task of [...inlineAssignedSubtasks, ...fetchedAssignedSubtasks, ...workspaceAssignedSubtasks]) {
          assignedSubtasksByGid.set(task.gid, task);
        }
        const assignedSubtasks = [...assignedSubtasksByGid.values()].filter((task) => Boolean(task.parent?.gid));

        // Include unassigned parent tasks when they contain assigned subtasks, so UI can select those subtasks.
        const requiredParentIds = new Set(assignedSubtasks.map((task) => task.parent!.gid));
        const requiredParentTasks = activeTasks.filter((task) => requiredParentIds.has(task.gid));
        const seenParentIds = new Set(requiredParentTasks.map((task) => task.gid));
        const missingParentIds = [...requiredParentIds].filter((gid) => !seenParentIds.has(gid));

        const asanaTaskIdToLocalTaskId = new Map<string, string>();

        const topLevelByGid = new Map<string, AsanaTasksResponse["data"][number]>();
        for (const task of topLevelTasks) {
          topLevelByGid.set(task.gid, task);
        }
        for (const task of workspaceAssignedTopLevel) {
          topLevelByGid.set(task.gid, task);
        }
        for (const task of requiredParentTasks) {
          topLevelByGid.set(task.gid, task);
        }
        for (const parentAsanaGid of missingParentIds) {
          if (!topLevelByGid.has(parentAsanaGid)) {
            try {
              const parent = await fetchTaskByGidWithAuth(parentAsanaGid, asanaFetchWithRefresh);
              if (!parent.completed) {
                topLevelByGid.set(parent.gid, parent);
              }
            } catch {
              // Parent may be unavailable; fallback lookup below can still attach if previously synced.
            }
          }
        }

        for (const task of topLevelByGid.values()) {
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
    return { projectsSynced, tasksSynced, subtasksSynced, diagnostics };
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

type JiraProjectsResponse = {
  values: Array<{ id: string; key: string; name: string }>;
};

type JiraSearchResponse = {
  startAt: number;
  maxResults: number;
  total: number;
  issues: Array<{
    id: string;
    key: string;
    fields: {
      summary?: string;
      parent?: {
        id: string;
        key: string;
        fields?: { summary?: string };
      };
    };
  }>;
};

function isJiraUnauthorized(error: unknown) {
  return error instanceof Error && error.message.includes("Jira API failed with 401");
}

export async function syncUserJiraData(userId: string, type: "initial" | "periodic" | "manual" = "manual") {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, companyId: true } });
  if (!user) {
    throw new Error("User not found");
  }

  const connection = await db.query.jiraConnections.findFirst({
    where: eq(jiraConnections.userId, userId),
  });
  if (!connection) {
    throw new Error("Jira not connected for this user");
  }
  const jiraConnection = connection;

  const runType = type === "initial" ? "jira_initial" : type === "periodic" ? "jira_periodic" : "jira_manual";
  const run = await db
    .insert(syncRuns)
    .values({ companyId: user.companyId, userId, type: runType, status: "running" })
    .returning();

  try {
    let accessToken = decrypt(jiraConnection.accessTokenEncrypted);
    let refreshToken = jiraConnection.refreshTokenEncrypted ? decrypt(jiraConnection.refreshTokenEncrypted) : null;

    async function refreshAccessToken() {
      if (!refreshToken) {
        throw new Error("Jira token expired and no refresh token is available. Reconnect Jira.");
      }
      const refreshed = await refreshJiraAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      refreshToken = refreshed.refresh_token ?? refreshToken;
      await db
        .update(jiraConnections)
        .set({
          accessTokenEncrypted: encrypt(accessToken),
          refreshTokenEncrypted: refreshToken ? encrypt(refreshToken) : null,
          expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
          scopes: refreshed.scope ?? jiraConnection.scopes,
        })
        .where(eq(jiraConnections.userId, userId));
    }

    async function jiraFetchWithRefresh<T>(path: string) {
      try {
        return await jiraRequest<T>(jiraConnection.jiraCloudId, path, accessToken);
      } catch (error) {
        if (!isJiraUnauthorized(error)) throw error;
      }

      await refreshAccessToken();
      return jiraRequest<T>(jiraConnection.jiraCloudId, path, accessToken);
    }

    const staleJiraProjects = await db.query.projects.findMany({
      where: and(eq(projects.syncedByUserId, userId), eq(projects.provider, "jira")),
      columns: { id: true, asanaProjectId: true },
    });
    const staleJiraProjectIds = staleJiraProjects.map((project) => project.id);
    if (staleJiraProjectIds.length > 0) {
      await db.update(tasks).set({ isActive: false }).where(inArray(tasks.projectId, staleJiraProjectIds));
      await db.update(projects).set({ isActive: false }).where(inArray(projects.id, staleJiraProjectIds));
    }

    const projectsPage = await jiraFetchWithRefresh<JiraProjectsResponse>("/project/search?maxResults=100");
    let projectsSynced = 0;
    let tasksSynced = 0;
    let subtasksSynced = 0;

    for (const jiraProject of projectsPage.values) {
      projectsSynced += 1;
      const externalProjectId = `jira:${jiraProject.id}`;
      const [upsertedProject] = await db
        .insert(projects)
        .values({
          companyId: user.companyId,
          syncedByUserId: userId,
          provider: "jira",
          asanaProjectId: externalProjectId,
          name: truncateName(jiraProject.name),
          isActive: true,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [projects.syncedByUserId, projects.asanaProjectId],
          set: {
            provider: "jira",
            name: truncateName(jiraProject.name),
            isActive: true,
            lastSyncedAt: new Date(),
          },
        })
        .returning();

      const issueMap = new Map<string, { name: string; parentId: string | null }>();
      let startAt = 0;
      const maxResults = 100;
      let total = 0;
      do {
        const jql = encodeURIComponent(
          `project = ${jiraProject.key} AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`,
        );
        const page = await jiraFetchWithRefresh<JiraSearchResponse>(
          `/search?jql=${jql}&fields=summary,parent&startAt=${startAt}&maxResults=${maxResults}`,
        );
        total = page.total;
        for (const issue of page.issues) {
          const issueName = truncateName(issue.fields.summary || issue.key);
          if (issue.fields.parent) {
            const parentId = issue.fields.parent.id;
            const parentName = truncateName(issue.fields.parent.fields?.summary || issue.fields.parent.key);
            issueMap.set(parentId, { name: parentName, parentId: null });
            issueMap.set(issue.id, { name: issueName, parentId });
          } else {
            issueMap.set(issue.id, { name: issueName, parentId: null });
          }
        }
        startAt += page.maxResults;
      } while (startAt < total);

      const externalToLocalId = new Map<string, string>();
      for (const [externalIssueId, issue] of issueMap.entries()) {
        if (issue.parentId) continue;
        const externalTaskId = `jira:${externalIssueId}`;
        const [upsertedTask] = await db
          .insert(tasks)
          .values({
            projectId: upsertedProject.id,
            asanaTaskId: externalTaskId,
            name: issue.name,
            assignedUserId: userId,
            parentTaskId: null,
            isActive: true,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [tasks.projectId, tasks.asanaTaskId],
            set: {
              name: issue.name,
              assignedUserId: userId,
              parentTaskId: null,
              isActive: true,
              lastSyncedAt: new Date(),
            },
          })
          .returning();
        externalToLocalId.set(externalIssueId, upsertedTask.id);
        tasksSynced += 1;
      }

      for (const [externalIssueId, issue] of issueMap.entries()) {
        if (!issue.parentId) continue;
        const parentLocalId = externalToLocalId.get(issue.parentId) ?? null;
        const externalTaskId = `jira:${externalIssueId}`;
        await db
          .insert(tasks)
          .values({
            projectId: upsertedProject.id,
            asanaTaskId: externalTaskId,
            name: issue.name,
            assignedUserId: userId,
            parentTaskId: parentLocalId,
            isActive: true,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [tasks.projectId, tasks.asanaTaskId],
            set: {
              name: issue.name,
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

function isMondayUnauthorized(error: unknown) {
  return error instanceof Error && error.message.includes("Monday API failed with 401");
}

type MondayBoardsResponse = {
  boards: Array<{
    id: string;
    name: string;
    state?: string;
  }>;
};

type MondayItemsByBoardResponse = {
  boards: Array<{
    id: string;
    items_page: {
      items: Array<{
        id: string;
        name: string;
      }>;
    };
  }>;
};

export async function syncUserMondayData(userId: string, type: "initial" | "periodic" | "manual" = "manual") {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, companyId: true } });
  if (!user) {
    throw new Error("User not found");
  }

  const connection = await db.query.mondayConnections.findFirst({
    where: eq(mondayConnections.userId, userId),
  });
  if (!connection) {
    throw new Error("Monday.com not connected for this user");
  }
  const mondayConnection = connection;

  const runType = type === "initial" ? "monday_initial" : type === "periodic" ? "monday_periodic" : "monday_manual";
  const run = await db
    .insert(syncRuns)
    .values({ companyId: user.companyId, userId, type: runType, status: "running" })
    .returning();

  try {
    let accessToken = decrypt(mondayConnection.accessTokenEncrypted);
    let refreshToken = mondayConnection.refreshTokenEncrypted ? decrypt(mondayConnection.refreshTokenEncrypted) : null;

    async function refreshAccessToken() {
      if (!refreshToken) {
        throw new Error("Monday token expired and no refresh token is available. Reconnect Monday.");
      }
      const refreshed = await refreshMondayAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      refreshToken = refreshed.refresh_token ?? refreshToken;
      await db
        .update(mondayConnections)
        .set({
          accessTokenEncrypted: encrypt(accessToken),
          refreshTokenEncrypted: refreshToken ? encrypt(refreshToken) : null,
          expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
          scopes: refreshed.scope ?? mondayConnection.scopes,
        })
        .where(eq(mondayConnections.userId, userId));
    }

    async function mondayQuery<T>(query: string, variables: Record<string, unknown>) {
      try {
        return await mondayGraphqlRequest<T>(query, variables, accessToken);
      } catch (error) {
        if (!isMondayUnauthorized(error)) throw error;
      }
      await refreshAccessToken();
      return mondayGraphqlRequest<T>(query, variables, accessToken);
    }

    await fetchMondayMe(accessToken);

    const staleMondayProjects = await db.query.projects.findMany({
      where: and(eq(projects.syncedByUserId, userId), eq(projects.provider, "monday")),
      columns: { id: true },
    });
    const staleMondayProjectIds = staleMondayProjects.map((project) => project.id);
    if (staleMondayProjectIds.length > 0) {
      await db.update(tasks).set({ isActive: false }).where(inArray(tasks.projectId, staleMondayProjectIds));
      await db.update(projects).set({ isActive: false }).where(inArray(projects.id, staleMondayProjectIds));
    }

    const boardsResult = await mondayQuery<MondayBoardsResponse>(
      `
        query MondayBoards {
          boards(limit: 100) {
            id
            name
            state
          }
        }
      `,
      {},
    );

    let projectsSynced = 0;
    let tasksSynced = 0;
    const subtasksSynced = 0;

    for (const board of boardsResult.boards) {
      if (board.state && board.state.toLowerCase() === "deleted") continue;

      projectsSynced += 1;
      const externalProjectId = `monday:${board.id}`;
      const [upsertedProject] = await db
        .insert(projects)
        .values({
          companyId: user.companyId,
          syncedByUserId: userId,
          provider: "monday",
          asanaProjectId: externalProjectId,
          name: truncateName(board.name),
          isActive: true,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [projects.syncedByUserId, projects.asanaProjectId],
          set: {
            provider: "monday",
            name: truncateName(board.name),
            isActive: true,
            lastSyncedAt: new Date(),
          },
        })
        .returning();

      const boardItems = await mondayQuery<MondayItemsByBoardResponse>(
        `
          query MondayBoardItems($boardIds: [ID!]) {
            boards(ids: $boardIds) {
              id
              items_page(limit: 100) {
                items {
                  id
                  name
                }
              }
            }
          }
        `,
        { boardIds: [board.id] },
      );

      const items = boardItems.boards[0]?.items_page.items ?? [];
      for (const item of items) {
        const externalTaskId = `monday:${item.id}`;
        await db
          .insert(tasks)
          .values({
            projectId: upsertedProject.id,
            asanaTaskId: externalTaskId,
            name: truncateName(item.name),
            assignedUserId: userId,
            parentTaskId: null,
            isActive: true,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [tasks.projectId, tasks.asanaTaskId],
            set: {
              name: truncateName(item.name),
              assignedUserId: userId,
              parentTaskId: null,
              isActive: true,
              lastSyncedAt: new Date(),
            },
          });
        tasksSynced += 1;
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

export async function syncUserProviderData(
  userId: string,
  provider: "asana" | "jira" | "monday",
  type: "initial" | "periodic" | "manual" = "manual",
) {
  if (provider === "asana") return syncUserAsanaData(userId, type);
  if (provider === "jira") return syncUserJiraData(userId, type);
  return syncUserMondayData(userId, type);
}
