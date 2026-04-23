import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await db.query.projects.findMany({
    where: and(
      eq(projects.companyId, user.companyId),
      eq(projects.syncedByUserId, user.id),
      eq(projects.isActive, true),
    ),
    orderBy: (table, { asc }) => [asc(table.name)],
  });
  return NextResponse.json(data);
}
