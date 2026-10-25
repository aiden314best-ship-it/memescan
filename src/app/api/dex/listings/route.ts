import type { NextRequest } from "next/server";
import type { ListingInfo, ListingsResponse } from "@/lib/api-types";
import { rowsFromPairs } from "@/lib/dexscreener/normalize";
import { cleanText, safeExternalUrl } from "@/lib/safe";
import { getListings, getPairsForManyTokens, type ListingSource } from "@/lib/server/dexscreener";
import { BadRequestError, errorResponse, json, limitClient } from "@/lib/server/http";

const SOURCES: Record<ListingSource, string> = {
  "boosts-top": "DEX Screener /token-boosts/top/v1",
  "boosts-latest": "DEX Screener /token-boosts/latest/v1",
  "profiles-latest": "DEX Screener /token-profiles/latest/v1",
  "community-takeovers": "DEX Screener /community-takeovers/latest/v1",
};

export async function GET(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const source = request.nextUrl.searchParams.get("source") as ListingSource;
    if (!(source in SOURCES)) throw new BadRequestError("Unknown source.");

    const listings = await getListings(source);
    const seen = new Set<string>();
    const listingInfo: ListingInfo[] = [];
    for (const item of listings.value.items) {
      if (seen.has(item.tokenAddress)) continue;
      seen.add(item.tokenAddress);
      listingInfo.push({
        mint: item.tokenAddress,
        boostAmount: "amount" in item ? (item.amount ?? null) : null,
        totalBoostAmount: "totalAmount" in item ? (item.totalAmount ?? null) : null,
        description: cleanText(item.description, 280),
        listingUrl: safeExternalUrl(item.url),
        claimDate: cleanText(item.claimDate, 40) || null,
      });
    }
    const mints = listingInfo.map((l) => l.mint).slice(0, 90);
    const pairs = await getPairsForManyTokens(mints);
    const rows = rowsFromPairs(pairs.pairs, mints);

    const body: ListingsResponse = {
      rows,
      listings: listingInfo,
      missingPairs: mints.length - rows.length,
      fetchedAt: Math.min(listings.fetchedAt, pairs.fetchedAt),
      stale: listings.stale || pairs.stale,
      staleReason: listings.staleReason ?? pairs.staleReason,
      dropped: listings.value.dropped + pairs.dropped,
      source: `${SOURCES[source]} + /tokens/v1`,
    };
    return json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
