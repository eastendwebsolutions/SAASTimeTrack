"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type AdminReviewTab = {
  id: string;
  label: string;
  count?: number;
};

type Props = {
  title?: string;
  tabs: AdminReviewTab[];
  defaultTab: string;
  panels: Record<string, ReactNode>;
};

export function AdminReviewTabs({ title, tabs, defaultTab, panels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabIds = useMemo(() => new Set(tabs.map((tab) => tab.id)), [tabs]);
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab && tabIds.has(requestedTab) ? requestedTab : defaultTab;

  const selectTab = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === defaultTab) {
        params.delete("tab");
      } else {
        params.set("tab", id);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [defaultTab, pathname, router, searchParams],
  );

  return (
    <div className="space-y-6">
      {title ? <h1 className="text-2xl font-semibold">{title}</h1> : null}
      <div role="tablist" aria-label="Admin sections" className="-mb-px flex flex-wrap gap-1 border-b border-zinc-800">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(tab.id)}
              className={
                isActive
                  ? "border-b-2 border-indigo-400 px-3 py-2 text-sm font-medium text-indigo-200"
                  : "border-b-2 border-transparent px-3 py-2 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }
            >
              {tab.label}
              {tab.count !== undefined ? <span className="ml-1 text-zinc-500">({tab.count})</span> : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="space-y-6">
        {panels[activeTab]}
      </div>
    </div>
  );
}
