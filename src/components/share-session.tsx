"use client";

import { useState, useCallback, useEffect } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { buildShareUrl } from "@/lib/share-code";
import { Button } from "@/components/ui/button";
import { announce } from "@/lib/utils";
import QRCode from "qrcode";

export function ShareSession({
  shareCode,
  sessionName = "SplitCheck Session",
}: {
  shareCode: string;
  sessionName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>("");

  const shareUrl = buildShareUrl(shareCode);
  const formattedCode = shareCode.toUpperCase().split("").join(" ");

  useEffect(() => {
    QRCode.toString(shareUrl, {
      type: "svg",
      width: 200,
      margin: 1,
      color: { dark: "#18181b", light: "#ffffff" },
    }).then(setQrSvg);
  }, [shareUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      announce("Copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      announce("Failed to copy");
    }
  }, [shareUrl]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join "${sessionName}" on SplitCheck`,
          text: `Use code ${shareCode.toUpperCase()} to join this session`,
          url: shareUrl,
        });
        return;
      } catch {
        // fall through to clipboard fallback
      }
    }
    await handleCopy();
  }, [sessionName, shareCode, shareUrl, handleCopy]);

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Share Code
        </p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em]">
          {formattedCode}
        </p>
        <p className="mt-3 break-all text-xs text-muted-foreground select-all">
          {shareUrl}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Button variant="secondary" className="h-11 gap-2" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy Link
            </>
          )}
        </Button>
        <Button className="h-11 gap-2" onClick={handleShare}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>

      <div className="flex justify-center">
        <div
          className="rounded-lg bg-white p-2"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Anyone with this link can join and claim items
      </p>
    </div>
  );
}
