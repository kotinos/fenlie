"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { splitCheckDB } from "@/lib/cache/db";
import { clearAllCache } from "@/lib/cache/cache-utils";

type CacheStatus = {
  cachedSessionCount: number;
  totalCacheSizeEstimate: string;
  lastSyncedAt: Date | null;
  clearAll: () => Promise<void>;
};

/** Format byte counts into a compact human-readable value. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/** Provide reactive global cache usage and sync metadata. */
export function useCacheStatus(): CacheStatus {
  const [totalCacheSizeEstimate, setTotalCacheSizeEstimate] = useState("0 B");

  const cacheMeta = useLiveQuery(async () => {
    const sessions = await splitCheckDB.sessions.toArray();
    const cachedSessionCount = sessions.length;
    const latestCachedAt = sessions.reduce<number>(
      (latest, session) => Math.max(latest, session._cached_at),
      0
    );
    return {
      cachedSessionCount,
      lastSyncedAt: latestCachedAt > 0 ? new Date(latestCachedAt) : null,
    };
  });

  useEffect(() => {
    /** Refresh browser storage usage estimate for cache indicator. */
    async function refreshEstimate(): Promise<void> {
      try {
        const estimate = await navigator.storage?.estimate?.();
        const usage = estimate?.usage ?? 0;
        setTotalCacheSizeEstimate(formatBytes(usage));
      } catch (error) {
        console.warn("[cache] storage estimate failed", error);
        setTotalCacheSizeEstimate("Unknown");
      }
    }

    void refreshEstimate();
  }, [cacheMeta?.cachedSessionCount]);

  /** Clear all IndexedDB cache tables and leave source-of-truth remote. */
  const clearAll = useCallback(async () => {
    await clearAllCache();
  }, []);

  return useMemo(
    () => ({
      cachedSessionCount: cacheMeta?.cachedSessionCount ?? 0,
      totalCacheSizeEstimate,
      lastSyncedAt: cacheMeta?.lastSyncedAt ?? null,
      clearAll,
    }),
    [cacheMeta?.cachedSessionCount, cacheMeta?.lastSyncedAt, clearAll, totalCacheSizeEstimate]
  );
}
