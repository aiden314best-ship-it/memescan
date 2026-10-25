// Server-side DEX Screener client: throttled, cached, validated.
// Docs: https://docs.dexscreener.com/api/reference
import "server-only";
import { cache, type CachedResult } from "./cache";
import { fetchJson } from "./http";
import { throttles } from "./throttle";
import { isSolanaAddress } from "@/lib/solana/address";
import {
  communityTakeoverSchema,
  parseArray,
  parsePairsEnvelope,
  tokenBoostSchema,
  tokenProfileSchema,
  type RawPair,
  type RawTokenListing,
} from "@/lib/dexscreener/schema";

const BASE = "https://api.dexscreener.com";
const LISTING_TTL = 60_000;
const PAIRS_TTL = 30_000;

export type ListingSource = "boosts-top" | "boosts-latest" | "profiles-latest" | "community-takeovers";

const LISTING_PATHS: Record<ListingSource, { path: string; schema: typeof tokenBoostSchema }> = {
  "boosts-top": { path: "/token-boosts/top/v1", schema: tokenBoostSchema },
  "boosts-latest": { path: "/token-boosts/latest/v1", schema: tokenBoostSchema },
  "profiles-latest": { path: "/token-profiles/latest/v1", schema: tokenProfileSchema as typeof tokenBoostSchema },
  "community-takeovers": {
    path: "/community-takeovers/latest/v1",
    schema: communityTakeoverSchema as unknown as typeof tokenBoostSchema,
  },
};

async function slow(url: string) {
  await throttles.dexSlow.acquire();
  return fetchJson(url, "DEX Screener");
}

async function fast(url: string) {
  await throttles.dexFast.acquire();
  return fetchJson(url, "DEX Screener");
}

export interface Parsed<T> {
  items: T[];
  dropped: number;
}

/** Token listings (profiles/boosts/takeovers), restricted to Solana mints. */
export function getListings(source: ListingSource): Promise<CachedResult<Parsed<RawTokenListing>>> {
  const { path, schema } = LISTING_PATHS[source];
  return cache.get(`listing:${source}`, LISTING_TTL, async () => {
    const raw = await slow(`${BASE}${path}`);
    const { items, dropped } = parseArray(schema, raw);
    const solana = items.filter((i) => i.chainId === "solana" && isSolanaAddress(i.tokenAddress));
    return { items: solana as RawTokenListing[], dropped };
  });
}

/** Pairs for up to 30 token mints in one call (tokens/v1). */
export function getPairsForTokens(mints: string[]): Promise<CachedResult<Parsed<RawPair>>> {
  const unique = [...new Set(mints.filter(isSolanaAddress))].slice(0, 30);
  const key = `tokens:${[...unique].sort().join(",")}`;
  return cache.get(key, PAIRS_TTL, async () => {
    if (unique.length === 0) return { items: [], dropped: 0 };
    const raw = await fast(`${BASE}/tokens/v1/solana/${unique.join(",")}`);
    return parsePairsEnvelope(raw);
  });
}

/** All pools for a single token (token-pairs/v1). */
export function getTokenPairs(mint: string): Promise<CachedResult<Parsed<RawPair>>> {
  return cache.get(`token-pairs:${mint}`, PAIRS_TTL, async () => {
    const raw = await fast(`${BASE}/token-pairs/v1/solana/${mint}`);
    return parsePairsEnvelope(raw);
  });
}

/** Free-text pair search. Results are restricted to Solana by the caller. */
export function searchPairs(query: string): Promise<CachedResult<Parsed<RawPair>>> {
  const q = query.trim().slice(0, 64);
  return cache.get(`search:${q.toLowerCase()}`, PAIRS_TTL, async () => {
    const raw = await fast(`${BASE}/latest/dex/search?q=${encodeURIComponent(q)}`);
    return parsePairsEnvelope(raw);
  });
}

/** Batches mints into groups of 30 for tokens/v1 and merges the results. */
export async function getPairsForManyTokens(mints: string[]) {
  const unique = [...new Set(mints.filter(isSolanaAddress))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const results = await Promise.all(chunks.map((c) => getPairsForTokens(c)));
  return {
    pairs: results.flatMap((r) => r.value.items),
    dropped: results.reduce((n, r) => n + r.value.dropped, 0),
    fetchedAt: results.length ? Math.min(...results.map((r) => r.fetchedAt)) : Date.now(),
    stale: results.some((r) => r.stale),
    staleReason: results.find((r) => r.stale)?.staleReason,
  };
}
