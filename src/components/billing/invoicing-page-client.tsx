"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { EmailRecipientTags } from "@/components/billing/email-recipient-tags";
import { InvoicePreview } from "@/components/billing/invoice-preview";
import { formatInvoiceCurrency, sumInvoiceLineItems } from "@/lib/services/billing/invoice";
import {
  REQUIRED_USER_BILLING_FIELD_LABELS,
  type InvoiceLineItem,
  type UserBillingProfileInput,
  type UserBillingSnapshot,
} from "@/lib/validation/billing";

type BillingCurrentResponse = {
  period: { id: string; label: string };
  selectedPeriodId: string;
  suggestedInvoiceNumber: string | null;
  periodOptions: Array<{
    id: string;
    label: string;
    periodStartDate: string;
    periodEndDate: string;
    latestSubmission: null | {
      id: string;
      subject: string;
      invoiceNumber: string | null;
      status: "submitted" | "accepted" | "needs_resubmission" | "failed";
      emailStatus: "pending" | "sent" | "failed";
      submissionAttemptNumber: number;
    };
    canSubmit: boolean;
    suggestedInvoiceNumber: string | null;
  }>;
  latestSubmission: null | {
    id: string;
    subject: string;
    invoiceNumber: string | null;
    status: "submitted" | "accepted" | "needs_resubmission" | "failed";
    emailStatus: "pending" | "sent" | "failed";
    submissionAttemptNumber: number;
  };
  canSubmit: boolean;
  warning: string | null;
  profileComplete: boolean;
  profile: UserBillingProfileInput | null;
  settings: null | {
    submissionInstructions: string | null;
    defaultBodyFooter: string | null;
  };
  billToRecipients: string[];
  submitterEmail: string;
  emailRecipients: {
    to: string[];
    cc: string[];
    bcc: string[];
  };
};

type HistoryRow = {
  id: string;
  subject: string;
  invoiceNumber: string | null;
  status: string;
  emailStatus: string;
  bodyContent: string | null;
  adminNote: string | null;
  submissionAttemptNumber: number;
  submittedAtUtc: string;
  invoiceLineItemsJson: InvoiceLineItem[] | null;
};

type LineItemDraft = { id: string; description: string; amount: string };

function newLineItem(description = ""): LineItemDraft {
  return { id: crypto.randomUUID(), description, amount: "" };
}

function defaultFirstLineDescription(periodLabel: string | undefined) {
  if (!periodLabel) return "Billing Period: …";
  return `Billing Period: ${periodLabel}`;
}

type PeriodOption = BillingCurrentResponse["periodOptions"][number];

function formatBillingPeriodSubmissionStatus(period: PeriodOption) {
  const status = period.latestSubmission?.status;
  if (!status || status === "failed") return "Pending submission";
  if (status === "submitted" || status === "accepted") return "Submitted";
  if (status === "needs_resubmission") return "Resubmission required";
  return "Pending submission";
}

function formatBillingPeriodOptionLabel(period: PeriodOption, isCurrentWeek: boolean) {
  const parts = [period.label];
  if (isCurrentWeek) parts.push("Current week");
  parts.push(formatBillingPeriodSubmissionStatus(period));
  return parts.join(" · ");
}

function formatPeriodStatusLabel(status: PeriodOption["latestSubmission"]) {
  if (!status) return "Pending submission";
  if (status.status === "submitted" || status.status === "accepted") return "Submitted";
  if (status.status === "needs_resubmission") return "Resubmission required";
  if (status.status === "failed") return "Pending submission";
  return "Pending submission";
}

function periodStatusBadgeClass(status: PeriodOption["latestSubmission"]) {
  if (!status) return "bg-zinc-700/60 text-zinc-200";
  if (status.status === "accepted") return "bg-emerald-500/20 text-emerald-300";
  if (status.status === "submitted") return "bg-sky-500/20 text-sky-300";
  if (status.status === "needs_resubmission") return "bg-amber-500/20 text-amber-300";
  if (status.status === "failed") return "bg-zinc-700/60 text-zinc-200";
  return "bg-zinc-700/60 text-zinc-200";
}

function parseLineItems(items: LineItemDraft[]): InvoiceLineItem[] {
  return items
    .map((item) => ({
      description: item.description.trim(),
      amount: Number(item.amount),
    }))
    .filter((item) => item.description.length > 0 && Number.isFinite(item.amount) && item.amount > 0);
}

function getFormValidationError(invoiceNumber: string, lineItems: LineItemDraft[]) {
  if (!invoiceNumber.trim()) {
    return "Enter an invoice number before previewing.";
  }
  const parsed = parseLineItems(lineItems);
  if (parsed.length === 0) {
    return "Add at least one line item with a description and an amount greater than zero.";
  }
  return null;
}

function getSubmitBlockedReason(current: BillingCurrentResponse | null) {
  if (!current?.profileComplete) {
    return `Complete your user billing information (${REQUIRED_USER_BILLING_FIELD_LABELS.join(", ")}) before submitting.`;
  }
  if (!current.canSubmit) {
    const status = current.latestSubmission?.status;
    if (status === "submitted" || status === "accepted") {
      return "You already submitted an invoice for this billing period. Check Submission History below, or wait until an admin requests a resubmission.";
    }
    return "Invoice submission is not available for the current billing period.";
  }
  return null;
}

export function InvoicingPageClient({ userDisplayName, userEmail }: { userDisplayName: string; userEmail: string }) {
  const [current, setCurrent] = useState<BillingCurrentResponse | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([newLineItem()]);
  const [notes, setNotes] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const invoiceNumberTouched = useRef(false);

  async function load() {
    setLoading(true);
    const [currentRes, historyRes] = await Promise.all([fetch("/api/billing/current"), fetch("/api/billing/history")]);
    const currentJson = await currentRes.json();
    const historyJson = await historyRes.json();
    if (!currentRes.ok) {
      setError(currentJson.error ?? "Unable to load invoicing status");
      setLoading(false);
      return;
    }
    setCurrent(currentJson);
    setSelectedPeriodId(currentJson.selectedPeriodId ?? "");
    setHistory(Array.isArray(historyJson) ? historyJson : []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedPeriod =
    current?.periodOptions?.find((option) => option.id === selectedPeriodId) ??
    current?.periodOptions?.[0] ??
    null;

  const firstLinePlaceholder = defaultFirstLineDescription(selectedPeriod?.label);

  useEffect(() => {
    if (!selectedPeriod?.label) return;
    const suggested = defaultFirstLineDescription(selectedPeriod.label);
    setLineItems((prev) => {
      if (!prev.length) return [newLineItem(suggested)];
      const [first, ...rest] = prev;
      if (first.description.trim()) return prev;
      return [{ ...first, description: suggested }, ...rest];
    });
  }, [selectedPeriod?.label]);

  useEffect(() => {
    if (!selectedPeriod?.canSubmit || invoiceNumberTouched.current) return;
    setInvoiceNumber(selectedPeriod.suggestedInvoiceNumber ?? "");
  }, [selectedPeriod?.id, selectedPeriod?.canSubmit, selectedPeriod?.suggestedInvoiceNumber]);

  const parsedLineItems = useMemo(() => parseLineItems(lineItems), [lineItems]);
  const total = useMemo(() => sumInvoiceLineItems(parsedLineItems), [parsedLineItems]);

  const billingSnapshot: UserBillingSnapshot | null = useMemo(() => {
    if (!current?.profile) return null;
    return {
      ...current.profile,
      userDisplayName,
      userEmail,
    };
  }, [current?.profile, userDisplayName, userEmail]);

  const selectedPeriodState = current
    ? {
        ...current,
        canSubmit: selectedPeriod?.canSubmit ?? false,
        latestSubmission: selectedPeriod?.latestSubmission ?? null,
      }
    : null;

  const formValidationError = getFormValidationError(invoiceNumber, lineItems);
  const submitBlockedReason = getSubmitBlockedReason(selectedPeriodState);
  const billingRecipientsConfigured = Boolean(current?.billToRecipients?.length);
  const isFormReady = Boolean(billingSnapshot && current?.profileComplete && billingRecipientsConfigured && !formValidationError);
  const canSubmitNow = Boolean(showPreview && isFormReady && selectedPeriod?.canSubmit && !submitting);

  function updateLineItem(id: string, patch: Partial<LineItemDraft>) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, newLineItem()]);
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  }

  function openPreview() {
    const validationError = getFormValidationError(invoiceNumber, lineItems);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!current?.profileComplete) {
      setError(getSubmitBlockedReason(current));
      return;
    }
    setError(null);
    setShowPreview(true);
    document.getElementById("invoice-preview-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit() {
    if (!canSubmitNow) {
      setError(submitBlockedReason ?? formValidationError ?? "Complete the invoice form and preview before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoiceNumber.trim(),
          lineItems: parsedLineItems,
          bodyContent: notes.trim() || null,
          billingPeriodId: selectedPeriod?.id ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Submission failed");
        return;
      }

      setInvoiceNumberTouched.current = false;
      setLineItems([newLineItem(defaultFirstLineDescription(selectedPeriod?.label ?? current?.period?.label))]);
      setNotes("");
      setShowPreview(false);
      await load();
      document.getElementById("submission-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setError("Submission failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function badgeClass(status: string) {
    if (status === "accepted") return "bg-emerald-500/20 text-emerald-300";
    if (status === "submitted") return "bg-sky-500/20 text-sky-300";
    if (status === "needs_resubmission") return "bg-amber-500/20 text-amber-300";
    return "bg-rose-500/20 text-rose-300";
  }

  if (loading) return <p className="text-zinc-400">Loading invoicing data...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invoicing</h1>
          <p className="mt-1 text-sm text-zinc-400">Submit your weekly invoice for the current billing period.</p>
        </div>
        <Link href="/billing/user-settings" className="text-sm text-indigo-300 hover:text-indigo-200">
          User Billing Information →
        </Link>
      </div>

      {!current?.profileComplete ? (
        <Card className="border-amber-600/50 bg-amber-900/20 p-4 text-amber-200">
          Complete all required fields in your{" "}
          <Link href="/billing/user-settings" className="underline">
            user billing information
          </Link>{" "}
          before submitting an invoice: {REQUIRED_USER_BILLING_FIELD_LABELS.join(", ")}.
        </Card>
      ) : null}

      {current?.warning ? (
        <Card className="border-amber-600/50 bg-amber-900/20 p-4 text-amber-200">{current.warning}</Card>
      ) : null}
      {!current?.billToRecipients?.length ? (
        <Card className="border-amber-600/50 bg-amber-900/20 p-4 text-amber-200">
          Invoice email recipients are not configured for your company. A company admin must open{" "}
          <Link href="/admin/billing/settings" className="underline">
            Company Billing Settings
          </Link>{" "}
          and add at least one TO recipient (the Bill To address on invoices) before you can submit.
        </Card>
      ) : null}
      {error ? <Card className="border-rose-600/50 bg-rose-900/20 p-4 text-rose-200">{error}</Card> : null}

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-medium">Current Period Status</h2>
        <SelectField
          label="Billing Period"
          description="Defaults to the current work week. Choose an earlier week if you need to submit a missed invoice."
          value={selectedPeriod?.id ?? ""}
          onChange={(event) => {
            invoiceNumberTouched.current = false;
            setSelectedPeriodId(event.target.value);
            setShowPreview(false);
          }}
        >
          {(current?.periodOptions ?? []).map((period, index) => (
            <option key={period.id} value={period.id}>
              {formatBillingPeriodOptionLabel(period, index === 0)}
            </option>
          ))}
        </SelectField>
        <p className="text-sm text-zinc-300">
          Status:{" "}
          <span className={`rounded px-2 py-1 text-xs ${periodStatusBadgeClass(selectedPeriod?.latestSubmission ?? null)}`}>
            {formatPeriodStatusLabel(selectedPeriod?.latestSubmission ?? null)}
          </span>
        </p>
        {selectedPeriod?.latestSubmission?.invoiceNumber ? (
          <p className="text-sm text-zinc-400">Latest invoice #: {selectedPeriod.latestSubmission.invoiceNumber}</p>
        ) : null}
        {current?.settings?.submissionInstructions ? (
          <p className="text-sm text-zinc-400">{current.settings.submissionInstructions}</p>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-medium">Submit Invoice</h2>

        {current?.emailRecipients ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="mb-1 text-sm font-medium text-zinc-200">Invoice email recipients</p>
            <p className="mb-3 text-xs text-zinc-500">You will always receive a copy of your submission at the address below.</p>
            <EmailRecipientTags
              to={current.emailRecipients.to}
              cc={current.emailRecipients.cc}
              bcc={current.emailRecipients.bcc}
              submitterEmail={userEmail}
            />
          </div>
        ) : null}

        <label className="space-y-1 text-sm text-zinc-300">
          Invoice Number
          <input
            value={invoiceNumber}
            onChange={(event) => {
              invoiceNumberTouched.current = true;
              setInvoiceNumber(event.target.value);
            }}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
            placeholder="e.g. INV-2026-014"
          />
          {selectedPeriod?.canSubmit && selectedPeriod.suggestedInvoiceNumber && !invoiceNumberTouched.current ? (
            <p className="text-xs text-zinc-500">Suggested from your last invoice — you can change this.</p>
          ) : null}
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200">Line Items</p>
            <button type="button" className="text-sm text-indigo-300 hover:text-indigo-200" onClick={addLineItem}>
              + Add line item
            </button>
          </div>
          {lineItems.map((item, index) => (
            <div key={item.id} className="grid gap-3 rounded border border-zinc-800 p-3 sm:grid-cols-[1fr_160px_auto]">
              <label className="space-y-1 text-sm text-zinc-300">
                Description
                <input
                  value={item.description}
                  onChange={(event) => updateLineItem(item.id, { description: event.target.value })}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
                  placeholder={index === 0 ? firstLinePlaceholder : `Line item ${index + 1}`}
                />
              </label>
              <label className="space-y-1 text-sm text-zinc-300">
                Amount (USD)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount}
                  onChange={(event) => updateLineItem(item.id, { amount: event.target.value })}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="rounded px-2 py-2 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-40"
                  disabled={lineItems.length <= 1}
                  onClick={() => removeLineItem(item.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <p className="text-right text-sm text-zinc-300">Subtotal: {formatInvoiceCurrency(total || 0)}</p>
        </div>

        <label className="space-y-1 text-sm text-zinc-300">
          Optional notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!isFormReady} onClick={openPreview}>
            Preview Invoice
          </Button>
          {!isFormReady && !formValidationError && submitBlockedReason ? (
            <p className="text-sm text-zinc-500">{submitBlockedReason}</p>
          ) : null}
          {!isFormReady && formValidationError ? <p className="text-sm text-zinc-500">{formValidationError}</p> : null}
        </div>
      </Card>

      {showPreview && billingSnapshot && selectedPeriod ? (
        <Card id="invoice-preview-panel" className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Invoice Preview</h2>
            <p className="text-sm text-zinc-400">Review your invoice, then submit when ready.</p>
          </div>
          <InvoicePreview
            invoiceNumber={invoiceNumber.trim()}
            periodLabel={selectedPeriod.label}
            billToRecipients={current?.billToRecipients ?? []}
            billingSnapshot={billingSnapshot}
            lineItems={parsedLineItems}
            userBody={notes.trim() || null}
            defaultFooter={current?.settings?.defaultBodyFooter ?? null}
          />
          {submitBlockedReason ? (
            <p className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">{submitBlockedReason}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
            <Button disabled={!canSubmitNow} onClick={() => void submit()}>
              {submitting ? "Submitting..." : "Submit Invoice"}
            </Button>
            <Button variant="secondary" disabled={submitting} onClick={() => setShowPreview(false)}>
              Back to edit
            </Button>
          </div>
        </Card>
      ) : null}

      <Card id="submission-history" className="p-5">
        <h2 className="mb-1 text-lg font-medium">Submission History</h2>
        <p className="mb-4 text-sm text-zinc-500">Every invoice you submit is recorded here with status and line items.</p>
        {history.length === 0 ? <p className="text-sm text-zinc-500">No submissions yet.</p> : null}
        <div className="space-y-3">
          {history.map((row) => {
            const items = Array.isArray(row.invoiceLineItemsJson) ? row.invoiceLineItemsJson : [];
            const rowTotal = sumInvoiceLineItems(items);
            return (
              <div key={row.id} className="rounded border border-zinc-800 p-3">
                <p className="text-sm font-medium text-zinc-100">
                  {row.invoiceNumber ? `Invoice #${row.invoiceNumber}` : row.subject}
                </p>
                <p className="text-xs text-zinc-400">
                  Attempt {row.submissionAttemptNumber} • {new Date(row.submittedAtUtc).toLocaleString("en-US")}
                  {items.length ? ` • ${formatInvoiceCurrency(rowTotal)}` : ""}
                </p>
                <div className="mt-1 flex gap-2 text-xs">
                  <span className={`rounded px-2 py-1 capitalize ${badgeClass(row.status)}`}>{row.status.replaceAll("_", " ")}</span>
                  <span className="rounded bg-zinc-800 px-2 py-1 capitalize text-zinc-300">Email: {row.emailStatus}</span>
                </div>
                {row.adminNote ? <p className="mt-2 text-sm text-amber-200">Admin Note: {row.adminNote}</p> : null}
                {row.bodyContent ? <p className="mt-2 text-sm text-zinc-300">Notes: {row.bodyContent}</p> : null}
                {items.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                    {items.map((item, index) => (
                      <li key={`${row.id}-${index}`}>
                        {item.description} — {formatInvoiceCurrency(item.amount)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
