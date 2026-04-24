import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getActiveProviderForUser } from "@/lib/integrations/provider";
import { withProjectsProviderColumnFallback } from "@/lib/integrations/projects-provider-fallback";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeProvider = await getActiveProviderForUser(user.id);
  const data = await withProjectsProviderColumnFallback(
    () =>
      db.query.projects.findMany({
        where: and(
          eq(projects.companyId, user.companyId),
          eq(projects.syncedByUserId, user.id),
          eq(projects.provider, activeProvider),
          eq(projects.isActive, true),
        ),
        orderBy: (table, { asc }) => [asc(table.name)],
      }),
    () =>
      db.query.projects.findMany({
        where: and(
          eq(projects.companyId, user.companyId),
          eq(projects.syncedByUserId, user.id),
          eq(projects.isActive, true),
        ),
        orderBy: (table, { asc }) => [asc(table.name)],
      }),
  );
  return NextResponse.json(data);
}
