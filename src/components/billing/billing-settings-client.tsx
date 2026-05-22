"use client";

import { useEffect, useMemo, useState } from "react";
import { EmailRecipientTags } from "@/components/billing/email-recipient-tags";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildSubmissionEmailRecipients } from "@/lib/services/billing/email-recipients";

type CompanyOption = { id: string; name: string; workspaceId: string | null; companyIds: string[] };

type SettingsResponse = {
  settings: null | {
    companyId: string;
    toRecipientsJson: string[];
    ccRecipientsJson: string[];
    bccRecipientsJson: string[];
    defaultBodyFooter: string | null;
    submissionInstructions: string | null;
    overdueBannerEnabled: boolean;
    expectedSubmissionCutoffTime: string | null;
  };
  availableCompanies: CompanyOption[];
};

export function BillingSettingsClient({
  isSuperAdmin,
  currentUserEmail,
}: {
  isSuperAdmin: boolean;
  currentUserEmail: string;
}) {
  const [companyId, setCompanyId] = useState<string>("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [toRecipients, setToRecipients] = useState("");
  const [ccRecipients, setCcRecipients] = useState("");
  const [bccRecipients, setBccRecipients] = useState("");
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
    setBccRecipients((json.settings?.bccRecipientsJson ?? []).join(", "));
    setFooter(json.settings?.defaultBodyFooter ?? "");
    setInstructions(json.settings?.submissionInstructions ?? "");
    setOverdueEnabled(json.settings?.overdueBannerEnabled ?? true);
    setCutoff(json.settings?.expectedSubmissionCutoffTime ?? "");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const emailPreview = useMemo(() => {
    const split = (value: string) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return buildSubmissionEmailRecipients({
      submitterEmail: currentUserEmail,
      toRecipients: split(toRecipients),
      ccRecipients: split(ccRecipients),
      bccRecipients: split(bccRecipients),
    });
  }, [bccRecipients, ccRecipients, currentUserEmail, toRecipients]);

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
      bccRecipients: bccRecipients
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
      <h1 className="text-2xl font-semibold">Company Billing Settings</h1>
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
          TO recipients (comma separated)
          <p className="text-xs text-zinc-500">Invoice emails are sent to these addresses. Bill To on the invoice uses this list.</p>
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={toRecipients} onChange={(e) => setToRecipients(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          CC recipients (comma separated)
          <p className="text-xs text-zinc-500">
            The person submitting an invoice is always CC&apos;d at their login email. When you submit, that is:
          </p>
          <div className="flex flex-wrap gap-2 py-1">
            <span className="inline-flex items-center rounded-full border border-indigo-500/50 bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200">
              {currentUserEmail} — invoice submitter (always included)
            </span>
          </div>
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={ccRecipients} onChange={(e) => setCcRecipients(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          BCC recipients (comma separated)
          <p className="text-xs text-zinc-500">Optional. These addresses receive a blind copy of each invoice submission.</p>
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={bccRecipients} onChange={(e) => setBccRecipients(e.target.value)} />
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

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="mb-3 text-sm font-medium text-zinc-200">Email preview (per submission)</p>
          <EmailRecipientTags
            to={emailPreview.to}
            cc={emailPreview.cc}
            bcc={emailPreview.bcc}
            submitterEmail={currentUserEmail}
          />
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Billing Settings"}
        </Button>
      </Card>
    </div>
  );
}

