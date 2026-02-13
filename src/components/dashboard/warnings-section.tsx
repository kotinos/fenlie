"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";

export type DashboardWarning = {
  id: string;
  message: string;
  actionLabel: "Review" | "Fix";
  href: string;
};

interface WarningsSectionProps {
  warnings: DashboardWarning[];
  onNavigate: (href: string) => void;
}

export function WarningsSection({
  warnings,
  onNavigate,
}: WarningsSectionProps) {
  const [showAll, setShowAll] = useState(false);

  const visibleWarnings = useMemo(
    () => (showAll ? warnings : warnings.slice(0, 3)),
    [showAll, warnings]
  );

  if (warnings.length === 0) return null;

  const hiddenCount = warnings.length - visibleWarnings.length;

  return (
    <section
      className="space-y-2 transition-all duration-300 animate-in slide-in-from-top-2 fade-in"
      aria-live="polite"
    >
      {visibleWarnings.map((warning) => (
        <button
          key={warning.id}
          type="button"
          onClick={() => onNavigate(warning.href)}
          className="w-full rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-200">{warning.message}</p>
            </div>
            <div className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-amber-300">
              {warning.actionLabel}
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </button>
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm text-zinc-300 transition-all active:scale-[0.98]"
        >
          Show {hiddenCount} more
        </button>
      )}
    </section>
  );
}
