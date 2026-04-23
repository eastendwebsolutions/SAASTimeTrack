type KnownIntegration = "asana" | "jira";

function normalizeIntegration(value: string): KnownIntegration | "other" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "asana") return "asana";
  if (normalized === "jira") return "jira";
  return "other";
}

type LogoProps = {
  integration: string;
  className?: string;
};

export function IntegrationLogo({ integration, className = "h-4 w-4" }: LogoProps) {
  const kind = normalizeIntegration(integration);

  if (kind === "asana") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <circle cx="7" cy="7" r="4" fill="#F06A6A" />
        <circle cx="16.5" cy="7" r="4" fill="#F99B70" />
        <circle cx="11.75" cy="16.5" r="4.25" fill="#7A4CF5" />
      </svg>
    );
  }

  if (kind === "jira") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <defs>
          <linearGradient id="jiraGradientA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2684FF" />
            <stop offset="100%" stopColor="#0052CC" />
          </linearGradient>
          <linearGradient id="jiraGradientB" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4C9AFF" />
            <stop offset="100%" stopColor="#2684FF" />
          </linearGradient>
        </defs>
        <path d="M4 12 10.2 5.8l3.2 3.2L10.4 12l3 3L10.2 18.2Z" fill="url(#jiraGradientA)" />
        <path d="M10.2 12 16.5 5.8l3.2 3.2-6.3 6.3Z" fill="url(#jiraGradientB)" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="4" y="4" width="16" height="16" rx="4" fill="#71717A" />
      <path d="M8 12h8M12 8v8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
