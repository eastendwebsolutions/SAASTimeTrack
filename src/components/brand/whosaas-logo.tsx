import Image from "next/image";
import { cn } from "@/lib/utils/cn";

type WhoSaaSLogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md";
};

export function WhoSaaSLogo({ className, showWordmark = true, size = "md" }: WhoSaaSLogoProps) {
  const iconSize = size === "sm" ? 24 : 28;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/whosaas-icon.png"
        alt=""
        width={iconSize}
        height={iconSize}
        className="shrink-0 rounded-md"
        priority
      />
      {showWordmark ? (
        <span className="font-semibold tracking-tight text-indigo-300">
          Who<span className="text-zinc-100">SaaS</span>
        </span>
      ) : null}
    </span>
  );
}
