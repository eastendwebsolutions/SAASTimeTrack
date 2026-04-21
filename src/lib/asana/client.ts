import { getEnv } from "@/lib/env";

const ASANA_BASE = "https://app.asana.com/api/1.0";

export async function asanaRequest<T>(
  path: string,
  accessToken: string,
  init: { method?: "GET" | "PUT" | "POST"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${ASANA_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const failureBody = await response.text();
    throw new Error(`Asana API failed with ${response.status} for ${path}: ${failureBody}`);
  }

  return response.json() as Promise<T>;
}

export async function asanaFetch<T>(path: string, accessToken: string): Promise<T> {
  return asanaRequest<T>(path, accessToken);
}

export function getAsanaAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: getEnv().ASANA_CLIENT_ID,
    redirect_uri: getEnv().ASANA_REDIRECT_URI,
    response_type: "code",
    state,
  });

  return `https://app.asana.com/-/oauth_authorize?${params.toString()}`;
}

export type AsanaTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  data?: { id: string };
};

export async function exchangeAsanaCode(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getEnv().ASANA_CLIENT_ID,
    client_secret: getEnv().ASANA_CLIENT_SECRET,
    redirect_uri: getEnv().ASANA_REDIRECT_URI,
    code,
  });

  const response = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const failureBody = await response.text();
    throw new Error(`Failed to exchange Asana code (${response.status}): ${failureBody}`);
  }

  return response.json() as Promise<AsanaTokenResponse>;
}

export async function refreshAsanaAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getEnv().ASANA_CLIENT_ID,
    client_secret: getEnv().ASANA_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const response = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const failureBody = await response.text();
    throw new Error(`Failed to refresh Asana token (${response.status}): ${failureBody}`);
  }

  return response.json() as Promise<AsanaTokenResponse>;
}

export type AsanaMeIdentity = {
  gid: string;
  name: string | null;
  email: string | null;
};

/** Current user for the given OAuth token (which Asana account is linked). */
export async function fetchAsanaMe(accessToken: string): Promise<AsanaMeIdentity> {
  const { data } = await asanaFetch<{ data: { gid: string; name?: string; email?: string } }>(
    "/users/me?opt_fields=gid,name,email",
    accessToken,
  );
  return {
    gid: data.gid,
    name: data.name ?? null,
    email: data.email?.trim() ? data.email.trim() : null,
  };
}
