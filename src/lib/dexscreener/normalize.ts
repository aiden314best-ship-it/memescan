// Converts validated DEX Screener pairs into the flat TokenRow shape the UI renders.
import { isSolanaAddress } from "@/lib/solana/address";
import { cleanText, safeExternalUrl, safeImageUrl } from "@/lib/safe";
import type { RawPair } from "./schema";

type Windowed = { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
type Txns = { buys: number | null; sells: number | null };

export interface TokenRow {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  pairAddress: string;
  dexId: string;
  pairUrl: string;
  quoteSymbol: string;
  quoteMint: string;
  priceUsd: number | null;
  priceNative: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  liquidityBase: number | null;
  liquidityQuote: number | null;
  volume: Windowed;
  priceChange: Windowed;
  txns: { m5: Txns; h1: Txns; h6: Txns; h24: Txns };
  pairCreatedAt: number | null;
  labels: string[];
  websites: { label: string; url: string }[];
  socials: { type: string; url: string }[];
  /** Active DEX Screener boosts on the pair. Boosts are paid promotions. */
  activeBoosts: number | null;
  /** Number of Solana pairs found for this token (best pair is shown). */
  pairCount: number;
  /** Sum of USD liquidity across all of the token's Solana pairs, when reported. */
  totalLiquidityUsd: number | null;
}

export interface PoolInfo {
  pairAddress: string;
  dexId: string;
  pairUrl: string;
  baseSymbol: string;
  quoteSymbol: string;
  quoteMint: string;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceUsd: number | null;
  pairCreatedAt: number | null;
  labels: string[];
}

function windowed(v: Partial<Record<keyof Windowed, number | null | undefined>>): Windowed {
  return { m5: v.m5 ?? null, h1: v.h1 ?? null, h6: v.h6 ?? null, h24: v.h24 ?? null };
}

const emptyTxns = (): Txns => ({ buys: null, sells: null });

export function pairUrl(pair: RawPair): string {
  return (
    safeExternalUrl(pair.url) ?? `https://dexscreener.com/${encodeURIComponent(pair.chainId)}/${encodeURIComponent(pair.pairAddress)}`
  );
}

/** Keeps only Solana pairs whose base token is a valid mint. */
export function solanaPairs(pairs: RawPair[]): RawPair[] {
  return pairs.filter(
    (p) => p.chainId === "solana" && isSolanaAddress(p.baseToken.address) && isSolanaAddress(p.pairAddress),
  );
}

/**
 * Picks the most liquid pair where the token is the *base* token. Pairs where the token
 * is quoted are skipped because their priceUsd refers to the other asset.
 */
export function bestPairFor(mint: string, pairs: RawPair[]): RawPair | null {
  let best: RawPair | null = null;
  for (const pair of pairs) {
    if (pair.chainId !== "solana" || pair.baseToken.address !== mint) continue;
    const liq = pair.liquidity?.usd ?? -1;
    const bestLiq = best?.liquidity?.usd ?? -1;
    if (!best || liq > bestLiq) best = pair;
  }
  return best;
}

export function toTokenRow(pair: RawPair, allPairsForToken: RawPair[] = [pair]): TokenRow {
  const relevant = allPairsForToken.filter((p) => p.baseToken.address === pair.baseToken.address);
  const liqValues = relevant.map((p) => p.liquidity?.usd).filter((v): v is number => typeof v === "number");
  const t = pair.txns ?? {};
  return {
    mint: pair.baseToken.address,
    name: cleanText(pair.baseToken.name) || "Unknown token",
    symbol: cleanText(pair.baseToken.symbol, 16) || "???",
    imageUrl: safeImageUrl(pair.info?.imageUrl),
    pairAddress: pair.pairAddress,
    dexId: cleanText(pair.dexId, 32),
    pairUrl: pairUrl(pair),
    quoteSymbol: cleanText(pair.quoteToken.symbol, 16) || "???",
    quoteMint: pair.quoteToken.address,
    priceUsd: pair.priceUsd,
    priceNative: pair.priceNative,
    marketCap: pair.marketCap,
    fdv: pair.fdv,
    liquidityUsd: pair.liquidity?.usd ?? null,
    liquidityBase: pair.liquidity?.base ?? null,
    liquidityQuote: pair.liquidity?.quote ?? null,
    volume: windowed(pair.volume),
    priceChange: windowed(pair.priceChange),
    txns: {
      m5: t.m5 ?? emptyTxns(),
      h1: t.h1 ?? emptyTxns(),
      h6: t.h6 ?? emptyTxns(),
      h24: t.h24 ?? emptyTxns(),
    },
    pairCreatedAt: pair.pairCreatedAt,
    labels: (pair.labels ?? []).map((l) => cleanText(l, 24)).filter(Boolean),
    websites: (pair.info?.websites ?? [])
      .map((w) => ({ label: cleanText(w.label, 32) || "Website", url: safeExternalUrl(w.url) }))
      .filter((w): w is { label: string; url: string } => w.url !== null)
      .slice(0, 5),
    socials: (pair.info?.socials ?? [])
      .map((s) => ({ type: cleanText(s.type, 24) || "social", url: safeExternalUrl(s.url) }))
      .filter((s): s is { type: string; url: string } => s.url !== null)
      .slice(0, 5),
    activeBoosts: pair.boosts?.active ?? null,
    pairCount: relevant.length,
    totalLiquidityUsd: liqValues.length ? liqValues.reduce((a, b) => a + b, 0) : null,
  };
}

export function toPoolInfo(pair: RawPair): PoolInfo {
  return {
    pairAddress: pair.pairAddress,
    dexId: cleanText(pair.dexId, 32),
    pairUrl: pairUrl(pair),
    baseSymbol: cleanText(pair.baseToken.symbol, 16) || "???",
    quoteSymbol: cleanText(pair.quoteToken.symbol, 16) || "???",
    quoteMint: pair.quoteToken.address,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24h: pair.volume.h24 ?? null,
    priceUsd: pair.priceUsd,
    pairCreatedAt: pair.pairCreatedAt,
    labels: (pair.labels ?? []).map((l) => cleanText(l, 24)).filter(Boolean),
  };
}

/** Groups pairs by base mint and returns one row per token using its best pair. */
export function rowsFromPairs(pairs: RawPair[], onlyMints?: string[]): TokenRow[] {
  const byMint = new Map<string, RawPair[]>();
  for (const p of solanaPairs(pairs)) {
    const list = byMint.get(p.baseToken.address) ?? [];
    list.push(p);
    byMint.set(p.baseToken.address, list);
  }
  const order = onlyMints ?? [...byMint.keys()];
  const rows: TokenRow[] = [];
  for (const mint of order) {
    const list = byMint.get(mint);
    if (!list) continue;
    const best = bestPairFor(mint, list);
    if (best) rows.push(toTokenRow(best, list));
  }
  return rows;
}
