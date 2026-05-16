import { getEnv } from "@/lib/env";

export function isTeamStatusTeamsEmailDeliveryReady() {
  try {
    const env = getEnv();
    return Boolean(env.RESEND_API_KEY && (env.TEAM_STATUS_FROM_EMAIL ?? env.BILLING_FROM_EMAIL));
  } catch {
    return false;
  }
}
