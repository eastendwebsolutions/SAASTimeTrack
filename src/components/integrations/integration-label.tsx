import { IntegrationLogo } from "@/components/integrations/integration-logo";

type Props = {
  integration: string;
  text: string;
  iconClassName?: string;
  className?: string;
};

export function IntegrationLabel({ integration, text, iconClassName = "h-4 w-4", className = "inline-flex items-center gap-1.5" }: Props) {
  return (
    <span className={className}>
      <IntegrationLogo integration={integration} className={iconClassName} />
      <span>{text}</span>
    </span>
  );
}
