import type { InvoiceLineItem, UserBillingSnapshot } from "@/lib/validation/billing";

export function formatInvoiceCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function sumInvoiceLineItems(lineItems: InvoiceLineItem[]) {
  return lineItems.reduce((total, item) => total + item.amount, 0);
}

export function buildInvoiceSubject({
  billingSnapshot,
  invoiceNumber,
  periodLabel,
}: {
  billingSnapshot: UserBillingSnapshot;
  invoiceNumber: string;
  periodLabel: string;
}) {
  return `Invoice ${invoiceNumber} — ${formatInvoiceBillFromName(billingSnapshot)} (${periodLabel})`;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatInvoiceBillFromName(snapshot: UserBillingSnapshot) {
  return `${snapshot.firstName} ${snapshot.lastName}`.trim();
}

export function formatBillToHtml(billToRecipients: string[]) {
  if (!billToRecipients.length) return "—";
  return billToRecipients.map((email) => escapeHtml(email)).join("<br/>");
}

export function formatBillToLines(billToRecipients: string[]) {
  if (!billToRecipients.length) return ["—"];
  return billToRecipients;
}

function formatAddress(snapshot: UserBillingSnapshot) {
  const cityLine = [snapshot.city, snapshot.state?.trim() || snapshot.province?.trim(), snapshot.zip].filter(Boolean).join(", ");
  const lines = [
    formatInvoiceBillFromName(snapshot),
    snapshot.userEmail,
    snapshot.address,
    snapshot.address2?.trim() ? snapshot.address2.trim() : null,
    cityLine,
    snapshot.country,
    snapshot.phone ? `Phone: ${snapshot.phone}` : null,
    snapshot.paypalAddress ? `PayPal: ${snapshot.paypalAddress}` : null,
  ].filter(Boolean);

  return lines.map((line) => escapeHtml(line ?? "")).join("<br/>");
}

export function buildInvoiceHtml({
  invoiceNumber,
  periodLabel,
  submittedLabel,
  billToRecipients,
  billingSnapshot,
  lineItems,
  userBody,
  defaultFooter,
}: {
  invoiceNumber: string;
  periodLabel: string;
  submittedLabel: string;
  billToRecipients: string[];
  billingSnapshot: UserBillingSnapshot;
  lineItems: InvoiceLineItem[];
  userBody: string | null;
  defaultFooter: string | null;
}) {
  const total = sumInvoiceLineItems(lineItems);
  const lineRows = lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;">${escapeHtml(item.description)}</td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right;">${escapeHtml(formatInvoiceCurrency(item.amount))}</td>
      </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#18181b;max-width:720px;">
      <h1 style="margin:0 0 8px;font-size:24px;">Invoice</h1>
      <p style="margin:0 0 16px;color:#52525b;">Invoice #${escapeHtml(invoiceNumber)}</p>
      <table style="width:100%;margin-bottom:20px;font-size:14px;">
        <tr>
          <td style="vertical-align:top;width:50%;">
            <strong>Bill From</strong><br/>
            ${formatAddress(billingSnapshot)}
          </td>
          <td style="vertical-align:top;width:50%;">
            <strong>Bill To</strong><br/>
            ${formatBillToHtml(billToRecipients)}<br/>
            <strong>Billing Period:</strong> ${escapeHtml(periodLabel)}<br/>
            <strong>Submitted:</strong> ${escapeHtml(submittedLabel)}
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f4f4f5;">
            <th style="padding:8px;text-align:left;">Description</th>
            <th style="padding:8px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
          <tr>
            <td style="padding:12px 8px;font-weight:bold;text-align:right;">Total</td>
            <td style="padding:12px 8px;font-weight:bold;text-align:right;">${escapeHtml(formatInvoiceCurrency(total))}</td>
          </tr>
        </tbody>
      </table>
      ${userBody ? `<p style="margin-top:20px;"><strong>Notes:</strong><br/>${escapeHtml(userBody)}</p>` : ""}
      ${defaultFooter ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e4e4e7;"/><p style="color:#52525b;">${escapeHtml(defaultFooter)}</p>` : ""}
    </div>
  `;
}
