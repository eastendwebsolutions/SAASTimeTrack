export function isMissingIntegrationSchemaError(error: unknown) {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "object") {
      const maybeCode = (current as { code?: unknown }).code;
      if (maybeCode === "42703" || maybeCode === "42P01") return true;
    }
    if (current instanceof Error) {
      const message = current.message.toLowerCase();
      if (
        message.includes("column \"active_integration_provider\" does not exist") ||
        message.includes("column \"provider\" does not exist") ||
        message.includes("relation \"monday_connections\" does not exist") ||
        message.includes("does not exist") ||
        message.includes("42703") ||
        message.includes("42p01")
      ) {
        return true;
      }
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    break;
  }

  return false;
}
