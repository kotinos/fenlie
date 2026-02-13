"use client";

import { useMemo } from "react";

interface YourSummaryCardProps {
  itemTotal: number;
  taxShare: number;
  tipShare: number;
  feeShare: number;
  totalOwed: number;
  totalPaid: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function YourSummaryCard({
  itemTotal,
  taxShare,
  tipShare,
  feeShare,
  totalOwed,
  totalPaid,
}: YourSummaryCardProps) {
  const net = useMemo(() => totalPaid - totalOwed, [totalOwed, totalPaid]);

  const tone = useMemo(() => {
    if (Math.abs(net) <= 0.01) {
      return {
        card: "border-emerald-500/40 bg-emerald-500/10",
        title: "You're all settled up",
        hero: "text-emerald-300",
      };
    }
    if (net < 0) {
      return {
        card: "border-red-500/40 bg-red-500/10",
        title: "You owe",
        hero: "text-red-300",
      };
    }
    return {
      card: "border-emerald-500/40 bg-emerald-500/10",
      title: "You're owed",
      hero: "text-emerald-300",
    };
  }, [net]);

  return (
    <section className={`rounded-2xl border p-5 ${tone.card}`}>
      <p className="text-center text-sm font-semibold uppercase tracking-wide text-zinc-300">
        Your Balance
      </p>

      <p className={`mt-4 text-center text-3xl font-bold ${tone.hero}`}>
        {Math.abs(net) <= 0.01
          ? "You're all settled up ✓"
          : `${tone.title} ${formatCurrency(Math.abs(net))}`}
      </p>

      <div className="mt-5 space-y-1.5 text-sm text-zinc-200">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Items claimed</span>
          <span>{formatCurrency(itemTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Tax share</span>
          <span>{formatCurrency(taxShare)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Tip share</span>
          <span>{formatCurrency(tipShare)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Fees share</span>
          <span>{formatCurrency(feeShare)}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-zinc-400">Total owed</span>
          <span>{formatCurrency(totalOwed)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">You paid</span>
          <span>{formatCurrency(totalPaid)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-zinc-700" />

      <div className="flex items-center justify-between text-base font-semibold text-zinc-100">
        <span>Net</span>
        <span className={net < 0 ? "text-red-300" : "text-emerald-300"}>
          {net >= 0 ? "+" : "-"}
          {formatCurrency(Math.abs(net))}
        </span>
      </div>
    </section>
  );
}
