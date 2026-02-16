"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpFromLine } from "lucide-react";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import { usePresence } from "@/hooks/use-presence";
import { PageHeader } from "@/components/page-header";
import { PageContainer } from "@/components/layout/PageContainer";
import { ShareSession } from "@/components/share-session";
import { OnlineNowBanner } from "@/components/dashboard/online-now-banner";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  WarningsSection,
  type DashboardWarning,
} from "@/components/dashboard/warnings-section";
import { YourSummaryCard } from "@/components/dashboard/your-summary-card";
import { SettlementTransfers } from "@/components/dashboard/settlement-transfers";
import { PersonBreakdown } from "@/components/dashboard/person-breakdown";
import { ExportDrawer } from "@/components/dashboard/export-drawer";
import {
  calculatePersonReceiptTotal,
  calculateSessionSettlement,
  getReceiptsWithoutPayer,
  getUnclaimedItems,
} from "@/lib/calculations";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const { session, isLoading } = useRealtimeSession(sessionId);

  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState("");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  useEffect(() => {
    try {
      const key = `splitcheck_user_${sessionId}`;
      const saved = localStorage.getItem(key);
      if (saved) setCurrentUserName(saved);
    } catch {
      setCurrentUserName(null);
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    const loadShareCode = async () => {
      if (!session) return;
      const fallback = session.id.slice(0, 6).toUpperCase();
      setShareCode(fallback);

      const { data } = await supabase
        .from("sessions")
        .select("share_code")
        .eq("id", session.id)
        .maybeSingle();

      if (cancelled) return;
      const dbCode = (data as { share_code?: string } | null)?.share_code ?? "";
      setShareCode(dbCode || fallback);
    };

    void loadShareCode();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const presence = usePresence(sessionId, currentUserName);
  const onlineUsers = useMemo(
    () =>
      presence.onlineUsers.map((name) => ({
        name,
        color: session?.participantColors[name] ?? "#71717a",
      })),
    [presence.onlineUsers, session]
  );

  const settlement = useMemo(() => {
    if (!session) return null;
    return calculateSessionSettlement(session);
  }, [session]);

  const warnings = useMemo<DashboardWarning[]>(() => {
    if (!session) return [];
    const computed: DashboardWarning[] = [];

    const unclaimedItems = getUnclaimedItems(session);
    if (unclaimedItems.length > 0) {
      const uniqueReceipts = new Set(unclaimedItems.map((item) => item.receiptId));
      computed.push({
        id: "unclaimed-items",
        message: `${unclaimedItems.length} items unclaimed on ${uniqueReceipts.size} receipts`,
        actionLabel: "Review",
        href: `/session/${session.id}/receipt/${unclaimedItems[0].receiptId}`,
      });
    }

    const noPayerReceiptIds = getReceiptsWithoutPayer(session);
    noPayerReceiptIds.forEach((receiptId) => {
      const receiptIndex = session.receipts.findIndex((r) => r.id === receiptId);
      const receiptName =
        session.receipts[receiptIndex]?.restaurantName ||
        `Receipt #${receiptIndex + 1}`;
      computed.push({
        id: `missing-payer-${receiptId}`,
        message: `${receiptName} has no payer assigned`,
        actionLabel: "Fix",
        href: `/session/${session.id}/receipt/${receiptId}`,
      });
    });

    return computed;
  }, [session]);

  const currentUserSummary = useMemo(() => {
    if (!session || !settlement || !currentUserName) return null;

    const userBalance = settlement.balances.find(
      (balance) => balance.name === currentUserName
    );
    if (!userBalance) return null;

    let itemTotal = 0;
    let taxShare = 0;
    let tipShare = 0;
    let feeShare = 0;
    let totalOwed = 0;

    session.receipts.forEach((receipt) => {
      const totals = calculatePersonReceiptTotal(receipt, currentUserName);
      itemTotal += totals.itemTotal;
      taxShare += totals.taxShare;
      tipShare += totals.tipShare;
      feeShare += totals.feeShare;
      totalOwed += totals.total;
    });

    return {
      itemTotal,
      taxShare,
      tipShare,
      feeShare,
      totalOwed,
      totalPaid: userBalance.totalPaid,
    };
  }, [currentUserName, session, settlement]);

  const openShareDrawer = useCallback(() => {
    setIsShareOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-zinc-100">
        <PageHeader title="Settlement" backHref={`/session/${sessionId}`} />
        <main className="px-4 py-8 text-sm text-zinc-400">Loading...</main>
      </div>
    );
  }

  if (!session || !settlement) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-zinc-100">
        <PageHeader title="Settlement" backHref={`/session/${sessionId}`} />
        <main className="px-4 py-8 text-sm text-zinc-400">
          Session not found.
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <PageHeader
        title="Settlement"
        backHref={`/session/${sessionId}`}
        rightAction={
          <button
            type="button"
            onClick={() => setIsExportOpen(true)}
            aria-label="Open export drawer"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-zinc-100 transition-all active:scale-[0.98]"
          >
            <ArrowUpFromLine className="h-5 w-5" />
          </button>
        }
      />

      <main className="pb-28 pt-4 md:pb-8">
        <PageContainer wide>
          <div className="space-y-4">
            <OnlineNowBanner
              onlineUsers={onlineUsers}
              currentUserName={currentUserName}
              onShare={openShareDrawer}
            />

            <WarningsSection
              warnings={warnings}
              onNavigate={(href) => router.push(href)}
            />

            {currentUserSummary && (
              <YourSummaryCard
                itemTotal={currentUserSummary.itemTotal}
                taxShare={currentUserSummary.taxShare}
                tipShare={currentUserSummary.tipShare}
                feeShare={currentUserSummary.feeShare}
                totalOwed={currentUserSummary.totalOwed}
                totalPaid={currentUserSummary.totalPaid}
              />
            )}

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-zinc-100 md:text-xl">Who Pays Whom</h2>
              <SettlementTransfers
                sessionId={session.id}
                transfers={settlement.transfers}
                currentUserName={currentUserName}
                participantColors={session.participantColors}
              />
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-zinc-100 md:text-xl">
                Breakdown by Person
              </h2>
              <PersonBreakdown
                balances={settlement.balances}
                participants={session.participants}
                receipts={session.receipts}
                participantColors={session.participantColors}
                currentUserName={currentUserName}
              />
            </section>
          </div>
        </PageContainer>
      </main>

      <ExportDrawer
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        sessionName={session.name}
        balances={settlement.balances}
        transfers={settlement.transfers}
      />

      <Drawer open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg px-4 pb-8">
            <DrawerHeader className="px-0">
              <DrawerTitle>Share Session</DrawerTitle>
              <DrawerDescription>
                Invite others to collaborate in real time.
              </DrawerDescription>
            </DrawerHeader>
            <ShareSession
              shareCode={shareCode || session.id.slice(0, 6).toUpperCase()}
              sessionName={session.name}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
