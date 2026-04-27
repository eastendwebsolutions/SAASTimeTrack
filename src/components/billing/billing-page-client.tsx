"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type BillingCurrentResponse = {
  period: { id: string; label: string };
  latestSubmission: null | {
    id: string;
    subject: string;
    status: "submitted" | "accepted" | "needs_resubmission" | "failed";
    emailStatus: "pending" | "sent" | "failed";
    submissionAttemptNumber: number;
  };
  canSubmit: boolean;
  warning: string | null;
  settings: null | {
    submissionInstructions: string | null;
  };
};

type HistoryRow = {
  id: string;
  subject: string;
  status: string;
  emailStatus: string;
  bodyContent: string | null;
  adminNote: string | null;
  submissionAttemptNumber: number;
  submittedAtUtc: string;
  files: Array<{ id: string; originalFileName: string }>;
};

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_ATTR = ".pdf,.docx,.xlsx,.csv";

export function BillingPageClient({ userRole }: { userRole: string }) {
  const [current, setCurrent] = useState<BillingCurrentResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  async function load() {
    setLoading(true);
    const [currentRes, historyRes] = await Promise.all([fetch("/api/billing/current"), fetch("/api/billing/history")]);
    const currentJson = await currentRes.json();
    const historyJson = await historyRes.json();
    if (!currentRes.ok) {
      setError(currentJson.error ?? "Unable to load billing status");
      setLoading(false);
      return;
    }
    setCurrent(currentJson);
    setHistory(Array.isArray(historyJson) ? historyJson : []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const generatedSubject = useMemo(() => {
    if (!current?.period?.label) return "";
    return `Billing Submission for ${current.period.label}`;
  }, [current?.period?.label]);

  function onFilesSelected(next: FileList | null) {
    if (!next) return;
    const updated = [...files];
    for (const file of Array.from(next)) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} exceeds 10 MB`);
        continue;
      }
      updated.push(file);
    }
    setFiles(updated);
  }

  async function submit() {
    if (!current?.canSubmit || files.length === 0) return;
    setSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.set("bodyContent", message);
    for (const file of files) {
      formData.append("files", file);
    }
    const res = await fetch("/api/billing/submissions", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Submission failed");
      setSubmitting(false);
      return;
    }

    setFiles([]);
    setMessage("");
    await load();
    setSubmitting(false);
  }

  function badgeClass(status: string) {
    if (status === "accepted") return "bg-emerald-500/20 text-emerald-300";
    if (status === "submitted") return "bg-sky-500/20 text-sky-300";
    if (status === "needs_resubmission") return "bg-amber-500/20 text-amber-300";
    return "bg-rose-500/20 text-rose-300";
  }

  if (loading) return <p className="text-zinc-400">Loading billing data...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Billing</h1>
        {userRole !== "user" ? <p className="text-xs text-zinc-500">Admins can review submissions in Admin area.</p> : null}
      </div>

      {current?.warning ? (
        <Card className="border-amber-600/50 bg-amber-900/20 p-4 text-amber-200">{current.warning}</Card>
      ) : null}
      {error ? <Card className="border-rose-600/50 bg-rose-900/20 p-4 text-rose-200">{error}</Card> : null}

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-medium">Current Billing Status</h2>
        <p className="text-sm text-zinc-300">Billing Period: {current?.period?.label ?? "N/A"}</p>
        <p className="text-sm text-zinc-300">
          Status:{" "}
          <span className={`rounded px-2 py-1 text-xs capitalize ${badgeClass(current?.latestSubmission?.status ?? "not_submitted")}`}>
            {current?.latestSubmission?.status ?? "not submitted"}
          </span>
        </p>
        {current?.settings?.submissionInstructions ? (
          <p className="text-sm text-zinc-400">{current.settings.submissionInstructions}</p>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-medium">Upload Submission</h2>
        <label className="space-y-1 text-sm text-zinc-300">
          Subject (auto-generated)
          <input value={generatedSubject} disabled className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200" />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          Optional message
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <div className="rounded border border-dashed border-zinc-700 p-4">
          <p className="mb-2 text-sm text-zinc-300">Upload files (PDF, DOCX, XLSX, CSV | max 10MB each)</p>
          <input type="file" multiple accept={ACCEPT_ATTR} onChange={(event) => onFilesSelected(event.target.files)} />
          {files.length ? (
            <ul className="mt-3 space-y-1 text-sm text-zinc-300">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between">
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="text-xs text-rose-300 hover:text-rose-200"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button disabled={!current?.canSubmit || !files.length || submitting} onClick={submit}>
          {submitting ? "Submitting..." : "Submit Billing Package"}
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-medium">Submission History</h2>
        {history.length === 0 ? <p className="text-sm text-zinc-500">No submissions yet.</p> : null}
        <div className="space-y-3">
          {history.map((row) => (
            <div key={row.id} className="rounded border border-zinc-800 p-3">
              <p className="text-sm font-medium text-zinc-100">{row.subject}</p>
              <p className="text-xs text-zinc-400">
                Attempt {row.submissionAttemptNumber} • {new Date(row.submittedAtUtc).toLocaleString("en-US")}
              </p>
              <div className="mt-1 flex gap-2 text-xs">
                <span className={`rounded px-2 py-1 capitalize ${badgeClass(row.status)}`}>{row.status.replaceAll("_", " ")}</span>
                <span className="rounded bg-zinc-800 px-2 py-1 capitalize text-zinc-300">Email: {row.emailStatus}</span>
              </div>
              {row.adminNote ? <p className="mt-2 text-sm text-amber-200">Admin Note: {row.adminNote}</p> : null}
              {row.bodyContent ? <p className="mt-2 text-sm text-zinc-300">Message: {row.bodyContent}</p> : null}
              {row.files.length ? (
                <p className="mt-2 text-xs text-zinc-400">Files: {row.files.map((file) => file.originalFileName).join(", ")}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

