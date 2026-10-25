import type { NextRequest } from "next/server";
import type { TokenResponse } from "@/lib/api-types";
import { bestPairFor, solanaPairs, toPoolInfo, toTokenRow } from "@/lib/dexscreener/normalize";
import { getTokenPairs } from "@/lib/server/dexscreener";
import { BadRequestError, errorResponse, json, limitClient } from "@/lib/server/http";
import { isSolanaAddress } from "@/lib/solana/address";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/dex/token/[mint]">) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const { mint } = await ctx.params;
    if (!isSolanaAddress(mint)) throw new BadRequestError("Not a valid Solana mint address.");

    const result = await getTokenPairs(mint);
    const pairs = solanaPairs(result.value.items);
    const best = bestPairFor(mint, pairs);
    const pools = pairs
      .filter((p) => p.baseToken.address === mint || p.quoteToken.address === mint)
      .sort((a, b) => (b.liquidity?.usd ?? -1) - (a.liquidity?.usd ?? -1))
      .map(toPoolInfo);

    const body: TokenResponse = {
      row: best ? toTokenRow(best, pairs) : null,
      pools,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      staleReason: result.staleReason,
      dropped: result.value.dropped,
      source: "DEX Screener /token-pairs/v1",
    };
    return json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
