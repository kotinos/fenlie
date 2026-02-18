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
