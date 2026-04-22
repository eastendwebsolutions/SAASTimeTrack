import { NextResponse } from "next/server";
import { requirePokerAdminForSession } from "@/lib/services/poker-planning/auth";
import { completeSession } from "@/lib/services/poker-planning/session";

type Params = Promise<{ sessionId: string }>;

export async function POST(_: Request, { params }: { params: Params }) {
  try {
    const { sessionId } = await params;
    const user = await requirePokerAdminForSession(sessionId);
    await completeSession({ sessionId, actorUserId: user.id, companyId: user.companyId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to complete session" }, { status: 400 });
  }
}
