// Runtime validation for DEX Screener API responses (https://docs.dexscreener.com/api/reference).
// Every field the UI depends on is validated; malformed items are dropped and counted
// rather than guessed at.
import { z } from "zod";

// Numbers sometimes arrive as strings (priceUsd, priceNative). Anything that is not a
// finite number becomes null instead of 0, so the UI can show "unavailable".
const num = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const optNum = num.optional().transform((v) => v ?? null);

const tokenRef = z.object({
  address: z.string(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
});

const txnWindow = z
  .object({ buys: optNum, sells: optNum })
  .nullish()
  .transform((v) => v ?? { buys: null, sells: null });

const windows = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .object({ m5: inner.optional(), h1: inner.optional(), h6: inner.optional(), h24: inner.optional() })
    .nullish()
    .transform((v) => v ?? {});

const link = z.object({
  type: z.string().nullish(),
  label: z.string().nullish(),
  url: z.string(),
});

export const pairSchema = z.object({
  chainId: z.string(),
  dexId: z.string(),
  url: z.string().nullish(),
  pairAddress: z.string(),
  labels: z.array(z.string()).nullish(),
  baseToken: tokenRef,
  quoteToken: tokenRef,
  priceNative: optNum,
  priceUsd: optNum,
  txns: z
    .object({ m5: txnWindow, h1: txnWindow, h6: txnWindow, h24: txnWindow })
    .partial()
    .nullish(),
  volume: windows(num),
  priceChange: windows(num),
  liquidity: z.object({ usd: optNum, base: optNum, quote: optNum }).nullish(),
  fdv: optNum,
  marketCap: optNum,
  pairCreatedAt: optNum,
  info: z
    .object({
      imageUrl: z.string().nullish(),
      header: z.string().nullish(),
      websites: z.array(z.object({ label: z.string().nullish(), url: z.string() })).nullish(),
      socials: z.array(z.object({ type: z.string().nullish(), url: z.string() })).nullish(),
    })
    .nullish(),
  boosts: z.object({ active: optNum }).nullish(),
});
export type RawPair = z.infer<typeof pairSchema>;

export const tokenProfileSchema = z.object({
  url: z.string().nullish(),
  chainId: z.string(),
  tokenAddress: z.string(),
  icon: z.string().nullish(),
  header: z.string().nullish(),
  description: z.string().nullish(),
  links: z.array(link).nullish(),
});

export const tokenBoostSchema = tokenProfileSchema.extend({
  amount: optNum,
  totalAmount: optNum,
});

export const communityTakeoverSchema = tokenProfileSchema.extend({
  claimDate: z.string().nullish(),
});

export type RawTokenListing = z.infer<typeof tokenBoostSchema> & { claimDate?: string | null };

/**
 * Validates each array element independently. One malformed pair must not hide the
 * rest, but it also must not be partially rendered.
 */
export function parseArray<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): { items: z.infer<T>[]; dropped: number } {
  const list = Array.isArray(input) ? input : input == null ? [] : [input];
  const items: z.infer<T>[] = [];
  let dropped = 0;
  for (const entry of list) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
    else dropped++;
  }
  return { items, dropped };
}

/** The search and pairs endpoints wrap results as { schemaVersion, pairs }. */
export function parsePairsEnvelope(input: unknown) {
  const pairs =
    input && typeof input === "object" && "pairs" in input ? (input as { pairs: unknown }).pairs : input;
  return parseArray(pairSchema, pairs);
}
