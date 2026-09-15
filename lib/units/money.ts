/** Integer-pence money helpers. Never use float arithmetic on totals (P2). */

export function assertMinor(n: number): number {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`assertMinor: expected a safe integer (pence), got ${n}`);
  }
  return n;
}

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += assertMinor(v);
  }
  return assertMinor(total);
}

export function mulMinor(minor: number, qty: number): number {
  assertMinor(minor);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error(`mulMinor: qty must be a positive integer, got ${qty}`);
  }
  return assertMinor(minor * qty);
}

export function formatMinor(minor: number, currency: "GBP" = "GBP"): string {
  assertMinor(minor);
  void currency; // only GBP supported currently
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const pounds = Math.floor(abs / 100);
  const pence = abs % 100;
  const formatted = `£${pounds}.${String(pence).padStart(2, "0")}`;
  return negative ? `−${formatted}` : formatted;
}
