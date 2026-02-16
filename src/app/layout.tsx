import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { SyncIndicator } from "@/components/sync-indicator";
import { AppShell } from "@/components/layout/AppShell";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "SplitCheck",
  description: "Mobile-first receipt-splitting web app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SplitCheck",
  },
  other: {
    "theme-color": "#18181b",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#18181b" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistrar />
        <AppShell>{children}</AppShell>
        <SyncIndicator />
        {/* Screen reader announcement region */}
        <div
          id="aria-live-region"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />
      </body>
    </html>
  );
}
