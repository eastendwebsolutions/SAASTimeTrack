import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const sizeStyles = {
  sm: { icon: 24, gap: "gap-1.5", wordmark: "text-sm" },
  md: { icon: 32, gap: "gap-2", wordmark: "text-base" },
  lg: { icon: 36, gap: "gap-2.5", wordmark: "text-lg sm:text-xl" },
} as const;

type WhoSaaSLogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: keyof typeof sizeStyles;
};

export function WhoSaaSLogo({ className, showWordmark = true, size = "md" }: WhoSaaSLogoProps) {
  const { icon, gap, wordmark } = sizeStyles[size];

  return (
    <span className={cn("inline-flex items-center", gap, className)}>
      <Image
        src="/whosaas-icon.png"
        alt=""
        width={icon}
        height={icon}
        className="shrink-0 rounded-md"
        priority
      />
      {showWordmark ? (
        <span className={cn("font-semibold tracking-tight text-indigo-300", wordmark)}>
          Who<span className="text-zinc-100">SaaS</span>
        </span>
      ) : null}
    </span>
  );
}
