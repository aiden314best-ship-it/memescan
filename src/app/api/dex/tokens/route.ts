import type { NextRequest } from "next/server";
import type { RowsResponse } from "@/lib/api-types";
import { rowsFromPairs } from "@/lib/dexscreener/normalize";
import { getPairsForManyTokens } from "@/lib/server/dexscreener";
import { BadRequestError, errorResponse, json, limitClient } from "@/lib/server/http";
import { isSolanaAddress } from "@/lib/solana/address";

/** Batch market data for a list of mints (watchlist, alerts, portfolio). */
export async function GET(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const mints = (request.nextUrl.searchParams.get("mints") ?? "").split(",").filter(Boolean);
    if (mints.length === 0) throw new BadRequestError("Provide at least one mint.");
    if (mints.length > 90) throw new BadRequestError("At most 90 mints per request.");
    if (!mints.every(isSolanaAddress)) throw new BadRequestError("One or more mints are not valid Solana addresses.");

    const result = await getPairsForManyTokens(mints);
    const body: RowsResponse = {
      rows: rowsFromPairs(result.pairs, mints),
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      staleReason: result.staleReason,
      dropped: result.dropped,
      source: "DEX Screener /tokens/v1",
    };
    return json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
