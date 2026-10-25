// Read-only Solana JSON-RPC proxy. Only an allow-list of read methods is forwarded, so
// this endpoint can never be used to send transactions or abuse the configured RPC key.
import type { NextRequest } from "next/server";
import { errorResponse, json, limitClient } from "@/lib/server/http";
import { rpcCall } from "@/lib/server/rpc";
import { isSolanaAddress } from "@/lib/solana/address";

const ALLOWED = new Set([
  "getBalance",
  "getAccountInfo",
  "getTokenAccountsByOwner",
  "getSignatureStatuses",
  "getBlockHeight",
  "getSlot",
  "getHealth",
]);

function validParams(method: string, params: unknown[]): boolean {
  switch (method) {
    case "getBalance":
    case "getAccountInfo":
      return isSolanaAddress(params[0]);
    case "getTokenAccountsByOwner": {
      const filter = params[1] as { programId?: unknown; mint?: unknown } | undefined;
      return isSolanaAddress(params[0]) && (isSolanaAddress(filter?.programId) || isSolanaAddress(filter?.mint));
    }
    case "getSignatureStatuses":
      return (
        Array.isArray(params[0]) &&
        params[0].length > 0 &&
        params[0].length <= 10 &&
        params[0].every((s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(s))
      );
    default:
      return true;
  }
}

export async function POST(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ error: "Request too large." }, { status: 413 });
    let body: { method?: unknown; params?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON." }, { status: 400 });
    }
    const method = typeof body.method === "string" ? body.method : "";
    const params = Array.isArray(body.params) ? body.params : [];
    if (!ALLOWED.has(method)) return json({ error: `RPC method "${method}" is not allowed.` }, { status: 403 });
    if (!validParams(method, params)) return json({ error: "Invalid RPC parameters." }, { status: 400 });

    const result = await rpcCall(method, params);
    return json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
