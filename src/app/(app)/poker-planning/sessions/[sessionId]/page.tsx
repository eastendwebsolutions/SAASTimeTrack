import { PokerSessionRoom } from "@/components/poker-planning/poker-session-room";

type Params = Promise<{ sessionId: string }>;

export default async function PokerSessionPage({ params }: { params: Params }) {
  const { sessionId } = await params;
  return (
    <div className="space-y-4">
      <PokerSessionRoom sessionId={sessionId} />
    </div>
  );
}
