import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import type { GeminiReceiptResponse } from "@/lib/gemini/types";
import { extractReceiptFromImage } from "@/lib/gemini/extract-receipt";

// Server-side receipt extraction endpoint used by ReceiptUploader.

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAP_MAX_SIZE = 2_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const GEMINI_MODEL = process.env.GEMINI_RECEIPT_MODEL || "gemini-2.5-flash-lite";
const REQUEST_TIMEOUT_MS = 20_000;
const GEMINI_MAX_RETRIES = 4;

type RateBucket = {
  count: number;
  resetAt: number;
};

type CachedPayload = {
  data: GeminiReceiptResponse;
  expiresAt: number;
};

const rateMap = new Map<string, RateBucket>();
const receiptCache = new Map<string, CachedPayload>();

/** Returns the request IP fallback key for in-memory rate limiting. */
function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

/** Keeps in-memory maps bounded in long-running runtimes. */
function pruneMaps(now: number): void {
  rateMap.forEach((bucket, key) => {
    if (bucket.resetAt <= now) rateMap.delete(key);
  });
  receiptCache.forEach((payload, key) => {
    if (payload.expiresAt <= now) receiptCache.delete(key);
  });
  if (rateMap.size <= RATE_MAP_MAX_SIZE) return;
  const oldestKeys = Array.from(rateMap.keys()).slice(
    0,
    rateMap.size - RATE_MAP_MAX_SIZE
  );
  for (const key of oldestKeys) {
    rateMap.delete(key);
  }
}

/** Handles server-side receipt extraction using private GEMINI_API_KEY. */
export async function POST(request: NextRequest) {
  const clientKey = getClientKey(request);
  const now = Date.now();
  pruneMaps(now);
  const bucket = rateMap.get(clientKey);
  const activeBucket =
    bucket && bucket.resetAt > now
      ? bucket
      : {
          count: 0,
          resetAt: now + RATE_WINDOW_MS,
        };
  if (activeBucket.count >= RATE_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((activeBucket.resetAt - now) / 1000));
    const remaining = 0;
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
          "Retry-After": String(retryAfterSec),
        },
      }
    );
  }
  activeBucket.count += 1;
  rateMap.set(clientKey, activeBucket);
  const remaining = Math.max(0, RATE_LIMIT - activeBucket.count);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return NextResponse.json(
      { success: false, error: "Missing GEMINI_API_KEY server configuration." },
      {
        status: 500,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  }

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Missing image file in multipart form-data." },
      {
        status: 400,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Image exceeds 10 MB limit." },
      {
        status: 413,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  }

  if (
    file.type !== "image/jpeg" &&
    file.type !== "image/png" &&
    file.type !== "image/webp" &&
    file.type !== "image/heic"
  ) {
    return NextResponse.json(
      { success: false, error: "Unsupported file type. Use JPEG, PNG, WEBP, or HEIC." },
      {
        status: 415,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  }

  try {
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const base64 = imageBuffer.toString("base64");
    const cacheKey = createHash("sha256")
      .update(file.type)
      .update(":")
      .update(imageBuffer)
      .digest("hex");
    const cached = receiptCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(
        { success: true, data: cached.data, cached: true },
        {
          status: 200,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT),
            "X-RateLimit-Remaining": String(remaining),
          },
        }
      );
    }

    const extraction = await extractReceiptFromImage(base64, file.type, {
      apiKey,
      model: GEMINI_MODEL,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxRetries: GEMINI_MAX_RETRIES,
    });
    if (!extraction.success) {
      const status =
        extraction.code === "invalid_json" || extraction.code === "invalid_structure"
          ? 502
          : extraction.code === "rate_limited"
            ? 429
            : 500;
      return NextResponse.json(
        { success: false, error: extraction.error },
        {
          status,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT),
            "X-RateLimit-Remaining": String(remaining),
            ...(extraction.retryAfterSec > 0 ? { "Retry-After": String(extraction.retryAfterSec) } : {}),
          },
        }
      );
    }
    const parsed = extraction.data;
    receiptCache.set(cacheKey, {
      data: parsed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json(
      { success: true, data: parsed },
      {
        status: 200,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not extract receipt data right now. Please retry.",
      },
      {
        status: 500,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  }
}
