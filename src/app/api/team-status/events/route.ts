import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { createTeamStatusEvent, isEventType } from "@/lib/services/team-status";

const payloadSchema = z.object({
  event_type: z.string(),
});

export async function POST(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!isEventType(parsed.data.event_type)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const result = await createTeamStatusEvent({
    companyId: user.companyId,
    userId: user.id,
    eventType: parsed.data.event_type,
    createdByUserId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        current_status: result.current,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    event: result.event,
    status: result.current.status,
    last_event_type: result.current.lastEventType,
    last_event_time_utc: result.current.lastEventTimeUtc,
    last_event_time_local_label: result.current.lastEventTimeLocalLabel,
    available_actions: result.current.availableActions,
    active_work_seconds: result.current.activeWorkSeconds,
    needs_review: result.current.needsReview,
  });
}
