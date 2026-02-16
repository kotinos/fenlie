const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Converts a file into base64 + mime payload expected by Gemini. */
export async function fileToBase64(
  file: File
): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to convert image to base64."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

  const parts = dataUrl.split(",", 2);
  if (parts.length !== 2 || !parts[1]) {
    throw new Error("Invalid base64 conversion result.");
  }

  return {
    base64: parts[1],
    mimeType: file.type || "image/jpeg",
  };
}

/** Creates a decoded bitmap while preserving EXIF orientation when possible. */
async function decodeBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/** Compresses large receipt images client-side before Gemini upload. */
export async function compressImage(
  file: File,
  maxWidth = 1600,
  quality = 0.8
): Promise<File> {
  const bitmap = await decodeBitmap(file);

  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (sourceWidth <= maxWidth) {
      return file;
    }

    const targetWidth = maxWidth;
    const targetHeight = Math.round((sourceHeight * targetWidth) / sourceWidth);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const outputType =
      file.type === "image/png" || file.type === "image/webp"
        ? file.type
        : "image/jpeg";

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("Failed to compress image"));
            return;
          }
          resolve(result);
        },
        outputType,
        quality
      );
    });

    return new File([blob], file.name, {
      type: outputType,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

/** Validates receipt image type and size before upload. */
export function validateImage(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return {
      valid: false,
      error: "Unsupported file type. Please use JPEG, PNG, WEBP, or HEIC.",
    };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: "Image is too large. Maximum allowed size is 10 MB.",
    };
  }

  return { valid: true };
}
