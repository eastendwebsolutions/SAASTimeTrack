import type { Role } from "@/lib/auth/rbac";

/** Super admins operate the product without a personal Asana/Jira/Monday account. */
export function requiresPersonalIntegration(role: Role) {
  return role !== "super_admin";
}
