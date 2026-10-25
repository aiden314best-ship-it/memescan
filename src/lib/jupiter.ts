// Jupiter Swap API V2 (Meta-Aggregator) types, request validation and error mapping.
// Source: Jupiter developer docs, "Order & Execute" (GET /swap/v2/order, POST /swap/v2/execute).
import { z } from "zod";
import { isSolanaAddress } from "@/lib/solana/address";

export const JUPITER_BASE = "https://api.jup.ag";

export const SLIPPAGE_MIN_BPS = 1;
export const SLIPPAGE_MAX_BPS = 3000; // 30% hard cap
export const SLIPPAGE_WARN_BPS = 500; // warn above 5%

const routeStep = z.object({
  swapInfo: z.object({
    ammKey: z.string(),
    label: z.string().nullish(),
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string(),
    outAmount: z.string(),
  }),
  percent: z.number().nullish(),
  bps: z.number().nullish(),
});

const intString = z.string().regex(/^\d+$/);

export const orderResponseSchema = z.object({
  mode: z.string().nullish(),
  inputMint: z.string(),
  outputMint: z.string(),
  inAmount: intString,
  outAmount: intString,
  inUsdValue: z.number().nullish(),
  outUsdValue: z.number().nullish(),
  priceImpact: z.number().nullish(),
  otherAmountThreshold: intString.nullish(),
  slippageBps: z.number().nullish(),
  routePlan: z.array(routeStep).nullish(),
  feeMint: z.string().nullish(),
  feeBps: z.number().nullish(),
  platformFee: z.object({ amount: z.string().nullish(), feeBps: z.number().nullish(), feeMint: z.string().nullish() }).nullish(),
  signatureFeeLamports: z.number().nullish(),
  signatureFeePayer: z.string().nullish(),
  prioritizationFeeLamports: z.number().nullish(),
  prioritizationFeePayer: z.string().nullish(),
  rentFeeLamports: z.number().nullish(),
  rentFeePayer: z.string().nullish(),
  router: z.string().nullish(),
  transactionVersion: z.number().nullish(),
  transaction: z.string().nullable().optional(),
  lastValidBlockHeight: z.union([z.string(), z.number()]).nullish(),
  gasless: z.boolean().nullish(),
  requestId: z.string().max(256),
  taker: z.string().nullish(),
  expireAt: z.string().nullish(),
  errorCode: z.number().nullish(),
  errorMessage: z.string().nullish(),
});
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const executeResponseSchema = z.object({
  status: z.enum(["Success", "Failed"]),
  signature: z.string().nullish(),
  code: z.number(),
  totalInputAmount: z.string().nullish(),
  totalOutputAmount: z.string().nullish(),
  inputAmountResult: z.string().nullish(),
  outputAmountResult: z.string().nullish(),
  error: z.string().nullish(),
});
export type ExecuteResponse = z.infer<typeof executeResponseSchema>;

export interface OrderParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker?: string;
  slippageBps?: number;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateOrderParams(input: Record<string, string | null | undefined>): Validated<OrderParams> {
  const { inputMint, outputMint, amount, taker, slippageBps } = input;
  if (!isSolanaAddress(inputMint)) return { ok: false, error: "inputMint is not a valid Solana address." };
  if (!isSolanaAddress(outputMint)) return { ok: false, error: "outputMint is not a valid Solana address." };
  if (inputMint === outputMint) return { ok: false, error: "Input and output tokens must differ." };
  if (!amount || !/^\d{1,20}$/.test(amount) || BigInt(amount) <= 0n || BigInt(amount) > (1n << 64n) - 1n) {
    return { ok: false, error: "amount must be a positive integer in the token's smallest unit." };
  }
  if (taker && !isSolanaAddress(taker)) return { ok: false, error: "taker is not a valid Solana address." };
  let slippage: number | undefined;
  if (slippageBps) {
    slippage = Number(slippageBps);
    if (!Number.isInteger(slippage) || slippage < SLIPPAGE_MIN_BPS || slippage > SLIPPAGE_MAX_BPS) {
      return { ok: false, error: `slippageBps must be an integer from ${SLIPPAGE_MIN_BPS} to ${SLIPPAGE_MAX_BPS}.` };
    }
  }
  return { ok: true, value: { inputMint, outputMint, amount, taker: taker || undefined, slippageBps: slippage } };
}

/** Signed Solana transactions are at most a few KB; anything larger is rejected. */
export function validateExecuteBody(body: unknown): Validated<{ signedTransaction: string; requestId: string }> {
  const b = body as { signedTransaction?: unknown; requestId?: unknown } | null;
  if (!b || typeof b.signedTransaction !== "string" || typeof b.requestId !== "string") {
    return { ok: false, error: "signedTransaction and requestId are required." };
  }
  if (b.signedTransaction.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.signedTransaction)) {
    return { ok: false, error: "signedTransaction must be base64 and under 8 KB." };
  }
  if (b.requestId.length === 0 || b.requestId.length > 256 || !/^[\w-]+$/.test(b.requestId)) {
    return { ok: false, error: "requestId is malformed." };
  }
  return { ok: true, value: { signedTransaction: b.signedTransaction, requestId: b.requestId } };
}

/** Explains why /order returned a quote without a buildable transaction. */
export function describeOrderError(router: string | null | undefined, code: number | null | undefined, fallback?: string | null): string {
  const aggregator: Record<number, string> = {
    1: "Insufficient balance of the token you are selling.",
    2: "Insufficient SOL to pay network fees for this swap.",
    3: "Swap amount is below the minimum for gasless execution.",
  };
  const rfq: Record<number, string> = {
    1: "Insufficient balance to fund the swap.",
    2: "Missing associated token account for this token.",
    3: "The quote could not be built into a transaction.",
  };
  const table = router === "jupiterz" ? rfq : aggregator;
  return (code != null && table[code]) || fallback || "Jupiter could not build a transaction for this quote.";
}

export type ExecuteOutcome = "confirmed" | "expired" | "failed" | "rejected-by-api";

export function describeExecuteCode(code: number): { outcome: ExecuteOutcome; message: string } {
  if (code === 0) return { outcome: "confirmed", message: "Transaction confirmed." };
  const expired: Record<number, string> = {
    [-1]: "The quote expired or was not found. Get a fresh quote and try again.",
    [-1004]: "Invalid block height: the quote is too old. Get a fresh quote.",
    [-1005]: "The transaction expired before it landed (signed too late). Nothing was swapped. Get a fresh quote.",
    [-2003]: "The market maker quote expired. Get a fresh quote.",
  };
  if (expired[code]) return { outcome: "expired", message: expired[code] };
  const messages: Record<number, string> = {
    [-2]: "Jupiter rejected the signed transaction as invalid.",
    [-3]: "Jupiter rejected the transaction message bytes as invalid.",
    [-1000]: "The transaction failed to land on-chain.",
    [-1001]: "Unknown aggregator error.",
    [-1002]: "Invalid transaction.",
    [-1003]: "The transaction was not fully signed.",
    [-2000]: "The RFQ transaction failed to land.",
    [-2001]: "Unknown RFQ error.",
    [-2002]: "Invalid RFQ payload.",
    [-2004]: "The market maker rejected the swap.",
  };
  return { outcome: code > -1000 ? "rejected-by-api" : "failed", message: messages[code] ?? `Swap failed (code ${code}).` };
}

/** Network costs paid by the taker, in lamports, when the quote reports them. */
export function takerNetworkCostLamports(order: OrderResponse): number | null {
  const parts: [number | null | undefined, string | null | undefined][] = [
    [order.signatureFeeLamports, order.signatureFeePayer],
    [order.prioritizationFeeLamports, order.prioritizationFeePayer],
    [order.rentFeeLamports, order.rentFeePayer],
  ];
  if (parts.every(([v]) => v == null)) return null;
  return parts.reduce((sum, [v, payer]) => {
    if (v == null) return sum;
    // When a payer is reported and it is not the taker, the taker does not pay that part.
    if (payer && order.taker && payer !== order.taker) return sum;
    return sum + v;
  }, 0);
}

/** Validates a slippage percentage typed by the user (e.g. "1.5" = 1.5%). */
export function validateSlippageInput(text: string): { bps: number | null; error: string | null; warning: string | null } {
  const pct = Number(text);
  if (!text.trim() || !Number.isFinite(pct)) return { bps: null, error: "Enter a percentage.", warning: null };
  const bps = Math.round(pct * 100);
  if (bps < SLIPPAGE_MIN_BPS || bps > SLIPPAGE_MAX_BPS) {
    return { bps: null, error: `Slippage must be between ${SLIPPAGE_MIN_BPS / 100}% and ${SLIPPAGE_MAX_BPS / 100}%.`, warning: null };
  }
  if (bps > SLIPPAGE_WARN_BPS) return { bps, error: null, warning: "High slippage: you may receive much less than quoted, and you are more exposed to sandwich attacks (MEV)." };
  if (bps < 10) return { bps, error: null, warning: "Very low slippage: volatile tokens will often fail to swap (you still pay the network fee)." };
  return { bps, error: null, warning: null };
}
