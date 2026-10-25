"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { WalletModal } from "@/components/wallet/WalletControls";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Card, EmptyState, ErrorBanner, ExtLink, Freshness, Notice, PageHeader, SkeletonRows, Stat, TokenAvatar } from "@/components/ui";
import type { PricesResponse, RowsResponse } from "@/lib/api-types";
import type { TokenRow } from "@/lib/dexscreener/normalize";
import { formatUsd, formatTime } from "@/lib/format";
import { getSolBalanceLamports, getTokenHoldings } from "@/lib/client/rpc";
import { swapHistoryStore } from "@/lib/client/stores";
import { apiGet, useAsync } from "@/lib/client/useApi";
import { shortAddress, WRAPPED_SOL_MINT } from "@/lib/solana/address";
import { atomicToNumber, formatAtomic } from "@/lib/solana/amounts";

interface Holding {
  mint: string;
  amount: bigint;
  decimals: number;
  program: string;
  accounts: number;
}

interface Loaded {
  holdings: Holding[];
  prices: Record<string, number>;
  meta: Record<string, TokenRow>;
  fetchedAt: number;
  priceError: string | null;
  metaError: string | null;
}

async function loadPortfolio(address: string): Promise<Loaded> {
  const [lamports, accounts] = await Promise.all([getSolBalanceLamports(address), getTokenHoldings(address)]);
  // Merge multiple token accounts of the same mint.
  const byMint = new Map<string, Holding>();
  for (const a of accounts) {
    const prev = byMint.get(a.mint);
    if (prev) {
      prev.amount += BigInt(a.amount);
      prev.accounts++;
    } else byMint.set(a.mint, { mint: a.mint, amount: BigInt(a.amount), decimals: a.decimals, program: a.program, accounts: 1 });
  }
  const holdings: Holding[] = [
    { mint: WRAPPED_SOL_MINT, amount: lamports, decimals: 9, program: "native", accounts: 1 },
    ...[...byMint.values()].filter((h) => h.mint !== WRAPPED_SOL_MINT || h.amount > 0n),
  ];
  const mints = [...new Set(holdings.filter((h) => h.amount > 0n).map((h) => h.mint))];

  const prices: Record<string, number> = {};
  let priceError: string | null = null;
  for (let i = 0; i < mints.length; i += 50) {
    try {
      const res = await apiGet<PricesResponse>(`/api/prices?ids=${mints.slice(i, i + 50).join(",")}`);
      for (const [m, p] of Object.entries(res.prices)) prices[m] = p.usdPrice;
    } catch (e) {
      priceError = e instanceof Error ? e.message : "Price lookup failed";
    }
  }
  const meta: Record<string, TokenRow> = {};
  let metaError: string | null = null;
  const nonSol = mints.filter((m) => m !== WRAPPED_SOL_MINT);
  for (let i = 0; i < nonSol.length; i += 90) {
    try {
      const res = await apiGet<RowsResponse>(`/api/dex/tokens?mints=${nonSol.slice(i, i + 90).join(",")}`);
      for (const r of res.rows) meta[r.mint] = r;
    } catch (e) {
      metaError = e instanceof Error ? e.message : "Token metadata lookup failed";
    }
  }
  return { holdings, prices, meta, fetchedAt: Date.now(), priceError, metaError };
}

export function PortfolioView() {
  const { account } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [swaps] = swapHistoryStore.useStore();
  const address = account?.address ?? null;
  const { data, error, loading, refresh } = useAsync(address, () => loadPortfolio(address!));

  const rows = useMemo(() => {
    if (!data) return [];
    return data.holdings
      .filter((h) => showZero || h.amount > 0n || h.mint === WRAPPED_SOL_MINT)
      .map((h) => {
        const price = data.prices[h.mint] ?? null;
        const qty = atomicToNumber(h.amount, h.decimals);
        return { ...h, price, value: price !== null ? qty * price : null, row: data.meta[h.mint] };
      })
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  }, [data, showZero]);

  const priced = rows.filter((r) => r.value !== null);
  const total = priced.reduce((s, r) => s + (r.value ?? 0), 0);
  const unpriced = rows.filter((r) => r.value === null && r.amount > 0n).length;
  const mySwaps = swaps.filter((s) => s.wallet === account?.address).slice().reverse();

  if (!account) {
    return (
      <>
        <PageHeader title="Portfolio" />
        <EmptyState title="Connect a wallet to view holdings">
          Balances are read from the public blockchain using your wallet address only.
          <div className="mt-3">
            <button className="btn-primary" onClick={() => setWalletOpen(true)}>
              Connect wallet
            </button>
          </div>
        </EmptyState>
        <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle={<>Current holdings of {shortAddress(account.address, 6)}, valued with Jupiter Price API where a reliable price exists.</>}
        actions={<Freshness fetchedAt={data?.fetchedAt} onRefresh={refresh} loading={loading} staleAfterMs={5 * 60_000} />}
      />
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refresh} />}
        {data?.priceError && <Notice tone="warn">Some prices could not be loaded: {data.priceError}. Those holdings are shown without a value.</Notice>}
        {data?.metaError && <Notice tone="warn">Token names could not be loaded: {data.metaError}.</Notice>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Current value (priced holdings)" value={data ? formatUsd(total) : "—"} sub={unpriced ? `${unpriced} holding(s) without a reliable price excluded` : undefined} />
          <Stat label="Tokens held" value={data ? rows.filter((r) => r.amount > 0n).length : "—"} />
          <Stat label="Unrealized P/L" value="Unavailable" sub="No reliable cost basis" />
          <Stat label="Realized P/L" value="Unavailable" sub="No reliable trade history" />
        </div>

        <Notice title="Why profit and loss are not shown">
          Calculating P/L needs the price you paid for every token, including buys made in other apps, transfers and airdrops. That full
          history is not available from the free data sources this app uses, and we will not estimate or invent purchase prices. The value
          above is only <em>what your holdings are worth now</em>.
        </Notice>

        <Card
          title="Holdings"
          actions={
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} /> Show empty accounts
            </label>
          }
        >
          {!data && loading && <SkeletonRows rows={5} />}
          {data && rows.length === 0 && <EmptyState title="No holdings found" />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 text-left font-medium">Token</th>
                    <th className="py-1 text-right font-medium">Balance</th>
                    <th className="py-1 text-right font-medium">Price</th>
                    <th className="py-1 text-right font-medium">Current value</th>
                    <th className="py-1 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isSol = r.mint === WRAPPED_SOL_MINT && r.program === "native";
                    const symbol = isSol ? "SOL" : (r.row?.symbol ?? shortAddress(r.mint));
                    return (
                      <tr key={`${r.mint}-${r.program}`} className="border-t border-line/60">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <TokenAvatar src={r.row?.imageUrl ?? null} symbol={symbol} size={28} />
                            <div className="min-w-0">
                              <div className="font-medium">{symbol}</div>
                              <div className="truncate text-xs text-muted">
                                {isSol ? "Native SOL" : r.row?.name ?? "Unknown token"} {r.program === "spl-token-2022" && "· Token-2022"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="tabular py-2 text-right">{formatAtomic(r.amount, r.decimals, 6)}</td>
                        <td className="tabular py-2 text-right">{r.price !== null ? formatUsd(r.price) : <span className="text-muted">No reliable price</span>}</td>
                        <td className="tabular py-2 text-right">{r.value !== null ? formatUsd(r.value) : "—"}</td>
                        <td className="py-2 text-right text-xs text-muted">
                          {!isSol && (
                            <span className="flex justify-end gap-3">
                              <Link className="hover:text-fg" href={`/token/${r.mint}`}>
                                Details
                              </Link>
                              {r.amount > 0n && (
                                <Link className="hover:text-fg" href={`/trade?mint=${r.mint}&side=sell`}>
                                  Sell
                                </Link>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">Prices: Jupiter Price API V3 (tokens without a reliable price are left unvalued). Balances: Solana RPC.</p>
        </Card>

        <Card title="Swaps confirmed through this browser">
          {mySwaps.length === 0 ? (
            <p className="text-sm text-muted">None yet. Only swaps made here and confirmed on-chain are listed. This is not a complete trade history.</p>
          ) : (
            <ul className="divide-y divide-line/60 text-sm">
              {mySwaps.slice(0, 50).map((s) => (
                <li key={s.signature} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatAtomic(s.inputAmount, s.inputDecimals, 6)} {s.inputSymbol} → {formatAtomic(s.outputAmount, s.outputDecimals, 6)} {s.outputSymbol}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {formatTime(s.confirmedAt)}
                    <ExtLink href={`https://solscan.io/tx/${s.signature}`}>Tx</ExtLink>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
