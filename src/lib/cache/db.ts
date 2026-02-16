import Dexie, { type Table } from "dexie";

export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  host_identity: string;
  status: "active" | "settled";
}

export interface Receipt {
  id: string;
  session_id: string;
  store_name: string;
  created_at: string;
  total: number;
  tax: number;
  tip: number;
}

export interface LineItem {
  id: string;
  receipt_id: string;
  description: string;
  amount: number;
  quantity: number;
  claimed_by: string[];
  claimed_at: string | null;
}

export interface CachedSession extends Session {
  _cached_at: number;
}

export interface CachedReceipt extends Receipt {
  _cached_at: number;
}

export interface CachedLineItem extends LineItem {
  _cached_at: number;
}

class SplitCheckCacheDB extends Dexie {
  sessions!: Table<CachedSession, string>;
  receipts!: Table<CachedReceipt, string>;
  lineItems!: Table<CachedLineItem, string>;

  /** Initialize IndexedDB schema for SplitCheck cache tables. */
  constructor() {
    super("splitcheck-cache");
    this.version(1).stores({
      sessions: "id, updated_at, _cached_at",
      receipts: "id, session_id, _cached_at",
      lineItems: "id, receipt_id, claimed_by, _cached_at",
    });
  }
}

const globalForSplitCheckDB = globalThis as typeof globalThis & {
  __splitCheckDB__?: SplitCheckCacheDB;
};

export const splitCheckDB =
  globalForSplitCheckDB.__splitCheckDB__ ??
  (globalForSplitCheckDB.__splitCheckDB__ = new SplitCheckCacheDB());
