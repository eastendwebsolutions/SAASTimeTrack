import { NextResponse } from "next/server";
import { requireBillingUser } from "@/lib/services/billing/auth";
import { getCurrentBillingState } from "@/lib/services/billing/submissions";

export async function GET() {
  try {
    const user = await requireBillingUser();
    const current = await getCurrentBillingState(user);
    return NextResponse.json(current);
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Unable to load billing status" }, { status: 500 });
  }
}

