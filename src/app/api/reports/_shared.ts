import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries } from "@/lib/auth/rbac";

export async function requireReportUser() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, response: null };
}

/** Admin intelligence routes: company_admin + super_admin only (MVP). */
export async function requireDeveloperEffectivenessAdmin() {
  const { user, response } = await requireReportUser();
  if (!user) return { user: null, response: response! };
  if (!canReviewEntries(user.role)) {
    return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}

export function toServerErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "Forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (error instanceof Error && error.message === "Not found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (error instanceof Error && (error.message.includes("required") || error.message.includes("Invalid"))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Failed to load report data" }, { status: 500 });
}
