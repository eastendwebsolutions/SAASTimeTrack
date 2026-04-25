import { eq } from "drizzle-orm";
import { asanaRequest, refreshAsanaAccessToken } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, companySettings, users } from "@/lib/db/schema";
import { logAuditChanges } from "@/lib/services/audit-log";
import { decrypt, encrypt } from "@/lib/utils/crypto";

type AsanaTask = {
  gid: string;
  name: string;
  parent?: { gid: string } | null;
  custom_fields?: Array<{
    gid: string;
    name?: string;
    enum_value?: { gid: string; name: string } | null;
  }>;
};

type AsanaCustomField = {
  gid: string;
  name?: string;
  resource_subtype?: string;
  enum_options?: Array<{ gid: string; name: string }>;
};

export async function getAsanaAccessTokenForUser(userId: string) {
  const connection = await db.query.asanaConnections.findFirst({
    where: eq(asanaConnections.userId, userId),
  });
  if (!connection) {
    throw new Error("Asana is not connected for this user");
  }

  let accessToken = decrypt(connection.accessTokenEncrypted);
  let refreshToken = connection.refreshTokenEncrypted ? decrypt(connection.refreshTokenEncrypted) : null;

  async function request<T>(path: string, init: { method?: "GET" | "PUT" | "POST"; body?: unknown } = {}) {
    try {
      return await asanaRequest<T>(path, accessToken, init);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Asana API failed with 401")) {
        throw error;
      }
    }
    if (!refreshToken) {
      throw new Error("Asana token expired and no refresh token is available");
    }
    const refreshed = await refreshAsanaAccessToken(refreshToken);
    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token ?? refreshToken;
    await db
      .update(asanaConnections)
      .set({
        accessTokenEncrypted: encrypt(accessToken),
        refreshTokenEncrypted: encrypt(refreshToken),
        expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
      })
      .where(eq(asanaConnections.userId, userId));
    return asanaRequest<T>(path, accessToken, init);
  }

  return { request };
}

export async function fetchSprintStoriesForSession(args: {
  userId: string;
  projectGid: string;
  sprintFieldGid: string;
  sprintValueGid: string;
}) {
  const { request } = await getAsanaAccessTokenForUser(args.userId);
  const params = new URLSearchParams({
    limit: "100",
    completed_since: "now",
    opt_fields: "gid,name,parent.gid,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name",
  });
  const response = await request<{
    data: AsanaTask[];
    next_page?: { offset?: string | null } | null;
  }>(`/projects/${args.projectGid}/tasks?${params.toString()}`);

  const matches = response.data.filter((task) =>
    task.custom_fields?.some(
      (field) => field.gid === args.sprintFieldGid && field.enum_value?.gid === args.sprintValueGid,
    ),
  );

  return matches.map((task, index) => ({
    asanaTaskGid: task.gid,
    asanaParentTaskGid: task.parent?.gid ?? null,
    name: task.name,
    isSubtask: Boolean(task.parent?.gid),
    ordering: index,
  }));
}

export async function writeStoryPointsToAsana(args: {
  userId: string;
  asanaTaskGid: string;
  storyPointsFieldGid: string;
  estimate: number;
}) {
  const { request } = await getAsanaAccessTokenForUser(args.userId);
  await request(`/tasks/${args.asanaTaskGid}`, {
    method: "PUT",
    body: {
      data: {
        custom_fields: {
          [args.storyPointsFieldGid]: args.estimate,
        },
      },
    },
  });
}

export async function getCompanyPokerAsanaMapping(companyId: string) {
  const settings = await db.query.companySettings.findFirst({
    where: eq(companySettings.companyId, companyId),
  });
  return {
    sprintFieldGid: settings?.asanaSprintFieldGid ?? null,
    sprintFieldName: settings?.asanaSprintFieldName ?? null,
    storyPointsFieldGid: settings?.asanaStoryPointsFieldGid ?? null,
    storyPointsFieldName: settings?.asanaStoryPointsFieldName ?? null,
  };
}

export async function updateCompanyPokerAsanaMapping(args: {
  companyId: string;
  actorUserId: string;
  sprintFieldGid: string;
  sprintFieldName: string;
  storyPointsFieldGid: string;
  storyPointsFieldName: string;
}) {
  const actor = await db.query.users.findFirst({
    where: eq(users.id, args.actorUserId),
    columns: {
      id: true,
      companyId: true,
    },
  });
  if (!actor || actor.companyId !== args.companyId) {
    throw new Error("Forbidden");
  }

  const previous = await db.query.companySettings.findFirst({
    where: eq(companySettings.companyId, args.companyId),
  });

  await db
    .insert(companySettings)
    .values({
      companyId: args.companyId,
      asanaSprintFieldGid: args.sprintFieldGid,
      asanaSprintFieldName: args.sprintFieldName,
      asanaStoryPointsFieldGid: args.storyPointsFieldGid,
      asanaStoryPointsFieldName: args.storyPointsFieldName,
    })
    .onConflictDoUpdate({
      target: [companySettings.companyId],
      set: {
        asanaSprintFieldGid: args.sprintFieldGid,
        asanaSprintFieldName: args.sprintFieldName,
        asanaStoryPointsFieldGid: args.storyPointsFieldGid,
        asanaStoryPointsFieldName: args.storyPointsFieldName,
      },
    });

  await logAuditChanges([
    {
      companyId: args.companyId,
      actorUserId: args.actorUserId,
      pageKey: "poker_planning_settings",
      entityType: "company_settings",
      entityId: args.companyId,
      fieldName: "Sprint custom field GID",
      beforeValue: previous?.asanaSprintFieldGid ?? null,
      afterValue: args.sprintFieldGid,
    },
    {
      companyId: args.companyId,
      actorUserId: args.actorUserId,
      pageKey: "poker_planning_settings",
      entityType: "company_settings",
      entityId: args.companyId,
      fieldName: "Sprint custom field name",
      beforeValue: previous?.asanaSprintFieldName ?? null,
      afterValue: args.sprintFieldName,
    },
    {
      companyId: args.companyId,
      actorUserId: args.actorUserId,
      pageKey: "poker_planning_settings",
      entityType: "company_settings",
      entityId: args.companyId,
      fieldName: "Story Points custom field GID",
      beforeValue: previous?.asanaStoryPointsFieldGid ?? null,
      afterValue: args.storyPointsFieldGid,
    },
    {
      companyId: args.companyId,
      actorUserId: args.actorUserId,
      pageKey: "poker_planning_settings",
      entityType: "company_settings",
      entityId: args.companyId,
      fieldName: "Story Points custom field name",
      beforeValue: previous?.asanaStoryPointsFieldName ?? null,
      afterValue: args.storyPointsFieldName,
    },
  ]);
}

export async function fetchSprintFieldOptions(args: { userId: string; projectGid: string; sprintFieldGid: string }) {
  const { request } = await getAsanaAccessTokenForUser(args.userId);
  const task = await request<{
    data: { custom_fields?: Array<{ gid: string; enum_options?: Array<{ gid: string; name: string }> }> };
  }>(`/projects/${args.projectGid}/tasks?limit=1&opt_fields=custom_fields.gid,custom_fields.enum_options.gid,custom_fields.enum_options.name`);
  const field = task.data.custom_fields?.find((item) => item.gid === args.sprintFieldGid);
  return field?.enum_options ?? [];
}

function scoreSprintField(field: AsanaCustomField) {
  const name = (field.name ?? "").toLowerCase();
  let score = 0;
  if (field.resource_subtype === "enum") score += 3;
  if (name.includes("sprint")) score += 5;
  if (name.includes("iteration")) score += 4;
  if (name.includes("cycle")) score += 2;
  return score;
}

function scoreStoryPointsField(field: AsanaCustomField) {
  const name = (field.name ?? "").toLowerCase();
  let score = 0;
  if (field.resource_subtype === "number") score += 3;
  if (name.includes("story points")) score += 6;
  if (name === "points" || name === "sp") score += 3;
  if (name.includes("estimate")) score += 2;
  return score;
}

export async function detectPokerAsanaFields(args: { userId: string; projectGid: string }) {
  const { request } = await getAsanaAccessTokenForUser(args.userId);
  const projectResponse = await request<{ data: { workspace?: { gid: string } | null; custom_fields?: AsanaCustomField[] } }>(
    `/projects/${args.projectGid}?opt_fields=workspace.gid,custom_fields.gid,custom_fields.name,custom_fields.resource_subtype,custom_fields.enum_options.gid,custom_fields.enum_options.name`,
  );
  const fields = projectResponse.data.custom_fields ?? [];

  const sprintCandidates = fields
    .map((field) => ({ field, score: scoreSprintField(field) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const storyPointCandidates = fields
    .map((field) => ({ field, score: scoreStoryPointsField(field) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const sprint = sprintCandidates[0]?.field
    ? {
        gid: sprintCandidates[0].field.gid,
        name: sprintCandidates[0].field.name ?? "Sprint",
        enumOptions: sprintCandidates[0].field.enum_options ?? [],
        ambiguous:
          sprintCandidates.length > 1 && sprintCandidates[0].score === sprintCandidates[1].score,
      }
    : null;

  const storyPoints = storyPointCandidates[0]?.field
    ? {
        gid: storyPointCandidates[0].field.gid,
        name: storyPointCandidates[0].field.name ?? "Story Points",
        ambiguous:
          storyPointCandidates.length > 1 && storyPointCandidates[0].score === storyPointCandidates[1].score,
      }
    : null;

  return {
    workspaceGid: projectResponse.data.workspace?.gid ?? null,
    sprint,
    storyPoints,
    needsManualMapping: !sprint || !storyPoints || sprint.ambiguous || storyPoints.ambiguous,
  };
}
