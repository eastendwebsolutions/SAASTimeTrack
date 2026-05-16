import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getWorkspaceRosterForCompanyAdmin } from "@/lib/services/admin-workspace-roster";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "company_admin") {
    return NextResponse.json({ error: "Company admin access required" }, { status: 403 });
  }

  try {
    const roster = await getWorkspaceRosterForCompanyAdmin({
      id: user.id,
      companyId: user.companyId,
      role: user.role,
    });
    return NextResponse.json(roster);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load workspace roster";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
