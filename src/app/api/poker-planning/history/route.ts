import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requirePokerUser } from "@/lib/services/poker-planning/auth";
import { db } from "@/lib/db";
import { ppSessions } from "@/lib/db/schema";

export async function GET() {
  try {
    const user = await requirePokerUser();
    const sessions = await db.query.ppSessions.findMany({
      where: and(eq(ppSessions.companyId, user.companyId), eq(ppSessions.status, "completed")),
      orderBy: (table) => [desc(table.completedAt), desc(table.updatedAt)],
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch history sessions" }, { status: 500 });
  }
}
