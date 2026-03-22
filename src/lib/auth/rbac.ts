export type Role = "user" | "company_admin" | "super_admin";

export function canReviewEntries(role: Role) {
  return role === "company_admin" || role === "super_admin";
}

export function canManageCompanySettings(role: Role) {
  return role === "company_admin" || role === "super_admin";
}

export function isSuperAdmin(role: Role) {
  return role === "super_admin";
}
