"use client";
import { z } from "zod";
import { createStore } from "./store";
import { isSolanaAddress } from "@/lib/solana/address";

const mint = z.string().refine(isSolanaAddress);

// ---------------------------------------------------------------- preferences
export const prefsSchema = z.object({
  theme: z.enum(["dark", "light"]),
  /** null = let Jupiter pick slippage automatically (recommended). */
  slippageBps: z.number().int().min(1).max(3000).nullable(),
  refreshMs: z.union([z.literal(0), z.literal(15_000), z.literal(30_000), z.literal(60_000), z.literal(120_000)]),
});
export type Prefs = z.infer<typeof prefsSchema>;
export const prefsStore = createStore<Prefs>("prefs", prefsSchema, {
  theme: "dark",
  slippageBps: null,
  refreshMs: 30_000,
});

// ---------------------------------------------------------------- favorites
const favoriteSchema = z.object({ mint, symbol: z.string().max(16), name: z.string().max(64), addedAt: z.number() });
export type Favorite = z.infer<typeof favoriteSchema>;
export const favoritesStore = createStore<Favorite[]>("favorites", z.array(favoriteSchema).max(200), []);

// ---------------------------------------------------------------- alerts
export const alertRuleSchema = z.object({
  id: z.string(),
  mint,
  symbol: z.string().max(16),
  metric: z.enum(["price", "marketCap"]),
  op: z.enum(["above", "below"]),
  value: z.number().positive(),
  enabled: z.boolean(),
  createdAt: z.number(),
  lastTriggeredAt: z.number().nullable(),
  lastTriggeredValue: z.number().nullable(),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;
export const alertsStore = createStore<AlertRule[]>("alerts", z.array(alertRuleSchema).max(100), []);

// ---------------------------------------------------------------- swap history
// Only swaps that Jupiter reported as Success AND that we confirmed on-chain are recorded.
const swapRecordSchema = z.object({
  signature: z.string(),
  wallet: z.string(),
  inputMint: mint,
  outputMint: mint,
  inputSymbol: z.string().max(16),
  outputSymbol: z.string().max(16),
  inputAmount: z.string(),
  outputAmount: z.string(),
  inputDecimals: z.number().int(),
  outputDecimals: z.number().int(),
  confirmedAt: z.number(),
});
export type SwapRecord = z.infer<typeof swapRecordSchema>;
export const swapHistoryStore = createStore<SwapRecord[]>("swaps", z.array(swapRecordSchema).max(500), []);

// ---------------------------------------------------------------- liquidity observations
// DEX Screener exposes only current liquidity. To show *changes*, this browser records
// what it observed on each risk check. These are local observations, not a full history.
const observationSchema = z.object({ t: z.number(), liq: z.number() });
export const liquidityObsStore = createStore<Record<string, z.infer<typeof observationSchema>[]>>(
  "liquidity-observations",
  z.record(z.string(), z.array(observationSchema).max(50)),
  {},
);

export function recordLiquidity(mintAddr: string, liq: number, t: number) {
  liquidityObsStore.set((prev) => {
    const list = [...(prev[mintAddr] ?? [])];
    const last = list[list.length - 1];
    // At most one observation per 5 minutes per token.
    if (last && t - last.t < 5 * 60_000) return prev;
    list.push({ t, liq });
    const next = { ...prev, [mintAddr]: list.slice(-50) };
    // Cap the number of tracked tokens.
    const keys = Object.keys(next);
    if (keys.length > 200) delete next[keys[0]];
    return next;
  });
}
