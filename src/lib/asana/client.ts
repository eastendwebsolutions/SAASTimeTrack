import { getEnv } from "@/lib/env";

const ASANA_BASE = "https://app.asana.com/api/1.0";

export async function asanaFetch<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${ASANA_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const failureBody = await response.text();
    throw new Error(`Asana API failed with ${response.status} for ${path}: ${failureBody}`);
  }

  return response.json() as Promise<T>;
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

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    data?: { id: string };
  }>;
}
