import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { canReviewEntries } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { entryComments, timeEntries } from "@/lib/db/schema";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry || entry.companyId !== user.companyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (entry.userId !== user.id && !canReviewEntries(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  let body = "";
  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as { body?: string };
    body = payload.body?.trim() ?? "";
  } else {
    const formData = await request.formData();
    body = String(formData.get("body") ?? "").trim();
  }

  if (!body) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  const [comment] = await db
    .insert(entryComments)
    .values({
      timeEntryId: id,
      authorUserId: user.id,
      body,
    })
    .returning();

  if (contentType.includes("application/json")) {
    return NextResponse.json(comment, { status: 201 });
  }

  return NextResponse.redirect(new URL("/admin/review", request.url));
}
