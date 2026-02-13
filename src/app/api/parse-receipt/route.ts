import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().min(1),
  unitPrice: z.number().min(0),
  totalPrice: z.number(),
});

const receiptSchema = z.object({
  restaurant: z.string().nullable(),
  date: z.string().nullable(),
  items: z.array(lineItemSchema).min(1),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  tip: z.number().nullable(),
  fees: z.number().nullable(),
  total: z.number().nullable(),
});

type ParsedReceipt = z.infer<typeof receiptSchema>;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const INITIAL_PROMPT = `You are a receipt parser. Analyze this receipt image and return ONLY valid JSON.
{
  "restaurant": "string or null",
  "date": "string or null",
  "items": [{ "description": "string", "quantity": number, "unitPrice": number, "totalPrice": number }],
  "subtotal": number or null,
  "tax": number or null,
  "tip": number or null,
  "fees": number or null,
  "total": number or null
}
Rules:
- All prices as numbers in dollars (e.g., 12.99, not "$12.99")
- Default quantity to 1 if not visible
- Do NOT include tax, tip, fees, subtotal, or total as line items
- Discounts should be a line item with a negative totalPrice
- Use null for unreadable values
- Return ONLY the JSON object. No markdown code fences. No explanation.`;

const RETRY_PROMPT =
  "Your previous response was invalid JSON. Return ONLY the raw JSON object. No markdown. No explanation. Just the JSON.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to parse a string as JSON.
 * If the initial parse fails, strip markdown code fences and try again.
 */
function tryParseJson(text: string): unknown | null {
  // Attempt 1: raw parse
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  // Attempt 2: strip markdown fences (```json ... ``` or ``` ... ```)
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/**
 * Map a MIME type string to the format the Gemini SDK expects.
 * Falls back to "image/jpeg" for unrecognised types.
 */
function toGeminiMime(
  mime: string
): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif" {
  const supported = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ] as const;
  type Supported = (typeof supported)[number];

  if (supported.includes(mime as Supported)) return mime as Supported;
  return "image/jpeg";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // --- Validate API key ---------------------------------------------------
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing GEMINI_API_KEY" },
      { status: 500 }
    );
  }

  // --- Parse multipart form data -----------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing required file field "image"' },
      { status: 400 }
    );
  }

  // --- Validate file size -------------------------------------------------
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Image too large. Max 10MB." },
      { status: 413 }
    );
  }

  // --- Validate content type ----------------------------------------------
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "File must be an image" },
      { status: 400 }
    );
  }

  // --- Convert to base64 --------------------------------------------------
  let base64Data: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    base64Data = buffer.toString("base64");
  } catch {
    return NextResponse.json(
      { error: "Failed to read uploaded file" },
      { status: 500 }
    );
  }

  // --- Set up Gemini client -----------------------------------------------
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: toGeminiMime(file.type),
    },
  };

  // --- Retry loop ---------------------------------------------------------
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prompt = attempt === 1 ? INITIAL_PROMPT : RETRY_PROMPT;
      const result = await model.generateContent([prompt, imagePart]);
      const response = result.response;
      const rawText = response.text();

      // Try to parse the response as JSON
      const parsed = tryParseJson(rawText);
      if (parsed === null) {
        // JSON parse failed — retry if attempts remain
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        break;
      }

      // Validate with Zod
      const validation = receiptSchema.safeParse(parsed);
      if (!validation.success) {
        return NextResponse.json(
          {
            error: "Parsed response did not match expected format",
            details: validation.error.flatten(),
          },
          { status: 422 }
        );
      }

      // Success
      return NextResponse.json(validation.data satisfies ParsedReceipt, {
        status: 200,
      });
    } catch (err: unknown) {
      // Network / API error
      const message =
        err instanceof Error ? err.message : "Unknown error calling Gemini API";

      // If it's a rate-limit or transient error, retry
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      return NextResponse.json(
        { error: `Gemini API error: ${message}` },
        { status: 500 }
      );
    }
  }

  // All retries exhausted with unparseable JSON
  return NextResponse.json(
    {
      error:
        "Failed to parse receipt after 3 attempts. Please enter items manually.",
    },
    { status: 422 }
  );
}
