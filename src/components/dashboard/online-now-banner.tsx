"use client";

import { Wifi } from "lucide-react";

type OnlineUser = {
  name: string;
  color: string;
};

interface OnlineNowBannerProps {
  onlineUsers: OnlineUser[];
  currentUserName: string | null;
  onShare: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function OnlineNowBanner({
  onlineUsers,
  currentUserName,
  onShare,
}: OnlineNowBannerProps) {
  if (onlineUsers.length === 0) return null;

  const onlyCurrentUserOnline =
    !!currentUserName &&
    onlineUsers.length === 1 &&
    onlineUsers[0].name === currentUserName;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-zinc-100">
      {onlyCurrentUserOnline ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-zinc-300">
            Just you - share the link so others can review!
          </p>
          <button
            type="button"
            onClick={onShare}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-blue-400 transition-all active:scale-[0.98]"
          >
            Share
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
            <Wifi className="h-4 w-4 text-blue-400" />
            <span>Online now:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {onlineUsers.map((user) => (
              <div
                key={user.name}
                className="relative flex h-8 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-2 pr-3"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: user.color || "#71717a" }}
                  aria-label={user.name}
                  title={user.name}
                >
                  {getInitials(user.name)}
                </div>
                <span className="max-w-[100px] truncate text-xs text-zinc-300">
                  {user.name}
                </span>
                <span className="absolute -right-1 -top-1 inline-flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
