import { type ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")";

export const selectClassName = cn(
  "w-full appearance-none rounded-lg border border-zinc-700/80 bg-zinc-950/90",
  "px-3 py-2.5 pr-10 text-sm text-zinc-100 shadow-sm",
  "transition-[border-color,background-color,box-shadow] duration-150",
  "hover:border-zinc-600 hover:bg-zinc-900",
  "focus:border-indigo-500/70 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/25",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "cursor-pointer",
);

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
};

export function Select({ className, style, wrapperClassName, ...props }: SelectProps) {
  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <select
        className={cn(selectClassName, className)}
        style={{
          backgroundImage: CHEVRON,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.75rem center",
          backgroundSize: "1rem",
          ...style,
        }}
        {...props}
      />
    </div>
  );
}

type SelectFieldProps = SelectProps & {
  label: ReactNode;
  description?: ReactNode;
  containerClassName?: string;
  labelClassName?: string;
};

export function SelectField({
  label,
  description,
  containerClassName,
  labelClassName,
  id,
  className,
  ...props
}: SelectFieldProps) {
  const selectId = id ?? (typeof props.name === "string" ? props.name : undefined);

  return (
    <div className={cn("space-y-1.5", containerClassName)}>
      <label htmlFor={selectId} className={cn("block text-sm text-zinc-300", labelClassName)}>
        <span className="font-medium text-zinc-200">{label}</span>
      </label>
      {description ? <p className="text-xs leading-relaxed text-zinc-500">{description}</p> : null}
      <Select id={selectId} className={className} {...props} />
    </div>
  );
}
