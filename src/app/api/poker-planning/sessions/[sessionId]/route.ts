import { NextRequest, NextResponse } from "next/server";
import { canManagePokerPlanning } from "@/lib/auth/rbac";
import { requirePokerUser } from "@/lib/services/poker-planning/auth";
import { getSessionDetail } from "@/lib/services/poker-planning/session";

type Params = Promise<{ sessionId: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const user = await requirePokerUser();
    const { sessionId } = await params;
    const version = request.nextUrl.searchParams.get("version");
    const session = await getSessionDetail({
      sessionId,
      companyId: user.companyId,
      versionNumber: version ? Number(version) : undefined,
    });
    return NextResponse.json({
      ...session,
      canManage: canManagePokerPlanning(user.role),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
