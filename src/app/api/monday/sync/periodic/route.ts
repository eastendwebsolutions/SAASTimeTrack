import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";
import { syncUserMondayData } from "@/lib/services/sync";

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getMondayReadiness();
  if (!readiness.fullyReady) {
    return NextResponse.json(
      { error: "Monday integration is not enabled yet", readiness },
      { status: 503 },
    );
  }

  await syncUserMondayData(user.id, "periodic");
  return NextResponse.json({ ok: true });
}
