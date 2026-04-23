import { getEnv } from "@/lib/env";

type ClerkUserPayload = {
  id: string;
  banned?: boolean;
  last_sign_in_at?: number | string | null;
  last_active_at?: number | string | null;
};

type ClerkSessionPayload = {
  id: string;
  status?: string | null;
  last_active_at?: number | string | null;
};

export type ClerkAccessStatus = {
  clerkUserId: string;
  isAccessRevoked: boolean;
  lastLoginAt: string | null;
  isActiveNow: boolean;
};

const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const SESSION_ACTIVE_WINDOW_MS = 10 * 60 * 1000;

function normalizeEpochMs(value: number | string | null | undefined) {
  if (!value) return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return null;
  // Clerk fields may arrive as epoch seconds or milliseconds depending on API shape/version.
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
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
  let sessions: ClerkSessionPayload[] = [];
  try {
    sessions = await clerkApi<ClerkSessionPayload[]>(`/users/${clerkUserId}/sessions`);
  } catch {
    sessions = [];
  }

  const lastActiveAt = normalizeEpochMs(payload.last_active_at);
  const lastLoginAt = normalizeEpochMs(payload.last_sign_in_at);
  const hasActiveSession = sessions.some((session) => {
    if (session.status === "active") return true;
    const sessionLastActive = normalizeEpochMs(session.last_active_at);
    return Boolean(sessionLastActive && Date.now() - sessionLastActive <= SESSION_ACTIVE_WINDOW_MS);
  });
  return {
    clerkUserId,
    isAccessRevoked: Boolean(payload.banned),
    lastLoginAt: lastLoginAt ? new Date(lastLoginAt).toISOString() : null,
    isActiveNow: Boolean(!payload.banned && (hasActiveSession || (lastActiveAt && Date.now() - lastActiveAt <= ACTIVE_WINDOW_MS))),
  };
}

export async function setClerkAccessEnabled(clerkUserId: string, enabled: boolean) {
  await clerkApi(`/users/${clerkUserId}/${enabled ? "unban" : "ban"}`, { method: "POST" });
}
