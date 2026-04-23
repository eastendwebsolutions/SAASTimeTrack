export function isMissingIntegrationSchemaError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("column \"active_integration_provider\" does not exist") ||
    message.includes("column \"provider\" does not exist") ||
    message.includes("relation \"monday_connections\" does not exist") ||
    message.includes("42703") ||
    message.includes("42p01")
  );
}
