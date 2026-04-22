import { PokerSessionHistoryDetail } from "@/components/poker-planning/poker-session-history-detail";

type Params = Promise<{ sessionId: string }>;

export default async function PokerSessionHistoryDetailPage({ params }: { params: Params }) {
  const { sessionId } = await params;
  return <PokerSessionHistoryDetail sessionId={sessionId} />;
}
