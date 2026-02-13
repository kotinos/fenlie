"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CACHE_CONFIG } from "@/lib/cache/cache-config";
import {
  cacheFullSession,
  evictOldSessions,
  getCachedFullSession,
  isCacheExpired,
  isCacheStale,
} from "@/lib/cache/cache-utils";
import { supabase } from "@/lib/supabase";
import type { LineItem, Receipt, Session } from "@/lib/cache/db";

type CacheGraph = {
  session: Session;
  receipts: Receipt[];
  lineItems: LineItem[];
};

type HookState = {
  session: Session | null;
  receipts: Receipt[];
  lineItems: LineItem[];
  isLoading: boolean;
  isRevalidating: boolean;
  isOffline: boolean;
  isStale: boolean;
  error: Error | null;
};

type SessionRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  host_identity?: string;
  status?: "active" | "settled";
};

type ReceiptRow = {
  id: string;
  session_id: string;
  restaurant_name: string | null;
  created_at: string;
  total: number | string | null;
  tax: number | string | null;
  tip: number | string | null;
};

type LineItemRow = {
  id: string;
  receipt_id: string;
  description: string;
  total_price: number | string | null;
  amount?: number | string | null;
  quantity: number | string | null;
  claimed_by: string[] | string | null;
  claimed_at?: string | null;
};

/** Convert unknown numeric values into safe numbers. */
function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Pause execution for retry backoff timing. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Normalize DB line item row into cache contract shape. */
function mapLineItemRow(row: LineItemRow): LineItem {
  const claimedBy =
    typeof row.claimed_by === "string"
      ? row.claimed_by
      : Array.isArray(row.claimed_by)
        ? row.claimed_by[0] ?? null
        : null;

  return {
    id: row.id,
    receipt_id: row.receipt_id,
    description: row.description,
    amount: toNumber(row.amount ?? row.total_price),
    quantity: toNumber(row.quantity) || 1,
    claimed_by: claimedBy,
    claimed_at: row.claimed_at ?? null,
  };
}

/** Fetch session graph from Supabase and map to cache contract types. */
async function fetchSessionGraphFromSupabase(sessionId: string): Promise<CacheGraph> {
  const { data: sessionData, error: sessionError } = await supabase
    .from("sessions")
    .select("id,name,created_at,created_by")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!sessionData) throw new Error("Session not found");

  const sessionRow = sessionData as SessionRow;
  const session: Session = {
    id: sessionRow.id,
    name: sessionRow.name,
    created_at: sessionRow.created_at,
    updated_at: sessionRow.updated_at ?? sessionRow.created_at,
    host_identity: sessionRow.host_identity ?? sessionRow.created_by,
    status: sessionRow.status ?? "active",
  };

  const { data: receiptsData, error: receiptsError } = await supabase
    .from("receipts")
    .select("id,session_id,restaurant_name,created_at,total,tax,tip")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (receiptsError) throw receiptsError;
  const receiptsRows = (receiptsData ?? []) as ReceiptRow[];
  const receipts: Receipt[] = receiptsRows.map((row) => ({
    id: row.id,
    session_id: row.session_id,
    store_name: row.restaurant_name ?? "Receipt",
    created_at: row.created_at,
    total: toNumber(row.total),
    tax: toNumber(row.tax),
    tip: toNumber(row.tip),
  }));

  const receiptIds = receipts.map((receipt) => receipt.id);
  if (receiptIds.length === 0) {
    return { session, receipts, lineItems: [] };
  }

  const { data: lineItemsData, error: lineItemsError } = await supabase
    .from("line_items")
    .select("id,receipt_id,description,total_price,quantity,claimed_by")
    .in("receipt_id", receiptIds);

  if (lineItemsError) throw lineItemsError;
  const lineItemsRows = (lineItemsData ?? []) as LineItemRow[];
  const lineItems = lineItemsRows.map(mapLineItemRow);

  return { session, receipts, lineItems };
}

/** Build the default hook state for a session view. */
function createInitialState(): HookState {
  return {
    session: null,
    receipts: [],
    lineItems: [],
    isLoading: true,
    isRevalidating: false,
    isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    isStale: false,
    error: null,
  };
}

/** Read-through cached session hook with stale-while-revalidate semantics. */
export function useCachedSession(sessionId: string): {
  session: Session | null;
  receipts: Receipt[];
  lineItems: LineItem[];
  isLoading: boolean;
  isRevalidating: boolean;
  isOffline: boolean;
  isStale: boolean;
  error: Error | null;
  revalidate: () => void;
} {
  const [state, setState] = useState<HookState>(createInitialState);
  const [revalidateTick, setRevalidateTick] = useState(0);
  const latestRequestIdRef = useRef(0);
  const consumedRevalidateTickRef = useRef(0);

  const cachedGraph = useLiveQuery(
    async () => {
      if (!sessionId) return null;
      return getCachedFullSession(sessionId);
    },
    [sessionId]
  );

  /** Trigger a manual background revalidation fetch. */
  const revalidate = useCallback(() => {
    setRevalidateTick((value) => value + 1);
  }, []);

  useEffect(() => {
    /** Sync online/offline flags and auto-revalidate on reconnect. */
    function handleOnline(): void {
      setState((prev) => ({ ...prev, isOffline: false }));
      setRevalidateTick((value) => value + 1);
    }

    /** Sync offline flags while preserving currently shown data. */
    function handleOffline(): void {
      setState((prev) => ({
        ...prev,
        isOffline: true,
        isStale: prev.session ? true : prev.isStale,
      }));
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setState({
        ...createInitialState(),
        isLoading: false,
        error: new Error("Missing session id"),
      });
      return;
    }

    if (cachedGraph === undefined) return;

    let cancelled = false;
    const requestId = ++latestRequestIdRef.current;
    const hasCachedData = Boolean(cachedGraph?.session);
    const cachedAt = cachedGraph?.session._cached_at ?? 0;
    const cachedIsExpired = hasCachedData ? isCacheExpired(cachedAt) : false;
    const cachedIsStale = hasCachedData ? isCacheStale(cachedAt) : false;
    const forceRevalidate = revalidateTick !== consumedRevalidateTickRef.current;
    consumedRevalidateTickRef.current = revalidateTick;

    if (hasCachedData && !cachedIsExpired) {
      setState({
        session: cachedGraph.session,
        receipts: cachedGraph.receipts,
        lineItems: cachedGraph.lineItems,
        isLoading: false,
        isRevalidating: forceRevalidate || cachedIsStale,
        isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
        isStale: cachedIsStale,
        error: null,
      });
    } else {
      setState((prev) => ({
        session: null,
        receipts: [],
        lineItems: [],
        isLoading: true,
        isRevalidating: false,
        isOffline: typeof navigator !== "undefined" ? !navigator.onLine : prev.isOffline,
        isStale: false,
        error: null,
      }));
    }

    const shouldFetch =
      forceRevalidate || !hasCachedData || cachedIsExpired || cachedIsStale;
    if (!shouldFetch) return;

    /** Apply final resolved state only for the latest request. */
    function safeSetState(next: HookState): void {
      if (cancelled || latestRequestIdRef.current !== requestId) return;
      setState(next);
    }

    /** Fetch with retry and exponential backoff. */
    async function runFetch(): Promise<void> {
      let attempt = 0;
      let lastError: Error | null = null;

      while (attempt <= CACHE_CONFIG.MAX_RETRIES) {
        try {
          const graph = await fetchSessionGraphFromSupabase(sessionId);
          if (cancelled || latestRequestIdRef.current !== requestId) return;

          await cacheFullSession(graph.session, graph.receipts, graph.lineItems);
          await evictOldSessions();

          safeSetState({
            session: graph.session,
            receipts: graph.receipts,
            lineItems: graph.lineItems,
            isLoading: false,
            isRevalidating: false,
            isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
            isStale: false,
            error: null,
          });
          return;
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error("Failed to load session data");
          const canRetry = attempt < CACHE_CONFIG.MAX_RETRIES;
          if (!canRetry) break;
          const delayMs = CACHE_CONFIG.RETRY_DELAY_MS * 2 ** attempt;
          await sleep(delayMs);
          attempt += 1;
        }
      }

      const offline = typeof navigator !== "undefined" ? !navigator.onLine : false;
      if (hasCachedData && cachedGraph) {
        safeSetState({
          session: cachedGraph.session,
          receipts: cachedGraph.receipts,
          lineItems: cachedGraph.lineItems,
          isLoading: false,
          isRevalidating: false,
          isOffline: true,
          isStale: true,
          error: offline ? null : lastError,
        });
        return;
      }

      safeSetState({
        session: null,
        receipts: [],
        lineItems: [],
        isLoading: false,
        isRevalidating: false,
        isOffline: offline,
        isStale: false,
        error: new Error(
          offline
            ? "You are offline and no cached session data is available."
            : lastError?.message ?? "Unable to load session data."
        ),
      });
    }

    void runFetch();
    return () => {
      cancelled = true;
    };
  }, [cachedGraph, revalidateTick, sessionId]);

  return {
    session: state.session,
    receipts: state.receipts,
    lineItems: state.lineItems,
    isLoading: state.isLoading,
    isRevalidating: state.isRevalidating,
    isOffline: state.isOffline,
    isStale: state.isStale,
    error: state.error,
    revalidate,
  };
}
