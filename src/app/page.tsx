"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { Link2, Users, UserRoundPlus, X, PlusCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { supabase } from "@/lib/supabase";
import { extractCodeFromUrl, generateUniqueShareCode } from "@/lib/share-code";

type HomeParticipant = {
  name: string;
  color: string;
  isOnline: boolean;
};

type HomeSession = {
  id: string;
  name: string;
  createdAt: string;
  lastActiveAt: string;
  participants: HomeParticipant[];
  receiptCount: number;
  totalAmount: number;
  myName: string | null;
};

const SESSION_KEY_PREFIX = "splitcheck_user_";
const PARTICIPANT_COLORS = [
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

function pickColor(index: number) {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((piece) => piece[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatRelativeTime(isoDate: string) {
  const now = Date.now();
  const target = new Date(isoDate).getTime();
  const delta = target - now;
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(delta) < hour) {
    return rtf.format(Math.round(delta / minute), "minute");
  }
  if (Math.abs(delta) < day) {
    return rtf.format(Math.round(delta / hour), "hour");
  }
  return rtf.format(Math.round(delta / day), "day");
}

function SessionCard({
  session,
  onLeave,
  onTap,
}: {
  session: HomeSession;
  onLeave: () => void;
  onTap: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    if (dx < -8) {
      isDragging.current = true;
      setOffsetX(Math.max(dx, -92));
    } else if (!isDragging.current) {
      setOffsetX(0);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    setOffsetX((prev) => (prev < -56 ? -92 : 0));
  }, []);

  const handleClick = useCallback(() => {
    if (!isDragging.current && offsetX === 0) {
      onTap();
      return;
    }
    setOffsetX(0);
  }, [offsetX, onTap]);

  return (
    <div className="relative overflow-hidden rounded-2xl md:h-full">
      <div className="absolute inset-y-0 right-0 flex w-[92px] items-center justify-center bg-red-600">
        <button
          onClick={onLeave}
          aria-label={`Leave ${session.name}`}
          className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center text-xs font-semibold text-white"
          type="button"
        >
          <X className="h-5 w-5" />
          Leave
        </button>
      </div>

      <div
        className="relative cursor-pointer rounded-2xl border border-zinc-200 bg-white p-4 transition-transform duration-200 ease-out active:bg-zinc-50 md:h-full md:p-5 lg:p-6 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
        style={{ transform: `translateX(${offsetX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{session.name}</h3>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex -space-x-2">
                {session.participants.slice(0, 4).map((participant) => (
                  <span
                    key={participant.name}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white dark:border-zinc-900 ${
                      participant.isOnline
                        ? "ring-2 ring-emerald-500 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
                        : ""
                    }`}
                    style={{ backgroundColor: participant.color }}
                    title={participant.name}
                  >
                    {getInitials(participant.name)}
                  </span>
                ))}
                {session.participants.length > 4 ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-zinc-200 text-[10px] font-semibold text-zinc-700 dark:border-zinc-900 dark:bg-zinc-700 dark:text-zinc-200">
                    +{session.participants.length - 4}
                  </span>
                ) : null}
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {session.receiptCount} {session.receiptCount === 1 ? "receipt" : "receipts"}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {formatMoney(session.totalAmount)}
              </span>
            </div>
          </div>
          <span className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatRelativeTime(session.lastActiveAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function NewSessionDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [sessionName, setSessionName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [nextParticipant, setNextParticipant] = useState("");
  const [extraParticipants, setExtraParticipants] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addParticipant = useCallback(() => {
    const trimmed = nextParticipant.trim();
    if (!trimmed || extraParticipants.includes(trimmed) || trimmed === creatorName.trim()) return;
    setExtraParticipants((prev) => [...prev, trimmed]);
    setNextParticipant("");
  }, [creatorName, extraParticipants, nextParticipant]);

  const removeParticipant = useCallback((name: string) => {
    setExtraParticipants((prev) => prev.filter((value) => value !== name));
  }, []);

  const createSession = useCallback(async () => {
    const creator = creatorName.trim();
    if (!creator || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const shareCode = await generateUniqueShareCode();
      const label = sessionName.trim() || "Untitled Session";
      const { data: createdSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          name: label,
          share_code: shareCode,
          created_by: creator,
        })
        .select("id")
        .single();
      if (sessionError) throw sessionError;
      if (!createdSession?.id) {
        throw new Error("Session was created without an id in response.");
      }

      const sessionId = String(createdSession.id);
      const participantNames = [creator, ...extraParticipants];
      const participantsPayload = participantNames.map((name, index) => ({
        session_id: sessionId,
        name,
        color: pickColor(index),
        is_online: false,
      }));
      const { error: participantsError } = await supabase
        .from("participants")
        .insert(participantsPayload);
      if (participantsError) throw participantsError;

      localStorage.setItem(`${SESSION_KEY_PREFIX}${sessionId}`, creator);
      onOpenChange(false);
      router.push(`/session/${sessionId}`);
    } catch (err: unknown) {
      const supabaseError =
        err && typeof err === "object"
          ? (err as {
              message?: string;
              code?: string;
              details?: string;
              hint?: string;
            })
          : {};

      console.error("Session creation failed:", {
        message: supabaseError.message,
        code: supabaseError.code,
        details: supabaseError.details,
        hint: supabaseError.hint,
      });
      setError("Could not create session. Try again.");
      setIsSubmitting(false);
    }
  }, [creatorName, extraParticipants, isSubmitting, onOpenChange, router, sessionName]);

  const preventFocusScroll = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const orig = el.scrollIntoView;
    el.scrollIntoView = () => {};
    requestAnimationFrame(() => {
      el.scrollIntoView = orig;
    });
  }, []);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>New Session</DrawerTitle>
            <DrawerDescription>Create a session and invite your group.</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="session-name" className="text-sm font-medium">
                Session name
              </label>
              <Input
                id="session-name"
                placeholder="Dinner at Luigi's"
                className="h-12"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onFocus={preventFocusScroll}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="creator-name" className="text-sm font-medium">
                Your name
              </label>
              <Input
                id="creator-name"
                placeholder="What should people call you?"
                className="h-12"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                onFocus={preventFocusScroll}
              />
              {creatorName.trim() ? (
                <div className="pt-1">
                  <span className="inline-flex min-h-[32px] items-center rounded-full bg-primary/10 px-3 text-sm font-medium text-primary">
                    {creatorName.trim()} (You)
                  </span>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="participant-name" className="text-sm font-medium">
                Add people (optional)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="participant-name"
                  className="h-12"
                  value={nextParticipant}
                  onChange={(e) => setNextParticipant(e.target.value)}
                  placeholder="Add participant"
                  onFocus={preventFocusScroll}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addParticipant();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 min-w-[44px] px-4"
                  onClick={addParticipant}
                >
                  Add
                </Button>
              </div>
              {extraParticipants.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {extraParticipants.map((name, index) => (
                    <span
                      key={name}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-white"
                      style={{ backgroundColor: pickColor(index + 1) }}
                    >
                      {name}
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10"
                        onClick={() => removeParticipant(name)}
                        aria-label={`Remove ${name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            <Button
              className="h-12 min-h-[44px] w-full text-base font-semibold"
              onClick={() => void createSession()}
              disabled={!creatorName.trim() || isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Session"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function JoinSessionDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shakeRef = useRef<HTMLDivElement | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (incomingCode: string) => {
      const normalized = incomingCode.toUpperCase();
      if (normalized.length !== 6 || isSubmitting) return;
      setIsSubmitting(true);
      setError(null);

      const { data, error: lookupError } = await supabase
        .from("sessions")
        .select("share_code")
        .eq("share_code", normalized)
        .maybeSingle();

      if (lookupError || !data) {
        setError("Session code not found.");
        setIsSubmitting(false);
        shakeRef.current?.animate(
          [
            { transform: "translateX(0px)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(-3px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0px)" },
          ],
          { duration: 240, easing: "ease-out" }
        );
        return;
      }

      onOpenChange(false);
      router.push(`/join/${normalized}`);
    },
    [isSubmitting, onOpenChange, router]
  );

  useEffect(() => {
    if (code.length === 6) {
      void submit(code);
    }
  }, [code, submit]);

  const handlePasteLink = useCallback(async () => {
    try {
      const clipboard = await navigator.clipboard.readText();
      const parsed =
        extractCodeFromUrl(clipboard) ??
        clipboard.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);

      if (parsed.length === 6) {
        setError(null);
        setCode(parsed);
      } else {
        setError("Could not find a valid 6-character code.");
      }
    } catch {
      setError("Clipboard access was denied.");
    }
  }, []);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>Join Session</DrawerTitle>
            <DrawerDescription>Enter your 6-character session code.</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4">
            <div
              ref={shakeRef}
              className="relative"
              onClick={() => inputRef.current?.focus()}
            >
              <input
                ref={inputRef}
                value={code}
                onChange={(e) => {
                  setError(null);
                  setCode(
                    e.target.value
                      .replace(/[^A-Za-z0-9]/g, "")
                      .toUpperCase()
                      .slice(0, 6)
                  );
                }}
                className="absolute inset-0 h-full w-full opacity-0"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                aria-label="Session code"
              />
              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className={`flex h-12 min-h-[44px] items-center justify-center rounded-xl border text-lg font-semibold tracking-widest ${
                      code[index]
                        ? "border-primary bg-primary/5"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {code[index] ?? ""}
                  </div>
                ))}
              </div>
            </div>

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                type="button"
                className="h-12 min-h-[44px] flex-1"
                onClick={() => void handlePasteLink()}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Paste Link
              </Button>
              <Button
                type="button"
                className="h-12 min-h-[44px] flex-1"
                disabled={code.length !== 6 || isSubmitting}
                onClick={() => void submit(code)}
              >
                {isSubmitting ? "Joining..." : "Continue"}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<HomeSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newDrawerOpen, setNewDrawerOpen] = useState(false);
  const [joinDrawerOpen, setJoinDrawerOpen] = useState(false);

  const loadMySessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const localEntries = Object.entries(localStorage).filter(([key]) =>
        key.startsWith(SESSION_KEY_PREFIX)
      );
      const sessionIds = localEntries
        .map(([key]) => key.replace(SESSION_KEY_PREFIX, ""))
        .filter(Boolean);
      const identityById = new Map(
        localEntries.map(([key, value]) => [key.replace(SESSION_KEY_PREFIX, ""), value])
      );

      if (sessionIds.length === 0) {
        setSessions([]);
        setIsLoading(false);
        return;
      }

      const [{ data: sessionRows, error: sessionError }, { data: participantRows }, { data: receiptRows }] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, name, created_at")
          .in("id", sessionIds),
        supabase
          .from("participants")
          .select("session_id, name, color, is_online")
          .in("session_id", sessionIds),
        supabase
          .from("receipts")
          .select("session_id, total, created_at")
          .in("session_id", sessionIds),
      ]);

      if (sessionError) throw sessionError;

      const participantsBySession = new Map<string, HomeParticipant[]>();
      for (const row of participantRows ?? []) {
        const bucket = participantsBySession.get(String(row.session_id)) ?? [];
        bucket.push({
          name: String(row.name),
          color: String(row.color ?? "#71717a"),
          isOnline: Boolean(row.is_online),
        });
        participantsBySession.set(String(row.session_id), bucket);
      }

      const receiptsBySession = new Map<string, { total: number; createdAt: string }[]>();
      for (const row of receiptRows ?? []) {
        const bucket = receiptsBySession.get(String(row.session_id)) ?? [];
        bucket.push({
          total: Number(row.total ?? 0),
          createdAt: String(row.created_at),
        });
        receiptsBySession.set(String(row.session_id), bucket);
      }

      const hydrated: HomeSession[] = (sessionRows ?? []).map((row) => {
        const id = String(row.id);
        const participants = participantsBySession.get(id) ?? [];
        const receipts = receiptsBySession.get(id) ?? [];
        const latestReceipt = receipts
          .map((receipt) => new Date(receipt.createdAt).getTime())
          .sort((a, b) => b - a)[0];

        return {
          id,
          name: String(row.name),
          createdAt: String(row.created_at),
          lastActiveAt: latestReceipt
            ? new Date(latestReceipt).toISOString()
            : String(row.created_at),
          participants,
          receiptCount: receipts.length,
          totalAmount: receipts.reduce((sum, receipt) => sum + receipt.total, 0),
          myName: identityById.get(id) ?? null,
        };
      });

      hydrated.sort(
        (a, b) =>
          new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );
      setSessions(hydrated);
    } catch (e) {
      console.error("Failed loading home sessions", e);
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMySessions();
  }, [loadMySessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    setNewDrawerOpen(true);
    router.replace("/");
  }, [router]);

  const leaveSession = useCallback(async (session: HomeSession) => {
    if (!session.myName) return;
    try {
      await supabase
        .from("participants")
        .delete()
        .eq("session_id", session.id)
        .eq("name", session.myName);
      localStorage.removeItem(`${SESSION_KEY_PREFIX}${session.id}`);
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
    } catch (e) {
      console.error("Failed leaving session", e);
    }
  }, []);

  const hasSessions = sessions.length > 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader title="SplitCheck" />

      <main className="flex-1 pb-40 pt-4 md:pb-8">
        <PageContainer wide>
          <div className="hidden items-center justify-end gap-3 pb-4 md:flex">
            <Button
              variant="outline"
              className="h-11 text-sm md:min-h-0"
              onClick={() => setJoinDrawerOpen(true)}
            >
              Join Session
            </Button>
            <Button className="h-11 text-sm md:min-h-0" onClick={() => setNewDrawerOpen(true)}>
              <UserRoundPlus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-sm md:text-base text-zinc-500 dark:text-zinc-400">
              Loading sessions...
            </div>
          ) : hasSessions ? (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <button
                type="button"
                onClick={() => setNewDrawerOpen(true)}
                className="hidden h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-700 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300"
              >
                <PlusCircle className="h-7 w-7" />
                <span className="mt-2 text-sm font-semibold">Create New Session</span>
              </button>

              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onLeave={() => void leaveSession(session)}
                  onTap={() => router.push(`/session/${session.id}`)}
                />
              ))}
            </section>
          ) : (
            <div className="flex min-h-[56vh] flex-col items-center justify-center text-center md:min-h-[64vh]">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 md:h-20 md:w-20 dark:bg-zinc-800">
                <Users className="h-8 w-8 text-zinc-500 md:h-10 md:w-10 dark:text-zinc-300" />
              </div>
              <h2 className="text-lg font-semibold md:text-2xl">No sessions yet</h2>
              <p className="mt-1 max-w-[280px] text-sm text-zinc-500 md:mt-2 md:max-w-xl md:text-base dark:text-zinc-400">
                Create a new session or join one with a code
              </p>
              <div className="mt-5 hidden gap-3 md:flex">
                <Button className="h-11 md:min-h-0" onClick={() => setNewDrawerOpen(true)}>
                  <UserRoundPlus className="mr-2 h-4 w-4" />
                  New Session
                </Button>
                <Button
                  variant="outline"
                  className="h-11 md:min-h-0"
                  onClick={() => setJoinDrawerOpen(true)}
                >
                  Join Session
                </Button>
              </div>
            </div>
          )}
        </PageContainer>
      </main>

      <div
        className="pointer-events-none fixed inset-x-0 z-30 md:hidden"
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <div className="pointer-events-auto mx-auto flex w-full max-w-lg gap-2 px-4 md:flex-row">
          <Button
            className="h-12 min-h-[44px] w-full text-base font-semibold"
            onClick={() => setNewDrawerOpen(true)}
          >
            <UserRoundPlus className="mr-2 h-4 w-4" />
            New Session
          </Button>
          <Button
            variant="outline"
            className="h-12 min-h-[44px] w-full text-base font-semibold"
            onClick={() => setJoinDrawerOpen(true)}
          >
            Join Session
          </Button>
        </div>
      </div>

      <NewSessionDrawer open={newDrawerOpen} onOpenChange={setNewDrawerOpen} />
      <JoinSessionDrawer open={joinDrawerOpen} onOpenChange={setJoinDrawerOpen} />
    </div>
  );
}
