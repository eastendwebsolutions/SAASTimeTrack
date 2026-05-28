import { NextResponse } from "next/server";
import { requireBillingUser } from "@/lib/services/billing/auth";
import { createBillingSubmission } from "@/lib/services/billing/submissions";
import { billingSubmissionCreateSchema } from "@/lib/validation/billing";

export async function POST(request: Request) {
  try {
    const user = await requireBillingUser();
    const body = await request.json();
    const parsed = billingSubmissionCreateSchema.parse(body);

    const userName = user.displayName?.trim() || user.email.split("@")[0];
    const submission = await createBillingSubmission({
      user,
      userName,
      bodyContent: parsed.bodyContent ?? null,
      invoiceNumber: parsed.invoiceNumber,
      lineItems: parsed.lineItems,
      billingPeriodId: parsed.billingPeriodId ?? null,
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && (error.message.includes("required") || error.message.includes("billing information") || error.message.includes("exists") || error.message.includes("configured"))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit invoice" }, { status: 500 });
  }
}
