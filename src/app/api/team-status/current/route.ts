import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getUserCurrentStatus } from "@/lib/services/team-status";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getUserCurrentStatus(user.id);
  return NextResponse.json({
    status: current.status,
    last_event_type: current.lastEventType,
    last_event_time_utc: current.lastEventTimeUtc,
    last_event_time_local_label: current.lastEventTimeLocalLabel,
    available_actions: current.availableActions,
    active_work_seconds: current.activeWorkSeconds,
    needs_review: current.needsReview,
  });
}
