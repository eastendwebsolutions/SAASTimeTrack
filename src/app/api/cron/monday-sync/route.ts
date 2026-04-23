import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";
import { syncUserMondayData } from "@/lib/services/sync";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getMondayReadiness();
  if (!readiness.fullyReady) {
    return NextResponse.json({ ok: true, skipped: true, reason: "monday_not_ready", readiness });
  }

  const connections = await db.query.mondayConnections.findMany({ columns: { userId: true } });
  const syncUserIds = connections.map((connection) => connection.userId);
  await Promise.allSettled(syncUserIds.map((syncUserId) => syncUserMondayData(syncUserId, "periodic")));
  return NextResponse.json({ ok: true, queued: syncUserIds.length });
}
