import { NextRequest, NextResponse } from "next/server";
import { fetchSprintFieldOptions } from "@/lib/services/poker-planning/asana";
import { requirePokerAdmin } from "@/lib/services/poker-planning/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePokerAdmin();
    const projectGid = request.nextUrl.searchParams.get("projectGid");
    const sprintFieldGid = request.nextUrl.searchParams.get("sprintFieldGid");
    if (!projectGid || !sprintFieldGid) {
      return NextResponse.json({ error: "projectGid and sprintFieldGid are required" }, { status: 400 });
    }
    const options = await fetchSprintFieldOptions({ userId: user.id, projectGid, sprintFieldGid });
    return NextResponse.json({ options });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to fetch sprint options" }, { status: 500 });
  }
}
