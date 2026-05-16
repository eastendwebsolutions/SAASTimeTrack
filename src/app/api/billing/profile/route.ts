import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireBillingUser } from "@/lib/services/billing/auth";
import { getUserBillingProfile, toUserBillingProfileInput, upsertUserBillingProfile } from "@/lib/services/billing/user-profile";
import { userBillingProfileSchema } from "@/lib/validation/billing";

export async function GET() {
  try {
    const user = await requireBillingUser();
    const profile = await getUserBillingProfile(user.id);
    return NextResponse.json({ profile: toUserBillingProfileInput(profile) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load billing profile" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireBillingUser();
    const body = await request.json();
    const parsed = userBillingProfileSchema.parse(body);
    const profile = await upsertUserBillingProfile(user.id, parsed);
    return NextResponse.json({ profile: toUserBillingProfileInput(profile) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid billing profile" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save billing profile" }, { status: 400 });
  }
}
