import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePokerAdmin, requirePokerUser } from "@/lib/services/poker-planning/auth";
import { createSession, listSessions } from "@/lib/services/poker-planning/session";

const createSessionSchema = z.object({
  title: z.string().min(2).max(255),
  asanaProjectId: z.string().min(1),
  sprintFieldGid: z.string().min(1),
  sprintFieldName: z.string().min(1),
  selectedSprintValueGid: z.string().min(1),
  selectedSprintValueName: z.string().min(1),
  writebackMode: z.enum(["immediate", "on_sprint_completion"]),
  participantUserIds: z.array(z.string().uuid()).default([]),
});

export async function GET() {
  try {
    const user = await requirePokerUser();
    const sessions = await listSessions(user.companyId, true);
    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePokerAdmin();
    const payload = createSessionSchema.parse(await request.json());
    const result = await createSession({
      companyId: user.companyId,
      actorUserId: user.id,
      ...payload,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
