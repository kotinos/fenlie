"use client";

import {
  Camera,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { GeminiReceiptResponse } from "@/lib/gemini/types";
import { compressImage, validateImage } from "@/lib/gemini/image-utils";
import { Button } from "@/components/ui/button";

interface ReceiptUploaderProps {
  sessionId: string;
  onExtracted: (data: GeminiReceiptResponse) => void;
  onCancel: () => void;
}

/** Renders a capture/upload UI and extracts structured receipt data via Gemini. */
export function ReceiptUploader({
  sessionId,
  onExtracted,
  onCancel,
}: ReceiptUploaderProps) {
  void sessionId;
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const isExtractingRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileSizeLabel = useMemo(() => {
    if (!file) return "";
    const mb = file.size / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item) continue;
        if (!item.type.startsWith("image/")) continue;
        const pastedFile = item.getAsFile();
        if (!pastedFile) continue;
        event.preventDefault();
        await handleFileSelection(pastedFile);
        break;
      }
    };

    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
    };
  });

  const clearFile = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setError(null);
  }, [previewUrl]);

  const handleFileSelection = useCallback(
    async (nextFile: File) => {
      const validation = validateImage(nextFile);
      if (!validation.valid) {
        setError(validation.error ?? "Invalid image file.");
        return;
      }
      setError(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(nextFile);
      setPreviewUrl(URL.createObjectURL(nextFile));
    },
    [previewUrl]
  );

  const onFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const picked = input.files?.[0];
      if (!picked) return;
      await handleFileSelection(picked);
      // Capture the input reference before awaiting to avoid null currentTarget access.
      if (input) {
        input.value = "";
      }
    },
    [handleFileSelection]
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      const dropped = event.dataTransfer.files?.[0];
      if (!dropped) return;
      await handleFileSelection(dropped);
    },
    [handleFileSelection]
  );

  const onExtract = useCallback(async () => {
    if (isExtractingRef.current) return;
    if (!file) {
      setError("Select an image first.");
      return;
    }
    isExtractingRef.current = true;
    setIsExtracting(true);
    setError(null);

    try {
      const compressed = await compressImage(file, 1600, 0.8);
      const formData = new FormData();
      formData.append("image", compressed, compressed.name || "receipt.jpg");

      const response = await fetch("/api/extract-receipt", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        success: boolean;
        data?: GeminiReceiptResponse;
        error?: string;
      };
      if (!result.success) {
        setError(result.error ?? "Could not extract this receipt right now.");
        return;
      }
      if (!result.data) {
        setError("Receipt extraction succeeded but returned no data.");
        return;
      }

      onExtracted(result.data);
    } catch (extractError) {
      const message =
        extractError instanceof Error
          ? extractError.message
          : "Unexpected extraction failure.";
      setError(message);
    } finally {
      isExtractingRef.current = false;
      setIsExtracting(false);
    }
  }, [file, onExtracted]);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={onDrop}
      className={[
        "rounded-2xl border border-border p-4 md:p-5 lg:p-6",
        isDragOver ? "border-dashed border-primary bg-primary/5" : "",
      ].join(" ")}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold md:text-2xl">Add Receipt</h2>
        <button
          type="button"
          aria-label="Close receipt uploader"
          onClick={onCancel}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={cameraInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileInputChange}
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Take receipt photo"
      />
      <input
        ref={uploadInputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={onFileInputChange}
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Upload receipt photo"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-14 justify-start gap-2 md:min-h-0"
          aria-label="Take photo with camera"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isExtracting}
        >
          <Camera className="h-4 w-4" />
          Take Photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 justify-start gap-2 md:min-h-0"
          aria-label="Upload photo from gallery"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isExtracting}
        >
          <Upload className="h-4 w-4" />
          Upload Photo
        </Button>
      </div>

      <div className="mt-4 min-h-[280px] md:min-h-0">
        {file && previewUrl ? (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            <div className="relative h-48 overflow-hidden rounded-xl border border-border bg-muted/30 md:h-64">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Selected receipt preview"
                className={[
                  "h-full w-full object-cover transition-opacity",
                  isExtracting ? "opacity-50" : "opacity-100",
                ].join(" ")}
              />
              {isExtracting && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="scan-line" />
                </div>
              )}
            </div>
            <div className="flex flex-col justify-between gap-4 lg:rounded-xl lg:border lg:border-border lg:bg-background lg:p-4">
              <div>
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{fileSizeLabel}</p>
              </div>
              <button
                type="button"
                aria-label="Remove selected image"
                onClick={clearFile}
                className="self-start text-sm text-muted-foreground underline underline-offset-4"
                disabled={isExtracting}
              >
                Remove
              </button>
              <Button
                type="button"
                className="h-12 w-full md:min-h-0"
                onClick={() => void onExtract()}
                disabled={isExtracting}
                aria-label="Extract receipt data from selected image"
              >
                {isExtracting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading receipt...
                  </span>
                ) : (
                  "Extract Receipt"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground md:h-72 md:border-2 md:text-base">
            Drag and drop an image, paste from clipboard, or choose an upload option.
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9"
            onClick={clearFile}
            aria-label="Try selecting another image"
          >
            Try Again
          </Button>
        </div>
      )}

      <style jsx>{`
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: #3b82f6;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.9);
          animation: scan 1.4s linear infinite;
        }
        @keyframes scan {
          0% {
            top: 0%;
          }
          100% {
            top: 100%;
          }
        }
      `}</style>
    </div>
  );
}
