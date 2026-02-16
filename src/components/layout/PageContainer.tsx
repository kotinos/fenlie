"use client";

import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  wide?: boolean;
}

/**
 * Responsive content-width wrapper that preserves mobile spacing and scales to
 * wider readable layouts on tablet/desktop.
 */
export function PageContainer({ children, wide = false }: PageContainerProps) {
  return (
    <div
      className={
        wide
          ? "w-full px-4 md:px-6 lg:mx-auto lg:max-w-6xl lg:px-8"
          : "w-full px-4 md:px-6 lg:mx-auto lg:max-w-3xl lg:px-6"
      }
    >
      {children}
    </div>
  );
}
