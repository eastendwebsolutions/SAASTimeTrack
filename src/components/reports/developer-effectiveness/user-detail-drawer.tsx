"use client";

import { Card } from "@/components/ui/card";

export type DeveloperEffectivenessUserDetailPayload = {
  user: {
    displayName: string;
    deliveryScore: number;
    aiAdoptionScore: number;
  };
  comparison: { teamAvgDelivery: number };
  strengths: string[];
  weaknesses: string[];
};

type Props = {
  userId: string | null;
  onClose: () => void;
  isLoading: boolean;
  data: DeveloperEffectivenessUserDetailPayload | undefined;
};

export function DeveloperEffectivenessUserDetailDrawer({ userId, onClose, isLoading, data }: Props) {
  if (!userId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="de-user-drawer-title"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id="de-user-drawer-title" className="text-xl font-semibold text-zinc-100">
            Developer intelligence
          </h3>
          <button
            type="button"
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {!isLoading && data ? (
          <div className="mt-6 space-y-4 text-sm text-zinc-300">
            <p className="text-lg text-zinc-100">{data.user.displayName}</p>
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-xs text-zinc-500">Delivery score</p>
                <p className="text-2xl font-semibold text-zinc-50">{data.user.deliveryScore}</p>
              </Card>
              <Card className="border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-xs text-zinc-500">AI adoption</p>
                <p className="text-2xl font-semibold text-zinc-50">{data.user.aiAdoptionScore}</p>
              </Card>
            </div>
            <p>
              vs team avg delivery:{" "}
              <span className="text-zinc-100">{Math.round(data.comparison.teamAvgDelivery * 10) / 10}</span>
            </p>
            <ul className="list-disc space-y-1 pl-5 text-zinc-400">
              {data.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <ul className="list-disc space-y-1 pl-5 text-zinc-500">
              {data.weaknesses.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-8 text-zinc-500">{isLoading ? "Loading…" : "No data."}</p>
        )}
      </div>
    </div>
  );
}
