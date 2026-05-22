function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function dedupeEmails(emails: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of emails) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeEmail(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Merges company billing settings with the submitter always CC'd (unless already on To/Bcc). */
export function buildSubmissionEmailRecipients({
  submitterEmail,
  toRecipients,
  ccRecipients,
  bccRecipients,
}: {
  submitterEmail: string;
  toRecipients: string[];
  ccRecipients: string[];
  bccRecipients: string[];
}) {
  const to = dedupeEmails(toRecipients);
  const cc = dedupeEmails(ccRecipients);
  const bcc = dedupeEmails(bccRecipients);

  const toSet = new Set(to.map(normalizeEmail));
  const ccSet = new Set(cc.map(normalizeEmail));
  const bccSet = new Set(bcc.map(normalizeEmail));

  const submitter = submitterEmail.trim();
  if (submitter) {
    const key = normalizeEmail(submitter);
    if (!toSet.has(key) && !ccSet.has(key) && !bccSet.has(key)) {
      cc.push(submitter);
    }
  }

  return { to, cc, bcc };
}
