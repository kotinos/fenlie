"use client";

import { useSplitCheckStore } from "@/lib/store";

export function SyncIndicator() {
  const syncStatus = useSplitCheckStore((s) => s.syncStatus);

  if (syncStatus === "synced") return null;

  const isError = syncStatus === "error";

  return (
    <div
      className={`pointer-events-none fixed right-3 z-30 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm transition-opacity sm:right-[calc(50%-256px+12px)] ${
        isError
          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : "bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      }`}
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            isError ? "bg-red-500" : "animate-pulse bg-emerald-400"
          }`}
        />
        {isError ? "Offline" : "Saving..."}
      </span>
    </div>
  );
}
