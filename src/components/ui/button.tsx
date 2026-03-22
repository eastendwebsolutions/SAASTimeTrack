import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-indigo-500 text-white hover:bg-indigo-400",
        variant === "secondary" && "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
        variant === "danger" && "bg-rose-500 text-white hover:bg-rose-400",
        className,
      )}
      {...props}
    />
  );
}
