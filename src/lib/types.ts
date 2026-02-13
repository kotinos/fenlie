export type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  claimedBy: string[];
  isEdited: boolean;
};

export type SharedCosts = {
  tax: number;
  tip: number;
  fees: number;
};

export type Receipt = {
  id: string;
  sessionId: string;
  imageUrl: string | null;
  paidBy: string;
  status: "processing" | "parsed" | "error" | "manual";
  lineItems: LineItem[];
  sharedCosts: SharedCosts;
  subtotal: number;
  total: number;
  restaurantName: string | null;
  date: string | null;
};

export type Session = {
  id: string;
  name: string;
  createdAt: string;
  participants: string[];
  participantColors: Record<string, string>;
  receipts: Receipt[];
};
