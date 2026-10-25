"use client";
// Read-only Solana RPC helpers that go through this app's /api/rpc proxy.
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@/lib/solana/address";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const body = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
  if (!res.ok || !body || body.error) throw new Error(body?.error ?? `RPC request failed (HTTP ${res.status}).`);
  return body.result as T;
}

export async function getSolBalanceLamports(owner: string): Promise<bigint> {
  const r = await rpc<{ value: number }>("getBalance", [owner, { commitment: "confirmed" }]);
  return BigInt(r.value);
}

export interface TokenHolding {
  mint: string;
  tokenAccount: string;
  amount: string;
  decimals: number;
  program: "spl-token" | "spl-token-2022";
}

interface ParsedTokenAccount {
  pubkey: string;
  account: { data: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } } } };
}

/** All SPL Token and Token-2022 accounts owned by a wallet. */
export async function getTokenHoldings(owner: string): Promise<TokenHolding[]> {
  const programs = [
    [TOKEN_PROGRAM_ID, "spl-token"],
    [TOKEN_2022_PROGRAM_ID, "spl-token-2022"],
  ] as const;
  const results = await Promise.all(
    programs.map(([programId]) =>
      rpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
        owner,
        { programId },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
    ),
  );
  const holdings: TokenHolding[] = [];
  results.forEach((r, i) => {
    for (const acc of r.value ?? []) {
      const info = acc.account?.data?.parsed?.info;
      const amount = info?.tokenAmount?.amount;
      const decimals = info?.tokenAmount?.decimals;
      if (!info?.mint || typeof amount !== "string" || !/^\d+$/.test(amount) || typeof decimals !== "number") continue;
      holdings.push({ mint: info.mint, tokenAccount: acc.pubkey, amount, decimals, program: programs[i][1] });
    }
  });
  return holdings;
}

/** Total balance of one mint across all of the owner's token accounts. */
export async function getTokenBalance(owner: string, mint: string): Promise<bigint> {
  const r = await rpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  return (r.value ?? []).reduce((sum, acc) => {
    const amount = acc.account?.data?.parsed?.info?.tokenAmount?.amount;
    return typeof amount === "string" && /^\d+$/.test(amount) ? sum + BigInt(amount) : sum;
  }, 0n);
}

export interface MintMeta {
  decimals: number;
  program: "spl-token" | "spl-token-2022";
}

export async function getMintMeta(mint: string): Promise<MintMeta | null> {
  const r = await rpc<{ value: { data?: { program?: string; parsed?: { type?: string; info?: { decimals?: number } } } } | null }>(
    "getAccountInfo",
    [mint, { encoding: "jsonParsed", commitment: "confirmed" }],
  );
  const data = r.value?.data;
  if (data?.parsed?.type !== "mint" || typeof data.parsed.info?.decimals !== "number") return null;
  if (data.program !== "spl-token" && data.program !== "spl-token-2022") return null;
  return { decimals: data.parsed.info.decimals, program: data.program };
}

export type SignatureState = "processed" | "confirmed" | "finalized" | "failed" | "not-found";

export async function getSignatureState(signature: string): Promise<SignatureState> {
  const r = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>("getSignatureStatuses", [
    [signature],
    { searchTransactionHistory: true },
  ]);
  const status = r.value?.[0];
  if (!status) return "not-found";
  if (status.err) return "failed";
  const c = status.confirmationStatus;
  return c === "finalized" || c === "confirmed" || c === "processed" ? c : "processed";
}
