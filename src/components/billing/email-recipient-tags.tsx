type EmailRecipientTagsProps = {
  to: string[];
  cc: string[];
  bcc: string[];
  submitterEmail: string;
  showSubmitterInCc?: boolean;
};

function Tag({ children, locked = false }: { children: React.ReactNode; locked?: boolean }) {
  return (
    <span
      className={
        locked
          ? "inline-flex items-center rounded-full border border-indigo-500/50 bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200"
          : "inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-300"
      }
    >
      {children}
    </span>
  );
}

export function EmailRecipientTags({ to, cc, bcc, submitterEmail, showSubmitterInCc = true }: EmailRecipientTagsProps) {
  const submitterKey = submitterEmail.trim().toLowerCase();
  const ccWithoutSubmitter = cc.filter((email) => email.trim().toLowerCase() !== submitterKey);
  const submitterOnCc = cc.some((email) => email.trim().toLowerCase() === submitterKey);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">To</p>
        <div className="flex flex-wrap gap-2">
          {to.length ? to.map((email) => <Tag key={`to-${email}`}>{email}</Tag>) : <span className="text-zinc-500">Not configured</span>}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Cc</p>
        <div className="flex flex-wrap gap-2">
          {showSubmitterInCc ? (
            <Tag locked>
              {submitterEmail} — {submitterOnCc ? "you (invoice submitter)" : "invoice submitter (always included)"}
            </Tag>
          ) : null}
          {ccWithoutSubmitter.map((email) => (
            <Tag key={`cc-${email}`}>{email}</Tag>
          ))}
          {!showSubmitterInCc && !cc.length ? <span className="text-zinc-500">None</span> : null}
        </div>
      </div>
      {bcc.length ? (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Bcc</p>
          <div className="flex flex-wrap gap-2">
            {bcc.map((email) => (
              <Tag key={`bcc-${email}`}>{email}</Tag>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
