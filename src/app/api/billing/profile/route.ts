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
    console.error("GET /api/billing/profile failed", error);
    return NextResponse.json({ error: "Unable to load billing profile" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireBillingUser();
    const body = await request.json();
    const parsed = userBillingProfileSchema.parse({
      ...body,
      address2: typeof body?.address2 === "string" && body.address2.trim() ? body.address2.trim() : null,
      province: typeof body?.province === "string" && body.province.trim() ? body.province.trim() : null,
    });
    const profile = await upsertUserBillingProfile(user.id, parsed);
    if (!profile) {
      return NextResponse.json({ error: "Unable to save billing profile" }, { status: 500 });
    }
    return NextResponse.json({ profile: toUserBillingProfileInput(profile) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid billing profile" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to save billing profile";
    console.error("PUT /api/billing/profile failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
