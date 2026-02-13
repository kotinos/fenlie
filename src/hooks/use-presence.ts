"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface PresencePayload {
  name: string;
  editingItemId: string | null;
  lastSeen: string;
}

export function usePresence(
  sessionId: string | null,
  participantName: string | null,
  participantColor?: string | null
) {
  void participantColor;
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [editingMap, setEditingMap] = useState<Record<string, string>>({});
  const [myPresenceStatus, setMyPresenceStatus] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("reconnecting");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editingRef = useRef<string | null>(null);

  // ── Sync presence state → array ────────────────────────────────────
  const syncPresence = useCallback((channel: RealtimeChannel) => {
    const state = channel.presenceState<PresencePayload>();
    const users: string[] = [];
    const nextEditing: Record<string, string> = {};
    const seen = new Set<string>();

    for (const key of Object.keys(state)) {
      for (const p of state[key]) {
        if (seen.has(p.name)) continue;
        seen.add(p.name);
        users.push(p.name);
        if (p.editingItemId) {
          nextEditing[p.editingItemId] = p.name;
        }
      }
    }
    setOnlineUsers(users);
    setEditingMap(nextEditing);
  }, []);

  useEffect(() => {
    if (!sessionId || !participantName) {
      setOnlineUsers([]);
      setEditingMap({});
      setMyPresenceStatus("disconnected");
      return;
    }

    const channel = supabase.channel(`presence:${sessionId}`, {
      config: { presence: { key: participantName } },
    });

    channel
      .on("presence", { event: "sync" }, () => syncPresence(channel))
      .on("presence", { event: "join" }, () => syncPresence(channel))
      .on("presence", { event: "leave" }, () => syncPresence(channel))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            name: participantName,
            editingItemId: editingRef.current,
            lastSeen: new Date().toISOString(),
          });
          setMyPresenceStatus("connected");
        } else if (status === "TIMED_OUT") {
          setMyPresenceStatus("reconnecting");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setMyPresenceStatus("disconnected");
        }
      });

    channelRef.current = channel;

    // ── Heartbeat: update last_seen every 30 s ──────────────────────
    heartbeatRef.current = setInterval(() => {
      supabase
        .from("participants")
        .update({ last_seen: new Date().toISOString(), is_online: true })
        .eq("session_id", sessionId)
        .eq("name", participantName)
        .then(() => {});
    }, 30_000);

    supabase
      .from("participants")
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq("session_id", sessionId)
      .eq("name", participantName)
      .then(() => {});

    // ── Cleanup on tab close ────────────────────────────────────────
    const handleBeforeUnload = () => {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/participants?session_id=eq.${sessionId}&name=eq.${encodeURIComponent(participantName)}`;
      const body = JSON.stringify({
        is_online: false,
        last_seen: new Date().toISOString(),
      });
      try {
        navigator.sendBeacon(
          url,
          new Blob([body], { type: "application/json" })
        );
      } catch {
        // sendBeacon may fail in some browsers; fallback ignored
      }
      channel.untrack();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setMyPresenceStatus("disconnected");

      // Mark offline in DB
      supabase
        .from("participants")
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("name", participantName)
        .then(() => {});
    };
  }, [sessionId, participantName, syncPresence]);

  const trackEditing = useCallback(async (itemId: string | null) => {
    editingRef.current = itemId;
    const channel = channelRef.current;
    if (!channel || !participantName) return;
    await channel.track({
      name: participantName,
      editingItemId: itemId,
      lastSeen: new Date().toISOString(),
    });
  }, [participantName]);

  return { onlineUsers, myPresenceStatus, trackEditing, editingMap };
}
