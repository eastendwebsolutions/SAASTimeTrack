import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncUserAsanaData } from "@/lib/services/sync";
import { users } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db.query.asanaConnections.findMany({ columns: { userId: true } });
  const connectedUsers = connections.length
    ? await db.query.users.findMany({
        where: inArray(
          users.id,
          connections.map((connection) => connection.userId),
        ),
        columns: { id: true, companyId: true },
      })
    : [];
  const uniqueUsersByCompany = new Map<string, string>();
  for (const connectedUser of connectedUsers) {
    if (!uniqueUsersByCompany.has(connectedUser.companyId)) {
      uniqueUsersByCompany.set(connectedUser.companyId, connectedUser.id);
    }
  }
  const syncUserIds = [...uniqueUsersByCompany.values()];

  await Promise.allSettled(
    syncUserIds.map((syncUserId) => syncUserAsanaData(syncUserId, "periodic")),
  );

  return NextResponse.json({ ok: true, queued: syncUserIds.length });
}
