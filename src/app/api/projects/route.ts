import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await db.query.projects.findMany({ where: eq(projects.companyId, user.companyId) });
  return NextResponse.json(data);
}
