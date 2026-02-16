"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { CacheStatusIndicator } from "@/components/CacheStatusIndicator";
import { useSplitCheckStore } from "@/lib/store";

interface SidebarProps {
  collapsed: boolean;
  canToggle: boolean;
  onToggleCollapsed: () => void;
}

type NavItem = {
  label: string;
  href: string;
  icon: typeof Home;
  isAction?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "New Session", href: "/?new=1", icon: PlusCircle, isAction: true },
  { label: "Settings", href: "/settings", icon: Settings },
];

/**
 * Persistent tablet/desktop navigation rail.
 * It renders as icon-only when collapsed and expands to icon + label at large widths.
 */
export function Sidebar({ collapsed, canToggle, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const syncStatus = useSplitCheckStore((s) => s.syncStatus);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsOffline(!window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-40 hidden border-r border-zinc-200 bg-white transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-900 md:flex md:flex-col",
        collapsed ? "md:w-20" : "lg:w-60",
      ].join(" ")}
    >
      <div className="flex h-16 items-center border-b border-zinc-200 px-4 dark:border-zinc-800">
        <Link
          href="/"
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label="SplitCheck home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
            SC
          </div>
          {!collapsed ? <span className="text-base font-semibold">SplitCheck</span> : null}
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4" aria-label="Main navigation">
        <ul className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = !item.isAction && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "group relative flex min-h-[44px] items-center rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    collapsed ? "justify-center" : "justify-start gap-3",
                    isActive
                      ? "border-l-primary bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "border-l-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto border-t border-zinc-200 px-3 py-4 dark:border-zinc-800">
        <div className={collapsed ? "flex justify-center" : "flex items-center justify-between gap-2"}>
          {!collapsed ? <p className="text-xs text-zinc-500 dark:text-zinc-400">Cache status</p> : null}
          <CacheStatusIndicator
            isRevalidating={syncStatus === "syncing"}
            isOffline={isOffline}
            isStale={false}
            error={syncStatus === "error" ? new Error("Sync failed") : null}
          />
        </div>

        {canToggle ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={[
              "mt-4 flex w-full min-h-[44px] items-center rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800",
              collapsed ? "justify-center" : "justify-between",
            ].join(" ")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {!collapsed ? <span>Collapse</span> : null}
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
