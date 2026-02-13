import { CACHE_CONFIG } from "@/lib/cache/cache-config";
import {
  splitCheckDB,
  type CachedLineItem,
  type CachedReceipt,
  type CachedSession,
  type LineItem,
  type Receipt,
  type Session,
} from "@/lib/cache/db";

/** Upsert a single session row into local cache. */
export async function cacheSession(session: Session): Promise<void> {
  try {
    await splitCheckDB.sessions.put({ ...session, _cached_at: Date.now() });
  } catch (error) {
    console.warn("[cache] cacheSession failed", error);
  }
}

/** Bulk upsert receipt rows into local cache. */
export async function cacheReceipts(receipts: Receipt[]): Promise<void> {
  if (receipts.length === 0) return;
  try {
    const now = Date.now();
    await splitCheckDB.receipts.bulkPut(
      receipts.map((receipt) => ({ ...receipt, _cached_at: now }))
    );
  } catch (error) {
    console.warn("[cache] cacheReceipts failed", error);
  }
}

/** Bulk upsert line item rows into local cache. */
export async function cacheLineItems(lineItems: LineItem[]): Promise<void> {
  if (lineItems.length === 0) return;
  try {
    const now = Date.now();
    await splitCheckDB.lineItems.bulkPut(
      lineItems.map((lineItem) => ({ ...lineItem, _cached_at: now }))
    );
  } catch (error) {
    console.warn("[cache] cacheLineItems failed", error);
  }
}

/** Atomically upsert a full session graph into local cache. */
export async function cacheFullSession(
  session: Session,
  receipts: Receipt[],
  lineItems: LineItem[]
): Promise<void> {
  try {
    const now = Date.now();
    await splitCheckDB.transaction(
      "rw",
      splitCheckDB.sessions,
      splitCheckDB.receipts,
      splitCheckDB.lineItems,
      async () => {
        await splitCheckDB.sessions.put({ ...session, _cached_at: now });
        if (receipts.length > 0) {
          await splitCheckDB.receipts.bulkPut(
            receipts.map((receipt) => ({ ...receipt, _cached_at: now }))
          );
        }
        if (lineItems.length > 0) {
          await splitCheckDB.lineItems.bulkPut(
            lineItems.map((lineItem) => ({ ...lineItem, _cached_at: now }))
          );
        }
      }
    );
  } catch (error) {
    console.warn("[cache] cacheFullSession failed", error);
  }
}

/** Read one cached session row by id. */
export async function getCachedSession(
  sessionId: string
): Promise<CachedSession | undefined> {
  try {
    return await splitCheckDB.sessions.get(sessionId);
  } catch (error) {
    console.warn("[cache] getCachedSession failed", error);
    return undefined;
  }
}

/** Read all cached receipts for a session id. */
export async function getCachedReceipts(
  sessionId: string
): Promise<CachedReceipt[]> {
  try {
    return await splitCheckDB.receipts.where("session_id").equals(sessionId).toArray();
  } catch (error) {
    console.warn("[cache] getCachedReceipts failed", error);
    return [];
  }
}

/** Read all cached line items for a receipt id. */
export async function getCachedLineItems(
  receiptId: string
): Promise<CachedLineItem[]> {
  try {
    return await splitCheckDB.lineItems.where("receipt_id").equals(receiptId).toArray();
  } catch (error) {
    console.warn("[cache] getCachedLineItems failed", error);
    return [];
  }
}

/** Read a full cached session graph by session id. */
export async function getCachedFullSession(sessionId: string): Promise<{
  session: CachedSession;
  receipts: CachedReceipt[];
  lineItems: CachedLineItem[];
} | null> {
  try {
    const session = await splitCheckDB.sessions.get(sessionId);
    if (!session) return null;

    const receipts = await splitCheckDB.receipts
      .where("session_id")
      .equals(sessionId)
      .toArray();

    const receiptIds = receipts.map((receipt) => receipt.id);
    const lineItems =
      receiptIds.length === 0
        ? []
        : await splitCheckDB.lineItems.where("receipt_id").anyOf(receiptIds).toArray();

    return { session, receipts, lineItems };
  } catch (error) {
    console.warn("[cache] getCachedFullSession failed", error);
    return null;
  }
}

/** Check whether cached data exceeded stale threshold. */
export function isCacheStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > CACHE_CONFIG.STALE_AFTER_MS;
}

/** Check whether cached data exceeded expiry threshold. */
export function isCacheExpired(cachedAt: number): boolean {
  return Date.now() - cachedAt > CACHE_CONFIG.EXPIRED_AFTER_MS;
}

/** Evict least recently cached sessions and all descendants. */
export async function evictOldSessions(): Promise<void> {
  try {
    const count = await splitCheckDB.sessions.count();
    if (count <= CACHE_CONFIG.MAX_CACHED_SESSIONS) return;

    const overshoot = count - CACHE_CONFIG.MAX_CACHED_SESSIONS;
    const sessionsToDelete = await splitCheckDB.sessions
      .orderBy("_cached_at")
      .limit(overshoot)
      .toArray();
    const sessionIds = sessionsToDelete.map((session) => session.id);
    if (sessionIds.length === 0) return;

    await splitCheckDB.transaction(
      "rw",
      splitCheckDB.sessions,
      splitCheckDB.receipts,
      splitCheckDB.lineItems,
      async () => {
        const receipts = await splitCheckDB.receipts
          .where("session_id")
          .anyOf(sessionIds)
          .toArray();
        const receiptIds = receipts.map((receipt) => receipt.id);

        if (receiptIds.length > 0) {
          await splitCheckDB.lineItems.where("receipt_id").anyOf(receiptIds).delete();
          await splitCheckDB.receipts.where("id").anyOf(receiptIds).delete();
        }
        await splitCheckDB.sessions.where("id").anyOf(sessionIds).delete();
      }
    );
  } catch (error) {
    console.warn("[cache] evictOldSessions failed", error);
  }
}

/** Clear one cached session and all child rows. */
export async function clearSessionCache(sessionId: string): Promise<void> {
  try {
    await splitCheckDB.transaction(
      "rw",
      splitCheckDB.sessions,
      splitCheckDB.receipts,
      splitCheckDB.lineItems,
      async () => {
        const receipts = await splitCheckDB.receipts
          .where("session_id")
          .equals(sessionId)
          .toArray();
        const receiptIds = receipts.map((receipt) => receipt.id);

        if (receiptIds.length > 0) {
          await splitCheckDB.lineItems.where("receipt_id").anyOf(receiptIds).delete();
          await splitCheckDB.receipts.where("id").anyOf(receiptIds).delete();
        }
        await splitCheckDB.sessions.delete(sessionId);
      }
    );
  } catch (error) {
    console.warn("[cache] clearSessionCache failed", error);
  }
}

/** Clear all cache tables. */
export async function clearAllCache(): Promise<void> {
  try {
    await splitCheckDB.transaction(
      "rw",
      splitCheckDB.sessions,
      splitCheckDB.receipts,
      splitCheckDB.lineItems,
      async () => {
        await Promise.all([
          splitCheckDB.sessions.clear(),
          splitCheckDB.receipts.clear(),
          splitCheckDB.lineItems.clear(),
        ]);
      }
    );
  } catch (error) {
    console.warn("[cache] clearAllCache failed", error);
  }
}
