import { getEnv } from "@/lib/env";

const MONDAY_AUTH_BASE = "https://auth.monday.com/oauth2";
const MONDAY_API_BASE = "https://api.monday.com/v2";

type MondayEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function getMondayEnv(): MondayEnv {
  const env = getEnv();
  const clientId = env.MONDAY_CLIENT_ID;
  const clientSecret = env.MONDAY_CLIENT_SECRET;
  const redirectUri = env.MONDAY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Monday OAuth env is not fully configured.");
  }
  return { clientId, clientSecret, redirectUri };
}

export type MondayTokenResponse = {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
};

export type MondayMe = {
  id: string;
  name: string;
  email: string | null;
  account: {
    id: string;
    slug: string | null;
    name: string | null;
  } | null;
};

export function getMondayAuthorizationUrl(state: string) {
  const env = getMondayEnv();
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    state,
  });
  return `${MONDAY_AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeMondayCode(code: string) {
  const env = getMondayEnv();
  const response = await fetch(`${MONDAY_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code,
      redirect_uri: env.redirectUri,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to exchange Monday code (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<MondayTokenResponse>;
}

export async function refreshMondayAccessToken(refreshToken: string) {
  const env = getMondayEnv();
  const response = await fetch(`${MONDAY_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      redirect_uri: env.redirectUri,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh Monday token (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<MondayTokenResponse>;
}

export async function mondayGraphqlRequest<T>(query: string, variables: Record<string, unknown>, accessToken: string) {
  const response = await fetch(MONDAY_API_BASE, {
    method: "POST",
    headers: {
      Authorization: accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Monday API failed with ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (data.errors?.length) {
    throw new Error(`Monday API graphql error: ${data.errors.map((e) => e.message ?? "Unknown").join("; ")}`);
  }
  if (!data.data) {
    throw new Error("Monday API returned empty data.");
  }
  return data.data;
}

export async function fetchMondayMe(accessToken: string): Promise<MondayMe> {
  const data = await mondayGraphqlRequest<{
    me: {
      id: string;
      name: string;
      email?: string | null;
      account?: {
        id: string;
        slug?: string | null;
        name?: string | null;
      } | null;
    };
  }>(
    `
      query MondayMe {
        me {
          id
          name
          email
          account {
            id
            slug
            name
          }
        }
      }
    `,
    {},
    accessToken,
  );

  return {
    id: data.me.id,
    name: data.me.name,
    email: data.me.email?.trim() || null,
    account: data.me.account
      ? {
          id: data.me.account.id,
          slug: data.me.account.slug ?? null,
          name: data.me.account.name ?? null,
        }
      : null,
  };
}
