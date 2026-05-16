import { NextResponse } from "next/server";

const PRODUCTION_ORIGINS = [
  "https://whosaas.com",
  "https://www.whosaas.com",
  "https://saastimetrack.vercel.app",
];

type ClerkDomain = {
  id: string;
  name: string;
  is_satellite?: boolean;
  dns_cname_targets?: Array<{ host: string; value: string; required?: boolean }>;
};

async function clerkApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!clerkSecretKey) {
    throw new Error("CLERK_SECRET_KEY is not set");
  }

  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${clerkSecretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Clerk API ${response.status} ${path}: ${body}`);
  }
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const domainsPayload = await clerkApi<{ data?: ClerkDomain[] } | ClerkDomain[]>("/domains");
    const existingDomains = Array.isArray(domainsPayload)
      ? domainsPayload
      : (domainsPayload.data ?? []);

    const added: string[] = [];
    for (const name of ["whosaas.com", "www.whosaas.com"]) {
      if (existingDomains.some((domain) => domain.name === name)) continue;
      await clerkApi("/domains", {
        method: "POST",
        body: JSON.stringify({ name, is_satellite: true }),
      });
      added.push(name);
    }

    await clerkApi("/instance", {
      method: "PATCH",
      body: JSON.stringify({
        allowed_origins: PRODUCTION_ORIGINS,
      }),
    });

    const refreshedPayload = await clerkApi<{ data?: ClerkDomain[] } | ClerkDomain[]>("/domains");
    const domains = Array.isArray(refreshedPayload)
      ? refreshedPayload
      : (refreshedPayload.data ?? []);

    return NextResponse.json({
      ok: true,
      added,
      allowed_origins: PRODUCTION_ORIGINS,
      asana_redirect_uri: process.env.ASANA_REDIRECT_URI ?? null,
      domains: domains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        is_satellite: domain.is_satellite,
        dns_cname_targets: domain.dns_cname_targets,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
