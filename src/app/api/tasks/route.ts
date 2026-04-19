import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyProjects = await db.query.projects.findMany({
    where: and(eq(projects.companyId, user.companyId), eq(projects.syncedByUserId, user.id)),
    columns: { id: true },
  });
  const companyProjectIds = companyProjects.map((project) => project.id);
  if (!companyProjectIds.length) return NextResponse.json([]);

  if (projectId && !companyProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Forbidden project" }, { status: 403 });
  }

  const where = projectId ? eq(tasks.projectId, projectId) : inArray(tasks.projectId, companyProjectIds);
  const data = await db.query.tasks.findMany({ where });
  return NextResponse.json(data);
}
