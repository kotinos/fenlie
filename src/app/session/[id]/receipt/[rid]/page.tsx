"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eraser,
  Image as ImageIcon,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  SplitSquareHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useSplitCheckStore } from "@/lib/store";
import { usePresence } from "@/hooks/use-presence";
import { calculatePersonReceiptTotal } from "@/lib/calculations";
import { announce, money } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { LineItem, Receipt, SharedCosts } from "@/lib/types";

type ToastState = { message: string; tone?: "default" | "warn" };

function Toast({ data }: { data: ToastState | null }) {
  if (!data) return null;
  return (
    <div className="fixed bottom-[calc(140px+env(safe-area-inset-bottom,0px))] left-1/2 z-[80] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div
        className={[
          "rounded-full px-4 py-2 text-sm font-medium shadow-lg",
          data.tone === "warn"
            ? "bg-amber-600 text-white"
            : "bg-foreground text-background",
        ].join(" ")}
      >
        {data.message}
      </div>
    </div>
  );
}

function OverflowMenu({
  hasImage,
  onViewPhoto,
  onSplitAll,
  onClaimAllMine,
  onClearAll,
  onDeleteReceipt,
}: {
  hasImage: boolean;
  onViewPhoto: () => void;
  onSplitAll: () => void;
  onClaimAllMine: () => void;
  onClearAll: () => void;
  onDeleteReceipt: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  const Item = ({
    label,
    onClick,
    danger,
    icon,
  }: {
    label: string;
    onClick: () => void;
    danger?: boolean;
    icon: React.ReactNode;
  }) => (
    <button
      onClick={() => {
        onClick();
        setOpen(false);
      }}
      className={[
        "flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors",
        danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-accent"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-popover py-1 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          {hasImage && (
            <Item
              label="View Photo"
              onClick={onViewPhoto}
              icon={<ImageIcon className="h-4 w-4" />}
            />
          )}
          <Item
            label="Split All Equally"
            onClick={onSplitAll}
            icon={<SplitSquareHorizontal className="h-4 w-4" />}
          />
          <Item
            label="Claim All for Me"
            onClick={onClaimAllMine}
            icon={<Check className="h-4 w-4" />}
          />
          <Item
            label="Clear All Claims"
            onClick={onClearAll}
            icon={<Eraser className="h-4 w-4" />}
          />
          <div className="my-1 border-t border-border" />
          <Item
            label="Delete Receipt"
            danger
            onClick={onDeleteReceipt}
            icon={<Trash2 className="h-4 w-4" />}
          />
        </div>
      )}
    </div>
  );
}

function PayerRow({
  participants,
  participantColors,
  payer,
  flash,
  onSelect,
}: {
  participants: string[];
  participantColors: Record<string, string>;
  payer: string;
  flash: boolean;
  onSelect: (name: string) => void;
}) {
  const noPayer = !payer;
  return (
    <section
      className={[
        "sticky z-30 border-b backdrop-blur-lg transition-colors",
        noPayer
          ? "border-amber-200/60 bg-amber-50/90 dark:border-amber-800/40 dark:bg-amber-950/30"
          : "border-border/60 bg-background/90",
      ].join(" ")}
      style={{ top: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}
    >
      <div className="px-4 py-3">
        {noPayer && (
          <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Who paid?
          </p>
        )}
        <div
          className={[
            "flex gap-2 overflow-x-auto pb-1 scrollbar-hide",
            flash ? "animate-claim-pop" : "",
          ].join(" ")}
        >
          {participants.map((person) => {
            const selected = payer === person;
            const color = participantColors[person] ?? "#71717a";
            return (
              <button
                key={person}
                onClick={() => onSelect(person)}
                className={[
                  "flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "text-white shadow-sm"
                    : "border border-border bg-secondary text-secondary-foreground",
                ].join(" ")}
                style={selected ? { backgroundColor: color } : undefined}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selected ? "white" : color }}
                />
                {person}
                {selected && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EditItemDrawer({
  open,
  title,
  item,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  title: string;
  item: Partial<LineItem> | null;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }) => void;
}) {
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [totalPrice, setTotalPrice] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescription(item?.description ?? "");
    setQty(String(item?.quantity ?? 1));
    setUnitPrice(item?.unitPrice != null ? String(item.unitPrice) : "");
    setTotalPrice(item?.totalPrice != null ? String(item.totalPrice) : "");
  }, [open, item]);

  const recalc = useCallback((qStr: string, uStr: string) => {
    const q = Number.parseFloat(qStr);
    const u = Number.parseFloat(uStr);
    if (!Number.isNaN(q) && !Number.isNaN(u)) setTotalPrice((q * u).toFixed(2));
  }, []);

  const save = useCallback(() => {
    const parsedQty = Number.parseFloat(qty) || 1;
    const parsedUnit = Number.parseFloat(unitPrice) || 0;
    const parsedTotal = Number.parseFloat(totalPrice) || parsedQty * parsedUnit;
    onSave({
      description: description.trim() || "Untitled Item",
      quantity: parsedQty,
      unitPrice: parsedUnit,
      totalPrice: parsedTotal,
    });
    onOpenChange(false);
  }, [description, onOpenChange, onSave, qty, totalPrice, unitPrice]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg px-4 pb-8">
          <DrawerHeader className="px-0">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>Edit line item details</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQty(val);
                    recalc(val, unitPrice);
                  }}
                  className="h-12"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unit Price</label>
                <Input
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUnitPrice(val);
                    recalc(qty, val);
                  }}
                  className="h-12"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Total Price</label>
                <Input
                  inputMode="decimal"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  className="h-12"
                />
              </div>
            </div>
            <Button className="h-12 w-full text-base font-semibold" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SharedCostsSection({
  receiptId,
  sharedCosts,
  updateSharedCosts,
}: {
  receiptId: string;
  sharedCosts: SharedCosts;
  updateSharedCosts: (receiptId: string, data: SharedCosts) => void;
}) {
  const [draft, setDraft] = useState({
    tax: sharedCosts.tax ? String(sharedCosts.tax) : "",
    tip: sharedCosts.tip ? String(sharedCosts.tip) : "",
    fees: sharedCosts.fees ? String(sharedCosts.fees) : "",
  });
  const [focused, setFocused] = useState<null | keyof SharedCosts>(null);
  const pendingRemoteRef = useRef<SharedCosts | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focused) {
      pendingRemoteRef.current = sharedCosts;
      return;
    }
    setDraft({
      tax: sharedCosts.tax ? String(sharedCosts.tax) : "",
      tip: sharedCosts.tip ? String(sharedCosts.tip) : "",
      fees: sharedCosts.fees ? String(sharedCosts.fees) : "",
    });
  }, [focused, sharedCosts]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const scheduleSave = useCallback(
    (next: { tax: string; tip: string; fees: string }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateSharedCosts(receiptId, {
          tax: Number.parseFloat(next.tax) || 0,
          tip: Number.parseFloat(next.tip) || 0,
          fees: Number.parseFloat(next.fees) || 0,
        });
      }, 800);
    },
    [receiptId, updateSharedCosts]
  );

  const fields: Array<{ key: keyof SharedCosts; label: string }> = [
    { key: "tax", label: "Tax" },
    { key: "tip", label: "Tip" },
    { key: "fees", label: "Fees" },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Tax, Tip &amp; Fees</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {fields.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <Input
              inputMode="decimal"
              className="h-11"
              value={draft[key]}
              onFocus={() => setFocused(key)}
              onBlur={() => {
                setFocused(null);
                if (pendingRemoteRef.current) {
                  const p = pendingRemoteRef.current;
                  setDraft({
                    tax: p.tax ? String(p.tax) : "",
                    tip: p.tip ? String(p.tip) : "",
                    fees: p.fees ? String(p.fees) : "",
                  });
                  pendingRemoteRef.current = null;
                }
              }}
              onChange={(e) => {
                const val = e.target.value;
                setDraft((prev) => {
                  const next = { ...prev, [key]: val };
                  scheduleSave(next);
                  return next;
                });
              }}
              placeholder="0.00"
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Split proportionally based on each person&apos;s item total
      </p>
    </section>
  );
}

function ImageViewer({
  imageUrl,
  open,
  onClose,
}: {
  imageUrl: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        aria-label="Close image"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        onClick={(e) => e.stopPropagation()}
        src={imageUrl}
        alt="Receipt photo"
        className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
      />
    </div>
  );
}

function SummaryPanel({
  receipt,
  participants,
  participantColors,
  currentUser,
}: {
  receipt: Receipt;
  participants: string[];
  participantColors: Record<string, string>;
  currentUser: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const pointerStartY = useRef<number | null>(null);

  const claimedCount = receipt.lineItems.filter((i) => i.claimedBy.length > 0).length;
  const totalItems = receipt.lineItems.length;
  const allClaimed = totalItems > 0 && claimedCount === totalItems;

  const byPerson = useMemo(
    () =>
      participants.map((name) => ({
        name,
        ...calculatePersonReceiptTotal(receipt, name),
      })),
    [participants, receipt]
  );
  const unclaimedValue = useMemo(
    () =>
      receipt.lineItems.reduce(
        (sum, item) => (item.claimedBy.length === 0 ? sum + item.totalPrice : sum),
        0
      ),
    [receipt.lineItems]
  );

  useEffect(() => {
    if (!allClaimed) return;
    setConfetti(true);
    const t = setTimeout(() => setConfetti(false), 900);
    return () => clearTimeout(t);
  }, [allClaimed]);

  const segmentTotals = useMemo(() => {
    const counts = participants.map((person) => ({
      person,
      count: receipt.lineItems.filter((i) => i.claimedBy.includes(person)).length,
    }));
    const all = counts.reduce((s, x) => s + x.count, 0);
    return counts.map((c) => ({
      ...c,
      percent: all > 0 ? (c.count / all) * 100 : 0,
    }));
  }, [participants, receipt.lineItems]);

  const handleDragStart = (e: PointerEvent<HTMLButtonElement>) => {
    pointerStartY.current = e.clientY;
  };
  const handleDragEnd = (e: PointerEvent<HTMLButtonElement>) => {
    if (!expanded || pointerStartY.current == null) return;
    if (e.clientY - pointerStartY.current > 40) setExpanded(false);
    pointerStartY.current = null;
  };

  return (
    <div className="lg:sticky lg:top-20 lg:h-fit">
      <div
        className={[
          "fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 lg:static lg:bottom-auto",
          allClaimed ? "summary-confetti" : "",
          confetti ? "summary-confetti-active" : "",
        ].join(" ")}
      >
        <div className="mx-auto max-w-lg lg:max-w-none">
          {expanded && (
            <div className="rounded-t-2xl border border-b-0 border-border bg-background px-4 pt-2 lg:max-h-[40vh] lg:rounded-2xl lg:border-b">
              <button
                onClick={() => setExpanded(false)}
                onPointerDown={handleDragStart}
                onPointerUp={handleDragEnd}
                className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-muted"
                aria-label="Collapse summary"
              />
              <div className="max-h-[36vh] overflow-y-auto pb-3">
                <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.8fr] gap-2 border-b border-border pb-2 text-xs font-semibold text-muted-foreground">
                  <p>Person</p>
                  <p className="text-right">Items</p>
                  <p className="text-right">+ Shared</p>
                  <p className="text-right">= Total</p>
                </div>
                <div className="space-y-1 pt-2">
                  {byPerson.map((row) => {
                    const shared = row.taxShare + row.tipShare + row.feeShare;
                    const isMe = row.name === currentUser;
                    return (
                      <div
                        key={row.name}
                        className={[
                          "grid grid-cols-[1.2fr_.8fr_.8fr_.8fr] items-center gap-2 rounded-md px-2 py-1 text-sm",
                          isMe ? "bg-primary/10" : "",
                        ].join(" ")}
                      >
                        <p className="flex items-center gap-2 font-medium">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: participantColors[row.name] ?? "#71717a" }}
                          />
                          {row.name}
                        </p>
                        <p className="text-right tabular-nums">${money(row.itemTotal)}</p>
                        <p className="text-right tabular-nums text-muted-foreground">
                          ${money(shared)}
                        </p>
                        <p className="text-right tabular-nums font-semibold">
                          ${money(row.total)}
                        </p>
                      </div>
                    );
                  })}
                  {unclaimedValue > 0 && (
                    <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.8fr] items-center gap-2 rounded-md bg-amber-100/70 px-2 py-1 text-sm dark:bg-amber-950/40">
                      <p className="font-medium text-amber-700 dark:text-amber-300">Unclaimed</p>
                      <p className="text-right tabular-nums text-amber-700 dark:text-amber-300">
                        ${money(unclaimedValue)}
                      </p>
                      <p className="text-right text-amber-700/70 dark:text-amber-300/70">-</p>
                      <p className="text-right text-amber-700/70 dark:text-amber-300/70">-</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setExpanded((v) => !v)}
            className={[
              "w-full border-t border-border px-4 py-3 text-left backdrop-blur-sm transition-colors lg:rounded-2xl lg:border",
              allClaimed ? "bg-emerald-500 text-white" : "bg-background/95",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-black/10">
                  {segmentTotals.map((segment) => (
                    <span
                      key={segment.person}
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${segment.percent}%`,
                        backgroundColor: participantColors[segment.person] ?? "#71717a",
                      }}
                    />
                  ))}
                </div>
                <p className="text-sm font-semibold">
                  {allClaimed
                    ? "All claimed ✓"
                    : `${claimedCount}/${totalItems} claimed`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">${money(receipt.total)}</span>
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptDetailPage() {
  const params = useParams<{ id: string; rid: string }>();
  const router = useRouter();
  const store = useSplitCheckStore((s) => s as unknown as Record<string, unknown>);
  const session = useSplitCheckStore((s: unknown) => {
    const typed = s as { sessions: Array<{ id: string; receipts: Receipt[] }> };
    return typed.sessions.find((x) => x.id === params.id) as
      | {
          id: string;
          participants: string[];
          participantColors: Record<string, string>;
          receipts: Receipt[];
        }
      | undefined;
  });

  const receipt = session?.receipts.find((x) => x.id === params.rid) ?? null;
  const receiptIndex = session?.receipts.findIndex((x) => x.id === params.rid) ?? -1;
  const title = receipt?.restaurantName ?? `Receipt #${receiptIndex + 1}`;

  const [toast, setToast] = useState<ToastState | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [deleteReceiptOpen, setDeleteReceiptOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LineItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [payerFlash, setPayerFlash] = useState(false);
  const [claimFlashIds, setClaimFlashIds] = useState<Record<string, true>>({});
  const [editFlashIds, setEditFlashIds] = useState<Record<string, true>>({});
  const [newFlashIds, setNewFlashIds] = useState<Record<string, true>>({});
  const [deletedGhosts, setDeletedGhosts] = useState<
    Array<{ id: string; description: string }>
  >([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Record<string, true>>({});
  const [currentUser, setCurrentUser] = useState("");
  const [sortBy, setSortBy] = useState<"description" | "price">("description");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const localPayerChangeRef = useRef(false);
  const prevItemsRef = useRef<LineItem[]>([]);
  const deleteConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userColor = session?.participantColors[currentUser] ?? "#71717a";
  const presenceRaw = usePresence(
    params.id,
    currentUser || null,
    userColor
  ) as unknown as {
    onlineUsers?: Array<{ name: string } | string>;
    myPresenceStatus?: "connected" | "reconnecting" | "disconnected";
    trackEditing?: (itemId: string | null) => void;
    editingMap?: Record<string, string>;
  };
  const trackEditing = useMemo(
    () => presenceRaw.trackEditing ?? (() => {}),
    [presenceRaw.trackEditing]
  );
  const editingMap = useMemo(
    () => presenceRaw.editingMap ?? {},
    [presenceRaw.editingMap]
  );

  const call = useCallback(
    (name: string, ...args: unknown[]) => {
      const fn = store[name];
      if (typeof fn === "function") {
        (fn as (...a: unknown[]) => unknown)(...args);
      }
    },
    [store]
  );

  const showToast = useCallback((message: string, tone: "default" | "warn" = "default") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(`splitcheck_user_${params.id}`);
    if (saved) {
      setCurrentUser(saved);
      return;
    }
    if (session?.participants[0]) setCurrentUser(session.participants[0]);
  }, [params.id, session?.participants]);

  useEffect(() => {
    if (!receipt) return;
    if (!prevItemsRef.current.length) {
      prevItemsRef.current = receipt.lineItems;
      return;
    }
    const prevById = new Map(prevItemsRef.current.map((x) => [x.id, x]));
    const nextById = new Map(receipt.lineItems.map((x) => [x.id, x]));

    for (const item of receipt.lineItems) {
      if (!prevById.has(item.id)) {
        setNewFlashIds((s) => ({ ...s, [item.id]: true }));
        setTimeout(() => {
          setNewFlashIds((s) => {
            const next = { ...s };
            delete next[item.id];
            return next;
          });
        }, 1000);
      }
    }

    for (const item of prevItemsRef.current) {
      if (!nextById.has(item.id)) {
        setDeletedGhosts((g) => [...g, { id: item.id, description: item.description }]);
        setTimeout(
          () => setDeletedGhosts((g) => g.filter((x) => x.id !== item.id)),
          800
        );
      }
    }

    for (const item of receipt.lineItems) {
      const prev = prevById.get(item.id);
      if (!prev) continue;
      const claimsChanged = prev.claimedBy.join("|") !== item.claimedBy.join("|");
      const itemChanged =
        prev.description !== item.description ||
        prev.quantity !== item.quantity ||
        prev.unitPrice !== item.unitPrice ||
        prev.totalPrice !== item.totalPrice;

      if (claimsChanged) {
        setClaimFlashIds((s) => ({ ...s, [item.id]: true }));
        setTimeout(() => {
          setClaimFlashIds((s) => {
            const next = { ...s };
            delete next[item.id];
            return next;
          });
        }, 400);
      }
      if (itemChanged) {
        setEditFlashIds((s) => ({ ...s, [item.id]: true }));
        setTimeout(() => {
          setEditFlashIds((s) => {
            const next = { ...s };
            delete next[item.id];
            return next;
          });
        }, 300);
      }
    }

    prevItemsRef.current = receipt.lineItems;
  }, [receipt]);

  useEffect(() => {
    if (!receipt) return;
    if (localPayerChangeRef.current) {
      localPayerChangeRef.current = false;
      return;
    }
    setPayerFlash(true);
    const t = setTimeout(() => setPayerFlash(false), 250);
    return () => clearTimeout(t);
  }, [receipt]);

  useEffect(
    () => () => {
      if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
    },
    []
  );

  const onSetPayer = useCallback(
    (person: string) => {
      if (!receipt) return;
      localPayerChangeRef.current = true;
      call("setPayer", receipt.id, person);
    },
    [call, receipt]
  );

  const onToggleClaim = useCallback(
    (item: LineItem, person: string) => {
      if (!receipt) return;
      const has = item.claimedBy.includes(person);
      if (has) {
        call("unclaimItem", receipt.id, item.id, person);
      } else {
        call("claimItem", receipt.id, item.id, person);
      }
    },
    [call, receipt]
  );

  const openEditor = useCallback(
    (item: LineItem) => {
      const editingBy = editingMap[item.id];
      if (editingBy && editingBy !== currentUser) {
        showToast(`${editingBy} is editing this item`, "warn");
        return;
      }
      setEditingItem(item);
      setEditorOpen(true);
      trackEditing(item.id);
    },
    [currentUser, editingMap, showToast, trackEditing]
  );

  const closeEditor = useCallback(
    (open: boolean) => {
      setEditorOpen(open);
      if (!open) {
        setEditingItem(null);
        trackEditing(null);
      }
    },
    [trackEditing]
  );

  const saveEdit = useCallback(
    (data: { description: string; quantity: number; unitPrice: number; totalPrice: number }) => {
      if (!editingItem || !receipt) return;
      call("updateLineItem", editingItem.id, { ...data, isEdited: true });
      call("updateLineItem", receipt.id, editingItem.id, { ...data, isEdited: true });
      showToast("Updated");
      announce("Item updated");
    },
    [call, editingItem, receipt, showToast]
  );

  const saveNew = useCallback(
    (data: { description: string; quantity: number; unitPrice: number; totalPrice: number }) => {
      if (!receipt) return;
      call("addLineItem", receipt.id, { ...data, claimedBy: [], isEdited: false });
      showToast("Item added");
      announce("Item added");
    },
    [call, receipt, showToast]
  );

  const requestDeleteItem = useCallback((itemId: string) => {
    setPendingDeleteId(itemId);
    if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
    deleteConfirmTimer.current = setTimeout(() => setPendingDeleteId(null), 5000);
  }, []);

  const deleteItem = useCallback(
    (itemId: string) => {
      if (!receipt) return;
      setDeletingIds((s) => ({ ...s, [itemId]: true }));
      setPendingDeleteId(null);
      setTimeout(() => call("deleteLineItem", receipt.id, itemId), 200);
    },
    [call, receipt]
  );

  const deleteReceiptNow = useCallback(() => {
    if (!receipt) return;
    call("deleteReceipt", receipt.id);
    router.push(`/session/${params.id}`);
  }, [call, params.id, receipt, router]);

  const sortedLineItems = useMemo(() => {
    if (!receipt) return [];
    const items = [...receipt.lineItems];
    items.sort((a, b) => {
      if (sortBy === "price") {
        return sortDirection === "asc" ? a.totalPrice - b.totalPrice : b.totalPrice - a.totalPrice;
      }
      const comparison = a.description.localeCompare(b.description);
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return items;
  }, [receipt, sortBy, sortDirection]);

  if (!session || !receipt) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PageHeader title="Not Found" backHref={`/session/${params.id}`} />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground">
              This receipt doesn&apos;t exist or was deleted.
            </p>
            <Button className="mt-4" onClick={() => router.push(`/session/${params.id}`)}>
              Back to Session
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={title}
        backHref={`/session/${params.id}`}
        rightAction={
          <div className="flex items-center gap-1">
            {receipt.imageUrl && (
              <button
                onClick={() => setImageOpen(true)}
                className="h-10 w-10 overflow-hidden rounded-lg border border-border"
                aria-label="View receipt image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receipt.imageUrl}
                  alt="Receipt thumbnail"
                  className="h-full w-full object-cover"
                />
              </button>
            )}
            <OverflowMenu
              hasImage={Boolean(receipt.imageUrl)}
              onViewPhoto={() => setImageOpen(true)}
              onSplitAll={() => call("splitAllItemsEqually", receipt.id)}
              onClaimAllMine={() => currentUser && call("claimAllItems", receipt.id, currentUser)}
              onClearAll={() => {
                if (window.confirm("Clear all item claims?")) call("clearAllClaims", receipt.id);
              }}
              onDeleteReceipt={() => setDeleteReceiptOpen(true)}
            />
          </div>
        }
      />

      <PayerRow
        participants={session.participants}
        participantColors={session.participantColors}
        payer={receipt.paidBy}
        flash={payerFlash}
        onSelect={onSetPayer}
      />

      <PageContainer wide>
        <div className="flex flex-col lg:flex-row lg:gap-8 lg:pt-4">
          <main className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-40 pt-4 lg:pb-6 lg:pt-0">
            <div className="space-y-3 md:hidden">
              {receipt.lineItems.map((item) => {
                const unclaimed = item.claimedBy.length === 0;
                const editingBy = editingMap[item.id];
                const lockedByOther = Boolean(editingBy && editingBy !== currentUser);
                const myEditing = editingBy === currentUser;
                return (
                  <article
                    key={item.id}
                    className={[
                      "relative rounded-xl border p-4 transition-all duration-200",
                      unclaimed
                        ? "border-l-4 border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
                        : "bg-card",
                      claimFlashIds[item.id] ? "ring-2 ring-primary/20" : "",
                      editFlashIds[item.id] ? "bg-amber-100/70 dark:bg-amber-900/20" : "",
                      newFlashIds[item.id] ? "bg-emerald-100/70 dark:bg-emerald-900/30" : "",
                      deletingIds[item.id] ? "-translate-x-4 opacity-0" : "",
                    ].join(" ")}
                  >
                    {lockedByOther && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/75 backdrop-blur-sm">
                        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          {editingBy} editing...
                        </p>
                      </div>
                    )}
                    {myEditing && (
                      <div className="absolute right-2 top-2 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                        You are editing
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">{item.description}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Qty: {item.quantity} x ${money(item.unitPrice)}
                          {item.isEdited && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                              edited
                            </span>
                          )}
                        </p>
                      </div>
                      <p className="shrink-0 text-base font-semibold tabular-nums">
                        ${money(item.totalPrice)}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {session.participants.map((person) => {
                        const claimed = item.claimedBy.includes(person);
                        const mine = claimed && person === currentUser;
                        const color = session.participantColors[person] ?? "#71717a";
                        return (
                          <button
                            key={person}
                            onClick={() => onToggleClaim(item, person)}
                            className={[
                              "min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition-all duration-200 active:animate-claim-pop",
                              claimed ? "text-white" : "border-2 bg-transparent",
                              mine ? "ring-2 ring-offset-2" : "",
                            ].join(" ")}
                            style={
                              claimed
                                ? {
                                    backgroundColor: color,
                                  }
                                : {
                                    borderColor: color,
                                    color,
                                  }
                            }
                          >
                            {person}
                          </button>
                        );
                      })}
                    </div>

                    {unclaimed && currentUser && (
                      <button
                        onClick={() => onToggleClaim(item, currentUser)}
                        className="mt-2 text-sm font-medium text-amber-700 underline underline-offset-2 dark:text-amber-300"
                      >
                        Tap to claim for yourself
                      </button>
                    )}

                    <div className="mt-2 flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditor(item)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={`Edit ${item.description}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {pendingDeleteId === item.id ? (
                        <div className="flex items-center gap-1 rounded-lg bg-destructive/5 px-1 py-1 animate-in fade-in slide-in-from-right-2 duration-150">
                          <span className="px-1 text-xs text-muted-foreground">Delete?</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs md:min-h-0"
                            onClick={() => setPendingDeleteId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 text-xs md:min-h-0"
                            onClick={() => deleteItem(item.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => requestDeleteItem(item.id)}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Delete ${item.description}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-hidden rounded-xl border border-border md:block">
              <table className="w-full text-sm md:text-base">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortBy === "description") {
                            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                            return;
                          }
                          setSortBy("description");
                          setSortDirection("asc");
                        }}
                        className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        Item Description
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortBy === "price") {
                            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                            return;
                          }
                          setSortBy("price");
                          setSortDirection("desc");
                        }}
                        className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        Price
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">Claimed By</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLineItems.map((item) => {
                    const isUnclaimed = item.claimedBy.length === 0;
                    const editingBy = editingMap[item.id];
                    const lockedByOther = Boolean(editingBy && editingBy !== currentUser);
                    return (
                      <tr
                        key={item.id}
                        className="border-t border-border align-top transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.description}</span>
                            {item.isEdited ? (
                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                edited
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 tabular-nums">${money(item.totalPrice)}</td>
                        <td className="px-4 py-3">
                          {isUnclaimed ? (
                            <span className="text-amber-700 dark:text-amber-300">Unclaimed</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {item.claimedBy.map((person) => (
                                <span
                                  key={person}
                                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                  style={{
                                    backgroundColor: session.participantColors[person] ?? "#71717a",
                                  }}
                                >
                                  {person}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (!currentUser) return;
                                onToggleClaim(item, currentUser);
                              }}
                              className="rounded px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                              disabled={!currentUser || lockedByOther}
                            >
                              {item.claimedBy.includes(currentUser) ? "Unclaim" : "Claim"}
                            </button>
                            <button
                              onClick={() => openEditor(item)}
                              className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                              aria-label={`Edit ${item.description}`}
                              disabled={lockedByOther}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => requestDeleteItem(item.id)}
                              className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Delete ${item.description}`}
                              disabled={lockedByOther}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {deletedGhosts.map((ghost) => (
              <div
                key={ghost.id}
                className="rounded-xl border border-red-300 bg-red-100/70 px-4 py-3 text-sm text-red-700 animate-out fade-out slide-out-to-left-4 duration-200 dark:bg-red-950/30 dark:text-red-300"
              >
                {ghost.description} deleted
              </div>
            ))}

            <button
              onClick={() => setAddOpen(true)}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary md:h-14 md:min-h-0"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>

            <SharedCostsSection
              receiptId={receipt.id}
              sharedCosts={receipt.sharedCosts}
              updateSharedCosts={(receiptId, data) => call("updateSharedCosts", receiptId, data)}
            />
          </main>

          <aside className="hidden lg:block lg:w-80 lg:shrink-0 lg:self-start lg:sticky lg:top-6">
            <SummaryPanel
              receipt={receipt}
              participants={session.participants}
              participantColors={session.participantColors}
              currentUser={currentUser}
            />
          </aside>
        </div>
      </PageContainer>

      <div className="lg:hidden">
        <SummaryPanel
          receipt={receipt}
          participants={session.participants}
          participantColors={session.participantColors}
          currentUser={currentUser}
        />
      </div>

      <EditItemDrawer
        open={editorOpen}
        title="Edit Item"
        item={editingItem}
        onOpenChange={closeEditor}
        onSave={saveEdit}
      />
      <EditItemDrawer
        open={addOpen}
        title="Add Item"
        item={null}
        onOpenChange={setAddOpen}
        onSave={saveNew}
      />

      <Drawer open={deleteReceiptOpen} onOpenChange={setDeleteReceiptOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg px-4 pb-8">
            <DrawerHeader className="px-0">
              <DrawerTitle>Delete Receipt?</DrawerTitle>
              <DrawerDescription>
                This removes the receipt and all line items.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-12 flex-1"
                onClick={() => setDeleteReceiptOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" className="h-12 flex-1" onClick={deleteReceiptNow}>
                Delete
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {receipt.imageUrl && (
        <ImageViewer imageUrl={receipt.imageUrl} open={imageOpen} onClose={() => setImageOpen(false)} />
      )}
      <Toast data={toast} />

      <style jsx>{`
        .summary-confetti::before,
        .summary-confetti::after {
          content: "";
          position: absolute;
          pointer-events: none;
          opacity: 0;
        }
        .summary-confetti::before {
          left: 20%;
          bottom: 60px;
          width: 8px;
          height: 8px;
          background: #22c55e;
        }
        .summary-confetti::after {
          right: 25%;
          bottom: 62px;
          width: 8px;
          height: 8px;
          background: #3b82f6;
        }
        .summary-confetti-active::before {
          animation: confetti-left 600ms ease-out;
        }
        .summary-confetti-active::after {
          animation: confetti-right 600ms ease-out;
        }
        @keyframes confetti-left {
          0% {
            opacity: 1;
            transform: translate(0, 0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translate(-24px, -36px) rotate(-140deg);
          }
        }
        @keyframes confetti-right {
          0% {
            opacity: 1;
            transform: translate(0, 0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translate(20px, -30px) rotate(160deg);
          }
        }
      `}</style>
    </div>
  );
}
