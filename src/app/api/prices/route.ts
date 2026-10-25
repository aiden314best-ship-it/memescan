// USD prices from Jupiter Price API V3. Tokens without a reliable price are omitted
// by Jupiter, and we pass that through rather than substituting another number.
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { PriceEntry, PricesResponse } from "@/lib/api-types";
import { JUPITER_BASE } from "@/lib/jupiter";
import { cache } from "@/lib/server/cache";
import { BadRequestError, errorResponse, fetchJson, json, limitClient } from "@/lib/server/http";
import { throttles } from "@/lib/server/throttle";
import { isSolanaAddress } from "@/lib/solana/address";

const priceSchema = z.object({
  usdPrice: z.number().finite().positive(),
  decimals: z.number().int().nullish(),
  priceChange24h: z.number().finite().nullish(),
  blockId: z.number().nullish(),
});

export async function GET(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean))];
    if (ids.length === 0 || ids.length > 50) throw new BadRequestError("Provide 1–50 mint ids.");
    if (!ids.every(isSolanaAddress)) throw new BadRequestError("One or more ids are not valid Solana addresses.");

    const key = [...ids].sort().join(",");
    const result = await cache.get(`price:${key}`, 30_000, async () => {
      await throttles.jupiter.acquire("jupiter", 4_000);
      const apiKey = process.env.JUPITER_API_KEY;
      const raw = (await fetchJson(`${JUPITER_BASE}/price/v3?ids=${ids.join(",")}`, "Jupiter Price", {
        headers: apiKey ? { "x-api-key": apiKey } : {},
      })) as Record<string, unknown> | null;
      const prices: Record<string, PriceEntry> = {};
      for (const id of ids) {
        const parsed = priceSchema.safeParse(raw?.[id]);
        if (parsed.success) {
          prices[id] = {
            usdPrice: parsed.data.usdPrice,
            decimals: parsed.data.decimals ?? null,
            priceChange24h: parsed.data.priceChange24h ?? null,
            blockId: parsed.data.blockId ?? null,
          };
        }
      }
      return prices;
    });
    const body: PricesResponse = {
      prices: result.value,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      source: "Jupiter Price API V3",
    };
    return json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
