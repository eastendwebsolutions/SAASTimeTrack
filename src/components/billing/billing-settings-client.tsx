"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CompanyOption = { id: string; name: string };

type SettingsResponse = {
  settings: null | {
    companyId: string;
    toRecipientsJson: string[];
    ccRecipientsJson: string[];
    defaultBodyFooter: string | null;
    submissionInstructions: string | null;
    overdueBannerEnabled: boolean;
    expectedSubmissionCutoffTime: string | null;
  };
  availableCompanies: CompanyOption[];
};

export function BillingSettingsClient({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [companyId, setCompanyId] = useState<string>("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [toRecipients, setToRecipients] = useState("");
  const [ccRecipients, setCcRecipients] = useState("");
  const [footer, setFooter] = useState("");
  const [instructions, setInstructions] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [overdueEnabled, setOverdueEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(targetCompanyId?: string) {
    const query = targetCompanyId ? `?companyId=${targetCompanyId}` : "";
    const res = await fetch(`/api/admin/billing/settings${query}`);
    const json = (await res.json()) as SettingsResponse;
    if (!res.ok) {
      setError("Unable to load billing settings.");
      return;
    }
    setCompanies(json.availableCompanies ?? []);
    const activeCompanyId = targetCompanyId ?? json.settings?.companyId ?? json.availableCompanies?.[0]?.id ?? "";
    setCompanyId(activeCompanyId);
    setToRecipients((json.settings?.toRecipientsJson ?? []).join(", "));
    setCcRecipients((json.settings?.ccRecipientsJson ?? []).join(", "));
    setFooter(json.settings?.defaultBodyFooter ?? "");
    setInstructions(json.settings?.submissionInstructions ?? "");
    setOverdueEnabled(json.settings?.overdueBannerEnabled ?? true);
    setCutoff(json.settings?.expectedSubmissionCutoffTime ?? "");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function save() {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    const payload = {
      companyId,
      toRecipients: toRecipients
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      ccRecipients: ccRecipients
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      defaultBodyFooter: footer || null,
      submissionInstructions: instructions || null,
      overdueBannerEnabled: overdueEnabled,
      expectedSubmissionCutoffTime: cutoff || null,
    };

    const res = await fetch("/api/admin/billing/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to save billing settings.");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing Settings</h1>
      {error ? <Card className="border-rose-600/50 bg-rose-900/20 p-4 text-rose-200">{error}</Card> : null}
      <Card className="space-y-4 p-5">
        {isSuperAdmin ? (
          <label className="space-y-1 text-sm text-zinc-300">
            Company
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm"
              value={companyId}
              onChange={(event) => {
                const next = event.target.value;
                setCompanyId(next);
                void load(next);
              }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="space-y-1 text-sm text-zinc-300">
          TO Recipients (comma separated)
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={toRecipients} onChange={(e) => setToRecipients(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          CC Recipients (comma separated)
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={ccRecipients} onChange={(e) => setCcRecipients(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          Submission instructions
          <textarea className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          Default email footer
          <textarea className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" rows={3} value={footer} onChange={(e) => setFooter(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          Expected submission cutoff (HH:mm)
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={overdueEnabled} onChange={(e) => setOverdueEnabled(e.target.checked)} />
          Show overdue banners
        </label>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Billing Settings"}
        </Button>
      </Card>
    </div>
  );
}

