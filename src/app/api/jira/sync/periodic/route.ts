import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { syncUserJiraData } from "@/lib/services/sync";

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncUserJiraData(user.id, "periodic");
  return NextResponse.json({ ok: true });
}
