"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { useCacheStatus } from "@/lib/cache/use-cache-status";

/**
 * Responsive settings page:
 * mobile keeps stacked sections, desktop constrains width and groups actions in cards.
 */
export default function SettingsPage() {
  const { cachedSessionCount, totalCacheSizeEstimate, lastSyncedAt, clearAll } = useCacheStatus();
  const [isClearing, setIsClearing] = useState(false);

  const clearCache = async () => {
    setIsClearing(true);
    try {
      await clearAll();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader title="Settings" breadcrumbs={[{ label: "Settings" }]} />
      <main className="flex-1 pb-24 pt-4 md:pb-8">
        <PageContainer>
          <div className="space-y-4 lg:mx-auto lg:max-w-2xl">
            <section className="rounded-xl border border-border bg-card p-4 md:p-5 lg:p-6">
              <h2 className="text-base font-semibold md:text-xl">Cache</h2>
              <dl className="mt-3 space-y-2 text-sm md:text-base">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Cached sessions</dt>
                  <dd className="font-medium">{cachedSessionCount}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Storage usage</dt>
                  <dd className="font-medium">{totalCacheSizeEstimate}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Last synced</dt>
                  <dd className="font-medium">
                    {lastSyncedAt ? lastSyncedAt.toLocaleString() : "Not yet"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-red-300/40 bg-red-50/40 p-4 md:p-5 lg:p-6 dark:border-red-900/40 dark:bg-red-950/20">
              <h2 className="text-base font-semibold text-red-700 md:text-xl dark:text-red-300">
                Danger Zone
              </h2>
              <p className="mt-2 text-sm text-red-700/80 md:text-base dark:text-red-300/80">
                Clearing cache removes local offline data. Synced session data remains in Supabase.
              </p>
              <div className="mt-4 rounded-lg border border-red-300/50 p-3 md:p-4 dark:border-red-900/60">
                <Button
                  variant="destructive"
                  className="h-11 w-full gap-2 md:min-h-0"
                  disabled={isClearing}
                  onClick={() => void clearCache()}
                >
                  <Trash2 className="h-4 w-4" />
                  {isClearing ? "Clearing..." : "Clear Cache"}
                </Button>
              </div>
            </section>
          </div>
        </PageContainer>
      </main>
    </div>
  );
}
