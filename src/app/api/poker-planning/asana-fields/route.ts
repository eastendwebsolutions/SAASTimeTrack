import { NextRequest, NextResponse } from "next/server";
import { requirePokerAdmin } from "@/lib/services/poker-planning/auth";
import { detectPokerAsanaFields } from "@/lib/services/poker-planning/asana";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePokerAdmin();
    const projectGid = request.nextUrl.searchParams.get("projectGid");
    if (!projectGid) {
      return NextResponse.json({ error: "projectGid is required" }, { status: 400 });
    }
    const detection = await detectPokerAsanaFields({
      userId: user.id,
      projectGid,
    });
    return NextResponse.json(detection);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to detect Asana fields" }, { status: 500 });
  }
}
