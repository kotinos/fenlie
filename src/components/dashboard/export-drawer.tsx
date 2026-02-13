"use client";

import { useCallback, useMemo, useState } from "react";
import { ClipboardList, Share2, Camera, Check } from "lucide-react";
import type { PersonBalance, Transfer } from "@/lib/calculations";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface ExportDrawerProps {
  open: boolean;
  onClose: () => void;
  sessionName: string;
  balances: PersonBalance[];
  transfers: Transfer[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function ExportDrawer({
  open,
  onClose,
  sessionName,
  balances,
  transfers,
}: ExportDrawerProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const summaryText = useMemo(() => {
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const transferLines =
      transfers.length === 0
        ? ["• No transfers needed"]
        : transfers.map(
            (transfer) =>
              `• ${transfer.from} → ${transfer.to}: ${formatCurrency(
                transfer.amount
              )}`
          );

    const breakdownLines = balances.map((balance) => {
      const netDisplay = balance.totalPaid - balance.totalOwed;
      return `• ${balance.name}: paid ${formatCurrency(
        balance.totalPaid
      )}, owes ${formatCurrency(balance.totalOwed)}, net ${
        netDisplay >= 0 ? "+" : "-"
      }${formatCurrency(Math.abs(netDisplay))}`;
    });

    return [
      `SplitCheck Settlement — ${sessionName}`,
      date,
      "",
      "Transfers:",
      ...transferLines,
      "",
      "Breakdown:",
      ...breakdownLines,
    ].join("\n");
  }, [balances, sessionName, transfers]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(summaryText);
    showToast("Copied ✓");
  }, [showToast, summaryText]);

  const handleCopy = async () => {
    try {
      await copyText();
    } catch {
      showToast("Copy failed");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `SplitCheck Settlement — ${sessionName}`,
          text: summaryText,
        });
        return;
      } catch {
        // Continue to clipboard fallback.
      }
    }

    try {
      await copyText();
    } catch {
      showToast("Share unavailable");
    }
  };

  const handleScreenshot = async () => {
    try {
      // TODO: Replace this fallback with html2canvas capture when dependency is added.
      await copyText();
      showToast("Screenshot saved (text fallback)");
    } catch {
      showToast("Screenshot fallback failed");
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg px-4 pb-8">
            <DrawerHeader className="px-0">
              <DrawerTitle>Export Settlement</DrawerTitle>
              <DrawerDescription>
                Share or copy the latest settlement summary.
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left text-zinc-100 transition-all active:scale-[0.98]"
              >
                <div className="flex items-start gap-3">
                  <ClipboardList className="mt-0.5 h-5 w-5 text-blue-400" />
                  <div>
                    <p className="font-semibold">Copy as Text</p>
                    <p className="text-sm text-zinc-400">
                      Plain text summary to clipboard
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void handleShare()}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left text-zinc-100 transition-all active:scale-[0.98]"
              >
                <div className="flex items-start gap-3">
                  <Share2 className="mt-0.5 h-5 w-5 text-blue-400" />
                  <div>
                    <p className="font-semibold">Share</p>
                    <p className="text-sm text-zinc-400">
                      Send via native share sheet
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void handleScreenshot()}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left text-zinc-100 transition-all active:scale-[0.98]"
              >
                <div className="flex items-start gap-3">
                  <Camera className="mt-0.5 h-5 w-5 text-blue-400" />
                  <div>
                    <p className="font-semibold">Screenshot</p>
                    <p className="text-sm text-zinc-400">
                      Save settlement as image
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg animate-in slide-in-from-bottom-3 fade-in">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            {toastMessage}
          </span>
        </div>
      )}
    </>
  );
}
