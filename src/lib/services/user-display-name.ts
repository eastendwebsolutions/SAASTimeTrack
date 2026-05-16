/** Clerk default username when no profile name is set (e.g. user_abc123). */
const CLERK_OPAQUE_USER_PATTERN = /^user_[A-Za-z0-9]+$/;

export function looksLikeClerkOpaqueId(value: string) {
  return CLERK_OPAQUE_USER_PATTERN.test(value.trim());
}

export function displayNameFromEmail(email: string) {
  const raw = email.split("@")[0] ?? email;
  return raw
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
}

/** Prefer DB name, then a human-readable Clerk name, then email-derived name — never show raw Clerk user ids. */
export function resolveUserDisplayName(input: {
  email: string;
  dbDisplayName?: string | null;
  clerkDisplayName?: string | null;
}) {
  const dbName = input.dbDisplayName?.trim();
  if (dbName && !looksLikeClerkOpaqueId(dbName)) return dbName;

  const clerkName = input.clerkDisplayName?.trim();
  if (clerkName && !looksLikeClerkOpaqueId(clerkName)) return clerkName;

  return displayNameFromEmail(input.email);
}

export function initialsFromDisplayName(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "U";
}
