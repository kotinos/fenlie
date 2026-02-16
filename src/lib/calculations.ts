import type { Receipt, Session, LineItem } from "./store";

function getItemQuantity(item: LineItem): number {
  const qty = Number(item.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function getClaimedQtyForPerson(item: LineItem, personName: string): number {
  return item.claimedBy.reduce((count, name) => (name === personName ? count + 1 : count), 0);
}

function getTotalClaimedQty(item: LineItem): number {
  return item.claimedBy.length;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Breakdown of what a single person owes on a single receipt. */
export type PersonReceiptTotal = {
  itemTotal: number;
  taxShare: number;
  tipShare: number;
  feeShare: number;
  total: number;
};

/** A person's net balance across the entire session. */
export type PersonBalance = {
  name: string;
  /** Total the person owes across all receipts (their share of items + tax/tip/fees). */
  totalOwed: number;
  /** Total the person already paid (sum of receipt.total where they are the payer). */
  totalPaid: number;
  /** Net balance: positive = they owe money, negative = they are owed money. */
  net: number;
};

/** A single simplified payment from one person to another. */
export type Transfer = {
  from: string;
  to: string;
  amount: number;
};

/** Full settlement result for a session. */
export type SessionSettlement = {
  balances: PersonBalance[];
  transfers: Transfer[];
};

/** An unclaimed item with its receipt context. */
export type UnclaimedItem = {
  receiptId: string;
  receiptName: string | null;
  item: LineItem;
};

// ---------------------------------------------------------------------------
// 1. calculatePersonReceiptTotal
// ---------------------------------------------------------------------------

/**
 * Calculate how much a single person owes on a single receipt.
 *
 * The person's share of each line item is `item.totalPrice / item.claimedBy.length`
 * for every item where `claimedBy` includes the person.
 *
 * Shared costs (tax, tip, fees) are distributed proportionally based on the
 * ratio of the person's item total to the receipt subtotal.
 *
 * @param receipt - The receipt to calculate against.
 * @param personName - The name of the person.
 * @returns A {@link PersonReceiptTotal} breakdown.
 *
 * @example
 * ```ts
 * const breakdown = calculatePersonReceiptTotal(receipt, "Alice");
 * console.log(breakdown.total); // e.g. 18.42
 * ```
 */
export function calculatePersonReceiptTotal(
  receipt: Receipt,
  personName: string
): PersonReceiptTotal {
  // Sum of the person's share of each claimed item quantity.
  const itemTotal = receipt.lineItems.reduce((sum, item) => {
    const itemQty = getItemQuantity(item);
    const claimedQty = getClaimedQtyForPerson(item, personName);
    if (claimedQty <= 0) {
      return sum;
    }

    return sum + (claimedQty / itemQty) * item.totalPrice;
  }, 0);

  // Proportional share ratio (guard against division by zero)
  const shareRatio = receipt.subtotal === 0 ? 0 : itemTotal / receipt.subtotal;

  const taxShare = receipt.sharedCosts.tax * shareRatio;
  const tipShare = receipt.sharedCosts.tip * shareRatio;
  const feeShare = receipt.sharedCosts.fees * shareRatio;

  const total = itemTotal + taxShare + tipShare + feeShare;

  return { itemTotal, taxShare, tipShare, feeShare, total };
}

// ---------------------------------------------------------------------------
// 2. calculateSessionSettlement
// ---------------------------------------------------------------------------

/**
 * Compute the settlement for an entire session.
 *
 * **Balances**: For each participant the function sums what they owe across
 * all receipts (via {@link calculatePersonReceiptTotal}) and subtracts what
 * they paid (receipts where `paidBy === name`). A positive `net` means the
 * person still owes money; negative means others owe *them*.
 *
 * **Transfers**: A greedy algorithm pairs the largest debtor with the largest
 * creditor repeatedly, transferring the minimum of the two absolute balances
 * each iteration, until all balances are settled (within ±$0.01 rounding).
 *
 * @param session - The session containing participants and receipts.
 * @returns A {@link SessionSettlement} with balances and simplified transfers.
 *
 * @example
 * ```ts
 * const { balances, transfers } = calculateSessionSettlement(session);
 * transfers.forEach(t =>
 *   console.log(`${t.from} pays ${t.to} $${t.amount.toFixed(2)}`)
 * );
 * ```
 */
export function calculateSessionSettlement(session: Session): SessionSettlement {
  // --- Build per-person balances ---
  const rawBalances = session.participants.map((name) => {
    // What the person owes across every receipt
    const totalOwed = session.receipts.reduce((sum, receipt) => {
      return sum + calculatePersonReceiptTotal(receipt, name).total;
    }, 0);

    // What the person already paid
    const totalPaid = session.receipts.reduce((sum, receipt) => {
      return receipt.paidBy === name ? sum + receipt.total : sum;
    }, 0);

    return {
      name,
      totalOwed: Math.round(totalOwed * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      net: Math.round((totalOwed - totalPaid) * 100) / 100,
    };
  });

  // --- Assign leftover rounding pennies to the largest debtor ---
  const totalNets = rawBalances.reduce((s, b) => s + b.net, 0);
  const roundingError = Math.round(totalNets * 100) / 100;
  if (Math.abs(roundingError) >= 0.01) {
    // Find the largest debtor (most positive net) and absorb the penny diff
    const sorted = [...rawBalances].sort((a, b) => b.net - a.net);
    const largestDebtor = sorted.find((b) => b.net > 0) ?? sorted[0];
    largestDebtor.net = Math.round((largestDebtor.net - roundingError) * 100) / 100;
  }

  const balances: PersonBalance[] = rawBalances;

  // --- Greedy settlement algorithm ---
  // Clone net balances so we can mutate them
  const working = balances.map((b) => ({ name: b.name, net: b.net }));
  const transfers: Transfer[] = [];

  const EPSILON = 0.01;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Sort ascending: most negative (creditor) first, most positive (debtor) last
    working.sort((a, b) => a.net - b.net);

    const creditor = working[0]; // most negative net
    const debtor = working[working.length - 1]; // most positive net

    // If both are effectively zero we're done
    if (Math.abs(debtor.net) < EPSILON || Math.abs(creditor.net) < EPSILON) {
      break;
    }

    // Transfer the smaller of the two absolute values
    const amount = Math.round(Math.min(debtor.net, Math.abs(creditor.net)) * 100) / 100;

    if (amount <= 0) break;

    transfers.push({
      from: debtor.name,
      to: creditor.name,
      amount,
    });

    debtor.net = Math.round((debtor.net - amount) * 100) / 100;
    creditor.net = Math.round((creditor.net + amount) * 100) / 100;
  }

  return { balances, transfers };
}

// ---------------------------------------------------------------------------
// 3. getUnclaimedItems
// ---------------------------------------------------------------------------

/**
 * Find every line item across all receipts in a session that has **no one**
 * claiming it (i.e. `claimedBy` is empty).
 *
 * Useful for alerting users that some items haven't been assigned yet.
 *
 * @param session - The session to scan.
 * @returns An array of {@link UnclaimedItem} objects.
 *
 * @example
 * ```ts
 * const unclaimed = getUnclaimedItems(session);
 * if (unclaimed.length > 0) {
 *   console.warn(`${unclaimed.length} items still need to be claimed!`);
 * }
 * ```
 */
export function getUnclaimedItems(session: Session): UnclaimedItem[] {
  const result: UnclaimedItem[] = [];

  for (const receipt of session.receipts) {
    for (const item of receipt.lineItems) {
      const itemQty = getItemQuantity(item);
      const claimedQty = getTotalClaimedQty(item);
      if (claimedQty < itemQty) {
        result.push({
          receiptId: receipt.id,
          receiptName: receipt.restaurantName,
          item,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 4. getReceiptsWithoutPayer
// ---------------------------------------------------------------------------

/**
 * Return the IDs of all receipts in a session where no payer has been set
 * (i.e. `paidBy` is an empty string).
 *
 * Useful for validation before computing settlements — every receipt needs
 * a payer for the settlement math to be meaningful.
 *
 * @param session - The session to scan.
 * @returns An array of receipt IDs that are missing a payer.
 *
 * @example
 * ```ts
 * const missing = getReceiptsWithoutPayer(session);
 * if (missing.length > 0) {
 *   alert("Please set a payer for all receipts before settling up.");
 * }
 * ```
 */
export function getReceiptsWithoutPayer(session: Session): string[] {
  return session.receipts
    .filter((r) => !r.paidBy)
    .map((r) => r.id);
}
