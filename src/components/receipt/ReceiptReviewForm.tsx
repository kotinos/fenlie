"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useReducer } from "react";
import type { GeminiReceiptResponse } from "@/lib/gemini/types";
import type { LineItem, Receipt } from "@/lib/cache/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReceiptReviewFormProps {
  extractedData: GeminiReceiptResponse;
  sessionId: string;
  onConfirm: (
    receipt: Omit<Receipt, "id" | "created_at">,
    lineItems: Omit<LineItem, "id" | "claimed_by" | "claimed_at">[]
  ) => void;
  onBack: () => void;
}

type EditableItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type FieldErrors = {
  storeName?: string;
  items?: string;
  tax?: string;
  tip?: string;
  rowErrors: Record<string, string>;
};

type ReviewState = {
  storeName: string;
  items: EditableItem[];
  tax: number;
  tip: number;
  currency: string;
  extractedTotal: number | null;
  fieldErrors: FieldErrors;
};

type ReviewAction =
  | { type: "SET_STORE_NAME"; value: string }
  | { type: "UPDATE_ITEM"; id: string; patch: Partial<EditableItem> }
  | { type: "DELETE_ITEM"; id: string }
  | { type: "ADD_ITEM" }
  | { type: "SET_TAX"; value: number }
  | { type: "SET_TIP"; value: number }
  | { type: "SET_ERRORS"; errors: FieldErrors };

/** Creates initial form state from extracted Gemini data. */
function createInitialState(extractedData: GeminiReceiptResponse): ReviewState {
  return {
    storeName: extractedData.store_name || "",
    items: extractedData.items.map((item) => ({
      id: crypto.randomUUID(),
      description: item.description,
      quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
      unitPrice: Number.isFinite(item.unit_price) ? item.unit_price : 0,
    })),
    tax: extractedData.tax ?? 0,
    tip: extractedData.tip ?? 0,
    currency: extractedData.currency || "USD",
    extractedTotal: extractedData.total,
    fieldErrors: { rowErrors: {} },
  };
}

/** Updates review form state in response to user edits. */
function reducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "SET_STORE_NAME":
      return {
        ...state,
        storeName: action.value,
        fieldErrors: { ...state.fieldErrors, storeName: undefined },
      };
    case "UPDATE_ITEM":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item
        ),
      };
    case "DELETE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
      };
    case "ADD_ITEM":
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: crypto.randomUUID(),
            description: "",
            quantity: 1,
            unitPrice: 0,
          },
        ],
      };
    case "SET_TAX":
      return {
        ...state,
        tax: action.value,
        fieldErrors: { ...state.fieldErrors, tax: undefined },
      };
    case "SET_TIP":
      return {
        ...state,
        tip: action.value,
        fieldErrors: { ...state.fieldErrors, tip: undefined },
      };
    case "SET_ERRORS":
      return {
        ...state,
        fieldErrors: action.errors,
      };
    default:
      return state;
  }
}

/** Validates review form fields before persisting receipt + line items. */
function validateState(state: ReviewState): FieldErrors {
  const errors: FieldErrors = {
    rowErrors: {},
  };
  if (!state.storeName.trim()) {
    errors.storeName = "Store name is required.";
  }
  if (state.items.length === 0) {
    errors.items = "Add at least one line item.";
  }
  for (const item of state.items) {
    if (!item.description.trim()) {
      errors.rowErrors[item.id] = "Description is required.";
      continue;
    }
    if (item.quantity < 0 || !Number.isFinite(item.quantity)) {
      errors.rowErrors[item.id] = "Quantity must be 0 or greater.";
      continue;
    }
    if (item.unitPrice < 0 || !Number.isFinite(item.unitPrice)) {
      errors.rowErrors[item.id] = "Unit price must be 0 or greater.";
      continue;
    }
  }
  if (!Number.isFinite(state.tax) || state.tax < 0) {
    errors.tax = "Tax must be 0 or greater.";
  }
  if (!Number.isFinite(state.tip) || state.tip < 0) {
    errors.tip = "Tip must be 0 or greater.";
  }
  return errors;
}

/** Renders review UI for extracted receipt data before committing to session. */
export function ReceiptReviewForm({
  extractedData,
  sessionId,
  onConfirm,
  onBack,
}: ReceiptReviewFormProps) {
  const [state, dispatch] = useReducer(reducer, extractedData, createInitialState);

  const subtotal = useMemo(
    () =>
      state.items.reduce((sum, item) => {
        return sum + item.quantity * item.unitPrice;
      }, 0),
    [state.items]
  );
  const total = useMemo(() => subtotal + state.tax + state.tip, [subtotal, state.tax, state.tip]);
  const formatMoney = useMemo(() => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: state.currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [state.currency]);

  const totalMismatch = useMemo(() => {
    if (state.extractedTotal === null) return false;
    return Math.abs(total - state.extractedTotal) > 0.5;
  }, [state.extractedTotal, total]);

  const confidenceBanner = useMemo(() => {
    if (extractedData.confidence === "high") {
      return {
        className:
          "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300",
        text: "Receipt read successfully",
      };
    }
    if (extractedData.confidence === "medium") {
      return {
        className:
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
        text: "Some items may need correction — please review",
      };
    }
    return {
      className:
        "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
      text: "Low confidence — please verify all items carefully",
    };
  }, [extractedData.confidence]);

  const handleConfirm = () => {
    const errors = validateState(state);
    const hasErrors =
      Boolean(errors.storeName) ||
      Boolean(errors.items) ||
      Boolean(errors.tax) ||
      Boolean(errors.tip) ||
      Object.keys(errors.rowErrors).length > 0;
    if (hasErrors) {
      dispatch({ type: "SET_ERRORS", errors });
      return;
    }

    const receiptPayload: Omit<Receipt, "id" | "created_at"> = {
      session_id: sessionId,
      store_name: state.storeName.trim(),
      total,
      tax: state.tax,
      tip: state.tip,
    };

    const lineItemsPayload: Omit<LineItem, "id" | "claimed_by" | "claimed_at">[] =
      state.items.map((item) => ({
        receipt_id: "",
        description: item.description.trim(),
        amount: item.quantity * item.unitPrice,
        quantity: item.quantity,
      }));

    onConfirm(receiptPayload, lineItemsPayload);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className={`rounded-lg border p-3 text-sm font-medium ${confidenceBanner.className}`}>
        {confidenceBanner.text}
      </div>

      <div>
        <label htmlFor="review-store-name" className="text-sm font-medium">
          Store name
        </label>
        <Input
          id="review-store-name"
          value={state.storeName}
          onChange={(event) => dispatch({ type: "SET_STORE_NAME", value: event.target.value })}
          className="mt-1 h-11"
          aria-invalid={Boolean(state.fieldErrors.storeName)}
        />
        {state.fieldErrors.storeName && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.fieldErrors.storeName}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Line items</h3>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1"
            onClick={() => dispatch({ type: "ADD_ITEM" })}
          >
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
        {state.fieldErrors.items && (
          <p className="text-xs text-red-600 dark:text-red-400">{state.fieldErrors.items}</p>
        )}
        <div className="space-y-2">
          {state.items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-background p-2"
            >
              <div className="col-span-12 sm:col-span-5">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input
                  value={item.description}
                  onChange={(event) =>
                    dispatch({
                      type: "UPDATE_ITEM",
                      id: item.id,
                      patch: { description: event.target.value },
                    })
                  }
                  className="mt-1 h-10"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Qty</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={item.quantity}
                  onChange={(event) =>
                    dispatch({
                      type: "UPDATE_ITEM",
                      id: item.id,
                      patch: { quantity: Number(event.target.value || 0) },
                    })
                  }
                  className="mt-1 h-10"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Unit</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unitPrice}
                  onChange={(event) =>
                    dispatch({
                      type: "UPDATE_ITEM",
                      id: item.id,
                      patch: { unitPrice: Number(event.target.value || 0) },
                    })
                  }
                  className="mt-1 h-10"
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Total</label>
                <div className="mt-1 flex h-10 items-center rounded-md border border-border px-2 text-sm">
                  {formatMoney.format(item.quantity * item.unitPrice)}
                </div>
              </div>
              <div className="col-span-1 flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "DELETE_ITEM", id: item.id })}
                  className="mb-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${item.description || "item"}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {state.fieldErrors.rowErrors[item.id] && (
                <p className="col-span-12 text-xs text-red-600 dark:text-red-400">
                  {state.fieldErrors.rowErrors[item.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-background p-3">
        <div className="flex items-center justify-between text-sm">
          <span>Subtotal</span>
          <span className="font-medium">{formatMoney.format(subtotal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Tax</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={state.tax}
              onChange={(event) =>
                dispatch({ type: "SET_TAX", value: Number(event.target.value || 0) })
              }
              className="mt-1 h-10"
              aria-invalid={Boolean(state.fieldErrors.tax)}
            />
            {state.fieldErrors.tax && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.fieldErrors.tax}</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tip</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={state.tip}
              onChange={(event) =>
                dispatch({ type: "SET_TIP", value: Number(event.target.value || 0) })
              }
              className="mt-1 h-10"
              aria-invalid={Boolean(state.fieldErrors.tip)}
            />
            {state.fieldErrors.tip && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.fieldErrors.tip}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
          <span>Total</span>
          <span>{formatMoney.format(total)}</span>
        </div>
        {totalMismatch && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Computed total differs from receipt total — please verify
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onBack}>
          Back
        </Button>
        <Button type="button" className="h-11 flex-1" onClick={handleConfirm}>
          Add to Session
        </Button>
      </div>
    </div>
  );
}
