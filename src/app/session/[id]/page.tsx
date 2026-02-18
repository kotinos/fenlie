"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  Camera,
  Pencil,
  Trash2,
  ImageIcon,
  Users,
  Plus,
  ChevronRight,
  Share2,
} from "lucide-react";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import { usePresence } from "@/hooks/use-presence";
import { useSplitCheckStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/utils";
import { ShareSession } from "@/components/share-session";
import { PageHeader } from "@/components/page-header";
import { PageContainer } from "@/components/layout/PageContainer";
import { CacheStatusIndicator } from "@/components/CacheStatusIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReceiptUploader } from "@/components/receipt/ReceiptUploader";
import { ReceiptReviewForm } from "@/components/receipt/ReceiptReviewForm";
import type { GeminiReceiptResponse } from "@/lib/gemini/types";
import type { LineItem as CacheLineItem, Receipt as CacheReceipt } from "@/lib/cache/db";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

const STATUS_COLORS: Record<string, string> = {
  parsed: "#22c55e",
  manual: "#3b82f6",
  processing: "#f59e0b",
  error: "#ef4444",
};

function toReceiptId(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return "";
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return "just now";
  const diff = Date.now() - value;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return "Unknown";
  const diff = Date.now() - value;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function getReceiptTimestamp(receipt: {
  date: string | null;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
}): string | null {
  return (
    receipt.updatedAt ??
    receipt.updated_at ??
    receipt.createdAt ??
    receipt.created_at ??
    receipt.date ??
    null
  );
}

function getItemClaimLimit(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  if (Number.isInteger(quantity) && quantity > 1) return Math.trunc(quantity);
  return 1;
}

function PageSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="h-14 border-b border-border/50 bg-background/80" />
      <div className="h-16 border-b border-border/30 bg-background/70 px-4 py-3">
        <div className="h-10 w-full animate-pulse rounded-xl bg-muted" />
      </div>
      <main className="flex-1 space-y-3 px-4 py-4 pb-36">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-border bg-muted/40"
          />
        ))}
      </main>
    </div>
  );
}

function PresenceBar({
  session,
  onlineUsers,
  currentUserName,
  onManageParticipants,
}: {
  session: {
    participants: string[];
    participantColors: Record<string, string>;
  };
  onlineUsers: { name: string }[];
  currentUserName: string;
  onManageParticipants: () => void;
}) {
  const onlineSet = useMemo(
    () => new Set(onlineUsers.map((u) => u.name)),
    [onlineUsers]
  );

  return (
    <section className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-30 border-b border-border/40 bg-background/95 px-4 py-2 backdrop-blur-lg">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {session.participants.map((name) => {
          const color = session.participantColors[name] ?? "#71717a";
          const isOnline = onlineSet.has(name);
          const isMe = name === currentUserName;

          return (
            <div key={name} className="animate-in fade-in slide-in-from-right-2 duration-200">
              <div
                className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white transition-all ${
                  isOnline ? "" : "grayscale opacity-45"
                } ${isMe ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}`}
                style={{ backgroundColor: color }}
                title={name}
              >
                {name.slice(0, 1).toUpperCase()}
                {isOnline && (
                  <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                )}
              </div>
            </div>
          );
        })}

        <button
          onClick={onManageParticipants}
          aria-label="Manage participants"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function ParticipantsDrawer({
  open,
  onOpenChange,
  session,
  sessionId,
  currentUserName,
  onlineUsers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    participants: string[];
    participantColors: Record<string, string>;
    receipts: { lineItems: { claimedBy: string[] }[] }[];
  };
  sessionId: string;
  currentUserName: string;
  onlineUsers: { name: string }[];
}) {
  const addParticipant = useSplitCheckStore((s) => s.addParticipant);
  const removeParticipant = useSplitCheckStore((s) => s.removeParticipant);
  const [name, setName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string | null>>(
    {}
  );
  const onlineSet = useMemo(
    () => new Set(onlineUsers.map((u) => u.name)),
    [onlineUsers]
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("participants")
        .select("name,last_seen")
        .eq("session_id", sessionId);
      if (!active) return;
      const next: Record<string, string | null> = {};
      for (const row of data ?? []) {
        const item = row as { name: string; last_seen: string | null };
        next[item.name] = item.last_seen;
      }
      setLastSeenMap(next);
    })();
    return () => {
      active = false;
    };
  }, [open, sessionId]);

  const getClaimedCount = useCallback(
    (person: string) => {
      let count = 0;
      for (const receipt of session.receipts) {
        for (const item of receipt.lineItems) {
          count += item.claimedBy.reduce((sum, name) => (name === person ? sum + 1 : sum), 0);
        }
      }
      return count;
    },
    [session.receipts]
  );

  const handleAdd = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addParticipant(sessionId, trimmed);
    setName("");
  }, [addParticipant, name, sessionId]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg px-4 pb-8">
          <DrawerHeader className="px-0">
            <DrawerTitle>Participants</DrawerTitle>
            <DrawerDescription>
              Add or remove people in this split session.
            </DrawerDescription>
          </DrawerHeader>

          <div className="mb-4 flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add participant name"
              className="h-12"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button
              variant="secondary"
              className="h-12 min-w-[44px]"
              disabled={!name.trim()}
              onClick={handleAdd}
            >
              Add
            </Button>
          </div>

          <div className="space-y-2">
            {session.participants.map((person) => {
              const color = session.participantColors[person] ?? "#71717a";
              const online = onlineSet.has(person);
              const claimCount = getClaimedCount(person);
              const canRemove = person !== currentUserName;

              return (
                <div
                  key={person}
                  className="rounded-xl border border-border bg-card px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <p className="truncate font-medium">{person}</p>
                        {person === currentUserName && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            you
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {online
                          ? "Online now"
                          : `Offline · last seen ${formatLastSeen(lastSeenMap[person])}`}
                      </p>
                    </div>

                    {canRemove && (
                      <button
                        onClick={() => setConfirmRemove(person)}
                        aria-label={`Remove ${person}`}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {confirmRemove === person && (
                    <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                      <p className="text-sm font-medium text-destructive">
                        Remove {person}?
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Their claims on {claimCount} unit
                        {claimCount === 1 ? "" : "s"} will be cleared.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 flex-1"
                          onClick={() => setConfirmRemove(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-9 flex-1"
                          onClick={() => {
                            removeParticipant(sessionId, person);
                            setConfirmRemove(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-[calc(140px+env(safe-area-inset-bottom,0px))] left-1/2 z-[70] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-150">
      <div className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">
        {message}
      </div>
    </div>
  );
}

function ScanReceiptDrawer({
  open,
  onOpenChange,
  sessionId,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onToast: (message: string) => void;
}) {
  const router = useRouter();
  const addReceipt = useSplitCheckStore((s) => s.addReceipt);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [extractedData, setExtractedData] = useState<GeminiReceiptResponse | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStep("upload");
    setExtractedData(null);
    setSaveError(null);
    setIsSaving(false);
  }, []);

  const handleConfirmReview = useCallback(
    async (
      receipt: Omit<CacheReceipt, "id" | "created_at">,
      lineItems: Omit<CacheLineItem, "id" | "claimed_by" | "claimed_at">[]
    ) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const mappedItems = lineItems.map((item) => {
          const quantity = item.quantity > 0 ? item.quantity : 1;
          const unitPrice = quantity === 0 ? 0 : item.amount / quantity;
          return {
            id: crypto.randomUUID(),
            description: item.description,
            quantity,
            unitPrice,
            totalPrice: item.amount,
            claimedBy: [],
            isEdited: false,
          };
        });
        const subtotal = mappedItems.reduce((sum, item) => sum + item.totalPrice, 0);
        const total = subtotal + receipt.tax + receipt.tip;

        const created = addReceipt(sessionId, {
          imageUrl: null,
          paidBy: "",
          status: "parsed",
          lineItems: mappedItems,
          sharedCosts: {
            tax: receipt.tax,
            tip: receipt.tip,
            fees: 0,
          },
          subtotal,
          total,
          restaurantName: receipt.store_name || null,
          date: null,
        });
        const receiptId = toReceiptId(created);
        onToast(`Found ${mappedItems.length} items!`);
        resetState();
        onOpenChange(false);
        if (receiptId) router.push(`/session/${sessionId}/receipt/${receiptId}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save extracted receipt.";
        setSaveError(message);
      } finally {
        setIsSaving(false);
      }
    },
    [addReceipt, onOpenChange, onToast, resetState, router, sessionId]
  );

  return (
    <Drawer
      open={open}
      dismissible={!isSaving}
      onOpenChange={(value) => {
        if (isSaving) return;
        if (!value) resetState();
        onOpenChange(value);
      }}
    >
      <DrawerContent className="h-dvh md:h-auto md:max-w-4xl">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col overflow-hidden px-4 pb-6 md:max-w-none md:px-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>Add Receipt</DrawerTitle>
            <DrawerDescription>
              Capture a photo, extract items, then review before saving.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto">
            {saveError ? (
              <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {saveError}
              </div>
            ) : null}

            {step === "upload" || !extractedData ? (
              <ReceiptUploader
                sessionId={sessionId}
                onCancel={() => onOpenChange(false)}
                onExtracted={(data) => {
                  setExtractedData(data);
                  setStep("review");
                }}
              />
            ) : (
              <ReceiptReviewForm
                extractedData={extractedData}
                sessionId={sessionId}
                onBack={() => {
                  setStep("upload");
                  setSaveError(null);
                }}
                onConfirm={(receipt, lineItems) => {
                  void handleConfirmReview(receipt, lineItems);
                }}
              />
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ReceiptCard({
  receipt,
  index,
  sessionId,
  participantColors,
  isNew,
}: {
  receipt: {
    id: string;
    status: string;
    restaurantName: string | null;
    lineItems: { id: string; quantity: number; claimedBy: string[] }[];
    total: number;
    paidBy: string;
    date: string | null;
    createdAt?: string;
    updatedAt?: string;
    created_at?: string;
    updated_at?: string;
  };
  index: number;
  sessionId: string;
  participantColors: Record<string, string>;
  isNew: boolean;
}) {
  const router = useRouter();
  const statusColor = STATUS_COLORS[receipt.status] ?? "#71717a";
  const itemCount = receipt.lineItems.length;
  const totalQty = receipt.lineItems.reduce((sum, item) => sum + getItemClaimLimit(item.quantity), 0);
  const claimedCount = receipt.lineItems.reduce(
    (sum, item) => sum + Math.min(item.claimedBy.length, getItemClaimLimit(item.quantity)),
    0
  );
  const pct = totalQty > 0 ? (claimedCount / totalQty) * 100 : 0;
  const payerColor = participantColors[receipt.paidBy] ?? "#71717a";

  return (
    <button
      onClick={() => router.push(`/session/${sessionId}/receipt/${receipt.id}`)}
      className={`relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all hover:bg-accent/40 ${
        isNew ? "animate-in fade-in slide-in-from-right-2" : ""
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${isNew ? "animate-pulse" : ""}`}
        style={{ backgroundColor: statusColor }}
      />
      <div className="ml-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {receipt.restaurantName || `Receipt #${index + 1}`}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {itemCount} items · ${money(receipt.total)}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        {receipt.paidBy ? (
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Paid by </span>
            <span style={{ color: payerColor }}>{receipt.paidBy}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">No payer</p>
        )}

        <div className="mt-2">
          <p className="text-xs text-muted-foreground">
            {claimedCount}/{totalQty || 0} claimed
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {formatRelativeTime(getReceiptTimestamp(receipt))}
        </p>
      </div>
    </button>
  );
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const addReceipt = useSplitCheckStore((s) => s.addReceipt);
  const addParticipant = useSplitCheckStore((s) => s.addParticipant);
  const syncStatus = useSplitCheckStore((s) => s.syncStatus);

  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [identityResolved, setIdentityResolved] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [showInviteHint, setShowInviteHint] = useState(false);
  const [newReceiptIds, setNewReceiptIds] = useState<Set<string>>(new Set());
  const shareTriggerRef = useRef<HTMLDivElement | null>(null);
  const seenReceiptIdsRef = useRef<Set<string>>(new Set());

  const { session, isLoading } = useRealtimeSession(sessionId);
  const presence = usePresence(sessionId, currentUserName);
  const onlineUsers = presence.onlineUsers.map((name) => ({ name }));

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    (async () => {
      const key = `splitcheck_user_${sessionId}`;
      const savedName = localStorage.getItem(key);
      if (savedName) {
        if (active) {
          setCurrentUserName(savedName);
          setIdentityResolved(true);
        }
        return;
      }

      const { data } = await supabase
        .from("sessions")
        .select("share_code")
        .eq("id", sessionId)
        .maybeSingle();
      const code = (data as { share_code?: string } | null)?.share_code ?? "";
      if (active) {
        setIdentityResolved(true);
        if (!savedName) {
          router.replace(`/join/${code || sessionId}`);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router, sessionId]);

  useEffect(() => {
    if (!session) return;
    const fromSession = (session as { shareCode?: string }).shareCode ?? "";
    if (fromSession) {
      setShareCode(fromSession);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("share_code")
        .eq("id", session.id)
        .maybeSingle();
      if (!active) return;
      setShareCode((data as { share_code?: string } | null)?.share_code ?? "");
    })();
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session || !currentUserName) return;
    const existing = session.participants.includes(currentUserName);
    if (!existing) addParticipant(session.id, currentUserName);
  }, [addParticipant, currentUserName, session]);

  useEffect(() => {
    if (!session) return;
    const key = `splitcheck_shared_${session.id}`;
    const alreadyShown = localStorage.getItem(key) === "1";
    const shouldAutoOpen =
      !alreadyShown &&
      session.receipts.length === 0 &&
      session.participants.length === 1;
    if (shouldAutoOpen) {
      setShowInviteHint(true);
      localStorage.setItem(key, "1");
      setTimeout(() => {
        const button = shareTriggerRef.current?.querySelector("button");
        button?.click();
      }, 250);
    } else {
      setShowInviteHint(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const currentIds = session.receipts.map((r) => r.id);
    if (seenReceiptIdsRef.current.size === 0) {
      seenReceiptIdsRef.current = new Set(currentIds);
      return;
    }

    const freshIds = currentIds.filter((id) => !seenReceiptIdsRef.current.has(id));
    if (freshIds.length > 0) {
      setNewReceiptIds(new Set(freshIds));
      setTimeout(() => setNewReceiptIds(new Set()), 1800);
    }
    seenReceiptIdsRef.current = new Set(currentIds);
  }, [session]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleManualEntry = useCallback(
    (imageUrl: string | null = null) => {
      if (!session) return;
      const created = addReceipt(session.id, {
        imageUrl,
        paidBy: "",
        status: "manual",
        lineItems: [],
        sharedCosts: { tax: 0, tip: 0, fees: 0 },
        subtotal: 0,
        total: 0,
        restaurantName: null,
        date: null,
      });
      const rid = toReceiptId(created);
      if (rid) router.push(`/session/${session.id}/receipt/${rid}`);
    },
    [addReceipt, router, session]
  );

  if (!identityResolved || isLoading) {
    return <PageSkeleton />;
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PageHeader title="Session Not Found" backHref="/" />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground">
              This session doesn&apos;t exist or was deleted.
            </p>
            <Button className="mt-4 h-11" onClick={() => router.push("/")}>
              Go Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const gridClass =
    session.receipts.length > 0 ? "grid grid-cols-1 gap-3 md:grid-cols-2" : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={session.name}
        backHref="/"
        rightAction={
          <div ref={shareTriggerRef}>
            <button
              onClick={() => setShareOpen(true)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-accent transition-colors"
              aria-label="Share session"
            >
              <Share2 className="h-5 w-5" />
            </button>
          </div>
        }
      />

      <PresenceBar
        session={session}
        onlineUsers={onlineUsers}
        currentUserName={currentUserName ?? ""}
        onManageParticipants={() => setParticipantsOpen(true)}
      />

      <PageContainer wide>
        <div className="flex flex-col lg:flex-row lg:gap-8">
          <main className="flex-1 overflow-y-auto pb-36 pt-4 md:pb-8">
            {showInviteHint && (
              <div className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm text-primary md:text-base">
                Invite your friends so they can claim their items!
              </div>
            )}
            <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div>
                <h2 className="text-base font-semibold">Receipts</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a receipt photo or add items manually.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button className="h-11 md:min-h-0" onClick={() => setScanOpen(true)}>
                  <Camera className="mr-2 h-4 w-4" />
                  Upload Receipt
                </Button>
                <Button
                  variant="outline"
                  className="h-11 md:min-h-0"
                  onClick={() => handleManualEntry(null)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Manual Entry
                </Button>
              </div>
            </section>
            {session.receipts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center lg:min-h-[60vh]">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold md:text-2xl">No receipts yet</h2>
                <p className="mt-1 max-w-[260px] text-sm text-muted-foreground md:max-w-xl md:text-base">
                  Scan a receipt or add items manually.
                </p>
              </div>
            ) : (
              <div className={gridClass}>
                {session.receipts.map((receipt, idx) => (
                  <ReceiptCard
                    key={receipt.id}
                    receipt={receipt}
                    index={idx}
                    sessionId={session.id}
                    participantColors={session.participantColors}
                    isNew={newReceiptIds.has(receipt.id)}
                  />
                ))}
              </div>
            )}
          </main>

          <aside className="hidden lg:block lg:w-80 lg:shrink-0 lg:self-start lg:sticky lg:top-6">
            <div className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">Session Sidebar</h2>
              <p className="text-sm text-muted-foreground">
                {session.participants.length} participants, {session.receipts.length} receipts
              </p>
              <div className="space-y-2">
                <Button className="h-11 w-full md:min-h-0" onClick={() => setScanOpen(true)}>
                  <Camera className="mr-2 h-4 w-4" />
                  Add Receipt
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full md:min-h-0"
                  onClick={() => handleManualEntry(null)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Manual Entry
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full md:min-h-0"
                  onClick={() => setParticipantsOpen(true)}
                >
                  Manage Participants
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full md:min-h-0"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share Session
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full md:min-h-0"
                  onClick={() => router.push(`/session/${session.id}/dashboard`)}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Settlement Dashboard
                </Button>
              </div>
              <div className="border-t border-border pt-3">
                <CacheStatusIndicator
                  isRevalidating={syncStatus === "syncing"}
                  isOffline={false}
                  isStale={false}
                  error={syncStatus === "error" ? new Error("Sync failed") : null}
                />
              </div>
            </div>
          </aside>
        </div>
      </PageContainer>

      <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 md:hidden">
        <div className="mx-auto max-w-3xl border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex gap-2 md:gap-3">
            <Button
              className="h-12 grow basis-3/5 gap-2"
              onClick={() => setScanOpen(true)}
            >
              <Camera className="h-4 w-4" />
              Scan
            </Button>
            <Button
              variant="outline"
              className="h-12 grow basis-2/5 gap-2"
              onClick={() => handleManualEntry(null)}
            >
              <Pencil className="h-4 w-4" />
              Manual
            </Button>
          </div>
        </div>
      </div>

      <ParticipantsDrawer
        open={participantsOpen}
        onOpenChange={setParticipantsOpen}
        session={session}
        sessionId={session.id}
        currentUserName={currentUserName ?? ""}
        onlineUsers={onlineUsers}
      />

      <Drawer open={shareOpen} onOpenChange={setShareOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg px-4 pb-8">
            <DrawerHeader className="px-0">
              <DrawerTitle>Share Session</DrawerTitle>
              <DrawerDescription>
                Invite others to collaborate in real time.
              </DrawerDescription>
            </DrawerHeader>
            <ShareSession
              shareCode={shareCode || session.id.slice(0, 6).toUpperCase()}
              sessionName={session.name}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <ScanReceiptDrawer
        open={scanOpen}
        onOpenChange={setScanOpen}
        sessionId={session.id}
        onToast={setToast}
      />

      {toast && <Toast message={toast} />}
      <button
        onClick={() => router.push(`/session/${session.id}/dashboard`)}
        aria-label="Open settlement dashboard"
        className="fixed bottom-[calc(140px+env(safe-area-inset-bottom,0px))] right-4 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground md:hidden"
      >
        <Users className="h-4 w-4" />
      </button>
    </div>
  );
}
