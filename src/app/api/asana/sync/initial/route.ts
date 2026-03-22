import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { syncUserAsanaData } from "@/lib/services/sync";

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncUserAsanaData(user.id, "initial");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Asana sync failed",
        details: error instanceof Error ? error.message : "Unknown sync error",
      },
      { status: 500 },
    );
  }
}
