import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { canonicalHostRedirect } from "./canonical-host";

describe("canonicalHostRedirect", () => {
  afterEach(() => {
    delete process.env.VERCEL_ENV;
  });

  it("does not redirect outside production", () => {
    process.env.VERCEL_ENV = "preview";
    const req = new NextRequest("https://saastimetrack.vercel.app/dashboard");
    expect(canonicalHostRedirect(req)).toBeNull();
  });

  it("redirects legacy vercel.app host to whosaas.com in production", () => {
    process.env.VERCEL_ENV = "production";
    const req = new NextRequest("https://saastimetrack.vercel.app/settings/integrations?x=1");
    const res = canonicalHostRedirect(req);
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://whosaas.com/settings/integrations?x=1");
  });

  it("redirects www to apex", () => {
    process.env.VERCEL_ENV = "production";
    const req = new NextRequest("https://www.whosaas.com/sign-in");
    const res = canonicalHostRedirect(req);
    expect(res?.headers.get("location")).toBe("https://whosaas.com/sign-in");
  });

  it("leaves canonical host unchanged", () => {
    process.env.VERCEL_ENV = "production";
    const req = new NextRequest("https://whosaas.com/dashboard");
    expect(canonicalHostRedirect(req)).toBeNull();
  });
});
