import { NextRequest, NextResponse } from "next/server";
import { exchangeAsanaCode } from "@/lib/asana/client";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { asanaConnections } from "@/lib/db/schema";
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
    return NextResponse.redirect(integrationsUrl(request, { asana_error: "missing_params" }));
  }

  let parsed: { userId: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { userId: string };
  } catch {
    return NextResponse.redirect(integrationsUrl(request, { asana_error: "invalid_state" }));
  }

  if (!parsed.userId) {
    return NextResponse.redirect(integrationsUrl(request, { asana_error: "invalid_state" }));
  }

  const currentUser = await getOrCreateCurrentUser();
  if (!currentUser) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("redirect_url", request.nextUrl.toString());
    return NextResponse.redirect(signIn);
  }

  if (currentUser.id !== parsed.userId) {
    return NextResponse.redirect(integrationsUrl(request, { asana_error: "user_mismatch" }));
  }

  let tokenData: Awaited<ReturnType<typeof exchangeAsanaCode>>;
  try {
    tokenData = await exchangeAsanaCode(code);
  } catch {
    return NextResponse.redirect(integrationsUrl(request, { asana_error: "exchange_failed" }));
  }

  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

  try {
    await db
      .insert(asanaConnections)
      .values({
        userId: parsed.userId,
        asanaUserId: tokenData.data?.id ?? "unknown",
        accessTokenEncrypted: encrypt(tokenData.access_token),
        refreshTokenEncrypted: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: "default",
      })
      .onConflictDoUpdate({
        target: asanaConnections.userId,
        set: {
          asanaUserId: tokenData.data?.id ?? "unknown",
          accessTokenEncrypted: encrypt(tokenData.access_token),
          refreshTokenEncrypted: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
          expiresAt,
        },
      });
  } catch {
    return NextResponse.redirect(integrationsUrl(request, { asana_error: "save_failed" }));
  }

  // Initial sync can exceed serverless limits; run it from /settings/integrations via POST /api/asana/sync/initial.
  return NextResponse.redirect(integrationsUrl(request, { asana_connected: "1" }));
}
