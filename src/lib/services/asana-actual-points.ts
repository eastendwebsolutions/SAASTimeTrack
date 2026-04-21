import { and, eq, isNull, sum } from "drizzle-orm";
import { asanaRequest, refreshAsanaAccessToken } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, projects, tasks, timeEntries } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/utils/crypto";

function mapHoursToActualPoints(hours: number) {
  if (hours < 0.5) return 1;
  if (hours < 1) return 2;
  if (hours < 2) return 3;
  if (hours < 4) return 5;
  if (hours < 8) return 8;
  if (hours < 16) return 13;
  if (hours < 32) return 21;
  if (hours < 64) return 34;
  if (hours < 128) return 55;
  if (hours < 256) return 89;
  if (hours < 512) return 144;
  return 144;
}

function isAsanaUnauthorized(error: unknown) {
  return error instanceof Error && error.message.includes("Asana API failed with 401");
}

type EntryTarget = {
  companyId: string;
  projectId: string;
  taskId: string;
  subtaskId: string | null;
};

async function getTotalHoursForTarget(target: EntryTarget) {
  const [result] = await db
    .select({ totalMinutes: sum(timeEntries.durationMinutes) })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.companyId, target.companyId),
        eq(timeEntries.projectId, target.projectId),
        eq(timeEntries.taskId, target.taskId),
        target.subtaskId ? eq(timeEntries.subtaskId, target.subtaskId) : isNull(timeEntries.subtaskId),
      ),
    );

  const totalMinutesRaw = Number(result?.totalMinutes ?? 0);
  const totalMinutes = Number.isFinite(totalMinutesRaw) ? totalMinutesRaw : 0;
  return totalMinutes / 60;
}

async function updateAsanaActualPoints(target: EntryTarget) {
  const targetTaskId = target.subtaskId ?? target.taskId;

  const taskRow = await db.query.tasks.findFirst({
    where: eq(tasks.id, targetTaskId),
    columns: { id: true, asanaTaskId: true, projectId: true },
  });
  if (!taskRow || taskRow.projectId !== target.projectId) return;

  const projectRow = await db.query.projects.findFirst({
    where: eq(projects.id, target.projectId),
    columns: { syncedByUserId: true },
  });
  if (!projectRow) return;

  const connection = await db.query.asanaConnections.findFirst({
    where: eq(asanaConnections.userId, projectRow.syncedByUserId),
  });
  if (!connection) return;

  let accessToken = decrypt(connection.accessTokenEncrypted);
  let refreshToken = connection.refreshTokenEncrypted
    ? decrypt(connection.refreshTokenEncrypted)
    : null;

  async function refreshAccessToken() {
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
      .where(eq(asanaConnections.userId, projectRow.syncedByUserId));
  }

  async function asanaRequestWithRefresh<T>(
    path: string,
    init: { method?: "GET" | "PUT" | "POST"; body?: unknown } = {},
  ) {
    try {
      return await asanaRequest<T>(path, accessToken, init);
    } catch (error) {
      if (!isAsanaUnauthorized(error)) throw error;
    }

    await refreshAccessToken();
    return asanaRequest<T>(path, accessToken, init);
  }

  const taskDetails = await asanaRequestWithRefresh<{
    data: {
      custom_fields?: Array<{
        gid: string;
        name?: string;
        resource_subtype?: string;
      }>;
    };
  }>(`/tasks/${taskRow.asanaTaskId}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.resource_subtype`);

  const actualPointsField = taskDetails.data.custom_fields?.find(
    (field) =>
      field.name?.trim().toLowerCase() === "actual points" && field.resource_subtype === "number",
  );
  if (!actualPointsField) return;

  const totalHours = await getTotalHoursForTarget(target);
  const mappedPoints = mapHoursToActualPoints(totalHours);

  await asanaRequestWithRefresh<{ data: { gid: string } }>(`/tasks/${taskRow.asanaTaskId}`, {
    method: "PUT",
    body: {
      data: {
        custom_fields: {
          [actualPointsField.gid]: mappedPoints,
        },
      },
    },
  });
}

export async function syncActualPointsForEntryTarget(target: EntryTarget) {
  try {
    await updateAsanaActualPoints(target);
  } catch (error) {
    console.error("Failed to sync Asana Actual Points", error);
  }
}
