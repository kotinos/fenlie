"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  calculatePersonReceiptTotal,
  type PersonBalance,
} from "@/lib/calculations";
import type { Receipt } from "@/lib/store";

interface PersonBreakdownProps {
  balances: PersonBalance[];
  participants: string[];
  receipts: Receipt[];
  participantColors: Record<string, string>;
  currentUserName: string | null;
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

export function PersonBreakdown({
  balances,
  participants,
  receipts,
  participantColors,
  currentUserName,
}: PersonBreakdownProps) {
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const balanceByName = useMemo(() => {
    return new Map(balances.map((balance) => [balance.name, balance]));
  }, [balances]);

  const orderedPeople = useMemo(() => {
    if (!currentUserName) return participants;
    const rest = participants.filter((name) => name !== currentUserName);
    return [currentUserName, ...rest];
  }, [currentUserName, participants]);

  if (participants.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
        No participants yet.
      </section>
    );
  }

  return (
    <section className="space-y-2">
      {orderedPeople.map((person) => {
        const balance = balanceByName.get(person);
        if (!balance) return null;

        const displayNet = balance.totalPaid - balance.totalOwed;
        const netClass =
          Math.abs(displayNet) <= 0.01
            ? "text-zinc-400"
            : displayNet > 0
              ? "text-emerald-400"
              : "text-red-400";
        const isOpen = openPerson === person;
        const isYou = currentUserName === person;
        const color = participantColors[person] || "#71717a";

        return (
          <div
            key={person}
            className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70"
          >
            <button
              type="button"
              onClick={() => setOpenPerson(isOpen ? null : person)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {initials(person)}
                </div>
                <span className="text-sm font-semibold text-zinc-100">
                  {person}
                  {isYou ? " (You)" : ""}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${netClass}`}>
                  Net: {displayNet >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(displayNet))}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-zinc-800 px-4 pb-4 pt-3 text-sm text-zinc-200 animate-in slide-in-from-top-2 fade-in duration-200">
                {receipts.map((receipt, index) => {
                  const personTotal = calculatePersonReceiptTotal(receipt, person);
                  const paidOnReceipt = receipt.paidBy === person ? receipt.total : 0;
                  const receiptLabel =
                    receipt.restaurantName || `Receipt #${index + 1}`;

                  return (
                    <div
                      key={`${person}-${receipt.id}`}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"
                    >
                      <p className="mb-2 text-sm font-semibold text-zinc-100">
                        Receipt: {receiptLabel}
                      </p>
                      <div className="space-y-1 text-xs text-zinc-300">
                        <div className="flex items-center justify-between">
                          <span>Items</span>
                          <span>{formatCurrency(personTotal.itemTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Tax</span>
                          <span>{formatCurrency(personTotal.taxShare)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Tip</span>
                          <span>{formatCurrency(personTotal.tipShare)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Fees</span>
                          <span>{formatCurrency(personTotal.feeShare)}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 text-zinc-100">
                          <span>Subtotal</span>
                          <span>{formatCurrency(personTotal.total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Paid</span>
                          <span>{formatCurrency(paidOnReceipt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
