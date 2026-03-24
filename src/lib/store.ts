"use client";

import { create } from "zustand";
import { announce } from "@/lib/utils";
import {
  fetchSessionGraph,
  lineItemsApi,
  participantsApi,
  receiptsApi,
  sessionsApi,
  type DbLineItem,
  type DbParticipant,
  type DbReceipt,
  type DbSession,
} from "@/lib/supabase";
import { generateUniqueShareCode } from "@/lib/share-code";
import type { LineItem, Receipt, Session, SharedCosts } from "@/lib/types";

export type { LineItem, Receipt, Session, SharedCosts };
export type { DbLineItem, DbParticipant, DbReceipt, DbSession };

const COLORS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ea580c",
  "#4f46e5",
  "#0891b2",
];

export function pickColor(existing: Record<string, string>): string {
  const used = new Set(Object.values(existing));
  const available = COLORS.find((c) => !used.has(c));
  return available ?? COLORS[Object.keys(existing).length % COLORS.length];
}

function notifySyncError(message: string, error: unknown) {
  console.error(message, error);
  announce(`${message}. Please retry.`);
}

function recalcReceipt(receipt: Receipt): Receipt {
  const subtotal = receipt.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const total =
    subtotal +
    receipt.sharedCosts.tax +
    receipt.sharedCosts.tip +
    receipt.sharedCosts.fees;
  return { ...receipt, subtotal, total };
}

function mapDbLineItem(item: DbLineItem): LineItem {
  return {
    id: item.id,
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    totalPrice: Number(item.total_price),
    claimedBy: item.claimed_by ?? [],
    isEdited: item.is_edited,
  };
}

function mapDbReceipt(receipt: DbReceipt, lineItems: DbLineItem[]): Receipt {
  return {
    id: receipt.id,
    sessionId: receipt.session_id,
    imageUrl: receipt.image_url,
    paidBy: receipt.paid_by ?? "",
    status: receipt.status,
    lineItems: lineItems.map(mapDbLineItem),
    sharedCosts: {
      tax: Number(receipt.tax),
      tip: Number(receipt.tip),
      fees: Number(receipt.fees),
    },
    subtotal: Number(receipt.subtotal),
    total: Number(receipt.total),
    restaurantName: receipt.restaurant_name,
    date: receipt.date,
  };
}

type SyncStatus = "synced" | "syncing" | "error";

type SplitCheckState = {
  sessions: Session[];
  syncStatus: SyncStatus;

  createSession: (
    name: string,
    createdBy: string,
    participants: string[]
  ) => Promise<string>;
  deleteSession: (sessionId: string) => void;
  addParticipant: (sessionId: string, participantName: string) => void;
  removeParticipant: (sessionId: string, participantName: string) => void;

  addReceipt: (
    sessionId: string,
    receipt: Omit<Receipt, "id" | "sessionId">
  ) => string;
  updateReceipt: (receiptId: string, patch: Partial<Receipt>) => void;
  deleteReceipt: (receiptId: string) => void;

  addLineItem: (
    receiptId: string,
    item: Omit<LineItem, "id">
  ) => string;
  updateLineItem: (
    receiptId: string,
    lineItemId: string,
    patch: Partial<LineItem>
  ) => void;
  deleteLineItem: (receiptId: string, lineItemId: string) => void;
  claimItem: (receiptId: string, lineItemId: string, participantName: string) => void;
  unclaimItem: (receiptId: string, lineItemId: string, participantName: string) => void;
  claimAllItems: (receiptId: string, participantName: string) => void;
  splitAllItemsEqually: (receiptId: string) => void;
  clearAllClaims: (receiptId: string) => void;
  setPayer: (receiptId: string, participantName: string) => void;
  updateSharedCosts: (receiptId: string, costs: SharedCosts) => void;

  _hydrateSession: (session: Session) => void;
  _applySessionChange: (event: "UPDATE" | "DELETE", row: DbSession) => void;
  _applyParticipantChange: (
    event: "INSERT" | "UPDATE" | "DELETE",
    row: DbParticipant
  ) => void;
  _applyReceiptChange: (event: "INSERT" | "UPDATE" | "DELETE", row: DbReceipt) => void;
  _applyLineItemChange: (
    event: "INSERT" | "UPDATE" | "DELETE",
    row: DbLineItem
  ) => void;
};

export const useSplitCheckStore = create<SplitCheckState>((set, get) => ({
  sessions: [],
  syncStatus: "synced",

  createSession: async (name, createdBy, participants) => {
    set({ syncStatus: "syncing" });
    const shareCode = await generateUniqueShareCode();
    const { data, error } = await sessionsApi.create({
      name,
      share_code: shareCode,
      created_by: createdBy,
    });
    if (error || !data) {
      set({ syncStatus: "error" });
      throw error ?? new Error("Failed to create session");
    }

    const colorMap: Record<string, string> = {};
    const uniqueParticipants = Array.from(new Set(participants)).filter(Boolean);
    uniqueParticipants.forEach((p) => {
      colorMap[p] = pickColor(colorMap);
    });

    if (uniqueParticipants.length > 0) {
      const inserts = uniqueParticipants.map((p) => ({
        session_id: data.id,
        name: p,
        color: colorMap[p],
        is_online: p === createdBy,
      }));
      const { error: participantsError } = await participantsApi.create(inserts[0]);
      if (participantsError) {
        set({ syncStatus: "error" });
        throw participantsError;
      }
      for (let i = 1; i < inserts.length; i += 1) {
        await participantsApi.create(inserts[i]);
      }
    }

    await fetchAndHydrateSession(data.id);
    set({ syncStatus: "synced" });
    return data.id;
  },

  deleteSession: (sessionId) => {
    const prev = get().sessions;
    set({
      sessions: prev.filter((s) => s.id !== sessionId),
      syncStatus: "syncing",
    });
    sessionsApi.remove(sessionId).then(({ error }) => {
      if (error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to delete session", error);
        return;
      }
      set({ syncStatus: "synced" });
    });
  },

  addParticipant: (sessionId, participantName) => {
    const name = participantName.trim();
    if (!name) return;
    const prev = get().sessions;
    const session = prev.find((s) => s.id === sessionId);
    if (!session || session.participants.includes(name)) return;
    const color = pickColor(session.participantColors);
    const next = prev.map((s) =>
      s.id !== sessionId
        ? s
        : {
            ...s,
            participants: [...s.participants, name],
            participantColors: { ...s.participantColors, [name]: color },
          }
    );
    set({ sessions: next, syncStatus: "syncing" });
    participantsApi
      .create({ session_id: sessionId, name, color, is_online: false })
      .then(({ error }) => {
        if (error) {
          set({ sessions: prev, syncStatus: "error" });
          notifySyncError("Failed to add participant", error);
          return;
        }
        set({ syncStatus: "synced" });
      });
  },

  removeParticipant: (sessionId, participantName) => {
    const prev = get().sessions;
    const next = prev.map((s) =>
      s.id !== sessionId
        ? s
        : {
            ...s,
            participants: s.participants.filter((p) => p !== participantName),
            participantColors: Object.fromEntries(
              Object.entries(s.participantColors).filter(([k]) => k !== participantName)
            ),
            receipts: s.receipts.map((r) => ({
              ...r,
              paidBy: r.paidBy === participantName ? "" : r.paidBy,
              lineItems: r.lineItems.map((li) => ({
                ...li,
                claimedBy: li.claimedBy.filter((p) => p !== participantName),
              })),
            })),
          }
    );
    set({ sessions: next, syncStatus: "syncing" });
    participantsApi.removeByName(sessionId, participantName).then(({ error }) => {
      if (error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to remove participant", error);
        return;
      }
      set({ syncStatus: "synced" });
    });
  },

  addReceipt: (sessionId, receipt) => {
    const id = crypto.randomUUID();
    const nextReceipt: Receipt = recalcReceipt({ ...receipt, id, sessionId });
    const prev = get().sessions;
    set({
      sessions: prev.map((s) =>
        s.id === sessionId ? { ...s, receipts: [...s.receipts, nextReceipt] } : s
      ),
      syncStatus: "syncing",
    });
    receiptsApi
      .create({
        id,
        session_id: sessionId,
        image_url: nextReceipt.imageUrl,
        paid_by: nextReceipt.paidBy,
        status: nextReceipt.status,
        restaurant_name: nextReceipt.restaurantName,
        date: nextReceipt.date,
        tax: nextReceipt.sharedCosts.tax,
        tip: nextReceipt.sharedCosts.tip,
        fees: nextReceipt.sharedCosts.fees,
        subtotal: nextReceipt.subtotal,
        total: nextReceipt.total,
      } as DbReceipt)
      .then(async ({ error }) => {
        if (error) {
          set({ sessions: prev, syncStatus: "error" });
          notifySyncError("Failed to add receipt", error);
          return;
        }
        for (let i = 0; i < nextReceipt.lineItems.length; i += 1) {
          const item = nextReceipt.lineItems[i];
          await lineItemsApi.create({
            id: item.id,
            receipt_id: id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            claimed_by: item.claimedBy,
            is_edited: item.isEdited,
            sort_order: i,
          });
        }
        set({ syncStatus: "synced" });
      });
    return id;
  },

  updateReceipt: (receiptId, patch) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id === receiptId ? recalcReceipt({ ...r, ...patch }) : r
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    receiptsApi
      .update(receiptId, {
        image_url: patch.imageUrl,
        paid_by: patch.paidBy,
        status: patch.status,
        restaurant_name: patch.restaurantName,
        date: patch.date,
        tax: patch.sharedCosts?.tax,
        tip: patch.sharedCosts?.tip,
        fees: patch.sharedCosts?.fees,
        subtotal: patch.subtotal,
        total: patch.total,
      })
      .then(({ error }) => {
        if (error) {
          set({ sessions: prev, syncStatus: "error" });
          notifySyncError("Failed to update receipt", error);
          return;
        }
        set({ syncStatus: "synced" });
      });
  },

  deleteReceipt: (receiptId) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.filter((r) => r.id !== receiptId),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    receiptsApi.remove(receiptId).then(({ error }) => {
      if (error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to delete receipt", error);
        return;
      }
      set({ syncStatus: "synced" });
    });
  },

  addLineItem: (receiptId, item) => {
    const id = crypto.randomUUID();
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id !== receiptId
          ? r
          : recalcReceipt({
              ...r,
              lineItems: [...r.lineItems, { ...item, id }],
            })
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    lineItemsApi
      .create({
        id,
        receipt_id: receiptId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        claimed_by: item.claimedBy,
        is_edited: item.isEdited,
        sort_order:
          next
            .flatMap((s) => s.receipts)
            .find((r) => r.id === receiptId)?.lineItems.length ?? 0,
      })
      .then(({ error }) => {
        if (error) {
          set({ sessions: prev, syncStatus: "error" });
          notifySyncError("Failed to add line item", error);
          return;
        }
        const receipt = get()
          .sessions.flatMap((s) => s.receipts)
          .find((r) => r.id === receiptId);
        if (receipt) {
          receiptsApi.update(receiptId, {
            subtotal: receipt.subtotal,
            total: receipt.total,
          });
        }
        set({ syncStatus: "synced" });
      });
    return id;
  },

  updateLineItem: (receiptId, lineItemId, patch) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id !== receiptId
          ? r
          : recalcReceipt({
              ...r,
              lineItems: r.lineItems.map((li) =>
                li.id === lineItemId ? { ...li, ...patch } : li
              ),
            })
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    lineItemsApi
      .update(lineItemId, {
        description: patch.description,
        quantity: patch.quantity,
        unit_price: patch.unitPrice,
        total_price: patch.totalPrice,
        claimed_by: patch.claimedBy,
        is_edited: patch.isEdited,
      })
      .then(async ({ error }) => {
        if (error) {
          set({ sessions: prev, syncStatus: "error" });
          notifySyncError("Failed to update line item", error);
          return;
        }
        const receipt = get()
          .sessions.flatMap((s) => s.receipts)
          .find((r) => r.id === receiptId);
        if (receipt) {
          await receiptsApi.update(receiptId, {
            subtotal: receipt.subtotal,
            total: receipt.total,
          });
        }
        set({ syncStatus: "synced" });
      });
  },

  deleteLineItem: (receiptId, lineItemId) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id !== receiptId
          ? r
          : recalcReceipt({
              ...r,
              lineItems: r.lineItems.filter((li) => li.id !== lineItemId),
            })
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    lineItemsApi.remove(lineItemId).then(async ({ error }) => {
      if (error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to delete line item", error);
        return;
      }
      const receipt = get()
        .sessions.flatMap((s) => s.receipts)
        .find((r) => r.id === receiptId);
      if (receipt) {
        await receiptsApi.update(receiptId, {
          subtotal: receipt.subtotal,
          total: receipt.total,
        });
      }
      set({ syncStatus: "synced" });
    });
  },

  claimItem: (receiptId, lineItemId, participantName) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id !== receiptId
          ? r
          : {
              ...r,
              lineItems: r.lineItems.map((li) =>
                li.id !== lineItemId || li.claimedBy.includes(participantName)
                  ? li
                  : { ...li, claimedBy: [...li.claimedBy, participantName] }
              ),
            }
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    lineItemsApi.claimItem(lineItemId, participantName).then(({ error }) => {
      if (error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to claim item", error);
        return;
      }
      set({ syncStatus: "synced" });
    });
  },

  unclaimItem: (receiptId, lineItemId, participantName) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id !== receiptId
          ? r
          : {
              ...r,
              lineItems: r.lineItems.map((li) =>
                li.id !== lineItemId
                  ? li
                  : {
                      ...li,
                      claimedBy: li.claimedBy.filter((p) => p !== participantName),
                    }
              ),
            }
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    lineItemsApi.unclaimItem(lineItemId, participantName).then(({ error }) => {
      if (error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to unclaim item", error);
        return;
      }
      set({ syncStatus: "synced" });
    });
  },

  claimAllItems: (receiptId, participantName) => {
    const receipt = get()
      .sessions.flatMap((s) => s.receipts)
      .find((r) => r.id === receiptId);
    if (!receipt) return;
    receipt.lineItems.forEach((item) => {
      if (!item.claimedBy.includes(participantName)) {
        get().claimItem(receiptId, item.id, participantName);
      }
    });
  },

  splitAllItemsEqually: (receiptId) => {
    const session = get().sessions.find((s) => s.receipts.some((r) => r.id === receiptId));
    const participants = session?.participants ?? [];
    if (participants.length === 0) return;
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id !== receiptId
          ? r
          : {
              ...r,
              lineItems: r.lineItems.map((li) => ({ ...li, claimedBy: [...participants] })),
            }
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    const updates = next
      .flatMap((s) => s.receipts)
      .find((r) => r.id === receiptId)?.lineItems;
    Promise.all(
      (updates ?? []).map((item) => lineItemsApi.update(item.id, { claimed_by: item.claimedBy }))
    ).then((results) => {
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to split items equally", failed.error);
        return;
      }
      set({ syncStatus: "synced" });
    });
  },

  clearAllClaims: (receiptId) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id !== receiptId
          ? r
          : { ...r, lineItems: r.lineItems.map((li) => ({ ...li, claimedBy: [] })) }
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    const updates = next
      .flatMap((s) => s.receipts)
      .find((r) => r.id === receiptId)?.lineItems;
    Promise.all((updates ?? []).map((item) => lineItemsApi.update(item.id, { claimed_by: [] })))
      .then((results) => {
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          set({ sessions: prev, syncStatus: "error" });
          notifySyncError("Failed to clear all claims", failed.error);
          return;
        }
        set({ syncStatus: "synced" });
      });
  },

  setPayer: (receiptId, participantName) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id === receiptId ? { ...r, paidBy: participantName } : r
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    receiptsApi.update(receiptId, { paid_by: participantName }).then(({ error }) => {
      if (error) {
        set({ sessions: prev, syncStatus: "error" });
        notifySyncError("Failed to update payer", error);
        return;
      }
      set({ syncStatus: "synced" });
    });
  },

  updateSharedCosts: (receiptId, costs) => {
    const prev = get().sessions;
    const next = prev.map((s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id === receiptId ? recalcReceipt({ ...r, sharedCosts: costs }) : r
      ),
    }));
    set({ sessions: next, syncStatus: "syncing" });
    const receipt = next
      .flatMap((s) => s.receipts)
      .find((r) => r.id === receiptId);
    receiptsApi
      .update(receiptId, {
        tax: costs.tax,
        tip: costs.tip,
        fees: costs.fees,
        subtotal: receipt?.subtotal,
        total: receipt?.total,
      })
      .then(({ error }) => {
        if (error) {
          set({ sessions: prev, syncStatus: "error" });
          notifySyncError("Failed to update shared costs", error);
          return;
        }
        set({ syncStatus: "synced" });
      });
  },

  _hydrateSession: (session) => {
    set((state) => {
      const existingIndex = state.sessions.findIndex((s) => s.id === session.id);
      if (existingIndex === -1) return { sessions: [...state.sessions, session] };
      const next = [...state.sessions];
      next[existingIndex] = session;
      return { sessions: next };
    });
  },

  _applySessionChange: (event, row) => {
    set((state) => {
      if (event === "DELETE") {
        return { sessions: state.sessions.filter((s) => s.id !== row.id) };
      }
      return {
        sessions: state.sessions.map((s) =>
          s.id === row.id ? { ...s, name: row.name } : s
        ),
      };
    });
  },

  _applyParticipantChange: (event, row) => {
    set((state) => {
      const target = state.sessions.find((s) => s.id === row.session_id);
      if (!target) return {};

      if (event === "DELETE") {
        if (!target.participants.includes(row.name)) return {};
        return {
          sessions: state.sessions.map((s) =>
            s.id !== row.session_id
              ? s
              : {
                  ...s,
                  participants: s.participants.filter((p) => p !== row.name),
                  participantColors: Object.fromEntries(
                    Object.entries(s.participantColors).filter(([k]) => k !== row.name)
                  ),
                }
          ),
        };
      }

      const exists = target.participants.includes(row.name);
      const colorMatch = target.participantColors[row.name] === row.color;
      if (exists && colorMatch) return {};
      return {
        sessions: state.sessions.map((s) =>
          s.id !== row.session_id
            ? s
            : {
                ...s,
                participants: exists ? s.participants : [...s.participants, row.name],
                participantColors: { ...s.participantColors, [row.name]: row.color },
              }
        ),
      };
    });
  },

  _applyReceiptChange: (event, row) => {
    set((state) => {
      const session = state.sessions.find((s) => s.id === row.session_id);
      if (!session) return {};
      if (event === "DELETE") {
        if (!session.receipts.some((r) => r.id === row.id)) return {};
        return {
          sessions: state.sessions.map((s) =>
            s.id !== row.session_id
              ? s
              : { ...s, receipts: s.receipts.filter((r) => r.id !== row.id) }
          ),
        };
      }

      const mapped = mapDbReceipt(row, []);
      const existing = session.receipts.find((r) => r.id === row.id);
      if (
        existing &&
        existing.paidBy === mapped.paidBy &&
        existing.status === mapped.status &&
        existing.total === mapped.total &&
        existing.subtotal === mapped.subtotal &&
        existing.restaurantName === mapped.restaurantName
      ) {
        return {};
      }
      return {
        sessions: state.sessions.map((s) =>
          s.id !== row.session_id
            ? s
            : {
                ...s,
                receipts: existing
                  ? s.receipts.map((r) =>
                      r.id === row.id ? { ...r, ...mapped, lineItems: r.lineItems } : r
                    )
                  : [...s.receipts, mapped],
              }
        ),
      };
    });
  },

  _applyLineItemChange: (event, row) => {
    set((state) => {
      const session = state.sessions.find((s) =>
        s.receipts.some((r) => r.id === row.receipt_id)
      );
      if (!session) return {};
      const receipt = session.receipts.find((r) => r.id === row.receipt_id);
      if (!receipt) return {};

      if (event === "DELETE") {
        if (!receipt.lineItems.some((li) => li.id === row.id)) return {};
        return {
          sessions: state.sessions.map((s) =>
            s.id !== session.id
              ? s
              : {
                  ...s,
                  receipts: s.receipts.map((r) =>
                    r.id !== row.receipt_id
                      ? r
                      : recalcReceipt({
                          ...r,
                          lineItems: r.lineItems.filter((li) => li.id !== row.id),
                        })
                  ),
                }
          ),
        };
      }

      const mapped = mapDbLineItem(row);
      const existing = receipt.lineItems.find((li) => li.id === row.id);
      if (
        existing &&
        existing.description === mapped.description &&
        existing.quantity === mapped.quantity &&
        existing.unitPrice === mapped.unitPrice &&
        existing.totalPrice === mapped.totalPrice &&
        existing.isEdited === mapped.isEdited &&
        existing.claimedBy.join("|") === mapped.claimedBy.join("|")
      ) {
        return {};
      }

      return {
        sessions: state.sessions.map((s) =>
          s.id !== session.id
            ? s
            : {
                ...s,
                receipts: s.receipts.map((r) =>
                  r.id !== row.receipt_id
                    ? r
                    : recalcReceipt({
                        ...r,
                        lineItems: existing
                          ? r.lineItems.map((li) => (li.id === row.id ? mapped : li))
                          : [...r.lineItems, mapped],
                      })
                ),
              }
        ),
      };
    });
  },
}));

export async function fetchAndHydrateSession(sessionId: string) {
  const graph = await fetchSessionGraph(sessionId);
  if (!graph) return null;

  const participantColors = Object.fromEntries(
    graph.participants.map((p) => [p.name, p.color])
  );
  const participants = graph.participants.map((p) => p.name);

  const receipts: Receipt[] = graph.receipts.map((r) =>
    mapDbReceipt(r, r.line_items ?? [])
  );

  const session: Session = {
    id: graph.session.id,
    name: graph.session.name,
    createdAt: graph.session.created_at,
    participants,
    participantColors,
    receipts,
  };

  useSplitCheckStore.getState()._hydrateSession(session);
  return session;
}

export async function createSessionInSupabase(
  name: string,
  createdBy: string,
  otherParticipants: string[] = []
) {
  const participants = [createdBy, ...otherParticipants];
  const sessionId = await useSplitCheckStore
    .getState()
    .createSession(name, createdBy, participants);
  return { sessionId };
}
