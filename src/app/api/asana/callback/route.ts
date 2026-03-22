import { NextRequest, NextResponse } from "next/server";
import { exchangeAsanaCode } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import { syncUserAsanaData } from "@/lib/services/sync";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state" }, { status: 400 });
  }

  const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { userId: string };
  const tokenData = await exchangeAsanaCode(code);
  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

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

  await syncUserAsanaData(parsed.userId, "initial");

  return NextResponse.redirect(new URL("/settings/integrations", request.url));
}
