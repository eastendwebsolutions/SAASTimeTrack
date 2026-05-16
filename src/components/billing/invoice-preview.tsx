"use client";

import { buildInvoiceHtml, formatInvoiceCurrency, sumInvoiceLineItems } from "@/lib/services/billing/invoice";
import type { InvoiceLineItem, UserBillingSnapshot } from "@/lib/validation/billing";
import { Card } from "@/components/ui/card";

type InvoicePreviewProps = {
  invoiceNumber: string;
  periodLabel: string;
  billToRecipients: string[];
  billingSnapshot: UserBillingSnapshot;
  lineItems: InvoiceLineItem[];
  userBody?: string | null;
  defaultFooter?: string | null;
  submittedLabel?: string;
};

export function InvoicePreview({
  invoiceNumber,
  periodLabel,
  billToRecipients,
  billingSnapshot,
  lineItems,
  userBody,
  defaultFooter,
  submittedLabel = "Preview",
}: InvoicePreviewProps) {
  const total = sumInvoiceLineItems(lineItems);
  const html = buildInvoiceHtml({
    invoiceNumber,
    periodLabel,
    submittedLabel,
    billToRecipients,
    billingSnapshot,
    lineItems,
    userBody: userBody ?? null,
    defaultFooter: defaultFooter ?? null,
  });

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden bg-white p-0 text-zinc-900">
        <div className="p-6" dangerouslySetInnerHTML={{ __html: html }} />
      </Card>
      <p className="text-right text-sm font-medium text-zinc-300">Total: {formatInvoiceCurrency(total)}</p>
    </div>
  );
}

