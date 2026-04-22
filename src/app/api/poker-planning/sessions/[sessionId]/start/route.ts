import { NextResponse } from "next/server";
import { requirePokerAdmin } from "@/lib/services/poker-planning/auth";
import { startSession } from "@/lib/services/poker-planning/session";

type Params = Promise<{ sessionId: string }>;

export async function POST(_: Request, { params }: { params: Params }) {
  try {
    const user = await requirePokerAdmin();
    const { sessionId } = await params;
    await startSession({ sessionId, actorUserId: user.id, companyId: user.companyId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start session" }, { status: 400 });
  }
}
