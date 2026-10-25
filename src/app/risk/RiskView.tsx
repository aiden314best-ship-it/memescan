"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CopyButton, ErrorBanner, ExtLink, Notice, PageHeader, SkeletonRows } from "@/components/ui";
import type { RiskResponse } from "@/lib/api-types";
import { describeOrderError, type OrderResponse } from "@/lib/jupiter";
import { formatAtomic } from "@/lib/solana/amounts";
import { formatCompactUsd, formatPct, formatTime } from "@/lib/format";
import { summarize, type SignalStatus } from "@/lib/risk";
import { liquidityObsStore, recordLiquidity } from "@/lib/client/stores";
import { apiGet, useApi } from "@/lib/client/useApi";
import { isSolanaAddress, shortAddress, WRAPPED_SOL_MINT } from "@/lib/solana/address";

const STATUS: Record<SignalStatus, { label: string; cls: string }> = {
  high: { label: "High risk", cls: "bg-down/15 text-down ring-down/30" },
  caution: { label: "Caution", cls: "bg-warn/15 text-warn ring-warn/30" },
  unknown: { label: "Unknown", cls: "bg-panel-2 text-muted ring-line" },
  ok: { label: "No issue found", cls: "bg-up/10 text-up ring-up/30" },
  info: { label: "Info", cls: "bg-panel-2 text-fg ring-line" },
};

function Pill({ status }: { status: SignalStatus }) {
  const s = STATUS[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${s.cls}`}>{s.label}</span>;
}

function ObservedLiquidity({ mint, current }: { mint: string; current: number | null }) {
  const [obs] = liquidityObsStore.useStore();
  useEffect(() => {
    if (current !== null) recordLiquidity(mint, current, Date.now());
  }, [mint, current]);
  const list = obs[mint] ?? [];
  const first = list[0];
  const last = list[list.length - 1];
  const change = first && last && list.length > 1 && first.liq > 0 ? ((last.liq - first.liq) / first.liq) * 100 : null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line p-3">
      <Pill status={change === null ? "unknown" : change <= -30 ? "high" : change <= -10 ? "caution" : "info"} />
      <div className="text-sm">
        <p className="font-medium">Liquidity change (observed in this browser)</p>
        <p className="text-muted">
          {change === null
            ? "DEX Screener only reports current liquidity, so there is no change history yet. This browser records liquidity each time you check this token (at most every 5 minutes); re-check later to see a change."
            : `${formatPct(change, 1)} between ${formatTime(first.t)} (${formatCompactUsd(first.liq)}) and ${formatTime(last.t)} (${formatCompactUsd(last.liq)}), across ${list.length} observations.`}
        </p>
        <p className="mt-1 text-xs text-muted">Why it matters: a sharp drop in liquidity can mean providers are withdrawing, a common step in a rug pull.</p>
      </div>
    </div>
  );
}

function SellRouteCheck({ mint, decimals, supply }: { mint: string; decimals: number; supply: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; text?: string; tone?: SignalStatus }>({ status: "idle" });
  async function run() {
    setState({ status: "loading" });
    // Quote selling a tiny amount (0.0001% of supply, at least 1 unit) with no wallet attached.
    const amount = (BigInt(supply) / 1_000_000n || 1n).toString();
    try {
      const { order } = await apiGet<{ order: OrderResponse }>(`/api/jupiter/order?inputMint=${mint}&outputMint=${WRAPPED_SOL_MINT}&amount=${amount}`);
      if (order.outAmount === "0") {
        setState({ status: "done", tone: "high", text: "Jupiter found a route but it returns 0 SOL for a small sell." });
      } else {
        setState({
          status: "done",
          tone: "info",
          text: `Jupiter quoted a sell of ${formatAtomic(amount, decimals, 6)} tokens → ${formatAtomic(order.outAmount, 9, 9)} SOL via ${order.router ?? "unknown router"}${
            order.priceImpact != null ? ` (price impact ${order.priceImpact.toFixed(2)}%)` : ""
          }. A quote is NOT proof you can sell: transfer hooks, freezes or fees can still block or tax a real sale.`,
        });
      }
      if (order.transaction === "" && order.errorCode) {
        setState({ status: "done", tone: "caution", text: describeOrderError(order.router, order.errorCode, order.errorMessage) });
      }
    } catch (e) {
      setState({ status: "error", tone: "caution", text: e instanceof Error ? e.message : "Quote failed" });
    }
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line p-3">
      <Pill status={state.tone ?? "unknown"} />
      <div className="flex-1 text-sm">
        <p className="font-medium">Sell route (Jupiter quote)</p>
        <p className="text-muted">
          {state.text ?? "Optional: ask Jupiter for a quote to sell a tiny amount of this token for SOL. Uses one request from the shared quote budget."}
        </p>
        <p className="mt-1 text-xs text-muted">Why it matters: tokens with no sell route (or a route that returns nearly nothing) cannot be exited.</p>
        {state.status !== "done" && (
          <button className="btn-ghost mt-2 py-1" onClick={run} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Requesting quote…" : state.status === "error" ? "Retry sell-route check" : "Check sell route"}
          </button>
        )}
      </div>
    </div>
  );
}

function Report({ mint }: { mint: string }) {
  const { data, error, loading, refresh } = useApi<RiskResponse>(`/api/risk/${mint}`);
  if (!data && loading) return <SkeletonRows rows={8} />;
  if (!data) return <ErrorBanner message={error ?? "Risk check failed."} onRetry={refresh} />;
  const counts = summarize(data.signals);
  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={`${error} Showing the previous result.`} onRetry={refresh} />}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted">Token mint</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all text-sm">{mint}</code>
              <CopyButton value={mint} />
            </div>
            <p className="mt-1 text-xs text-muted">
              Checked {formatTime(data.checkedAt)} · <ExtLink href={`https://solscan.io/token/${mint}`}>Solscan</ExtLink> ·{" "}
              <Link className="hover:text-fg" href={`/token/${mint}`}>
                Token details
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-down/10 px-3 py-1.5 text-down">{counts.high} high risk</span>
            <span className="rounded-lg bg-warn/10 px-3 py-1.5 text-warn">{counts.caution} caution</span>
            <span className="rounded-lg bg-panel-2 px-3 py-1.5 text-muted">{counts.unknown} unknown</span>
            <button className="btn-ghost py-1.5" onClick={refresh} disabled={loading}>
              {loading ? "Checking…" : "Re-check"}
            </button>
          </div>
        </div>
      </div>

      <Notice tone="warn" title="No check can prove a token is safe">
        These are individual signals, not a rating. A token can pass every check here and still be a scam or lose all its value.
        &quot;Unknown&quot; means we could not verify it, not that it is fine.
      </Notice>

      <div className="space-y-2">
        {data.signals.map((s) => (
          <div key={s.id} className="flex items-start gap-3 rounded-lg border border-line bg-panel p-3">
            <Pill status={s.status} />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{s.label}</p>
              <p className="break-words text-muted">{s.detail}</p>
              <p className="mt-1 text-xs text-muted">
                Why it matters: {s.why} <span className="opacity-70">· Source: {s.source}</span>
              </p>
            </div>
          </div>
        ))}
        <ObservedLiquidity mint={mint} current={data.market.liquidityUsd} />
        {data.mintInfo && <SellRouteCheck mint={mint} decimals={data.mintInfo.decimals} supply={data.mintInfo.supply} />}
      </div>

      {data.holders && (
        <Card title={`Largest token accounts (top ${data.holders.accounts.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">#</th>
                  <th className="py-1 text-left font-medium">Owner (wallet/program)</th>
                  <th className="py-1 text-left font-medium">Label</th>
                  <th className="py-1 text-right font-medium">Amount</th>
                  <th className="py-1 text-right font-medium">% supply</th>
                </tr>
              </thead>
              <tbody>
                {data.holders.accounts.map((a, i) => (
                  <tr key={a.tokenAccount} className="border-t border-line/60">
                    <td className="py-1.5 text-muted">{i + 1}</td>
                    <td className="py-1.5">
                      <ExtLink href={`https://solscan.io/account/${a.owner ?? a.tokenAccount}`}>{shortAddress(a.owner ?? a.tokenAccount, 5)}</ExtLink>
                    </td>
                    <td className="py-1.5 text-xs text-muted">
                      {a.label === "pool" ? "Liquidity pool" : a.label === "burn" ? "Burn address" : a.label === "amm-authority" ? "AMM authority (pool)" : "Unlabeled"}
                    </td>
                    <td className="tabular py-1.5 text-right">{formatAtomic(a.amount, data.holders!.decimals, 2)}</td>
                    <td className="tabular py-1.5 text-right">{a.pctOfSupply.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            From the RPC method getTokenLargestAccounts. These are token <em>accounts</em>, not unique people. Total holder count is not available.
          </p>
        </Card>
      )}
    </div>
  );
}

export function RiskView() {
  const params = useSearchParams();
  const router = useRouter();
  const mint = params.get("mint") ?? "";
  const [input, setInput] = useState(mint);
  const [formError, setFormError] = useState<string | null>(null);
  const valid = isSolanaAddress(mint);

  return (
    <>
      <PageHeader
        title="Risk checker"
        subtitle="On-chain checks (mint/freeze authority, Token-2022 extensions, largest holders) via Solana RPC, plus market signals from DEX Screener. Each result explains why it matters."
      />
      <form
        className="mb-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.trim();
          if (!isSolanaAddress(v)) {
            setFormError("That is not a valid Solana mint address (base58, 32–44 characters).");
            return;
          }
          setFormError(null);
          router.push(`/risk?mint=${v}`);
        }}
      >
        <input className="input sm:max-w-xl" placeholder="Paste a token mint address" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Token mint address" spellCheck={false} />
        <button className="btn-primary" type="submit">
          Check token
        </button>
      </form>
      {formError && <p className="mb-4 text-sm text-down">{formError}</p>}
      {mint && !valid && <ErrorBanner message="The mint address in the URL is not a valid Solana address." />}
      {valid ? (
        <Report key={mint} mint={mint} />
      ) : (
        !mint && <Notice>Paste a mint address above, or open a token and choose &quot;Risk check&quot;.</Notice>
      )}
    </>
  );
}
