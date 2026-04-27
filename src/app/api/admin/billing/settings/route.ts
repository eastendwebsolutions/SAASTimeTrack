import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { billingSettings } from "@/lib/db/schema";
import { isSuperAdmin } from "@/lib/auth/rbac";
import { requireBillingSettingsAdmin } from "@/lib/services/billing/auth";
import { listCompaniesForBillingAdmin, upsertBillingSettings } from "@/lib/services/billing/submissions";
import { billingSettingsSchema } from "@/lib/validation/billing";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireBillingSettingsAdmin();
    const companyId = request.nextUrl.searchParams.get("companyId") ?? actor.companyId;
    if (!isSuperAdmin(actor.role) && companyId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [settings, availableCompanies] = await Promise.all([
      db.query.billingSettings.findFirst({
        where: eq(billingSettings.companyId, companyId),
      }),
      listCompaniesForBillingAdmin(actor),
    ]);
    return NextResponse.json({
      settings,
      availableCompanies,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Unable to load billing settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireBillingSettingsAdmin();
    const payload = await request.json();
    const parsed = billingSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const targetCompanyId = parsed.data.companyId ?? actor.companyId;
    if (!isSuperAdmin(actor.role) && targetCompanyId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await upsertBillingSettings({
      actorUserId: actor.id,
      companyId: targetCompanyId,
      toRecipients: parsed.data.toRecipients,
      ccRecipients: parsed.data.ccRecipients,
      defaultBodyFooter: parsed.data.defaultBodyFooter ?? null,
      submissionInstructions: parsed.data.submissionInstructions ?? null,
      overdueBannerEnabled: parsed.data.overdueBannerEnabled,
      expectedSubmissionCutoffTime: parsed.data.expectedSubmissionCutoffTime ?? null,
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Unable to save billing settings" }, { status: 500 });
  }
}

