import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GeminiReceiptResponse } from "@/lib/gemini/types";

const EXTRACTION_PROMPT = `You are a receipt OCR specialist. Analyze this receipt image and extract all data into structured JSON.
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

/** Checks whether a value is a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Checks whether a value is nullable numeric. */
function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

/** Validates Gemini JSON payload against receipt extraction schema. */
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

/** Executes a promise with a timeout in milliseconds. */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 4;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export type ExtractReceiptOptions = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export type ReceiptExtractionResult =
  | {
      success: true;
      data: GeminiReceiptResponse;
      retryAfterSec: number;
    }
  | {
      success: false;
      error: string;
      code: "invalid_json" | "invalid_structure" | "rate_limited" | "upstream_error";
      retryAfterSec: number;
    };

/** Maps Gemini SDK and network errors into user-friendly extraction messages. */
function mapGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown Gemini error";
  const lower = message.toLowerCase();

  if (lower.includes("timeout")) {
    return "Receipt extraction timed out. Please try again.";
  }
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
  return "Could not extract receipt data right now. Please retry.";
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractReceiptAttempt(
  imageBase64: string,
  mimeType: string,
  options: ExtractReceiptOptions
): Promise<
  | { success: true; data: GeminiReceiptResponse }
  | { success: false; error: unknown; retryAfterSec: number }
> {
  const client = new GoogleGenerativeAI(options.apiKey);
  const model = client.getGenerativeModel({
    model: options.model,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastRetryAfterSec = 0;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const geminiResponse = await withTimeout(
        model.generateContent([
          EXTRACTION_PROMPT,
          {
            inlineData: {
              data: imageBase64,
              mimeType,
            },
          },
        ]),
        timeoutMs
      );
      const rawText = geminiResponse.response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return {
          success: false,
          error: new Error("invalid_json"),
          retryAfterSec: 0,
        };
      }

      if (!isGeminiReceiptResponse(parsed)) {
        return {
          success: false,
          error: new Error("invalid_structure"),
          retryAfterSec: 0,
        };
      }

      return {
        success: true,
        data: parsed,
      };
    } catch (error) {
      if (!isQuotaOrRateError(error) || attempt === maxRetries) {
        return {
          success: false,
          error,
          retryAfterSec: lastRetryAfterSec,
        };
      }
      const hintedDelayMs = getRetryDelayMs(error);
      const waitMs = computeBackoffMs(attempt, hintedDelayMs);
      lastRetryAfterSec = Math.max(lastRetryAfterSec, Math.ceil(waitMs / 1000));
      await sleep(waitMs);
    }
  }

  return {
    success: false,
    error: new Error("upstream_error"),
    retryAfterSec: lastRetryAfterSec,
  };
}

/**
 * Extracts structured receipt data from a base64-encoded image using Gemini.
 * Designed for server-side use from API routes and other backend modules.
 */
export async function extractReceiptFromImage(
  imageBase64: string,
  mimeType: string,
  options: ExtractReceiptOptions
): Promise<ReceiptExtractionResult> {
  const extraction = await extractReceiptAttempt(imageBase64, mimeType, options);
  if (extraction.success) {
    return {
      success: true,
      data: extraction.data,
      retryAfterSec: 0,
    };
  }

  if (extraction.error instanceof Error && extraction.error.message === "invalid_json") {
    return {
      success: false,
      error: "Gemini returned invalid JSON output.",
      code: "invalid_json",
      retryAfterSec: extraction.retryAfterSec,
    };
  }

  if (extraction.error instanceof Error && extraction.error.message === "invalid_structure") {
    return {
      success: false,
      error: "Invalid response structure from Gemini",
      code: "invalid_structure",
      retryAfterSec: extraction.retryAfterSec,
    };
  }

  const rateLimited = isQuotaOrRateError(extraction.error);
  return {
    success: false,
    error: mapGeminiError(extraction.error),
    code: rateLimited ? "rate_limited" : "upstream_error",
    retryAfterSec:
      extraction.retryAfterSec > 0
        ? extraction.retryAfterSec
        : Math.ceil(BACKOFF_BASE_MS * 2 ** DEFAULT_MAX_RETRIES / 1000),
  };
}
