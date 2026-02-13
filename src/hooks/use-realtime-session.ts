"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  useSplitCheckStore,
  fetchAndHydrateSession,
  type DbLineItem,
  type DbReceipt,
  type DbParticipant,
  type DbSession,
} from "@/lib/store";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to Supabase Realtime `postgres_changes` for all four tables
 * filtered by session_id. Applies incremental patches to the Zustand store
 * via the `_apply*` methods so every participant sees live changes.
 *
 * Call this hook once per mounted session page.
 */
export function useRealtimeSession(sessionId: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);

  const session = useSplitCheckStore((s) =>
    s.sessions.find((x) => x.id === sessionId)
  );

  // ── Initial fetch ────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchAndHydrateSession(sessionId);
    } catch (e) {
      console.error("Failed to fetch session:", e);
      setError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    // If we don't already have the session in the store, fetch it.
    const existing = useSplitCheckStore.getState().sessions.find(
      (x) => x.id === sessionId
    );
    if (!existing) {
      fetchSession();
    } else {
      setIsLoading(false);
      // Still refresh in the background to pick up changes while offline
      fetchSession();
    }

    // ── Realtime subscription ──────────────────────────────────────────
    const channel = supabase
      .channel(`session:${sessionId}`)
      // Line items — filter by receipt_id isn't possible across all
      // receipts, so we subscribe to all line_items and filter client-side
      // for the session's receipts. For tables with session_id we filter
      // server-side via the `filter` param.
      .on<DbLineItem>(
        "postgres_changes",
        { event: "*", schema: "public", table: "line_items" },
        (payload) => {
          const row = (payload.new ?? payload.old) as DbLineItem;
          if (!row) return;
          // Check the row belongs to a receipt in this session
          const store = useSplitCheckStore.getState();
          const sess = store.sessions.find((x) => x.id === sessionId);
          if (!sess) return;

          const eventType = payload.eventType.toUpperCase() as
            | "INSERT"
            | "UPDATE"
            | "DELETE";

          if (eventType === "DELETE") {
            // For DELETE, the old row is used
            const oldRow = payload.old as DbLineItem;
            if (
              oldRow &&
              sess.receipts.some((r) => r.id === oldRow.receipt_id)
            ) {
              store._applyLineItemChange("DELETE", oldRow);
            }
            return;
          }

          if (sess.receipts.some((r) => r.id === row.receipt_id)) {
            store._applyLineItemChange(eventType, row);
          }
        }
      )
      .on<DbReceipt>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "receipts",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const eventType = payload.eventType.toUpperCase() as
            | "INSERT"
            | "UPDATE"
            | "DELETE";
          const row = (payload.new ?? payload.old) as DbReceipt;
          if (!row) return;
          useSplitCheckStore
            .getState()
            ._applyReceiptChange(eventType, row);
        }
      )
      .on<DbParticipant>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participants",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const eventType = payload.eventType.toUpperCase() as
            | "INSERT"
            | "UPDATE"
            | "DELETE";
          const row = (payload.new ?? payload.old) as DbParticipant;
          if (!row) return;
          useSplitCheckStore
            .getState()
            ._applyParticipantChange(eventType, row);
        }
      )
      .on<DbSession>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const eventType = payload.eventType.toUpperCase() as
            | "UPDATE"
            | "DELETE";
          const row = (payload.new ?? payload.old) as DbSession;
          if (!row) return;
          useSplitCheckStore
            .getState()
            ._applySessionChange(eventType, row);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
        } else if (status === "TIMED_OUT") {
          setIsConnected(false);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      setIsConnected(false);
      const currentUser =
        typeof window !== "undefined"
          ? localStorage.getItem(`splitcheck_user_${sessionId}`)
          : null;
      if (currentUser) {
        supabase
          .from("participants")
          .update({ is_online: false, last_seen: new Date().toISOString() })
          .eq("session_id", sessionId)
          .eq("name", currentUser)
          .then(() => {});
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId, fetchSession]);

  return {
    session: session ?? null,
    isLoading,
    error,
    isConnected,
  };
}
