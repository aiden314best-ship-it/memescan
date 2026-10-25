import type { NextRequest } from "next/server";
import type { RiskResponse } from "@/lib/api-types";
import { bestPairFor, solanaPairs } from "@/lib/dexscreener/normalize";
import type { RawPair } from "@/lib/dexscreener/schema";
import {
  authoritySignals,
  concentrationSignals,
  extensionSignals,
  labelHolders,
  liquiditySignals,
  notCheckedSignals,
  parseMintAccount,
  poolAgeSignals,
  valuationSignals,
  type HolderSnapshot,
  type MintInfo,
} from "@/lib/risk";
import { cache } from "@/lib/server/cache";
import { getTokenPairs } from "@/lib/server/dexscreener";
import { BadRequestError, errorResponse, json, limitClient } from "@/lib/server/http";
import { rpcCall } from "@/lib/server/rpc";
import { isSolanaAddress } from "@/lib/solana/address";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

async function loadMint(mint: string): Promise<MintInfo | null> {
  const res = await rpcCall<{ value: unknown }>("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
  return res?.value ? parseMintAccount(res.value) : null;
}

async function loadHolders(mint: string, info: MintInfo, pairAddresses: string[]): Promise<HolderSnapshot> {
  const largest = await rpcCall<{ value: { address: string; amount: string }[] }>("getTokenLargestAccounts", [
    mint,
    { commitment: "confirmed" },
  ]);
  const accounts = (largest?.value ?? []).filter((a) => isSolanaAddress(a.address) && /^\d+$/.test(a.amount));
  const owners: Record<string, string | null> = {};
  if (accounts.length) {
    const multi = await rpcCall<{ value: ({ data?: { parsed?: { info?: { owner?: string } } } } | null)[] }>(
      "getMultipleAccounts",
      [accounts.map((a) => a.address), { encoding: "jsonParsed", commitment: "confirmed" }],
    );
    accounts.forEach((a, i) => {
      const owner = multi?.value?.[i]?.data?.parsed?.info?.owner;
      owners[a.address] = typeof owner === "string" && isSolanaAddress(owner) ? owner : null;
    });
  }
  return {
    accounts: labelHolders(accounts, owners, info.supply, pairAddresses),
    supply: info.supply,
    decimals: info.decimals,
  };
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/risk/[mint]">) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const { mint } = await ctx.params;
    if (!isSolanaAddress(mint)) throw new BadRequestError("Not a valid Solana mint address.");

    const result = await cache.get(`risk:${mint}`, 60_000, async () => {
      const errors: RiskResponse["errors"] = {};
      const [mintRes, pairsRes] = await Promise.allSettled([loadMint(mint), getTokenPairs(mint)]);

      const mintInfo = mintRes.status === "fulfilled" ? mintRes.value : null;
      if (mintRes.status === "rejected") errors.rpc = msg(mintRes.reason);
      else if (!mintInfo) errors.rpc = "No SPL token mint exists at this address.";

      let pairs: RawPair[] = [];
      let dexFetchedAt: number | null = null;
      if (pairsRes.status === "fulfilled") {
        pairs = solanaPairs(pairsRes.value.value.items).filter(
          (p) => p.baseToken.address === mint || p.quoteToken.address === mint,
        );
        dexFetchedAt = pairsRes.value.fetchedAt;
      } else {
        errors.dex = msg(pairsRes.reason);
      }

      let holders: HolderSnapshot | null = null;
      if (mintInfo) {
        try {
          holders = await loadHolders(mint, mintInfo, pairs.map((p) => p.pairAddress));
        } catch (e) {
          errors.holders = msg(e);
        }
      }

      const best = bestPairFor(mint, pairs);
      const pools = pairs.map((p) => ({
        pairAddress: p.pairAddress,
        liquidityUsd: p.liquidity?.usd ?? null,
        pairCreatedAt: p.pairCreatedAt,
      }));
      const liquidityTotal = pools.some((p) => p.liquidityUsd !== null)
        ? pools.reduce((s, p) => s + (p.liquidityUsd ?? 0), 0)
        : null;
      const now = Date.now();

      const body: RiskResponse = {
        mint,
        checkedAt: now,
        mintInfo,
        holders,
        signals: [
          ...authoritySignals(mintInfo, errors.rpc),
          ...extensionSignals(mintInfo),
          ...liquiditySignals(pools, errors.dex),
          ...poolAgeSignals(pools, now, errors.dex),
          ...valuationSignals(best?.marketCap ?? best?.fdv ?? null, best?.liquidity?.usd ?? null, errors.dex),
          ...concentrationSignals(holders, errors.holders ?? (mintInfo ? undefined : errors.rpc)),
          ...notCheckedSignals(),
        ],
        market: {
          liquidityUsd: liquidityTotal,
          marketCap: best?.marketCap ?? best?.fdv ?? null,
          pools: pools.length,
          fetchedAt: dexFetchedAt,
        },
        errors,
      };
      return body;
    });
    return json(result.value);
  } catch (error) {
    return errorResponse(error);
  }
}
