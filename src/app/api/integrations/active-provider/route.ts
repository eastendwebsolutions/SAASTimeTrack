import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { asanaConnections, jiraConnections, users } from "@/lib/db/schema";
import { isIntegrationProvider } from "@/lib/integrations/provider";

export async function POST(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.formData();
  const providerRaw = payload.get("provider");
  if (typeof providerRaw !== "string" || !isIntegrationProvider(providerRaw)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (providerRaw === "asana") {
    const hasConnection = await db.query.asanaConnections.findFirst({
      where: eq(asanaConnections.userId, user.id),
      columns: { id: true },
    });
    if (!hasConnection) return NextResponse.json({ error: "Connect Asana first" }, { status: 400 });
  } else {
    const hasConnection = await db.query.jiraConnections.findFirst({
      where: eq(jiraConnections.userId, user.id),
      columns: { id: true },
    });
    if (!hasConnection) return NextResponse.json({ error: "Connect Jira first" }, { status: 400 });
  }

  await db.update(users).set({ activeIntegrationProvider: providerRaw }).where(eq(users.id, user.id));
  return NextResponse.redirect(new URL("/settings/integrations", request.url));
}
