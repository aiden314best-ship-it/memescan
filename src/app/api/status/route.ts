import type { NextRequest } from "next/server";
import type { ServiceStatus, StatusResponse } from "@/lib/api-types";
import { SWAP_EXECUTION_ENABLED } from "@/lib/config";
import { JUPITER_BASE } from "@/lib/jupiter";
import { WRAPPED_SOL_MINT } from "@/lib/solana/address";
import { cache } from "@/lib/server/cache";
import { fetchJson, json, limitClient } from "@/lib/server/http";
import { rpcCall, rpcHostLabel } from "@/lib/server/rpc";

async function probe(name: string, run: () => Promise<string>): Promise<ServiceStatus> {
  const started = Date.now();
  try {
    const detail = await run();
    return { name, ok: true, latencyMs: Date.now() - started, detail };
  } catch (error) {
    return { name, ok: false, latencyMs: null, detail: error instanceof Error ? error.message : "Unreachable" };
  }
}

export async function GET(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  const result = await cache.get("status", 20_000, async () => {
    const services = await Promise.all([
      probe("DEX Screener API", async () => {
        const raw = await fetchJson(`https://api.dexscreener.com/tokens/v1/solana/${WRAPPED_SOL_MINT}`, "DEX Screener");
        return Array.isArray(raw) ? `Reachable (${raw.length} SOL pairs returned)` : "Reachable";
      }),
      probe(`Solana RPC (${rpcHostLabel()})`, async () => {
        const slot = await rpcCall<number>("getSlot", [{ commitment: "confirmed" }]);
        return `Current slot ${slot.toLocaleString("en-US")}`;
      }),
      probe("Jupiter API", async () => {
        const key = process.env.JUPITER_API_KEY;
        await fetchJson(`${JUPITER_BASE}/price/v3?ids=${WRAPPED_SOL_MINT}`, "Jupiter", {
          headers: key ? { "x-api-key": key } : {},
        });
        return key ? "Reachable (API key configured)" : "Reachable (keyless, 0.5 req/s)";
      }),
    ]);
    const body: StatusResponse = {
      checkedAt: Date.now(),
      services,
      config: {
        rpcHost: rpcHostLabel(),
        jupiterKeyConfigured: Boolean(process.env.JUPITER_API_KEY),
        swapExecutionEnabled: SWAP_EXECUTION_ENABLED,
      },
    };
    return body;
  });
  return json(result.value);
}
