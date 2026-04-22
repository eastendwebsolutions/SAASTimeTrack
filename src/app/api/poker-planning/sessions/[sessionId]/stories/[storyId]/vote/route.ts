import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePokerUser } from "@/lib/services/poker-planning/auth";
import { submitVote } from "@/lib/services/poker-planning/session";

type Params = Promise<{ sessionId: string; storyId: string }>;
const voteSchema = z.object({ voteValue: z.string().min(1).max(20) });

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const user = await requirePokerUser();
    const { sessionId, storyId } = await params;
    const payload = voteSchema.parse(await request.json());
    await submitVote({
      sessionId,
      storyId,
      voterUserId: user.id,
      companyId: user.companyId,
      voteValue: payload.voteValue,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to submit vote" }, { status: 400 });
  }
}
