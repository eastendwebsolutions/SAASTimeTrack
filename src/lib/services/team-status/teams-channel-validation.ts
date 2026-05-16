/** Microsoft Teams channel inbound addresses (varies by tenant/region). */
const TEAMS_CHANNEL_EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.(teams\.ms|amer\.teams\.ms|emea\.teams\.ms|apac\.teams\.ms|thread\.tacv2\.teams\.ms)$/i;

export function isTeamsChannelEmail(value: string) {
  return TEAMS_CHANNEL_EMAIL_PATTERN.test(value.trim());
}

export function validateTeamsChannelDestination(method: "email" | "webhook", destination: string) {
  const trimmed = destination.trim();
  if (method === "email") {
    if (!isTeamsChannelEmail(trimmed)) {
      const at = trimmed.indexOf("@");
      if (at <= 0 || at === trimmed.length - 1) {
        throw new Error("Enter a valid Microsoft Teams channel email address.");
      }
      throw new Error(
        "Enter the full channel email from Teams (⋯ → Get email address), e.g. ending in @amer.teams.ms or @thread.tacv2.teams.ms.",
      );
    }
    return trimmed;
  }
  const url = new URL(trimmed);
  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS.");
  }
  return trimmed;
}
