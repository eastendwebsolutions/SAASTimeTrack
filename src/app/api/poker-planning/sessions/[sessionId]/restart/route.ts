import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePokerAdmin } from "@/lib/services/poker-planning/auth";
import { restartSession } from "@/lib/services/poker-planning/session";

type Params = Promise<{ sessionId: string }>;
const restartSchema = z.object({
  restartScope: z.enum(["full", "stories"]),
  storyIds: z.array(z.string().uuid()).optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const user = await requirePokerAdmin();
    const { sessionId } = await params;
    const payload = restartSchema.parse(await request.json());
    await restartSession({
      sessionId,
      actorUserId: user.id,
      companyId: user.companyId,
      restartScope: payload.restartScope,
      storyIds: payload.storyIds,
      reason: payload.reason,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid restart payload" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to restart session" }, { status: 400 });
  }
}
