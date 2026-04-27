import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { userHasAnyIntegrationConnectionByClerkUserId } from "@/lib/integrations/connection-gate";

const isProtectedRoute = createRouteMatcher([
  "/time(.*)",
  "/timesheet(.*)",
  "/dashboard(.*)",
  "/billing(.*)",
  "/reports(.*)",
  "/admin(.*)",
  "/poker-planning(.*)",
  "/settings(.*)",
  "/welcome/integration(.*)",
  "/api/(.*)",
]);

const requiresIntegrationSetup = createRouteMatcher([
  "/time(.*)",
  "/timesheet(.*)",
  "/dashboard(.*)",
  "/billing(.*)",
  "/reports(.*)",
  "/admin(.*)",
  "/poker-planning(.*)",
  "/settings(.*)",
]);

function isIntegrationOAuthBypass(pathname: string): boolean {
  if (pathname === "/welcome/integration" || pathname.startsWith("/welcome/integration/")) {
    return true;
  }

  const oauthPaths = new Set([
    "/api/asana/connect/url",
    "/api/asana/callback",
    "/api/jira/connect/url",
    "/api/jira/callback",
    "/api/monday/connect/url",
    "/api/monday/callback",
    "/api/onboarding/bootstrap",
  ]);

  return oauthPaths.has(pathname);
}

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) {
    return NextResponse.next();
  }

  await auth.protect();

  const pathname = req.nextUrl.pathname;
  if (isIntegrationOAuthBypass(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!requiresIntegrationSetup(req)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.next();
  }

  const hasIntegration = await userHasAnyIntegrationConnectionByClerkUserId(userId);
  if (!hasIntegration) {
    return NextResponse.redirect(new URL("/welcome/integration", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
