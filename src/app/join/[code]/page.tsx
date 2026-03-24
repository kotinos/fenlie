"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Users, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchAndHydrateSession,
  pickColor,
  type DbSession,
  type DbParticipant,
} from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Helper: initials
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Join Page
// ---------------------------------------------------------------------------

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code ?? "").toUpperCase();

  // Loading / error state
  const [status, setStatus] = useState<
    "loading" | "ready" | "not-found" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Session data fetched from Supabase
  const [sessionData, setSessionData] = useState<DbSession | null>(null);
  const [participants, setParticipants] = useState<DbParticipant[]>([]);

  // Join form
  const [name, setName] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // Check for existing identity for this session
  const existingIdentity = useMemo(() => {
    if (!sessionData) return null;
    try {
      return localStorage.getItem(`splitcheck_user_${sessionData.id}`);
    } catch {
      return null;
    }
  }, [sessionData]);

  // ── Fetch session by share code ────────────────────────────────────
  useEffect(() => {
    if (!code) {
      setStatus("not-found");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: sess, error: sessErr } = await supabase
          .from("sessions")
          .select("*")
          .eq("share_code", code)
          .maybeSingle();

        if (cancelled) return;
        if (sessErr) throw sessErr;
        if (!sess) {
          setStatus("not-found");
          return;
        }

        const dbS = sess as unknown as DbSession;
        setSessionData(dbS);

        const { data: parts } = await supabase
          .from("participants")
          .select("*")
          .eq("session_id", dbS.id)
          .order("name");

        if (cancelled) return;
        setParticipants((parts ?? []) as unknown as DbParticipant[]);
        setStatus("ready");

        // If user already has an identity for this session, pre-fill
        try {
          const saved = localStorage.getItem(`splitcheck_user_${dbS.id}`);
          if (saved) setName(saved);
        } catch {
          /* ssr */
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Join page fetch error:", e);
        setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // ── Rejoin (existing participant) ──────────────────────────────────
  const handleRejoin = useCallback(async () => {
    if (!sessionData || !existingIdentity) return;
    setIsJoining(true);
    try {
      await fetchAndHydrateSession(sessionData.id);
      // Mark online
      await supabase
        .from("participants")
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq("session_id", sessionData.id)
        .eq("name", existingIdentity);

      router.push(`/session/${sessionData.id}`);
    } catch (e) {
      console.error("Rejoin failed:", e);
      setErrorMsg("Failed to rejoin session");
      setIsJoining(false);
    }
  }, [sessionData, existingIdentity, router]);

  // ── Join as new participant ────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    if (!sessionData) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsJoining(true);
    setErrorMsg(null);

    try {
      const existing = participants.find(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        await supabase
          .from("participants")
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq("session_id", sessionData.id)
          .eq("name", existing.name);
        localStorage.setItem(`splitcheck_user_${sessionData.id}`, existing.name);
        await fetchAndHydrateSession(sessionData.id);
        router.push(`/session/${sessionData.id}`);
        return;
      }

      // Build participant colors from existing participants
      const existingColors: Record<string, string> = {};
      for (const p of participants) {
        existingColors[p.name] = p.color;
      }
      const color = pickColor(existingColors);

      // Insert participant into DB
      const { error } = await supabase.from("participants").insert({
        session_id: sessionData.id,
        name: trimmed,
        color,
        is_online: true,
      });
      if (error) throw error;

      // Save identity
      try {
        localStorage.setItem(`splitcheck_user_${sessionData.id}`, trimmed);
      } catch {
        /* ssr */
      }

      // Hydrate session into store
      await fetchAndHydrateSession(sessionData.id);

      router.push(`/session/${sessionData.id}`);
    } catch (e) {
      console.error("Join failed:", e);
      setErrorMsg(e instanceof Error ? e.message : "Failed to join session");
      setIsJoining(false);
    }
  }, [sessionData, name, participants, router]);

  // ── Render ─────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col">
        <PageHeader title="Join Session" />
        <main className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Looking up session…</p>
          </div>
        </main>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="flex min-h-dvh flex-col">
        <PageHeader title="Join Session" />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Session not found</h2>
            <p className="text-sm text-muted-foreground max-w-[260px]">
              The code <span className="font-mono font-bold">{code}</span>{" "}
              doesn&apos;t match any active session. Double-check the link
              or ask the host for a new code.
            </p>
            <Button
              variant="secondary"
              className="mt-2 h-12 px-6"
              onClick={() => router.push("/")}
            >
              Go Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-dvh flex-col">
        <PageHeader title="Join Session" />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-[260px]">
              {errorMsg ?? "Unable to load session. Try again later."}
            </p>
            <Button
              variant="secondary"
              className="mt-2 h-12 px-6"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // status === "ready"
  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader title="Join Session" />

      <main className="flex-1 px-4 pb-24 pt-4">
        <div className="mx-auto max-w-lg space-y-6">
          {/* Session info card */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Session</p>
                <h2 className="text-xl font-bold">
                  {sessionData?.name ?? "—"}
                </h2>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-bold text-primary">
                {code}
              </span>
            </div>

            {/* Participants */}
            {participants.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <Users className="h-4 w-4" />
                  <span>
                    {participants.length}{" "}
                    {participants.length === 1
                      ? "participant"
                      : "participants"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => (
                    <span
                      key={p.name}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          p.is_online ? "bg-green-300" : "bg-white/40"
                        }`}
                        title={p.is_online ? "Online" : "Offline"}
                      />
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                        {getInitials(p.name)}
                      </span>
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rejoin prompt (if existing identity found) */}
          {existingIdentity && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm text-muted-foreground mb-3">
                You previously joined as{" "}
                <span className="font-semibold text-foreground">
                  {existingIdentity}
                </span>
                .
              </p>
              <Button
                className="h-12 w-full text-base font-semibold"
                onClick={handleRejoin}
                disabled={isJoining}
              >
                {isJoining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rejoining…
                  </>
                ) : (
                  `Rejoin as ${existingIdentity}`
                )}
              </Button>
            </div>
          )}

          {/* Join as new */}
          <div className="space-y-3">
            {existingIdentity && (
              <p className="text-center text-sm text-muted-foreground">
                — or join as someone else —
              </p>
            )}
            <div className="space-y-2">
              <label htmlFor="join-name" className="text-sm font-medium">
                Your Name
              </label>
              <Input
                id="join-name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleJoin();
                  }
                }}
                className="h-12"
                autoFocus={!existingIdentity}
              />
              {errorMsg && status === "ready" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}
            </div>
            <Button
              className="h-12 w-full text-base font-semibold"
              onClick={handleJoin}
              disabled={!name.trim() || isJoining}
            >
              {isJoining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining…
                </>
              ) : (
                "Join Session"
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
