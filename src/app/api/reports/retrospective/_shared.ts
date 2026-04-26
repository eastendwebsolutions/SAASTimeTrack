import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";

export async function requireReportUser() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, response: null };
}

export function toServerErrorResponse(error: unknown) {
  if (error instanceof Error && (error.message.includes("required") || error.message.includes("Invalid"))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Failed to load report data" }, { status: 500 });
}
