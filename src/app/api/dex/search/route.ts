import type { NextRequest } from "next/server";
import type { RowsResponse } from "@/lib/api-types";
import { rowsFromPairs } from "@/lib/dexscreener/normalize";
import { getTokenPairs, searchPairs } from "@/lib/server/dexscreener";
import { BadRequestError, errorResponse, json, limitClient } from "@/lib/server/http";
import { isSolanaAddress } from "@/lib/solana/address";

export async function GET(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 64) throw new BadRequestError("Search query must be 2–64 characters.");

    // A pasted mint address is looked up directly, which is more precise than search.
    const result = isSolanaAddress(q) ? await getTokenPairs(q) : await searchPairs(q);
    const body: RowsResponse = {
      rows: rowsFromPairs(result.value.items),
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      staleReason: result.staleReason,
      dropped: result.value.dropped,
      source: isSolanaAddress(q) ? "DEX Screener /token-pairs/v1" : "DEX Screener /latest/dex/search",
    };
    return json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
