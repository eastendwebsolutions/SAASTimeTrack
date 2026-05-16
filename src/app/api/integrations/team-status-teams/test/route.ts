import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canManageCompanySettings } from "@/lib/auth/rbac";
import { sendTeamStatusTeamsChannelTest } from "@/lib/services/team-status/teams-channel-notify";

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCompanySettings(user.role)) {
    return NextResponse.json({ error: "Company admin access required" }, { status: 403 });
  }

  const result = await sendTeamStatusTeamsChannelTest(user.companyId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: "Test message accepted by the delivery provider.",
    deliveryMethod: result.deliveryMethod,
    destinationHint: result.destinationHint,
    providerMessageId: result.providerMessageId,
    teamsNote: result.teamsNote,
  });
}
