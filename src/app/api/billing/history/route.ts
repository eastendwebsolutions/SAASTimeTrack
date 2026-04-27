import { NextResponse } from "next/server";
import { requireBillingUser } from "@/lib/services/billing/auth";
import { getUserBillingHistory } from "@/lib/services/billing/submissions";

export async function GET() {
  try {
    const user = await requireBillingUser();
    const history = await getUserBillingHistory(user.id, user.companyId);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load history" }, { status: 500 });
  }
}

