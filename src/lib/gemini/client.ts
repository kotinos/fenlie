import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

if (!geminiApiKey || geminiApiKey === "your_gemini_api_key_here") {
  throw new Error(
    "Missing or placeholder NEXT_PUBLIC_GEMINI_API_KEY. Update .env.local before using Gemini receipt extraction."
  );
}

/** Shared Gemini SDK client for client-side extraction flows. */
export const geminiClient = new GoogleGenerativeAI(geminiApiKey);

export interface GeminiReceiptResponse {
  store_name: string;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  currency: string;
  confidence: "high" | "medium" | "low";
}

/** Returns the preconfigured vision model for receipt parsing. */
export function getGeminiVisionModel(): GenerativeModel {
  return geminiClient.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
}
