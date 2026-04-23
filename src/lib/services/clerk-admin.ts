import { getEnv } from "@/lib/env";

type ClerkUserPayload = {
  id: string;
  banned?: boolean;
  last_sign_in_at?: number | null;
  last_active_at?: number | null;
};

export type ClerkAccessStatus = {
  clerkUserId: string;
  isAccessRevoked: boolean;
  lastLoginAt: string | null;
  isActiveNow: boolean;
};

const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

function normalizeEpochMs(value: number | null | undefined) {
  if (!value) return null;
  // Clerk fields may arrive as epoch seconds or milliseconds depending on API shape/version.
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

async function clerkApi<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getEnv().CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Clerk API failed (${response.status}) ${path}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function getClerkAccessStatus(clerkUserId: string): Promise<ClerkAccessStatus> {
  const payload = await clerkApi<ClerkUserPayload>(`/users/${clerkUserId}`);
  const lastActiveAt = normalizeEpochMs(payload.last_active_at);
  const lastLoginAt = normalizeEpochMs(payload.last_sign_in_at);
  return {
    clerkUserId,
    isAccessRevoked: Boolean(payload.banned),
    lastLoginAt: lastLoginAt ? new Date(lastLoginAt).toISOString() : null,
    isActiveNow: Boolean(lastActiveAt && Date.now() - lastActiveAt <= ACTIVE_WINDOW_MS && !payload.banned),
  };
}

export async function setClerkAccessEnabled(clerkUserId: string, enabled: boolean) {
  await clerkApi(`/users/${clerkUserId}/${enabled ? "unban" : "ban"}`, { method: "POST" });
}
