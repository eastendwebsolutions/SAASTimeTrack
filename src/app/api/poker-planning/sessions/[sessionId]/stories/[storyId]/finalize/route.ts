import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePokerAdminForSession } from "@/lib/services/poker-planning/auth";
import { finalizeStory } from "@/lib/services/poker-planning/session";

type Params = Promise<{ sessionId: string; storyId: string }>;
const finalizeSchema = z.object({ estimate: z.number().int().positive() });

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { sessionId, storyId } = await params;
    const user = await requirePokerAdminForSession(sessionId);
    const payload = finalizeSchema.parse(await request.json());
    await finalizeStory({
      sessionId,
      storyId,
      actorUserId: user.id,
      companyId: user.companyId,
      estimate: payload.estimate,
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
      return NextResponse.json({ error: "Invalid estimate payload" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to finalize story" }, { status: 400 });
  }
}
