import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { jiraConnections, users } from "@/lib/db/schema";
import { exchangeJiraCode, fetchJiraAccessibleResources, fetchJiraMe } from "@/lib/jira/client";
import { encrypt } from "@/lib/utils/crypto";

function integrationsUrl(request: NextRequest, query: Record<string, string>) {
  const url = new URL("/settings/integrations", request.url);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(integrationsUrl(request, { jira_error: "missing_params" }));
  }

  let parsed: { userId: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { userId: string };
  } catch {
    return NextResponse.redirect(integrationsUrl(request, { jira_error: "invalid_state" }));
  }
  if (!parsed.userId) {
    return NextResponse.redirect(integrationsUrl(request, { jira_error: "invalid_state" }));
  }

  const currentUser = await getOrCreateCurrentUser();
  if (!currentUser) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("redirect_url", request.nextUrl.toString());
    return NextResponse.redirect(signIn);
  }
  if (currentUser.id !== parsed.userId) {
    return NextResponse.redirect(integrationsUrl(request, { jira_error: "user_mismatch" }));
  }

  try {
    const tokenData = await exchangeJiraCode(code);
    const resources = await fetchJiraAccessibleResources(tokenData.access_token);
    const primaryResource = resources[0];
    if (!primaryResource) {
      return NextResponse.redirect(integrationsUrl(request, { jira_error: "no_site_access" }));
    }
    const jiraMe = await fetchJiraMe(primaryResource.id, tokenData.access_token);
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

    await db
      .insert(jiraConnections)
      .values({
        userId: parsed.userId,
        jiraAccountId: jiraMe.accountId,
        jiraCloudId: primaryResource.id,
        jiraSiteName: primaryResource.name,
        accessTokenEncrypted: encrypt(tokenData.access_token),
        refreshTokenEncrypted: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: tokenData.scope ?? null,
      })
      .onConflictDoUpdate({
        target: jiraConnections.userId,
        set: {
          jiraAccountId: jiraMe.accountId,
          jiraCloudId: primaryResource.id,
          jiraSiteName: primaryResource.name,
          accessTokenEncrypted: encrypt(tokenData.access_token),
          refreshTokenEncrypted: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
          expiresAt,
          scopes: tokenData.scope ?? null,
        },
      });

    await db
      .update(users)
      .set({ activeIntegrationProvider: "jira" })
      .where(eq(users.id, parsed.userId));
  } catch {
    return NextResponse.redirect(integrationsUrl(request, { jira_error: "exchange_failed" }));
  }

  return NextResponse.redirect(integrationsUrl(request, { jira_connected: "1" }));
}
