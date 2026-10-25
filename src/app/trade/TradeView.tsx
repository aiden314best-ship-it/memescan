"use client";
import { useSignTransaction } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { WalletModal, describeWalletError } from "@/components/wallet/WalletControls";
import { SOLANA_CHAIN, useWallet } from "@/components/wallet/WalletProvider";
import { useFavorites } from "@/components/tokens/favorites";
import { Card, ErrorBanner, ExtLink, Notice, PageHeader, TokenAvatar } from "@/components/ui";
import type { TokenResponse } from "@/lib/api-types";
import { SWAP_EXECUTION_ENABLED } from "@/lib/config";
import {
  describeExecuteCode,
  describeOrderError,
  SLIPPAGE_WARN_BPS,
  takerNetworkCostLamports,
  type ExecuteResponse,
  type OrderResponse,
} from "@/lib/jupiter";
import { formatUsd } from "@/lib/format";
import { getMintMeta, getSignatureState, getSolBalanceLamports, getTokenBalance, type MintMeta } from "@/lib/client/rpc";
import { prefsStore, swapHistoryStore } from "@/lib/client/stores";
import { base64ToBytes, bytesToBase64, inspectTransaction, signatureIfFeePayer } from "@/lib/client/tx";
import { apiGet, useApi, useAsync, useNow } from "@/lib/client/useApi";
import { isSolanaAddress, shortAddress, WRAPPED_SOL_MINT } from "@/lib/solana/address";
import { formatAtomic, parseDecimalAmount } from "@/lib/solana/amounts";

/** Quotes older than this must be refreshed before signing. */
const QUOTE_TTL_MS = 30_000;
/** Kept aside so the wallet still has SOL for rent and future fees after a buy. */
const SOL_RESERVE_LAMPORTS = 5_000_000n; // 0.005 SOL

type Side = "buy" | "sell";

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  meta: MintMeta;
}

interface Quote {
  order: OrderResponse;
  fetchedAt: number;
  taker: string | null;
  side: Side;
  amountAtomic: bigint;
}

type ExecState =
  | { step: "idle" }
  | { step: "signing" }
  | { step: "submitting"; signature: string | null }
  | { step: "confirming"; signature: string }
  | { step: "confirmed"; signature: string; result: ExecuteResponse | null; commitment: string }
  | { step: "failed"; message: string; signature: string | null }
  | { step: "unknown"; message: string; signature: string | null };

// ------------------------------------------------------------------ token loading

async function loadToken(mint: string): Promise<TokenInfo> {
  const meta = await getMintMeta(mint);
  if (!meta) throw new Error("No SPL token mint exists at this address. This token is not supported.");
  let market: TokenResponse | null = null;
  try {
    market = await apiGet<TokenResponse>(`/api/dex/token/${mint}`);
  } catch {
    // Market data is optional for trading; Jupiter decides routability.
  }
  const row = market?.row;
  return {
    mint,
    meta,
    symbol: row?.symbol ?? shortAddress(mint),
    name: row?.name ?? "Unknown token (no DEX Screener data)",
    imageUrl: row?.imageUrl ?? null,
    priceUsd: row?.priceUsd ?? null,
  };
}

function useBalances(address: string | undefined, mint: string | null) {
  const state = useAsync(address ? `${address}|${mint}` : null, async () => {
    const [sol, token] = await Promise.all([getSolBalanceLamports(address!), mint ? getTokenBalance(address!, mint) : Promise.resolve(null)]);
    return { sol, token };
  });
  return { sol: state.data?.sol ?? null, token: state.data?.token ?? null, error: state.error, reload: state.refresh };
}

// ------------------------------------------------------------------ review panel

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={`tabular text-right ${tone ?? ""}`}>{v}</span>
    </div>
  );
}

function QuoteReview({ quote, token, now }: { quote: Quote; token: TokenInfo; now: number }) {
  const o = quote.order;
  const inDec = quote.side === "buy" ? 9 : token.meta.decimals;
  const outDec = quote.side === "buy" ? token.meta.decimals : 9;
  const inSym = quote.side === "buy" ? "SOL" : token.symbol;
  const outSym = quote.side === "buy" ? token.symbol : "SOL";
  const impact = o.priceImpact ?? null; // percentage points
  const impactAbs = impact === null ? null : Math.abs(impact);
  const cost = takerNetworkCostLamports(o);
  const age = Math.max(0, Math.floor((now - quote.fetchedAt) / 1000));
  const route = (o.routePlan ?? []).map((s) => `${s.swapInfo.label ?? "Unknown"}${s.percent != null && s.percent !== 100 ? ` (${s.percent}%)` : ""}`);

  return (
    <div className="divide-y divide-line/60">
      <Row k="You pay" v={`${formatAtomic(o.inAmount, inDec)} ${inSym}`} />
      <Row k="Estimated output" v={`${formatAtomic(o.outAmount, outDec)} ${outSym}`} tone="font-semibold" />
      <Row
        k="Minimum received (after slippage)"
        v={o.otherAmountThreshold ? `${formatAtomic(o.otherAmountThreshold, outDec)} ${outSym}` : "Not reported by Jupiter"}
      />
      <Row
        k="Slippage tolerance"
        v={o.slippageBps != null ? `${(o.slippageBps / 100).toFixed(2)}%${o.mode === "ultra" ? " (auto)" : ""}` : "Not reported"}
        tone={o.slippageBps != null && o.slippageBps > SLIPPAGE_WARN_BPS ? "text-warn" : ""}
      />
      <Row
        k="Price impact"
        v={impact === null ? "Not reported" : `${impact.toFixed(2)}%`}
        tone={impactAbs === null ? "" : impactAbs >= 5 ? "text-down font-semibold" : impactAbs >= 1 ? "text-warn" : ""}
      />
      <Row k="Value (Jupiter estimate)" v={o.inUsdValue != null ? `${formatUsd(o.inUsdValue)} → ${formatUsd(o.outUsdValue)}` : "Not reported"} />
      <Row k="Route" v={route.length ? route.join(" → ") : (o.router ?? "Not reported")} />
      <Row k="Router" v={o.router ?? "—"} />
      <Row
        k="Network costs you pay"
        v={
          cost === null
            ? "Not reported (your wallet shows the final fee)"
            : `≈ ${formatAtomic(BigInt(cost), 9)} SOL${
                // Mention rent only when the taker is the one paying it.
                o.rentFeeLamports && (!o.rentFeePayer || o.rentFeePayer === o.taker)
                  ? ` (incl. ${formatAtomic(BigInt(o.rentFeeLamports), 9)} SOL rent)`
                  : ""
              }`
        }
      />
      {o.gasless && <Row k="Gasless" v="Yes: network fees are paid by another party, and recouped through the Jupiter fee below" />}
      <Row
        k="Jupiter fee"
        v={o.feeBps != null ? `${(o.feeBps / 100).toFixed(2)}% (charged by Jupiter, included in the quote)` : "Not reported"}
      />
      <Row k="MemeScan fee" v="None" />
      <Row k="Quote age" v={`${age}s (expires after ${QUOTE_TTL_MS / 1000}s)`} tone={now - quote.fetchedAt > QUOTE_TTL_MS ? "text-down" : ""} />
    </div>
  );
}

// ------------------------------------------------------------------ signing

function SignAndExecute({
  account,
  quote,
  token,
  canSign,
  onDone,
}: {
  account: UiWalletAccount;
  quote: Quote;
  token: TokenInfo;
  canSign: boolean;
  onDone: () => void;
}) {
  const signTransaction = useSignTransaction(account, SOLANA_CHAIN);
  const [state, setState] = useState<ExecState>({ step: "idle" });
  const busy = state.step === "signing" || state.step === "submitting" || state.step === "confirming";

  async function confirmOnChain(signature: string, attempts: number): Promise<string | null> {
    for (let i = 0; i < attempts; i++) {
      try {
        const s = await getSignatureState(signature);
        if (s === "failed") return "failed";
        if (s === "confirmed" || s === "finalized") return s;
      } catch {
        // keep polling
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }

  async function run() {
    const order = quote.order;
    if (!order.transaction) return;
    if (Date.now() - quote.fetchedAt > QUOTE_TTL_MS) {
      setState({ step: "failed", message: "This quote has expired. Get a fresh quote before signing.", signature: null });
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(order.transaction);
      const inspection = inspectTransaction(bytes, account.address);
      if (!inspection.takerMustSign) {
        setState({ step: "failed", message: "The transaction does not require your wallet's signature, so it was not shown for safety.", signature: null });
        return;
      }
    } catch {
      setState({ step: "failed", message: "Could not decode the transaction returned by Jupiter. Nothing was signed.", signature: null });
      return;
    }

    setState({ step: "signing" });
    let signed: Uint8Array;
    try {
      ({ signedTransaction: signed } = await signTransaction({ transaction: bytes }));
    } catch (e) {
      setState({ step: "failed", message: describeWalletError(e), signature: null });
      return;
    }

    let signature: string | null = null;
    try {
      signature = signatureIfFeePayer(signed, account.address);
    } catch {
      // not fatal; we just cannot look the transaction up independently
    }
    setState({ step: "submitting", signature });

    let result: ExecuteResponse | null = null;
    let submitError: string | null = null;
    try {
      const res = await fetch("/api/jupiter/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTransaction: bytesToBase64(signed), requestId: order.requestId }),
      });
      const body = (await res.json().catch(() => null)) as { result?: ExecuteResponse; error?: string } | null;
      if (!res.ok || !body?.result) submitError = body?.error ?? `Execute failed (HTTP ${res.status}).`;
      else result = body.result;
    } catch {
      submitError = "Network error while submitting.";
    }

    const sig = result?.signature || signature;
    if (result && result.status === "Failed") {
      const { message } = describeExecuteCode(result.code);
      setState({ step: "failed", message: `${message}${result.error ? ` (${result.error.slice(0, 160)})` : ""}`, signature: sig ?? null });
      onDone();
      return;
    }
    if (!sig) {
      setState({
        step: "unknown",
        message: `${submitError ?? "No transaction signature was returned."} The outcome is unknown. Check your wallet's activity before trying again.`,
        signature: null,
      });
      onDone();
      return;
    }

    // Success from Jupiter, or an unclear submit: verify independently on-chain.
    setState({ step: "confirming", signature: sig });
    const commitment = await confirmOnChain(sig, result ? 15 : 45);
    if (commitment === "confirmed" || commitment === "finalized") {
      setState({ step: "confirmed", signature: sig, result, commitment });
      swapHistoryStore.set((list) => [
        ...list.slice(-499),
        {
          signature: sig,
          wallet: account.address,
          inputMint: order.inputMint,
          outputMint: order.outputMint,
          inputSymbol: quote.side === "buy" ? "SOL" : token.symbol,
          outputSymbol: quote.side === "buy" ? token.symbol : "SOL",
          inputAmount: result?.totalInputAmount ?? order.inAmount,
          outputAmount: result?.totalOutputAmount ?? order.outAmount,
          inputDecimals: quote.side === "buy" ? 9 : token.meta.decimals,
          outputDecimals: quote.side === "buy" ? token.meta.decimals : 9,
          confirmedAt: Date.now(),
        },
      ]);
    } else if (commitment === "failed") {
      setState({ step: "failed", message: "The transaction landed on-chain but FAILED (no swap happened; the network fee was still charged).", signature: sig });
    } else {
      setState({
        step: "unknown",
        message: `${submitError ? `${submitError} ` : ""}The transaction could not be confirmed yet. It may still land or may have expired. Check Solscan before trying again.`,
        signature: sig,
      });
    }
    onDone();
  }

  const txLink = (sig: string | null) =>
    sig ? (
      <ExtLink href={`https://solscan.io/tx/${sig}`} className="underline">
        View transaction on Solscan
      </ExtLink>
    ) : null;

  return (
    <div className="space-y-3">
      <button className="btn-primary w-full py-3 text-base" disabled={!canSign || busy} onClick={run}>
        {state.step === "signing"
          ? "Approve in your wallet…"
          : state.step === "submitting"
            ? "Submitting…"
            : state.step === "confirming"
              ? "Waiting for on-chain confirmation…"
              : "Review in wallet & swap"}
      </button>
      {state.step === "confirmed" && (
        <Notice title={`Swap confirmed (${state.commitment})`}>
          {state.result?.totalOutputAmount
            ? `Received ${formatAtomic(state.result.totalOutputAmount, quote.side === "buy" ? token.meta.decimals : 9)} ${quote.side === "buy" ? token.symbol : "SOL"}. `
            : ""}
          {txLink(state.signature)}
        </Notice>
      )}
      {state.step === "failed" && (
        <Notice tone="danger" title="Swap not completed">
          {state.message} {txLink(state.signature)}
        </Notice>
      )}
      {state.step === "unknown" && (
        <Notice tone="warn" title="Outcome unknown">
          {state.message} {txLink(state.signature)}
        </Notice>
      )}
      {(state.step === "submitting" || state.step === "confirming") && (
        <p className="text-xs text-muted">Do not close this page. A swap is not reported as successful until it is confirmed on-chain.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page

export function TradeView() {
  const params = useSearchParams();
  const { account } = useWallet();
  const [prefs] = prefsStore.useStore();
  const { favorites } = useFavorites();
  const [walletOpen, setWalletOpen] = useState(false);

  const [mintInput, setMintInput] = useState(params.get("mint") ?? "");
  const mint = isSolanaAddress(mintInput.trim()) && mintInput.trim() !== WRAPPED_SOL_MINT ? mintInput.trim() : null;
  const [side, setSide] = useState<Side>(params.get("side") === "sell" ? "sell" : "buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [ack, setAck] = useState(false);
  const [impactAck, setImpactAck] = useState(false);
  const now = useNow(1000);

  const { data: token, error: tokenError, loading: tokenLoading } = useAsync(mint, () => loadToken(mint!));
  const balances = useBalances(account?.address, mint);
  const status = useApi<{ config: { swapExecutionEnabled: boolean } }>("/api/status");

  const decimals = side === "buy" ? 9 : (token?.meta.decimals ?? null);
  const parsed = decimals === null || !amount ? null : parseDecimalAmount(amount, decimals);

  // Any change to the inputs invalidates the current quote.
  const quoteKey = `${side}|${mint}|${amount}|${account?.address}|${prefs.slippageBps}`;
  const [lastKey, setLastKey] = useState(quoteKey);
  if (lastKey !== quoteKey) {
    // Adjusting state during render (not in an effect) avoids showing a stale quote for a frame.
    setLastKey(quoteKey);
    setQuote(null);
    setQuoteError(null);
    setAck(false);
    setImpactAck(false);
  }

  async function getQuote() {
    if (!token || !parsed?.ok) return;
    setQuoting(true);
    setQuoteError(null);
    setAck(false);
    setImpactAck(false);
    const q = new URLSearchParams({
      inputMint: side === "buy" ? WRAPPED_SOL_MINT : token.mint,
      outputMint: side === "buy" ? token.mint : WRAPPED_SOL_MINT,
      amount: parsed.atomic.toString(),
    });
    if (account) q.set("taker", account.address);
    if (prefs.slippageBps) q.set("slippageBps", String(prefs.slippageBps));
    try {
      const { order, fetchedAt } = await apiGet<{ order: OrderResponse; fetchedAt: number }>(`/api/jupiter/order?${q}`);
      setQuote({ order, fetchedAt: Math.min(fetchedAt, Date.now()), taker: account?.address ?? null, side, amountAtomic: parsed.atomic });
      balances.reload();
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : "Quote failed.");
    } finally {
      setQuoting(false);
    }
  }

  const expired = quote ? now - quote.fetchedAt > QUOTE_TTL_MS || (quote.order.expireAt ? Date.parse(quote.order.expireAt) < now : false) : false;
  const order = quote?.order;
  const impactAbs = order?.priceImpact != null ? Math.abs(order.priceImpact) : null;
  const needsImpactAck = impactAbs !== null && impactAbs >= 5;

  // Pre-flight balance checks, using quote-reported costs where available.
  const blockers: string[] = [];
  if (order && quote?.taker) {
    if (order.transaction === "") blockers.push(describeOrderError(order.router, order.errorCode, order.errorMessage));
    const cost = BigInt(takerNetworkCostLamports(order) ?? 0);
    if (balances.sol !== null) {
      if (side === "buy" && balances.sol < quote.amountAtomic + cost) {
        blockers.push(`Insufficient SOL: you have ${formatAtomic(balances.sol, 9)} SOL but need about ${formatAtomic(quote.amountAtomic + cost, 9)} SOL including network costs.`);
      } else if (side === "sell" && balances.sol < cost) {
        blockers.push(`Insufficient SOL for network fees: about ${formatAtomic(cost, 9)} SOL needed.`);
      }
    }
    if (side === "sell" && balances.token !== null && balances.token < quote.amountAtomic) {
      blockers.push(`Insufficient ${token?.symbol ?? "token"} balance.`);
    }
  }
  const lowReserve =
    side === "buy" && balances.sol !== null && parsed?.ok && balances.sol - parsed.atomic < SOL_RESERVE_LAMPORTS && balances.sol >= parsed.atomic;

  const executionEnabled = SWAP_EXECUTION_ENABLED && status.data?.config.swapExecutionEnabled !== false;
  const canSign =
    executionEnabled &&
    !!account &&
    !!order?.transaction &&
    quote?.taker === account.address &&
    !expired &&
    ack &&
    (!needsImpactAck || impactAck) &&
    blockers.length === 0;

  const inSym = side === "buy" ? "SOL" : (token?.symbol ?? "token");

  return (
    <>
      <PageHeader title="Trade" subtitle="Swap SOL ↔ Solana tokens through Jupiter's Swap API. You review the quote here and approve the exact transaction in your own wallet." />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {!SWAP_EXECUTION_ENABLED && (
            <Notice tone="warn" title="Quote-only mode">
              Live Jupiter quotes work, but signing and submitting swaps is <strong>disabled on this deployment</strong> because real-money
              execution has not been tested end to end by this build. The operator can enable it with{" "}
              <code className="break-all">NEXT_PUBLIC_ENABLE_SWAP_EXECUTION=true</code> after testing with a tiny amount (see README).
            </Notice>
          )}
          <Card>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel-2 p-1 text-sm" role="tablist">
                {(["buy", "sell"] as const).map((s) => (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={side === s}
                    onClick={() => {
                      setSide(s);
                      setAmount("");
                    }}
                    className={`rounded-md py-2 font-medium ${side === s ? (s === "buy" ? "bg-up/20 text-up" : "bg-down/20 text-down") : "text-muted"}`}
                  >
                    {s === "buy" ? "Buy with SOL" : "Sell for SOL"}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="label">Token mint address</span>
                <input className="input font-mono text-xs sm:text-sm" placeholder="Paste a token mint address" value={mintInput} onChange={(e) => setMintInput(e.target.value)} spellCheck={false} />
              </label>
              {favorites.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {favorites.slice(-8).map((f) => (
                    <button key={f.mint} className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-fg" onClick={() => setMintInput(f.mint)}>
                      {f.symbol}
                    </button>
                  ))}
                </div>
              )}
              {mintInput.trim() && !mint && (
                <p className="text-sm text-down">{mintInput.trim() === WRAPPED_SOL_MINT ? "Pick a token other than SOL." : "Not a valid Solana mint address."}</p>
              )}
              {tokenLoading && <div className="skeleton h-12 w-full" />}
              {tokenError && <ErrorBanner message={tokenError} />}
              {token && (
                <div className="flex items-center gap-3 rounded-lg border border-line bg-panel-2/60 p-3">
                  <TokenAvatar src={token.imageUrl} symbol={token.symbol} size={36} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {token.symbol} <span className="text-muted">· {token.name}</span>
                    </p>
                    <p className="truncate font-mono text-xs text-muted">{token.mint}</p>
                    <p className="text-xs text-muted">
                      {token.meta.program === "spl-token-2022" ? "Token-2022" : "SPL Token"} · {token.meta.decimals} decimals · price {formatUsd(token.priceUsd)}
                    </p>
                  </div>
                  <Link className="text-xs text-muted hover:text-fg" href={`/risk?mint=${token.mint}`}>
                    Risk check →
                  </Link>
                </div>
              )}
              {token && <p className="text-xs text-warn">Names and logos can be faked. Verify the mint address above matches the token you intend to trade.</p>}

              <label className="block">
                <span className="label">
                  Amount ({inSym})
                  {account && (
                    <span className="float-right">
                      Balance:{" "}
                      {side === "buy"
                        ? balances.sol !== null
                          ? `${formatAtomic(balances.sol, 9, 6)} SOL`
                          : "…"
                        : balances.token !== null && token
                          ? `${formatAtomic(balances.token, token.meta.decimals, 6)} ${token.symbol}`
                          : "…"}
                      {side === "sell" && balances.token !== null && balances.token > 0n && token && (
                        <button className="ml-2 text-accent" onClick={() => setAmount(formatAtomic(balances.token!, token.meta.decimals).replace(/,/g, ""))}>
                          Max
                        </button>
                      )}
                    </span>
                  )}
                </span>
                <input className="input tabular text-lg" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} disabled={!token} />
              </label>
              {parsed && !parsed.ok && <p className="text-sm text-down">{parsed.error}</p>}
              {lowReserve && <p className="text-sm text-warn">This would leave less than 0.005 SOL in your wallet, which may not cover fees or rent for future transactions.</p>}
              {balances.error && <p className="text-sm text-warn">Could not read balances: {balances.error}</p>}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="btn-ghost flex-1" onClick={getQuote} disabled={!token || !parsed?.ok || quoting}>
                  {quoting ? "Fetching quote…" : quote ? "Refresh quote" : "Get quote"}
                </button>
                {!account && (
                  <button className="btn-primary flex-1" onClick={() => setWalletOpen(true)}>
                    Connect wallet to swap
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                Slippage: {prefs.slippageBps ? `${(prefs.slippageBps / 100).toFixed(2)}% (custom)` : "automatic (Jupiter RTSE)"} ·{" "}
                <Link href="/settings" className="hover:text-fg">
                  change
                </Link>
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Quote review">
            {quoteError && <ErrorBanner message={quoteError} onRetry={getQuote} />}
            {!quote && !quoteError && <p className="text-sm text-muted">Enter a token and amount, then get a quote. Quotes are live from Jupiter and are never simulated.</p>}
            {quote && token && (
              <div className="space-y-3">
                <QuoteReview quote={quote} token={token} now={now} />
                {expired && (
                  <Notice tone="warn" title="Quote expired">
                    Prices move quickly. Refresh the quote before signing.
                  </Notice>
                )}
                {!quote.taker && <Notice>This is a price check only. Connect a wallet and refresh to get a signable transaction.</Notice>}
                {blockers.map((b) => (
                  <Notice key={b} tone="danger">
                    {b}
                  </Notice>
                ))}
                {impactAbs !== null && impactAbs >= 1 && (
                  <Notice tone={impactAbs >= 5 ? "danger" : "warn"} title={`Price impact ${impactAbs.toFixed(2)}%`}>
                    Your trade moves the price significantly because liquidity is thin. You will receive noticeably less than the market price.
                  </Notice>
                )}
                {quote.taker && order?.transaction && (
                  <>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                      <span className="text-muted">
                        I reviewed this quote. I understand this token may be fraudulent or worthless, the transaction is irreversible, and I may
                        lose the full amount.
                      </span>
                    </label>
                    {needsImpactAck && (
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={impactAck} onChange={(e) => setImpactAck(e.target.checked)} />
                        <span className="text-down">I accept the high price impact of {impactAbs!.toFixed(2)}%.</span>
                      </label>
                    )}
                    {account && quote.taker === account.address ? (
                      <SignAndExecute account={account} quote={quote} token={token} canSign={canSign} onDone={balances.reload} />
                    ) : (
                      <p className="text-sm text-warn">The connected wallet changed. Refresh the quote.</p>
                    )}
                    {!executionEnabled && <p className="text-xs text-muted">Signing is disabled in quote-only mode.</p>}
                  </>
                )}
              </div>
            )}
          </Card>
          <Notice tone="danger" title="Transactions are irreversible">
            Swaps on Solana cannot be undone. Many memecoins are scams or lose most of their value. Never trade more than you can afford to lose.
            This site never signs or sends anything without your explicit approval in your wallet.
          </Notice>
        </div>
      </div>
      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </>
  );
}
