"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Receipt, BarChart3 } from "lucide-react";

const tabs = [
  { label: "Home", icon: House },
  { label: "Session", icon: Receipt },
  { label: "Dashboard", icon: BarChart3 },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/join/")) return null;

  const sessionIdMatch = pathname.match(/\/session\/([^/]+)/);
  const currentSessionId = sessionIdMatch?.[1] ?? null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden" aria-label="Main navigation">
      <div className="mx-auto max-w-lg">
        <div
          className="flex items-start justify-around border-t border-zinc-200 bg-white/80 backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-900/80"
          role="tablist"
          style={{
            height: "calc(64px + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {tabs.map((tab) => {
            const requiresSession = tab.label !== "Home";
            const disabled = requiresSession && !currentSessionId;
            const href =
              tab.label === "Home"
                ? "/"
                : tab.label === "Session" && currentSessionId
                  ? `/session/${currentSessionId}`
                  : tab.label === "Dashboard" && currentSessionId
                    ? `/session/${currentSessionId}/dashboard`
                    : "#";

            const isActive = tab.label === "Home"
              ? pathname === "/"
              : tab.label === "Session"
                ? !!currentSessionId && pathname === `/session/${currentSessionId}`
                : !!currentSessionId &&
                  pathname.startsWith(`/session/${currentSessionId}/dashboard`);

            const Icon = tab.icon;

            return (
              <div
                key={tab.label}
                className="relative flex min-w-[84px] flex-1 items-center justify-center"
              >
                {disabled ? (
                  <div
                    aria-label={`${tab.label} disabled`}
                    className="relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 py-2 text-zinc-400 dark:text-zinc-600"
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] font-medium">{tab.label}</span>
                  </div>
                ) : (
                  <Link
                    href={href}
                    role="tab"
                    aria-selected={isActive}
                    aria-label={tab.label}
                    className={`relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                      isActive
                        ? "text-primary"
                        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    }`}
                  >
                    <Icon className="h-5 w-5" fill={isActive ? "currentColor" : "none"} />
                    <span className="text-[10px] font-medium">{tab.label}</span>
                    {isActive ? (
                      <span className="absolute bottom-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : null}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
