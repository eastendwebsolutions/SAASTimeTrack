import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { syncUserAsanaData } from "@/lib/services/sync";

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncUserAsanaData(user.id, "periodic");
  return NextResponse.json({ ok: true });
}
