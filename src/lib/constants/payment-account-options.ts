export const PAYMENT_ACCOUNT_TYPE_OPTIONS = ["PayPal", "US GCash"] as const;

export type PaymentAccountType = (typeof PAYMENT_ACCOUNT_TYPE_OPTIONS)[number];

export const PAYMENT_ACCOUNT_TYPE_SET = new Set<string>(PAYMENT_ACCOUNT_TYPE_OPTIONS);

export function formatPaymentAccountLine(type: string, address: string) {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) return null;
  const trimmedType = type.trim() || "PayPal";
  return `${trimmedType}: ${trimmedAddress}`;
}

/** Supports snapshots saved before payment account fields were renamed. */
export function formatPaymentAccountLineFromSnapshot(snapshot: {
  paymentAccountType?: string | null;
  paymentAccountAddress?: string | null;
  paypalAddress?: string | null;
}) {
  if (snapshot.paymentAccountAddress?.trim()) {
    return formatPaymentAccountLine(snapshot.paymentAccountType ?? "PayPal", snapshot.paymentAccountAddress);
  }
  if (snapshot.paypalAddress?.trim()) {
    return formatPaymentAccountLine("PayPal", snapshot.paypalAddress);
  }
  return null;
}
