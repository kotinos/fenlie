import {
  getGeminiVisionModel,
  type GeminiReceiptResponse,
} from "@/lib/gemini/client";

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

/** Maps Gemini SDK and network errors into user-friendly extraction messages. */
function mapGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown Gemini error";
  const lower = message.toLowerCase();

  if (lower.includes("timeout")) {
    return "Receipt extraction timed out. Try a clearer image or retry in a moment.";
  }
  if (lower.includes("quota") || lower.includes("resource_exhausted")) {
    return "Gemini quota exceeded. Please try again later.";
  }
  if (lower.includes("rate") || lower.includes("429")) {
    return "Too many extraction requests right now. Please retry shortly.";
  }
  if (
    lower.includes("api key") ||
    lower.includes("permission denied") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid")
  ) {
    return "Gemini API key is invalid or missing permissions. Check your API key configuration.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error while contacting Gemini. Check your connection and try again.";
  }

  return "Could not extract this receipt right now. Please try again.";
}

type ExtractionResult =
  | {
      success: true;
      data: GeminiReceiptResponse;
    }
  | {
      success: false;
      error: string;
    };

function isRateLimitError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 429) return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("resource_exhausted")
  );
}

function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("resource_exhausted")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractReceiptAttempt(
  imageBase64: string,
  mimeType: string
): Promise<ExtractionResult> {
  const model = getGeminiVisionModel();

  // Approximate cost note (Gemini 2.0 Flash):
  // ~ $0.10 / 1M input tokens. Typical receipt image ~250K tokens,
  // so 1,000 scans are roughly ~$0.025.
  let response: Awaited<ReturnType<typeof model.generateContent>>;
  try {
    response = await withTimeout(
      model.generateContent([
        EXTRACTION_PROMPT,
        {
          inlineData: {
            data: imageBase64,
            mimeType,
          },
        },
      ]),
      15_000
    );
  } catch (error) {
    if (isRateLimitError(error)) {
      return {
        success: false,
        error: "Rate limit reached — please wait 30 seconds and try again.",
      };
    }
    return {
      success: false,
      error: mapGeminiError(error),
    };
  }

  const rawText = response.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      success: false,
      error: "Gemini returned invalid JSON. Please retry with a clearer photo.",
    };
  }

  if (!isGeminiReceiptResponse(parsed)) {
    return {
      success: false,
      error: "Invalid response structure from Gemini",
    };
  }

  return {
    success: true,
    data: parsed,
  };
}

async function extractWithRetry(
  imageBase64: string,
  mimeType: string,
  maxRetries = 3
): Promise<ExtractionResult> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const result = await extractReceiptAttempt(imageBase64, mimeType);
    if (result.success) return result;

    if (!isRateLimitMessage(result.error)) return result;
    if (attempt === maxRetries - 1) break;

    const delay = Math.min(1000 * 2 ** attempt, 10_000);
    console.warn(
      `Gemini rate limited. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
    );
    await sleep(delay);
  }

  return {
    success: false,
    error: "Rate limit reached — please wait 30 seconds and try again.",
  };
}

/**
 * Extracts structured receipt data from a base64-encoded image using Gemini.
 * Note: for production, move this call to `/api/extract-receipt` so the API key stays server-side.
 */
export async function extractReceiptFromImage(
  imageBase64: string,
  mimeType: string
) {
  return extractWithRetry(imageBase64, mimeType);
}
