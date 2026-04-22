import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canManagePokerPlanning } from "@/lib/auth/rbac";

export async function requirePokerUser() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requirePokerAdmin() {
  const user = await requirePokerUser();
  if (!canManagePokerPlanning(user.role)) {
    throw new Error("Forbidden");
  }
  return user;
}
