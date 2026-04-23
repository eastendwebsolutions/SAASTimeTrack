import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getMondayAuthorizationUrl } from "@/lib/monday/client";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";

function missingMondayConnectEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.MONDAY_CLIENT_ID?.trim()) missing.push("MONDAY_CLIENT_ID");
  if (!process.env.MONDAY_CLIENT_SECRET?.trim()) missing.push("MONDAY_CLIENT_SECRET");
  if (!process.env.MONDAY_REDIRECT_URI?.trim()) missing.push("MONDAY_REDIRECT_URI");
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) missing.push("ENCRYPTION_KEY");
  if (process.env.MONDAY_FEATURE_ENABLED !== "1") missing.push("MONDAY_FEATURE_ENABLED");
  return missing;
}

export async function GET(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getMondayReadiness();
  if (!readiness.fullyReady) {
    const missing = missingMondayConnectEnv();
    const url = new URL("/settings/integrations", request.url);
    url.searchParams.set("config", "monday");
    if (missing.length > 0) url.searchParams.set("missing", missing.join(","));
    url.searchParams.set("monday_error", readiness.schemaReady ? "not_enabled" : "schema_not_ready");
    return NextResponse.redirect(url);
  }

  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url");
  try {
    return NextResponse.redirect(getMondayAuthorizationUrl(state));
  } catch {
    const url = new URL("/settings/integrations", request.url);
    url.searchParams.set("config", "monday");
    url.searchParams.set("monday_error", "env_invalid");
    return NextResponse.redirect(url);
  }
}
