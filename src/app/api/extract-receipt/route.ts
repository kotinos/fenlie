import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import type { GeminiReceiptResponse } from "@/lib/gemini/client";

// Server-side receipt extraction endpoint used by ReceiptUploader.

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAP_MAX_SIZE = 2_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const GEMINI_MODEL = process.env.GEMINI_RECEIPT_MODEL || "gemini-2.5-flash-lite";
const REQUEST_TIMEOUT_MS = 20_000;
const GEMINI_MAX_RETRIES = 4;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

const RECEIPT_PROMPT = `You are a receipt OCR specialist. Analyze this receipt image and extract all data into structured JSON.
Rules:
1. Extract EVERY line item visible on the receipt. Do not skip items.
2. For each item, extract: description (the item name as printed), quantity (default 1 if not shown), unit_price, and total_price.
3. Extract store_name from the header/top of the receipt.
4. Extract subtotal, tax, tip, and total if visible. Use null if not present.
5. Currency should be the ISO 4217 code (e.g., "USD", "EUR", "GBP").
6. Confidence: "high" if the receipt is clear and fully legible, "medium" if some parts are blurry or cut off, "low" if significant portions are unreadable.
7. If the image is NOT a receipt, return: { "store_name": "", "items": [], "subtotal": null, "tax": null, "tip": null, "total": null, "currency": "USD", "confidence": "low" }
8. Prices should be numbers, not strings. Do not include currency symbols in price fields.
9. If an item appears to be a discount or negative amount, set total_price as a negative number.
Return ONLY valid JSON matching the schema. No explanation, no markdown.`;

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

/** Validates that a value is finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validates nullable numeric values. */
function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

/** Validates parsed payload against expected Gemini receipt structure. */
function isGeminiReceiptResponse(value: unknown): value is GeminiReceiptResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.store_name !== "string") return false;
  if (!Array.isArray(payload.items)) return false;
  if (!isNullableNumber(payload.subtotal)) return false;
  if (!isNullableNumber(payload.tax)) return false;
  if (!isNullableNumber(payload.tip)) return false;
  if (!isNullableNumber(payload.total)) return false;
  if (typeof payload.currency !== "string") return false;
  if (
    payload.confidence !== "high" &&
    payload.confidence !== "medium" &&
    payload.confidence !== "low"
  ) {
    return false;
  }

  for (const item of payload.items) {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    if (typeof row.description !== "string") return false;
    if (!isFiniteNumber(row.quantity)) return false;
    if (!isFiniteNumber(row.unit_price)) return false;
    if (!isFiniteNumber(row.total_price)) return false;
  }

  return true;
}

/** Executes a promise with timeout handling for slow upstream responses. */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Sleeps for a fixed time in milliseconds. */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Detects Gemini quota/rate limiting errors from SDK responses. */
function isQuotaOrRateError(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  );
}

/** Parses Gemini retry delay hints like `retryDelay: "8s"` from error text. */
function getRetryDelayMs(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/retrydelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s["']?/i);
  if (!match) return null;
  const seconds = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

/** Computes next wait delay with jitter, honoring server-provided retry delay. */
function computeBackoffMs(attempt: number, retryDelayMs: number | null): number {
  const jitter = Math.floor(Math.random() * 500);
  if (retryDelayMs !== null) {
    return Math.min(BACKOFF_MAX_MS, retryDelayMs + jitter);
  }
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt + jitter);
}

/** Maps API errors into user-friendly response text. */
function mapGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown Gemini error";
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("resource_exhausted")) {
    return "Gemini quota exceeded. Please try again later.";
  }
  if (lower.includes("rate") || lower.includes("429")) {
    return "Too many extraction requests. Please try again shortly.";
  }
  if (
    lower.includes("api key") ||
    lower.includes("permission denied") ||
    lower.includes("unauthorized")
  ) {
    return "Gemini API key is invalid or unauthorized.";
  }
  if (lower.includes("timeout")) {
    return "Receipt extraction timed out. Please try again.";
  }
  return "Could not extract receipt data right now. Please retry.";
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

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    let parsed: unknown;
    let lastRetryAfterSec = 0;
    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
      try {
        const geminiResponse = await withTimeout(
          model.generateContent([
            RECEIPT_PROMPT,
            {
              inlineData: {
                data: base64,
                mimeType: file.type,
              },
            },
          ]),
          REQUEST_TIMEOUT_MS
        );
        const rawText = geminiResponse.response.text();
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return NextResponse.json(
            { success: false, error: "Gemini returned invalid JSON output." },
            {
              status: 502,
              headers: {
                "X-RateLimit-Limit": String(RATE_LIMIT),
                "X-RateLimit-Remaining": String(remaining),
              },
            }
          );
        }
        break;
      } catch (error) {
        if (!isQuotaOrRateError(error) || attempt === GEMINI_MAX_RETRIES) {
          throw error;
        }
        const hintedDelayMs = getRetryDelayMs(error);
        const waitMs = computeBackoffMs(attempt, hintedDelayMs);
        lastRetryAfterSec = Math.max(lastRetryAfterSec, Math.ceil(waitMs / 1000));
        await sleep(waitMs);
      }
    }

    if (parsed === undefined) {
      return NextResponse.json(
        { success: false, error: "Could not parse Gemini response." },
        {
          status: 500,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT),
            "X-RateLimit-Remaining": String(remaining),
            ...(lastRetryAfterSec > 0 ? { "Retry-After": String(lastRetryAfterSec) } : {}),
          },
        }
      );
    }

    if (!isGeminiReceiptResponse(parsed)) {
      return NextResponse.json(
        { success: false, error: "Invalid response structure from Gemini" },
        {
          status: 502,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT),
            "X-RateLimit-Remaining": String(remaining),
          },
        }
      );
    }
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
    const isQuota = isQuotaOrRateError(error);
    const retryAfterSec = Math.ceil(BACKOFF_BASE_MS * 2 ** GEMINI_MAX_RETRIES / 1000);
    return NextResponse.json(
      { success: false, error: mapGeminiError(error) },
      {
        status: isQuota ? 429 : 500,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": String(remaining),
          ...(isQuota ? { "Retry-After": String(retryAfterSec) } : {}),
        },
      }
    );
  }
}
