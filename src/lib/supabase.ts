import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl.includes("example")) {
  throw new Error(
    "Missing or placeholder NEXT_PUBLIC_SUPABASE_URL — check .env.local"
  );
}

if (!supabaseAnonKey || supabaseAnonKey === "public-anon-key") {
  throw new Error(
    "Missing or placeholder NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local"
  );
}

export type DbSession = {
  id: string;
  name: string;
  share_code: string;
  created_at: string;
  created_by: string;
};

export type DbParticipant = {
  id: string;
  session_id: string;
  name: string;
  color: string;
  is_online: boolean;
  last_seen: string;
};

export type DbReceipt = {
  id: string;
  session_id: string;
  image_url: string | null;
  paid_by: string;
  status: "processing" | "parsed" | "error" | "manual";
  restaurant_name: string | null;
  date: string | null;
  tax: number;
  tip: number;
  fees: number;
  subtotal: number;
  total: number;
  created_at: string;
};

export type DbLineItem = {
  id: string;
  receipt_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  claimed_by: string[];
  is_edited: boolean;
  sort_order: number;
};

export type DbSessionWithParticipants = DbSession & {
  participants: DbParticipant[];
};

export type DbReceiptWithLineItems = DbReceipt & {
  line_items: DbLineItem[];
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const sessionsApi = {
  getById: (id: string) =>
    supabase.from("sessions").select("*").eq("id", id).maybeSingle(),
  getByShareCode: (shareCode: string) =>
    supabase
      .from("sessions")
      .select("*")
      .eq("share_code", shareCode.toUpperCase())
      .maybeSingle(),
  create: (payload: { name: string; share_code: string; created_by: string }) =>
    supabase.from("sessions").insert(payload).select("*").single(),
  update: (id: string, patch: Partial<Pick<DbSession, "name" | "share_code">>) =>
    supabase.from("sessions").update(patch).eq("id", id).select("*").single(),
  remove: (id: string) => supabase.from("sessions").delete().eq("id", id),
};

export const participantsApi = {
  listBySession: (sessionId: string) =>
    supabase
      .from("participants")
      .select("*")
      .eq("session_id", sessionId)
      .order("name"),
  create: (payload: {
    session_id: string;
    name: string;
    color: string;
    is_online?: boolean;
  }) => supabase.from("participants").insert(payload).select("*").single(),
  updateByName: (
    sessionId: string,
    name: string,
    patch: Partial<Pick<DbParticipant, "color" | "is_online" | "last_seen">>
  ) =>
    supabase
      .from("participants")
      .update(patch)
      .eq("session_id", sessionId)
      .eq("name", name)
      .select("*")
      .maybeSingle(),
  removeByName: (sessionId: string, name: string) =>
    supabase
      .from("participants")
      .delete()
      .eq("session_id", sessionId)
      .eq("name", name),
};

export const receiptsApi = {
  listBySession: (sessionId: string) =>
    supabase
      .from("receipts")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  create: (payload: Omit<DbReceipt, "created_at">) =>
    supabase.from("receipts").insert(payload).select("*").single(),
  update: (id: string, patch: Partial<Omit<DbReceipt, "id" | "session_id">>) =>
    supabase.from("receipts").update(patch).eq("id", id).select("*").single(),
  remove: (id: string) => supabase.from("receipts").delete().eq("id", id),
};

export const lineItemsApi = {
  listByReceiptIds: (receiptIds: string[]) =>
    supabase
      .from("line_items")
      .select("*")
      .in("receipt_id", receiptIds)
      .order("sort_order", { ascending: true }),
  create: (payload: DbLineItem) =>
    supabase.from("line_items").insert(payload).select("*").single(),
  update: (id: string, patch: Partial<Omit<DbLineItem, "id" | "receipt_id">>) =>
    supabase.from("line_items").update(patch).eq("id", id).select("*").single(),
  remove: (id: string) => supabase.from("line_items").delete().eq("id", id),
  claimItem: (itemId: string, person: string) =>
    supabase.rpc("claim_item", { item_id: itemId, person }),
  unclaimItem: (itemId: string, person: string) =>
    supabase.rpc("unclaim_item", { item_id: itemId, person }),
};

export async function fetchSessionGraph(sessionId: string) {
  const [sessionRes, participantsRes, receiptsRes] = await Promise.all([
    sessionsApi.getById(sessionId),
    participantsApi.listBySession(sessionId),
    receiptsApi.listBySession(sessionId),
  ]);

  if (sessionRes.error) throw sessionRes.error;
  if (participantsRes.error) throw participantsRes.error;
  if (receiptsRes.error) throw receiptsRes.error;
  if (!sessionRes.data) return null;

  const receipts = (receiptsRes.data ?? []) as DbReceipt[];
  const receiptIds = receipts.map((r) => r.id);
  const lineItemsRes =
    receiptIds.length > 0
      ? await lineItemsApi.listByReceiptIds(receiptIds)
      : { data: [], error: null };
  if (lineItemsRes.error) throw lineItemsRes.error;

  const lineItems = (lineItemsRes.data ?? []) as DbLineItem[];
  const receiptMap = new Map<string, DbLineItem[]>();
  for (const item of lineItems) {
    const items = receiptMap.get(item.receipt_id) ?? [];
    items.push(item);
    receiptMap.set(item.receipt_id, items);
  }

  const receiptsWithItems: DbReceiptWithLineItems[] = receipts.map((r) => ({
    ...r,
    line_items: receiptMap.get(r.id) ?? [],
  }));

  return {
    session: sessionRes.data as DbSession,
    participants: (participantsRes.data ?? []) as DbParticipant[],
    receipts: receiptsWithItems,
  };
}
