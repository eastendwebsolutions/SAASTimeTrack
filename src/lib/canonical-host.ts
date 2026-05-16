import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const CANONICAL_PRODUCTION_HOST = "whosaas.com";

/** 308 redirect to https://whosaas.com when request hits a legacy or alternate host in production. */
export function canonicalHostRedirect(req: NextRequest): NextResponse | null {
  if (process.env.VERCEL_ENV !== "production") {
    return null;
  }

  const host = req.nextUrl.hostname.toLowerCase();
  if (host === CANONICAL_PRODUCTION_HOST) {
    return null;
  }

  const destination = new URL(req.nextUrl);
  destination.protocol = "https:";
  destination.hostname = CANONICAL_PRODUCTION_HOST;
  destination.port = "";

  return NextResponse.redirect(destination, 308);
}
