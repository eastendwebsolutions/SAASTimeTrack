import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { listTeamStatusFeed, type TeamStatusEventType } from "@/lib/services/team-status";

function parseCsv(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEventTypes(value: string | null): TeamStatusEventType[] {
  const items = parseCsv(value);
  return items.filter(
    (item): item is TeamStatusEventType =>
      item === "DAY_IN" || item === "DAY_OUT" || item === "BREAK_IN" || item === "BREAK_OUT",
  );
}

export async function GET(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get("company_id");
  const userIds = parseCsv(request.nextUrl.searchParams.get("user_ids"));
  const eventTypes = parseEventTypes(request.nextUrl.searchParams.get("event_types"));
  const startDate = request.nextUrl.searchParams.get("start_date");
  const endDate = request.nextUrl.searchParams.get("end_date");

  const data = await listTeamStatusFeed({
    actor: { role: user.role, companyId: user.companyId, userId: user.id },
    companyId,
    userIds: userIds.length ? userIds : undefined,
    eventTypes: eventTypes.length ? eventTypes : undefined,
    startDate,
    endDate,
    defaultTodayYesterday: !startDate && !endDate,
  });

  return NextResponse.json(data);
}
