import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PokerHistoryList } from "@/components/poker-planning/poker-history-list";

export default function PokerPlanningHistoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Poker Session History</h1>
        <Link className="rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700" href="/poker-planning">
          Back to Sessions
        </Link>
      </div>
      <Card className="p-5">
        <PokerHistoryList />
      </Card>
    </div>
  );
}
