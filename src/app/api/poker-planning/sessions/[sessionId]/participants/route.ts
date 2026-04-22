import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePokerAdmin } from "@/lib/services/poker-planning/auth";
import { assignParticipants } from "@/lib/services/poker-planning/session";

type Params = Promise<{ sessionId: string }>;
const schema = z.object({ participantUserIds: z.array(z.string().uuid()) });

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const user = await requirePokerAdmin();
    const { sessionId } = await params;
    const payload = schema.parse(await request.json());
    await assignParticipants({
      sessionId,
      actorUserId: user.id,
      companyId: user.companyId,
      participantUserIds: payload.participantUserIds,
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
      return NextResponse.json({ error: "Invalid participants payload" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to assign participants" }, { status: 400 });
  }
}
