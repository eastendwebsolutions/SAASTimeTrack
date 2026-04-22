import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePokerAdmin, requirePokerUser } from "@/lib/services/poker-planning/auth";
import { getCompanyPokerAsanaMapping, updateCompanyPokerAsanaMapping } from "@/lib/services/poker-planning/asana";

const mappingSchema = z.object({
  sprintFieldGid: z.string().min(1),
  sprintFieldName: z.string().min(1),
  storyPointsFieldGid: z.string().min(1),
  storyPointsFieldName: z.string().min(1),
});

export async function GET() {
  try {
    const user = await requirePokerUser();
    const mapping = await getCompanyPokerAsanaMapping(user.companyId);
    return NextResponse.json({ mapping });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch mapping" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePokerAdmin();
    const payload = mappingSchema.parse(await request.json());
    await updateCompanyPokerAsanaMapping({
      companyId: user.companyId,
      actorUserId: user.id,
      ...payload,
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
      return NextResponse.json({ error: "Invalid mapping payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update mapping" }, { status: 500 });
  }
}
