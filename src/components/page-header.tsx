"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

interface PageHeaderProps {
  title: string;
  backHref?: string;
  breadcrumbs?: BreadcrumbItem[];
  rightAction?: ReactNode;
}

function inferBackLabel(pathname: string, backHref: string): string {
  if (backHref === "/") return "Sessions";
  if (pathname.includes("/dashboard")) return "Session";
  if (pathname.includes("/receipt/")) return "Session";
  return "Back";
}

export function PageHeader({ title, backHref, breadcrumbs, rightAction }: PageHeaderProps) {
  const pathname = usePathname();
  const trail =
    breadcrumbs && breadcrumbs.length > 0
      ? breadcrumbs
      : backHref
        ? [{ label: inferBackLabel(pathname, backHref), href: backHref }, { label: title }]
        : [{ label: title }];

  return (
    <header
      className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-900/80 md:border-b md:border-zinc-200 dark:md:border-zinc-800"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="relative flex h-14 items-center justify-center px-3 md:justify-between md:px-6">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Go back"
            className="absolute left-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}

        <h1 className="max-w-[65%] truncate text-base font-semibold tracking-tight md:hidden">
          {title}
        </h1>

        <div className="hidden min-w-0 items-center gap-2 md:flex">
          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;
            const labelClass = isLast
              ? "truncate text-xl font-semibold text-zinc-900 dark:text-zinc-100"
              : "truncate text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";

            return (
              <div key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                {index > 0 ? (
                  <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
                    /
                  </span>
                ) : null}
                {crumb.href && !isLast ? (
                  <Link href={crumb.href} className={labelClass}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={labelClass}>{crumb.label}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="absolute right-1 flex min-h-[44px] min-w-[44px] items-center justify-center md:static md:min-w-0 md:justify-end md:gap-3">
          {rightAction}
        </div>
      </div>
    </header>
  );
}
