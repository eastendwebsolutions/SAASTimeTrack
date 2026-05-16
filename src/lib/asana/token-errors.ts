export const ASANA_RECONNECT_MESSAGE =
  "Your Asana connection expired. Reconnect Asana in Settings → Integrations.";

export function isAsanaInvalidGrantError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("invalid_grant") || message.includes("refresh_token") && message.includes("invalid");
}

export function formatAsanaTokenErrorForUser(error: unknown) {
  if (isAsanaInvalidGrantError(error)) return ASANA_RECONNECT_MESSAGE;
  if (error instanceof Error) {
    if (error.message === ASANA_RECONNECT_MESSAGE) return error.message;
    if (error.message.includes("Failed to refresh Asana token")) return ASANA_RECONNECT_MESSAGE;
    if (error.message.includes("not connected")) return ASANA_RECONNECT_MESSAGE;
    return error.message;
  }
  return "Failed to load Asana data.";
}
