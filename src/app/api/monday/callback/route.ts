import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { mondayConnections, users } from "@/lib/db/schema";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";
import { exchangeMondayCode, fetchMondayMe } from "@/lib/monday/client";
import { encrypt } from "@/lib/utils/crypto";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";

function integrationsUrl(request: NextRequest, query: Record<string, string>) {
  const url = new URL("/settings/integrations", request.url);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const readiness = await getMondayReadiness();
  if (!readiness.fullyReady) {
    return NextResponse.redirect(integrationsUrl(request, { monday_error: "not_enabled" }));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(integrationsUrl(request, { monday_error: "missing_params" }));
  }

  let parsed: { userId: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { userId: string };
  } catch {
    return NextResponse.redirect(integrationsUrl(request, { monday_error: "invalid_state" }));
  }
  if (!parsed.userId) {
    return NextResponse.redirect(integrationsUrl(request, { monday_error: "invalid_state" }));
  }

  const currentUser = await getOrCreateCurrentUser();
  if (!currentUser) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("redirect_url", request.nextUrl.toString());
    return NextResponse.redirect(signIn);
  }
  if (currentUser.id !== parsed.userId) {
    return NextResponse.redirect(integrationsUrl(request, { monday_error: "user_mismatch" }));
  }

  try {
    const tokenData = await exchangeMondayCode(code);
    const me = await fetchMondayMe(tokenData.access_token);
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

    await db
      .insert(mondayConnections)
      .values({
        userId: parsed.userId,
        mondayUserId: me.id,
        mondayAccountId: me.account?.id ?? null,
        mondayAccountSlug: me.account?.slug ?? null,
        accessTokenEncrypted: encrypt(tokenData.access_token),
        refreshTokenEncrypted: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: tokenData.scope ?? null,
      })
      .onConflictDoUpdate({
        target: mondayConnections.userId,
        set: {
          mondayUserId: me.id,
          mondayAccountId: me.account?.id ?? null,
          mondayAccountSlug: me.account?.slug ?? null,
          accessTokenEncrypted: encrypt(tokenData.access_token),
          refreshTokenEncrypted: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
          expiresAt,
          scopes: tokenData.scope ?? null,
        },
      });

    try {
      await db
        .update(users)
        .set({ activeIntegrationProvider: "monday" })
        .where(eq(users.id, parsed.userId));
    } catch (error) {
      if (!isMissingIntegrationSchemaError(error)) throw error;
    }
  } catch {
    return NextResponse.redirect(integrationsUrl(request, { monday_error: "exchange_failed" }));
  }

  return NextResponse.redirect(integrationsUrl(request, { monday_connected: "1" }));
}
