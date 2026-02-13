"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  backHref?: string;
  rightAction?: ReactNode;
}

export function PageHeader({ title, backHref, rightAction }: PageHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-900/80"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="relative flex h-14 items-center justify-center px-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Go back"
            className="absolute left-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}

        <h1 className="max-w-[65%] truncate text-base font-semibold tracking-tight">
          {title}
        </h1>

        <div className="absolute right-1 flex min-h-[44px] min-w-[44px] items-center justify-center">
          {rightAction}
        </div>
      </div>
    </header>
  );
}
