import { getEnv } from "@/lib/env";

const ATLASSIAN_AUTH_BASE = "https://auth.atlassian.com";

type JiraEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function getJiraEnv(): JiraEnv {
  const env = getEnv();
  const clientId = env.JIRA_CLIENT_ID;
  const clientSecret = env.JIRA_CLIENT_SECRET;
  const redirectUri = env.JIRA_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Jira OAuth env is not fully configured.");
  }
  return { clientId, clientSecret, redirectUri };
}

export type JiraTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type JiraAccessibleResource = {
  id: string;
  url: string;
  name: string;
  scopes: string[];
};

export type JiraMeIdentity = {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
};

export function getJiraAuthorizationUrl(state: string) {
  const env = getJiraEnv();
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: env.clientId,
    scope: "read:jira-work read:jira-user offline_access",
    redirect_uri: env.redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${ATLASSIAN_AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeJiraCode(code: string) {
  const env = getJiraEnv();
  const response = await fetch(`${ATLASSIAN_AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code,
      redirect_uri: env.redirectUri,
    }),
  });
  if (!response.ok) {
    const failureBody = await response.text();
    throw new Error(`Failed to exchange Jira code (${response.status}): ${failureBody}`);
  }
  return response.json() as Promise<JiraTokenResponse>;
}

export async function fetchJiraAccessibleResources(accessToken: string) {
  const response = await fetch(`${ATLASSIAN_AUTH_BASE}/oauth/token/accessible-resources`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Jira accessible resources (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<JiraAccessibleResource[]>;
}

export async function jiraRequest<T>(cloudId: string, path: string, accessToken: string) {
  const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Jira API failed with ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchJiraMe(cloudId: string, accessToken: string): Promise<JiraMeIdentity> {
  const me = await jiraRequest<{ accountId: string; displayName: string; emailAddress?: string }>(
    cloudId,
    "/myself",
    accessToken,
  );
  return {
    accountId: me.accountId,
    displayName: me.displayName,
    emailAddress: me.emailAddress?.trim() || null,
  };
}
