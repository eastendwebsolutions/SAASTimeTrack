import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";

/** Run a projects query that uses `projects.provider`; retry without that filter if the column is not migrated yet. */
export async function withProjectsProviderColumnFallback<T>(
  withProviderColumn: () => Promise<T>,
  legacyWithoutProviderColumn: () => Promise<T>,
): Promise<T> {
  try {
    return await withProviderColumn();
  } catch (error) {
    if (!isMissingIntegrationSchemaError(error)) throw error;
    return await legacyWithoutProviderColumn();
  }
}
