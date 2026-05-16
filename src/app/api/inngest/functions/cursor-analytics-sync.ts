import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cursorTeamConnections,
  cursorUsageDaily,
  cursorUserIdentities,
  users,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";
import { startOfUtcDay } from "@/lib/services/analytics/utc-day";
import { inngest } from "./client";

/**
 * Best-effort sync from Cursor Team Analytics API when a company has stored credentials.
 * Normalizes into cursor_usage_daily (per Cursor user; mapped to SaaSTimeTrack users when identities exist).
 */
export const cursorAnalyticsSync = inngest.createFunction(
  { id: "cursor-analytics-sync", triggers: [{ cron: "45 6 * * *" }] },
  async () => {
    const connections = await db.query.cursorTeamConnections.findMany();
    if (connections.length === 0) return { synced: 0 };

    let synced = 0;
    for (const conn of connections) {
      try {
        const apiKey = decrypt(conn.apiKeyEncrypted);
        const companyUsers = await db.query.users.findMany({
          where: eq(users.companyId, conn.companyId),
          columns: { id: true, email: true, companyId: true },
        });
        const identities = await db.query.cursorUserIdentities.findMany({
          where: eq(cursorUserIdentities.companyId, conn.companyId),
        });
        const emailToUserId = new Map(companyUsers.map((u) => [u.email.toLowerCase(), u.id]));
        for (const row of identities) {
          if (!row.userId && row.sourceEmail) {
            const uid = emailToUserId.get(row.sourceEmail.toLowerCase());
            if (uid) {
              await db
                .update(cursorUserIdentities)
                .set({ userId: uid })
                .where(eq(cursorUserIdentities.id, row.id));
            }
          }
        }

        const end = new Date();
        const start = new Date();
        start.setUTCDate(start.getUTCDate() - 7);
        const usage = await fetchCursorUsageAggregate(conn.companyId, apiKey);
        if (!usage) continue;

        const usageDay = startOfUtcDay(end);
        for (const [userId, agg] of usage.perAppUserId) {
          await db
            .insert(cursorUsageDaily)
            .values({
              companyId: conn.companyId,
              userId,
              usageDate: usageDay,
              totalRequests: agg.totalRequests,
              acceptedCompletions: agg.acceptedCompletions,
              aiLinesAdded: agg.aiLinesAdded,
              aiLinesDeleted: agg.aiLinesDeleted,
              manualLinesAdded: agg.manualLinesAdded,
              manualLinesDeleted: agg.manualLinesDeleted,
              sessionCount: agg.sessionCount,
              modelUsageJson: agg.modelUsageJson,
              ingestionSource: "api",
            })
            .onConflictDoUpdate({
              target: [
                cursorUsageDaily.companyId,
                cursorUsageDaily.userId,
                cursorUsageDaily.usageDate,
                cursorUsageDaily.ingestionSource,
              ],
              set: {
                totalRequests: agg.totalRequests,
                acceptedCompletions: agg.acceptedCompletions,
                aiLinesAdded: agg.aiLinesAdded,
                aiLinesDeleted: agg.aiLinesDeleted,
                manualLinesAdded: agg.manualLinesAdded,
                manualLinesDeleted: agg.manualLinesDeleted,
                sessionCount: agg.sessionCount,
                modelUsageJson: agg.modelUsageJson,
                computedAt: new Date(),
                updatedAt: new Date(),
              },
            });
        }

        await db
          .update(cursorTeamConnections)
          .set({
            lastSyncSuccessAt: new Date(),
            lastSyncError: null,
            updatedAt: new Date(),
          })
          .where(eq(cursorTeamConnections.id, conn.id));
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        await db
          .update(cursorTeamConnections)
          .set({
            lastSyncError: message,
            updatedAt: new Date(),
          })
          .where(eq(cursorTeamConnections.id, conn.id));
      }
    }

    return { synced };
  },
);

type CursorAgg = {
  totalRequests: number;
  acceptedCompletions: number;
  aiLinesAdded: number;
  aiLinesDeleted: number;
  manualLinesAdded: number;
  manualLinesDeleted: number;
  sessionCount: number;
  modelUsageJson: Record<string, number>;
};

/** When the Team API supports scoped usage, extend with team id and date range. */
async function fetchCursorUsageAggregate(
  companyId: string,
  apiKey: string,
): Promise<{ perAppUserId: Map<string, CursorAgg> } | null> {
  const map = new Map<string, CursorAgg>();
  const res = await fetch("https://api.cursor.com/teams/usage", {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      Accept: "application/json",
    },
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return null;

  /** Best-effort parse: API shape may vary; map known fields into aggregates per mapped user id placeholder */
  const usersArr = (body as { data?: { userId?: string; metrics?: Record<string, unknown> }[] }).data;
  if (!Array.isArray(usersArr)) {
    return null;
  }
  for (const row of usersArr) {
    const uid = row.userId;
    if (!uid || typeof uid !== "string") continue;
    const m = row.metrics as Record<string, number> | undefined;
    map.set(uid, {
      totalRequests: Number(m?.requests ?? m?.totalRequests ?? 0) || 0,
      acceptedCompletions: Number(m?.acceptedCompletions ?? m?.accepted ?? 0) || 0,
      aiLinesAdded: Number(m?.aiLinesAdded ?? 0) || 0,
      aiLinesDeleted: Number(m?.aiLinesDeleted ?? 0) || 0,
      manualLinesAdded: Number(m?.manualLinesAdded ?? 0) || 0,
      manualLinesDeleted: Number(m?.manualLinesDeleted ?? 0) || 0,
      sessionCount: Number(m?.sessions ?? 0) || 0,
      modelUsageJson: typeof m?.models === "object" && m?.models != null ? (m.models as Record<string, number>) : {},
    });
  }
  /** Without user UUID mapping, return empty (identities required for internal user ids). */
  if (map.size === 0) return null;

  /** Resolve internal SaaSTimeTrack user IDs via cursor identities stored with matching external id. */
  const internalMap = new Map<string, CursorAgg>();
  const identities = await db.query.cursorUserIdentities.findMany({
    where: eq(cursorUserIdentities.companyId, companyId),
    columns: { cursorExternalUserId: true, userId: true },
  });
  const extToUser = new Map(identities.filter((i) => i.userId).map((i) => [i.cursorExternalUserId, i.userId!]));
  for (const [ext, agg] of map) {
    const internal = extToUser.get(ext);
    if (internal) internalMap.set(internal, agg);
  }
  return { perAppUserId: internalMap };
}
