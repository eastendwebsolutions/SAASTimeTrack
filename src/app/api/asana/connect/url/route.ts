import { NextRequest, NextResponse } from "next/server";
import { getAsanaAuthorizationUrl } from "@/lib/asana/client";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";

function missingAsanaConnectEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.ASANA_CLIENT_ID?.trim()) missing.push("ASANA_CLIENT_ID");
  if (!process.env.ASANA_CLIENT_SECRET?.trim()) missing.push("ASANA_CLIENT_SECRET");
  if (!process.env.ASANA_REDIRECT_URI?.trim()) missing.push("ASANA_REDIRECT_URI");
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) missing.push("ENCRYPTION_KEY");
  return missing;
}

export async function GET(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing = missingAsanaConnectEnv();
  if (missing.length > 0) {
    const url = new URL("/settings/integrations", request.url);
    url.searchParams.set("config", "asana");
    url.searchParams.set("missing", missing.join(","));
    return NextResponse.redirect(url);
  }

  try {
    new URL(process.env.ASANA_REDIRECT_URI!);
  } catch {
    const url = new URL("/settings/integrations", request.url);
    url.searchParams.set("config", "asana");
    url.searchParams.set("missing", "ASANA_REDIRECT_URI");
    return NextResponse.redirect(url);
  }

  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url");
  try {
    return NextResponse.redirect(getAsanaAuthorizationUrl(state));
  } catch {
    const url = new URL("/settings/integrations", request.url);
    url.searchParams.set("config", "asana");
    url.searchParams.set("missing", "env");
    return NextResponse.redirect(url);
  }
}
