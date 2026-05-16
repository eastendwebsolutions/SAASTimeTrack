import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries } from "@/lib/auth/rbac";

export default async function ReportsLandingPage() {
  const user = await getOrCreateCurrentUser();
  const showEffectiveness = user && canReviewEntries(user.role);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-zinc-100">Reports</h1>
        <p className="mt-2 text-sm text-zinc-400">Analytics and retrospectives for planning vs actual execution.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg font-medium text-zinc-100">Retrospective Productivity Report</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Compare estimated effort and points against actual logged time across sprint or date-range periods.
          </p>
          <div className="mt-4">
            <Link href="/reports/retrospective-productivity">
              <Button>Open report</Button>
            </Link>
          </div>
        </Card>

        {showEffectiveness ? (
          <Card className="border-indigo-500/20 bg-gradient-to-br from-zinc-900/90 to-zinc-950 p-5">
            <h2 className="text-lg font-medium text-zinc-100">AI Developer Effectiveness</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Engineering intelligence: AI adoption, delivery scores, sprint signals, and timesheet discipline—admin
              visibility only.
            </p>
            <div className="mt-4">
              <Link href="/reports/developer-effectiveness">
                <Button>Open report</Button>
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
