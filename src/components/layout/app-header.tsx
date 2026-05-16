import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { AsanaHeaderStatus } from "@/components/integrations/asana-header-status";
import { TeamStatusHeaderIndicator } from "@/components/team-status/header-indicator";
import { cn } from "@/lib/utils/cn";

type NavItem = { href: string; label: string };

type AppHeaderProps = {
  appHomeHref: string;
  navItems: NavItem[];
  timesheetItems: NavItem[];
  canSeeAdmin: boolean;
  integration: {
    provider: "asana" | "jira" | "monday";
    connected: boolean;
    integrationOptional: boolean;
    lastSyncLabel: string;
    lastSyncedAtIso: string | null;
    timezone: string;
  };
};

function NavLink({ href, label }: NavItem) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800/80 hover:text-zinc-100"
    >
      {label}
    </Link>
  );
}

export function AppHeader({
  appHomeHref,
  navItems,
  timesheetItems,
  canSeeAdmin,
  integration,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href={appHomeHref} className="shrink-0 text-sm font-semibold tracking-tight text-indigo-300 sm:text-base">
          SaaSTimeTrack
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex" aria-label="Main">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
          <details className="group relative">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-zinc-300 transition",
                "hover:bg-zinc-800/80 hover:text-zinc-100",
                "[&::-webkit-details-marker]:hidden",
              )}
            >
              Timesheet
              <span className="text-[10px] text-zinc-500 transition group-open:rotate-180">▾</span>
            </summary>
            <div className="absolute left-0 top-[calc(100%+0.35rem)] z-30 min-w-44 rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-xl">
              {timesheetItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <TeamStatusHeaderIndicator variant="compact" />
          <AsanaHeaderStatus
            variant="compact"
            provider={integration.provider}
            connected={integration.connected}
            integrationOptional={integration.integrationOptional}
            lastSyncLabel={integration.lastSyncLabel}
            lastSyncedAtIso={integration.lastSyncedAtIso}
            timezone={integration.timezone}
          />
          <div className="group relative">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
            <div className="invisible absolute right-0 top-[calc(100%+0.35rem)] z-30 min-w-48 rounded-lg border border-zinc-800 bg-zinc-950 p-1 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 md:hidden">Menu</p>
              <div className="flex flex-col md:hidden">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    {item.label}
                  </Link>
                ))}
                {timesheetItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <Link href="/settings/profile" className="block rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                Profile
              </Link>
              <Link href="/settings/integrations" className="block rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                Integrations
              </Link>
              {canSeeAdmin ? (
                <>
                  <Link href="/admin/billing/settings" className="block rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                    Billing settings
                  </Link>
                  <Link href="/admin/billing/submissions" className="block rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                    Billing submissions
                  </Link>
                  <Link
                    href="/reports/developer-effectiveness"
                    className="block rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    AI effectiveness
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
