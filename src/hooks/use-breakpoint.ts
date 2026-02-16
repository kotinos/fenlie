"use client";

import { useEffect, useState } from "react";

type BreakpointState = {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
};

const SSR_DEFAULT: BreakpointState = {
  isMobile: true,
  isTablet: false,
  isDesktop: false,
};

/**
 * Tracks Tailwind breakpoints using matchMedia.
 * Mobile: < 768px, Tablet: >= 768px and < 1024px, Desktop: >= 1024px.
 */
export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>(SSR_DEFAULT);

  useEffect(() => {
    if (typeof window === "undefined") {
      setState(SSR_DEFAULT);
      return;
    }

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const tabletQuery = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    const sync = () => {
      setState({
        isMobile: mobileQuery.matches,
        isTablet: tabletQuery.matches,
        isDesktop: desktopQuery.matches,
      });
    };

    sync();

    mobileQuery.addEventListener("change", sync);
    tabletQuery.addEventListener("change", sync);
    desktopQuery.addEventListener("change", sync);

    return () => {
      mobileQuery.removeEventListener("change", sync);
      tabletQuery.removeEventListener("change", sync);
      desktopQuery.removeEventListener("change", sync);
    };
  }, []);

  return state;
}
