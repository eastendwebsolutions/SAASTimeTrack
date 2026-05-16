import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceLineItem, UserBillingSnapshot } from "@/lib/validation/billing";
import { formatBillToLines, formatInvoiceBillFromName, formatInvoiceCurrency, sumInvoiceLineItems } from "./invoice";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type BuildInvoicePdfInput = {
  invoiceNumber: string;
  periodLabel: string;
  submittedLabel: string;
  billToRecipients: string[];
  billingSnapshot: UserBillingSnapshot;
  lineItems: InvoiceLineItem[];
  userBody: string | null;
  defaultFooter: string | null;
};

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function drawLines(
  page: PDFPage,
  lines: string[],
  x: number,
  startY: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color = rgb(0.1, 0.1, 0.1),
) {
  let y = startY;
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

function billFromLines(snapshot: UserBillingSnapshot) {
  const cityLine = [snapshot.city, snapshot.state?.trim() || snapshot.province?.trim(), snapshot.zip]
    .filter(Boolean)
    .join(", ");
  return [
    formatInvoiceBillFromName(snapshot),
    snapshot.userEmail,
    snapshot.address,
    snapshot.address2?.trim() || null,
    cityLine,
    snapshot.country,
    snapshot.phone ? `Phone: ${snapshot.phone}` : null,
    snapshot.paypalAddress ? `PayPal: ${snapshot.paypalAddress}` : null,
  ].filter((line): line is string => Boolean(line));
}

export function invoicePdfFilename(invoiceNumber: string) {
  const safe = invoiceNumber.trim().replace(/[^\w.-]+/g, "_") || "invoice";
  return `Invoice-${safe}.pdf`;
}

export async function buildInvoicePdf(input: BuildInvoicePdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = PAGE_HEIGHT - MARGIN;

  page.drawText("Invoice", { x: MARGIN, y: y - 4, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;
  page.drawText(`Invoice #${input.invoiceNumber}`, { x: MARGIN, y, size: 11, font, color: rgb(0.32, 0.32, 0.35) });
  y -= 28;

  const columnWidth = CONTENT_WIDTH / 2 - 12;
  const billFromY = y;
  page.drawText("Bill From", { x: MARGIN, y, size: 11, font: fontBold });
  y = drawLines(page, billFromLines(input.billingSnapshot), MARGIN, y - 14, font, 10, 13, rgb(0.15, 0.15, 0.18));

  const billToX = MARGIN + columnWidth + 24;
  let rightY = billFromY;
  page.drawText("Bill To", { x: billToX, y: rightY, size: 11, font: fontBold });
  rightY -= 14;
  const billToLines = [
    ...formatBillToLines(input.billToRecipients),
    `Billing Period: ${input.periodLabel}`,
    `Submitted: ${input.submittedLabel}`,
  ];
  rightY = drawLines(page, billToLines, billToX, rightY, font, 10, 13, rgb(0.15, 0.15, 0.18));

  y = Math.min(y, rightY) - 24;

  const descriptionX = MARGIN;
  const amountX = PAGE_WIDTH - MARGIN - 80;
  const amountWidth = 80;

  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 20,
    color: rgb(0.96, 0.96, 0.97),
  });
  page.drawText("Description", { x: descriptionX + 8, y: y, size: 10, font: fontBold });
  page.drawText("Amount", { x: amountX, y, size: 10, font: fontBold });
  y -= 26;

  for (const item of input.lineItems) {
    const descriptionLines = wrapText(item.description, CONTENT_WIDTH - amountWidth - 24, font, 10);
    const rowHeight = Math.max(descriptionLines.length * 13, 18);
    if (y - rowHeight < MARGIN + 80) {
      break;
    }

    drawLines(page, descriptionLines, descriptionX + 8, y, font, 10, 13);
    page.drawText(formatInvoiceCurrency(item.amount), {
      x: amountX,
      y,
      size: 10,
      font,
    });
    y -= rowHeight + 6;

    page.drawLine({
      start: { x: MARGIN, y: y + 2 },
      end: { x: PAGE_WIDTH - MARGIN, y: y + 2 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.92),
    });
  }

  const total = sumInvoiceLineItems(input.lineItems);
  y -= 8;
  page.drawText("Total", { x: amountX - 48, y, size: 11, font: fontBold });
  page.drawText(formatInvoiceCurrency(total), { x: amountX, y, size: 11, font: fontBold });
  y -= 28;

  if (input.userBody?.trim()) {
    page.drawText("Notes", { x: MARGIN, y, size: 11, font: fontBold });
    y = drawLines(page, wrapText(input.userBody.trim(), CONTENT_WIDTH, font, 10), MARGIN, y - 14, font, 10, 13);
    y -= 8;
  }

  if (input.defaultFooter?.trim()) {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.88),
    });
    y -= 16;
    drawLines(page, wrapText(input.defaultFooter.trim(), CONTENT_WIDTH, font, 9), MARGIN, y, font, 9, 12, rgb(0.35, 0.35, 0.38));
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
