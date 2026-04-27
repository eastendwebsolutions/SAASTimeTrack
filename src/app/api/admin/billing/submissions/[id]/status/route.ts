import { NextResponse } from "next/server";
import { requireBillingSubmissionAdmin } from "@/lib/services/billing/auth";
import { updateBillingSubmissionStatus } from "@/lib/services/billing/submissions";
import { adminBillingStatusUpdateSchema } from "@/lib/validation/billing";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireBillingSubmissionAdmin();
    const { id } = await params;
    const payload = await request.json();
    const parsed = adminBillingStatusUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const updated = await updateBillingSubmissionStatus({
      actor,
      submissionId: id,
      status: parsed.data.status,
      adminNote: parsed.data.adminNote ?? parsed.data.requestedCorrection ?? null,
      dueDateUtcIso: parsed.data.dueDateUtcIso ?? null,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    if (error instanceof Error && error.message === "Submission not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to update submission status" }, { status: 500 });
  }
}

