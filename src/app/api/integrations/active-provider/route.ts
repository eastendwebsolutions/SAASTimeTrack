import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { asanaConnections, jiraConnections, mondayConnections, users } from "@/lib/db/schema";
import { isIntegrationProvider } from "@/lib/integrations/provider";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";

async function hasConnection(userId: string, provider: "asana" | "jira" | "monday") {
  if (provider === "asana") {
    return Boolean(await db.query.asanaConnections.findFirst({ where: eq(asanaConnections.userId, userId), columns: { id: true } }));
  }
  if (provider === "jira") {
    return Boolean(await db.query.jiraConnections.findFirst({ where: eq(jiraConnections.userId, userId), columns: { id: true } }));
  }
  return Boolean(await db.query.mondayConnections.findFirst({ where: eq(mondayConnections.userId, userId), columns: { id: true } }));
}

async function setActiveProviderForCurrentUser(userId: string, provider: "asana" | "jira" | "monday") {
  if (!(await hasConnection(userId, provider))) {
    return { ok: false as const, status: 400, error: "Provider is not connected for this user" };
  }

  await db
    .update(users)
    .set({ activeIntegrationProvider: provider })
    .where(eq(users.id, userId))
    .catch((error) => {
      if (!isMissingIntegrationSchemaError(error)) throw error;
    });

  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { provider?: string } | null;
  if (!body?.provider || !isIntegrationProvider(body.provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const result = await setActiveProviderForCurrentUser(user.id, body.provider);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, provider: body.provider });
}

export async function GET(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));

  const provider = request.nextUrl.searchParams.get("provider");
  const backTo = request.nextUrl.searchParams.get("redirect") || "/settings/integrations";
  const redirectUrl = new URL(backTo, request.url);
  if (!provider || !isIntegrationProvider(provider)) {
    redirectUrl.searchParams.set("provider_error", "invalid_provider");
    return NextResponse.redirect(redirectUrl);
  }

  const result = await setActiveProviderForCurrentUser(user.id, provider);
  if (!result.ok) {
    redirectUrl.searchParams.set("provider_error", "not_connected");
    return NextResponse.redirect(redirectUrl);
  }
  redirectUrl.searchParams.set("provider_switched", provider);
  return NextResponse.redirect(redirectUrl);
}
