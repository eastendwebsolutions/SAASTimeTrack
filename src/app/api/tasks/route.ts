import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { getActiveProviderForUser } from "@/lib/integrations/provider";
import { withProjectsProviderColumnFallback } from "@/lib/integrations/projects-provider-fallback";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeProvider = await getActiveProviderForUser(user.id);
  const companyProjects = await withProjectsProviderColumnFallback(
    () =>
      db.query.projects.findMany({
        where: and(
          eq(projects.companyId, user.companyId),
          eq(projects.syncedByUserId, user.id),
          eq(projects.provider, activeProvider),
          eq(projects.isActive, true),
        ),
        columns: { id: true },
      }),
    () =>
      db.query.projects.findMany({
        where: and(
          eq(projects.companyId, user.companyId),
          eq(projects.syncedByUserId, user.id),
          eq(projects.isActive, true),
        ),
        columns: { id: true },
      }),
  );
  const companyProjectIds = companyProjects.map((project) => project.id);
  if (!companyProjectIds.length) return NextResponse.json([]);

  if (projectId && !companyProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Forbidden project" }, { status: 403 });
  }

  const where = projectId
    ? and(eq(tasks.projectId, projectId), eq(tasks.isActive, true))
    : and(inArray(tasks.projectId, companyProjectIds), eq(tasks.isActive, true));
  const data = await db.query.tasks.findMany({ where });
  return NextResponse.json(data);
}
