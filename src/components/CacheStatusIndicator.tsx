"use client";

type CacheStatusIndicatorProps = {
  isRevalidating: boolean;
  isOffline: boolean;
  isStale: boolean;
  error: Error | null;
};

/** Render compact cache/network state indicator for the header area. */
export function CacheStatusIndicator({
  isRevalidating,
  isOffline,
  isStale,
  error,
}: CacheStatusIndicatorProps) {
  if (error) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
        <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
        <span aria-live="polite">Unable to load - check your connection</span>
      </div>
    );
  }

  if (isOffline || isStale) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
        <span aria-live="polite">Offline - showing cached data</span>
      </div>
    );
  }

  if (isRevalidating) {
    return (
      <div className="inline-flex items-center">
        <span
          className="h-2 w-2 rounded-full bg-blue-500 animate-pulse dark:bg-blue-400"
          title="Syncing..."
          aria-label="Syncing..."
        />
      </div>
    );
  }

  return (
    <div className="inline-flex items-center">
      <span
        className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400"
        title="Up to date"
        aria-label="Up to date"
      />
    </div>
  );
}
