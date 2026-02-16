"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { Sidebar } from "@/components/layout/Sidebar";
import { useBreakpoint } from "@/hooks/use-breakpoint";

interface AppShellProps {
  children: ReactNode;
}

const SIDEBAR_PREF_KEY = "splitcheck.sidebar.collapsed";

/**
 * Global responsive shell:
 * - Mobile keeps the existing single-column flow with bottom navigation.
 * - Tablet/desktop use a persistent left sidebar and a dedicated scrollable content area.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { isDesktop } = useBreakpoint();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SIDEBAR_PREF_KEY);
    setDesktopCollapsed(stored === "1");
  }, []);

  const shouldHideSidebar = pathname.startsWith("/join/");
  const isCollapsed = useMemo(() => {
    if (!isDesktop) return true;
    return desktopCollapsed;
  }, [desktopCollapsed, isDesktop]);

  const contentOffsetClass = shouldHideSidebar
    ? "md:ml-0"
    : isCollapsed
      ? "md:ml-20"
      : "md:ml-20 lg:ml-60";

  return (
    <div className="relative min-h-dvh md:h-dvh">
      {!shouldHideSidebar ? (
        <Sidebar
          collapsed={isCollapsed}
          canToggle={isDesktop}
          onToggleCollapsed={() => {
            const next = !desktopCollapsed;
            setDesktopCollapsed(next);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(SIDEBAR_PREF_KEY, next ? "1" : "0");
            }
          }}
        />
      ) : null}

      <div
        className={[
          "relative min-h-dvh mx-auto max-w-lg pb-[env(safe-area-inset-bottom)] md:max-w-none md:h-dvh md:overflow-y-auto md:pb-0",
          contentOffsetClass,
        ].join(" ")}
      >
        {children}
      </div>

      <BottomNav />
    </div>
  );
}
