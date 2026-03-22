import { NextResponse } from "next/server";
import { getAsanaAuthorizationUrl } from "@/lib/asana/client";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url");
  return NextResponse.redirect(getAsanaAuthorizationUrl(state));
}
