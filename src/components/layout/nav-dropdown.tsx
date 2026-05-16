"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type NavItem = { href: string; label: string };

export function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-zinc-300 transition",
          "hover:bg-zinc-800/80 hover:text-zinc-100",
          open && "bg-zinc-800/80 text-zinc-100",
        )}
      >
        {label}
        <span className={cn("text-[10px] text-zinc-500 transition", open && "rotate-180")} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-50 min-w-44 rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-xl"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="block rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
