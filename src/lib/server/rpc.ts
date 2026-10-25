// Server-side Solana JSON-RPC client. The endpoint (which may embed a private API key
// for providers like Helius/QuickNode free tiers) stays on the server.
import "server-only";
import { UpstreamError } from "./throttle";
import { throttles } from "./throttle";
import { fetchJson } from "./http";

export const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/** Hostname only, for status display. Never expose the full URL (it may contain a key). */
export function rpcHostLabel(): string {
  try {
    return new URL(RPC_URL).hostname;
  } catch {
    return "invalid SOLANA_RPC_URL";
  }
}

let nextId = 1;

export async function rpcCall<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  await throttles.rpc.acquire("rpc", 5_000);
  const body = await fetchJson(RPC_URL, "Solana RPC", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const response = body as { result?: T; error?: { code?: number; message?: string } };
  if (response.error) {
    throw new UpstreamError(
      `Solana RPC error${response.error.code ? ` ${response.error.code}` : ""}: ${String(response.error.message ?? "unknown").slice(0, 200)}`,
      502,
      "Solana RPC",
    );
  }
  return response.result as T;
}
