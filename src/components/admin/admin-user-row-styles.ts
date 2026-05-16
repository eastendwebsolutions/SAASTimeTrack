import { cn } from "@/lib/utils/cn";

/** Row styling for Admin → Users & permissions lists. */
export function adminUserPermissionsRowClassName(role: string) {
  return cn(
    "p-4 sm:p-5",
    role === "company_admin" &&
      "border-l-2 border-l-indigo-400/80 bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/20",
    role === "super_admin" && "border-l-2 border-l-amber-400/60 bg-amber-500/5 ring-1 ring-inset ring-amber-500/15",
  );
}
