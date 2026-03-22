import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-[0_8px_30px_rgba(0,0,0,0.25)]", className)}
      {...props}
    />
  );
}
