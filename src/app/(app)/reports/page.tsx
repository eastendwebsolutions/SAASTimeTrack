import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ReportsLandingPage() {
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
      </div>
    </section>
  );
}
