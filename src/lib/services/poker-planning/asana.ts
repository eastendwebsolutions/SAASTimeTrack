import { eq } from "drizzle-orm";
import { asanaRequest, refreshAsanaAccessToken } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, companySettings, users } from "@/lib/db/schema";
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

async function getAsanaAccessTokenForUser(userId: string) {
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
  const actor = await db.query.users.findFirst({ where: eq(users.id, args.actorUserId) });
  if (!actor || actor.companyId !== args.companyId) {
    throw new Error("Forbidden");
  }

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
}

export async function fetchSprintFieldOptions(args: { userId: string; projectGid: string; sprintFieldGid: string }) {
  const { request } = await getAsanaAccessTokenForUser(args.userId);
  const task = await request<{
    data: { custom_fields?: Array<{ gid: string; enum_options?: Array<{ gid: string; name: string }> }> };
  }>(`/projects/${args.projectGid}/tasks?limit=1&opt_fields=custom_fields.gid,custom_fields.enum_options.gid,custom_fields.enum_options.name`);
  const field = task.data.custom_fields?.find((item) => item.gid === args.sprintFieldGid);
  return field?.enum_options ?? [];
}
