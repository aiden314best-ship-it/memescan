// Conversions between user-entered decimal strings and on-chain integer amounts.
// All math is done with bigint so large supplies and 9-decimal tokens never lose precision.

export const LAMPORTS_PER_SOL = 1_000_000_000n;
const U64_MAX = (1n << 64n) - 1n;

export type ParseAmountResult =
  | { ok: true; atomic: bigint }
  | { ok: false; error: string };

/** Parses a decimal string such as "1.25" into atomic units for a token with `decimals`. */
export function parseDecimalAmount(input: string, decimals: number): ParseAmountResult {
  const value = input.trim();
  if (value === "") return { ok: false, error: "Enter an amount." };
  if (!/^\d*\.?\d*$/.test(value) || value === ".") {
    return { ok: false, error: "Use digits and an optional decimal point only." };
  }
  const [whole = "", fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    return { ok: false, error: `This token supports at most ${decimals} decimal places.` };
  }
  const atomic =
    BigInt(whole || "0") * 10n ** BigInt(decimals) +
    BigInt((fraction || "").padEnd(decimals, "0") || "0");
  if (atomic <= 0n) return { ok: false, error: "Amount must be greater than zero." };
  if (atomic > U64_MAX) return { ok: false, error: "Amount is too large." };
  return { ok: true, atomic };
}

/** Formats atomic units as a decimal string, trimming trailing zeros. */
export function formatAtomic(atomic: bigint | string, decimals: number, maxFraction = decimals): string {
  const value = typeof atomic === "string" ? BigInt(atomic) : atomic;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let fraction = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction);
  fraction = fraction.replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${wholeStr}${fraction ? `.${fraction}` : ""}`;
}

export function atomicToNumber(atomic: bigint | string, decimals: number): number {
  const value = typeof atomic === "string" ? BigInt(atomic) : atomic;
  return Number(value) / 10 ** decimals;
}
