import { NextRequest, NextResponse } from "next/server";
import { requireBillingSubmissionAdmin } from "@/lib/services/billing/auth";
import { listAdminBillingSubmissions } from "@/lib/services/billing/submissions";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireBillingSubmissionAdmin();
    const companyId = request.nextUrl.searchParams.get("companyId") ?? undefined;
    const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const rows = await listAdminBillingSubmissions(actor, { companyId, userId, status });
    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Unable to load submissions" }, { status: 500 });
  }
}

