import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Image compression (client-side, canvas-based)
// ---------------------------------------------------------------------------

/**
 * Compress an image file to JPEG using a canvas element.
 * Resizes so the longest side is at most `maxDimension` pixels.
 * Returns a new File with the compressed data.
 */
export function compressImage(
  file: File,
  maxDimension = 2048,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Compression failed"));
            return;
          }
          resolve(
            new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
              type: "image/jpeg",
            })
          );
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Screen-reader announcements
// ---------------------------------------------------------------------------

/**
 * Announce a message to screen readers via the #aria-live-region element.
 * Falls back to a no-op if the element doesn't exist.
 */
export function announce(message: string) {
  const el = document.getElementById("aria-live-region");
  if (el) {
    el.textContent = "";
    // Use requestAnimationFrame so the empty string is applied first,
    // forcing screen readers to re-read the new text.
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }
}

// ---------------------------------------------------------------------------
// Money formatting
// ---------------------------------------------------------------------------

/** Round to 2 decimal places for currency display. */
export function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
