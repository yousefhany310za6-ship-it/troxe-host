"use client";

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme";

const options = [
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "system" as const, label: "System", icon: Monitor },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const currentIcon = options.find((o) => o.value === theme)?.icon ?? Moon;
  const Icon = currentIcon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-9 w-9 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all duration-200"
        aria-label="Toggle theme"
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[140px] glass-card rounded-xl shadow-glass py-1 animate-in fade-in-0 zoom-in-95">
          {options.map((opt) => {
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-all duration-200 rounded-lg mx-1",
                  theme === opt.value
                    ? "text-brand-400 bg-brand-600/10 border border-brand-500/20"
                    : "text-foreground hover:bg-white/[0.04] border border-transparent"
                )}
              >
                <OptIcon className="h-4 w-4" />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
