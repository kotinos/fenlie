"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Camera,
  Pencil,
  Upload,
  Trash2,
  AlertTriangle,
  ImageIcon,
  Users,
  Plus,
  ChevronRight,
  Share2,
  X,
} from "lucide-react";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import { usePresence } from "@/hooks/use-presence";
import { useSplitCheckStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { compressImage, money } from "@/lib/utils";
import { ShareSession } from "@/components/share-session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const LOADING_MESSAGES = ["Reading...", "Finding items...", "Almost done..."];

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
    <section className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-30 border-b border-border/40 bg-background/95 backdrop-blur-lg px-4 py-2 lg:sticky lg:top-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:py-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:flex-col lg:items-stretch lg:overflow-visible">
        {session.participants.map((name) => {
          const color = session.participantColors[name] ?? "#71717a";
          const isOnline = onlineSet.has(name);
          const isMe = name === currentUserName;

          return (
            <div
              key={name}
              className="animate-in fade-in slide-in-from-right-2 duration-200 lg:flex lg:items-center lg:gap-2"
            >
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
              <span className="mt-1 hidden max-w-[10rem] truncate text-xs text-muted-foreground lg:block">
                {name}
              </span>
            </div>
          );
        })}

        <button
          onClick={onManageParticipants}
          aria-label="Manage participants"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary lg:w-full lg:justify-start lg:gap-2 lg:rounded-xl lg:px-3"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden text-sm font-medium lg:inline">
            Participants
          </span>
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
          if (item.claimedBy.includes(person)) count += 1;
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
                        Their claims on {claimCount} item
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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorKind, setErrorKind] = useState<"network" | "parse" | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isProcessing) return;
    setLoadingIdx(0);
    loadingIntervalRef.current = setInterval(() => {
      setLoadingIdx((v) => (v + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      loadingIntervalRef.current = null;
    };
  }, [isProcessing]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetState = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setIsCompressing(false);
    setIsProcessing(false);
    setErrorKind(null);
    setErrorMessage("");
    setLoadingIdx(0);
    setIsDragOver(false);
    setUploadedImageUrl(null);
  }, [previewUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorKind(null);
      setErrorMessage("");
      let next = file;
      if (file.size > 10 * 1024 * 1024) {
        setIsCompressing(true);
        try {
          next = await compressImage(file, 2048, 0.8);
        } catch {
          setIsCompressing(false);
          setErrorKind("parse");
          setErrorMessage(
            "Couldn't compress this image. Try a clearer photo or enter manually."
          );
          return;
        }
        setIsCompressing(false);
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(next);
      setPreviewUrl(URL.createObjectURL(next));
    },
    [previewUrl]
  );

  const processReceipt = useCallback(async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setErrorKind(null);
    setErrorMessage("");

    const draftReceiptId = crypto.randomUUID();
    const uploadPath = `receipts/${sessionId}/${draftReceiptId}.jpg`;

    const uploadPromise = supabase.storage
      .from("receipts")
      .upload(uploadPath, selectedFile, {
        upsert: true,
        contentType: selectedFile.type || "image/jpeg",
      })
      .then(({ error }) => {
        if (error) throw new Error(error.message);
        return supabase.storage.from("receipts").getPublicUrl(uploadPath).data
          .publicUrl;
      });

    const parsePromise = (async () => {
      const formData = new FormData();
      formData.append("image", selectedFile);
      const res = await fetch("/api/parse-receipt", {
        method: "POST",
        body: formData,
      });
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok) {
        const err = (payload as { error?: string } | null)?.error ?? "Parse error";
        throw new Error(err);
      }
      return payload as {
        restaurant: string | null;
        date: string | null;
        items: Array<{
          description: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
        }>;
        subtotal: number | null;
        tax: number | null;
        tip: number | null;
        fees: number | null;
        total: number | null;
      };
    })();

    let imageUrl: string | null = null;
    try {
      const [uploadedUrl, parsed] = await Promise.all([uploadPromise, parsePromise]);
      imageUrl = uploadedUrl;
      setUploadedImageUrl(uploadedUrl);

      const lineItems = parsed.items.map((item) => ({
        id: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        claimedBy: [],
        isEdited: false,
      }));
      const subtotal =
        parsed.subtotal ??
        lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const total =
        parsed.total ??
        subtotal + (parsed.tax ?? 0) + (parsed.tip ?? 0) + (parsed.fees ?? 0);

      const created = addReceipt(sessionId, {
        imageUrl: uploadedUrl,
        paidBy: "",
        status: "parsed",
        lineItems,
        sharedCosts: {
          tax: parsed.tax ?? 0,
          tip: parsed.tip ?? 0,
          fees: parsed.fees ?? 0,
        },
        subtotal,
        total,
        restaurantName: parsed.restaurant ?? null,
        date: parsed.date ?? null,
      });
      const receiptId = toReceiptId(created) || draftReceiptId;
      onToast(`Found ${lineItems.length} items!`);
      resetState();
      onOpenChange(false);
      router.push(`/session/${sessionId}/receipt/${receiptId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to process receipt";
      const isNetwork =
        /network|failed to fetch|connection/i.test(message) ||
        (typeof navigator !== "undefined" && !navigator.onLine);
      setErrorKind(isNetwork ? "network" : "parse");
      setErrorMessage(
        isNetwork
          ? "No connection. You can enter items manually."
          : "Couldn't read this receipt. Try a clearer photo or enter manually."
      );
      if (!imageUrl) {
        try {
          imageUrl = await uploadPromise;
          setUploadedImageUrl(imageUrl);
        } catch {
          // best effort
        }
      }
      setIsProcessing(false);
    }
  }, [addReceipt, onOpenChange, onToast, resetState, router, selectedFile, sessionId]);

  const handleManualFallback = useCallback(() => {
    const created = addReceipt(sessionId, {
      imageUrl: uploadedImageUrl,
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
    resetState();
    onOpenChange(false);
    if (rid) router.push(`/session/${sessionId}/receipt/${rid}`);
  }, [addReceipt, onOpenChange, resetState, router, sessionId, uploadedImageUrl]);

  return (
    <Drawer
      open={open}
      dismissible={!isProcessing}
      onOpenChange={(value) => {
        if (isProcessing) return;
        if (!value) resetState();
        onOpenChange(value);
      }}
    >
      <DrawerContent className="h-[95dvh]">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col overflow-hidden px-4 pb-6">
          <DrawerHeader className="px-0">
            <div className="flex items-center justify-between">
              <DrawerTitle>Scan Receipt</DrawerTitle>
              <button
                disabled={isProcessing}
                onClick={() => onOpenChange(false)}
                aria-label="Close scan drawer"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DrawerDescription>
              Take a photo or upload an image to parse automatically.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-1 flex-col items-center justify-center overflow-auto">
            {isCompressing ? (
              <div className="text-center">
                <p className="text-sm font-medium">Compressing...</p>
              </div>
            ) : isProcessing ? (
              <div className="flex w-full max-w-sm flex-col items-center gap-5 py-8">
                <div className="w-full space-y-3">
                  <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {LOADING_MESSAGES[loadingIdx]}
                </p>
              </div>
            ) : errorKind ? (
              <div className="flex w-full max-w-sm flex-col items-center gap-4 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                  <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
                <div className="flex w-full gap-2">
                  <Button className="h-12 flex-1" onClick={processReceipt}>
                    Try Again
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 flex-1"
                    onClick={handleManualFallback}
                  >
                    Enter Manually
                  </Button>
                </div>
              </div>
            ) : previewUrl ? (
              <div className="w-full space-y-4">
                <div className="max-h-[50vh] overflow-hidden rounded-xl border border-border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    className="h-full w-full object-contain"
                  />
                </div>
                <Button className="h-12 w-full" onClick={processReceipt}>
                  Process Receipt
                </Button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-11 w-full text-sm text-muted-foreground underline underline-offset-4"
                >
                  Retake
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={(e: DragEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file?.type.startsWith("image/")) void handleFile(file);
                }}
                className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent/30"
                }`}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <Upload className="h-8 w-8 text-muted-foreground md:hidden" />
                  <Camera className="hidden h-8 w-8 text-muted-foreground md:block" />
                </div>
                <p className="text-sm font-medium text-muted-foreground md:hidden">
                  Tap to take a photo
                </p>
                <p className="hidden text-sm font-medium text-muted-foreground md:block">
                  Drag &amp; drop or click to upload
                </p>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
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
    lineItems: { id: string; claimedBy: string[] }[];
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
  const claimedCount = receipt.lineItems.filter((i) => i.claimedBy.length > 0).length;
  const pct = itemCount > 0 ? (claimedCount / itemCount) * 100 : 0;
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
            {claimedCount}/{itemCount || 0} items claimed
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

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <PresenceBar
          session={session}
          onlineUsers={onlineUsers}
          currentUserName={currentUserName ?? ""}
          onManageParticipants={() => setParticipantsOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-4 pb-36 pt-4">
          {showInviteHint && (
            <div className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm text-primary">
              Invite your friends so they can claim their items!
            </div>
          )}
          {session.receipts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
                <ImageIcon className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">No receipts yet</h2>
              <p className="mt-1 max-w-[260px] text-sm text-muted-foreground">
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
      </div>

      <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30">
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
        className="fixed bottom-[calc(140px+env(safe-area-inset-bottom,0px))] right-4 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground lg:right-[max(1rem,calc((100vw-64rem)/2+1rem))]"
      >
        <Users className="h-4 w-4" />
      </button>
    </div>
  );
}
