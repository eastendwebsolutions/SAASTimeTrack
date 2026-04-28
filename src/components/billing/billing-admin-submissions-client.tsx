"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SubmissionRow = {
  id: string;
  companyId: string;
  userId: string;
  subject: string;
  status: "submitted" | "accepted" | "needs_resubmission" | "failed";
  emailStatus: "pending" | "sent" | "failed";
  submissionAttemptNumber: number;
  submittedAtUtc: string;
  bodyContent: string | null;
  adminNote: string | null;
  files: Array<{ id: string; originalFileName: string }>;
};
type CompanyOption = { id: string; name: string };

export function BillingAdminSubmissionsClient({ isSuperAdmin, companyId }: { isSuperAdmin: boolean; companyId: string }) {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [companyFilter, setCompanyFilter] = useState(companyId);
  const [selected, setSelected] = useState<SubmissionRow | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (companyFilter) params.set("companyId", companyFilter);
    const res = await fetch(`/api/admin/billing/submissions?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to load billing submissions");
      return;
    }
    setRows(Array.isArray(json) ? json : []);
  }, [companyFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    async function loadCompanyOptions() {
      const res = await fetch("/api/admin/billing/settings");
      const json = await res.json();
      if (!res.ok) return;
      setCompanyOptions((json.availableCompanies as CompanyOption[] | undefined) ?? []);
    }
    void loadCompanyOptions();
  }, [isSuperAdmin]);

  async function applyStatus(status: "accepted" | "needs_resubmission") {
    if (!selected) return;
    const res = await fetch(`/api/admin/billing/submissions/${selected.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        adminNote,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to update status");
      return;
    }
    setSelected(null);
    setAdminNote("");
    await load();
  }

  const selectedFilesUrlBase = useMemo(() => {
    if (!selected) return "";
    return `/api/admin/billing/submissions/${selected.id}/files`;
  }, [selected]);

  function badgeClass(status: string) {
    if (status === "accepted") return "bg-emerald-500/20 text-emerald-300";
    if (status === "submitted") return "bg-sky-500/20 text-sky-300";
    if (status === "needs_resubmission") return "bg-amber-500/20 text-amber-300";
    return "bg-rose-500/20 text-rose-300";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing Submissions</h1>
      {error ? <Card className="border-rose-600/50 bg-rose-900/20 p-4 text-rose-200">{error}</Card> : null}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        {isSuperAdmin ? (
          <label className="text-sm text-zinc-300">
            Workspace
            <select className="ml-2 rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm text-zinc-300">
          Status
          <select className="ml-2 rounded border border-zinc-700 bg-zinc-950 p-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="accepted">Accepted</option>
            <option value="needs_resubmission">Needs Resubmission</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/70 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Attempt</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-800">
                <td className="px-3 py-2 text-zinc-300">{new Date(row.submittedAtUtc).toLocaleString("en-US")}</td>
                <td className="px-3 py-2 text-zinc-100">{row.subject}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-1 text-xs capitalize ${badgeClass(row.status)}`}>{row.status.replaceAll("_", " ")}</span>
                </td>
                <td className="px-3 py-2 capitalize text-zinc-300">{row.emailStatus}</td>
                <td className="px-3 py-2 text-zinc-300">{row.submissionAttemptNumber}</td>
                <td className="px-3 py-2">
                  <Button variant="secondary" onClick={() => setSelected(row)}>
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selected ? (
        <Card className="space-y-3 border-indigo-700/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Submission Detail</h2>
            <button className="text-sm text-zinc-400 hover:text-zinc-200" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="text-sm text-zinc-300">{selected.subject}</p>
          {selected.bodyContent ? <p className="text-sm text-zinc-400">User Message: {selected.bodyContent}</p> : null}
          {selected.adminNote ? <p className="text-sm text-amber-300">Admin Note: {selected.adminNote}</p> : null}
          <p className="text-xs text-zinc-500">
            Files
          </p>
          {selected.files.length ? (
            <ul className="space-y-1 text-sm text-zinc-300">
              {selected.files.map((file) => (
                <li key={file.id}>
                  <a className="text-indigo-300 hover:text-indigo-200" href={`${selectedFilesUrlBase}/${file.id}`}>
                    {file.originalFileName}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">No files found for this submission.</p>
          )}
          <textarea
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            rows={3}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
            placeholder="Admin note / correction request"
          />
          <div className="flex gap-2">
            <Button onClick={() => void applyStatus("accepted")}>Mark Accepted</Button>
            <Button variant="danger" onClick={() => void applyStatus("needs_resubmission")}>
              Needs Resubmission
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

