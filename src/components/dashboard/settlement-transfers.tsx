"use client";

import { useEffect, useMemo } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Transfer } from "@/lib/calculations";

type PaidTransfersState = {
  paidByKey: Record<string, boolean>;
  hydrate: (paidByKey: Record<string, boolean>) => void;
  togglePaid: (key: string) => void;
};

const usePaidTransfersStore = create<PaidTransfersState>((set) => ({
  paidByKey: {},
  hydrate: (paidByKey) => set({ paidByKey }),
  togglePaid: (key) =>
    set((state) => ({
      paidByKey: {
        ...state.paidByKey,
        [key]: !state.paidByKey[key],
      },
    })),
}));

interface SettlementTransfersProps {
  sessionId: string;
  transfers: Transfer[];
  currentUserName: string | null;
  participantColors: Record<string, string>;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function keyForTransfer(sessionId: string, transfer: Transfer): string {
  return `${sessionId}:${transfer.from}:${transfer.to}:${transfer.amount.toFixed(2)}`;
}

export function SettlementTransfers({
  sessionId,
  transfers,
  currentUserName,
  participantColors,
}: SettlementTransfersProps) {
  const { paidByKey, hydrate, togglePaid } = usePaidTransfersStore();

  useEffect(() => {
    const key = `splitcheck_paid_transfers_${sessionId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        hydrate({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      hydrate(parsed);
    } catch {
      hydrate({});
    }
  }, [hydrate, sessionId]);

  useEffect(() => {
    const key = `splitcheck_paid_transfers_${sessionId}`;
    try {
      localStorage.setItem(key, JSON.stringify(paidByKey));
    } catch {
      // Ignore storage failures in private mode/quota exceeded.
    }
  }, [paidByKey, sessionId]);

  const { mine, others } = useMemo(() => {
    if (!currentUserName) return { mine: [] as Transfer[], others: transfers };
    return {
      mine: transfers.filter(
        (transfer) =>
          transfer.from === currentUserName || transfer.to === currentUserName
      ),
      others: transfers.filter(
        (transfer) =>
          transfer.from !== currentUserName && transfer.to !== currentUserName
      ),
    };
  }, [currentUserName, transfers]);

  const markPaid = async (transfer: Transfer) => {
    const transferKey = keyForTransfer(sessionId, transfer);
    const nextPaid = !paidByKey[transferKey];
    togglePaid(transferKey);

    await supabase.from("transfer_payments").upsert(
      {
        session_id: sessionId,
        transfer_key: transferKey,
        from_name: transfer.from,
        to_name: transfer.to,
        amount: transfer.amount,
        is_paid: nextPaid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "transfer_key" }
    );
  };

  if (transfers.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 text-center text-zinc-100">
        <p className="text-base font-semibold">
          No transfers needed - everyone is settled! 🎉
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {mine.map((transfer) => {
        const transferKey = keyForTransfer(sessionId, transfer);
        const isPaid = !!paidByKey[transferKey];
        const fromColor = participantColors[transfer.from] || "#71717a";
        const toColor = participantColors[transfer.to] || "#71717a";
        const youAreDebtor = currentUserName === transfer.from;

        return (
          <div
            key={transferKey}
            className={`rounded-2xl border p-4 transition-all duration-200 ${
              isPaid
                ? "border-emerald-500/40 bg-zinc-900/60 opacity-75"
                : "border-zinc-700 bg-zinc-900"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: fromColor }}
                >
                  {transfer.from === currentUserName
                    ? "You"
                    : initials(transfer.from)}
                </div>
                <span className="text-sm text-zinc-100">
                  {transfer.from === currentUserName ? "You" : transfer.from}
                </span>
                <ArrowRight className="h-4 w-4 text-zinc-400" />
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: toColor }}
                >
                  {transfer.to === currentUserName
                    ? "You"
                    : initials(transfer.to)}
                </div>
                <span className="text-sm text-zinc-100">
                  {transfer.to === currentUserName ? "You" : transfer.to}
                </span>
              </div>
              <span className="text-lg font-bold text-zinc-100">
                {formatCurrency(transfer.amount)}
              </span>
            </div>

            <div className="flex justify-end">
              {isPaid ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Paid
                </span>
              ) : youAreDebtor ? (
                <button
                  type="button"
                  onClick={() => void markPaid(transfer)}
                  className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-all active:scale-[0.98]"
                >
                  Mark Paid
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      {others.map((transfer) => {
        const transferKey = keyForTransfer(sessionId, transfer);
        const fromColor = participantColors[transfer.from] || "#71717a";
        const toColor = participantColors[transfer.to] || "#71717a";
        return (
          <div
            key={transferKey}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 text-zinc-300"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: fromColor }}
                >
                  {initials(transfer.from)}
                </div>
                <span>{transfer.from}</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: toColor }}
                >
                  {initials(transfer.to)}
                </div>
                <span>{transfer.to}</span>
              </div>
              <span className="text-sm font-semibold">
                {formatCurrency(transfer.amount)}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
