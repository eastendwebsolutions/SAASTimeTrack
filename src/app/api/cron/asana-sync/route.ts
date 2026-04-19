import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncUserAsanaData } from "@/lib/services/sync";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db.query.asanaConnections.findMany({ columns: { userId: true } });
  const syncUserIds = connections.map((connection) => connection.userId);

  await Promise.allSettled(syncUserIds.map((syncUserId) => syncUserAsanaData(syncUserId, "periodic")));

  return NextResponse.json({ ok: true, queued: syncUserIds.length });
}
