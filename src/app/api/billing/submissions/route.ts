import { NextResponse } from "next/server";
import { requireBillingUser } from "@/lib/services/billing/auth";
import { createBillingSubmission } from "@/lib/services/billing/submissions";

export async function POST(request: Request) {
  try {
    const user = await requireBillingUser();
    const formData = await request.formData();
    const bodyContent = formData.get("bodyContent");
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    const userName = user.displayName?.trim() || user.email.split("@")[0];
    const submission = await createBillingSubmission({
      user,
      userName,
      bodyContent: typeof bodyContent === "string" && bodyContent.trim().length > 0 ? bodyContent.trim() : null,
      files,
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && (error.message.includes("required") || error.message.includes("Unsupported") || error.message.includes("exists"))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit billing package" }, { status: 500 });
  }
}

