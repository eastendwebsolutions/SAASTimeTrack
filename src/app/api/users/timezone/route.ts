import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { timezone?: string };
  const timezone = body.timezone?.trim();
  if (!timezone || !isValidTimeZone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set({ timezone })
    .where(eq(users.id, user.id))
    .returning({ timezone: users.timezone });

  return NextResponse.json({ ok: true, timezone: updated?.timezone ?? timezone });
}
