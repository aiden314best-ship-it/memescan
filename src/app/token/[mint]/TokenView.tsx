"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { solscanToken } from "@/components/tokens/TokenTable";
import { useFavorites } from "@/components/tokens/favorites";
import { IconStar } from "@/components/icons";
import { Card, CopyButton, EmptyState, ErrorBanner, ExtLink, Freshness, Notice, RiskDisclaimer, SkeletonRows, Stat, TokenAvatar } from "@/components/ui";
import type { TokenResponse } from "@/lib/api-types";
import type { TokenRow } from "@/lib/dexscreener/normalize";
import { changeClass, formatAge, formatCompactUsd, formatInt, formatPct, formatTime, formatUsd, NA } from "@/lib/format";
import { hostnameOf } from "@/lib/safe";
import { prefsStore } from "@/lib/client/stores";
import { useApi, useNow } from "@/lib/client/useApi";
import { isSolanaAddress, shortAddress } from "@/lib/solana/address";

const WINDOWS = [
  { key: "m5", label: "5m" },
  { key: "h1", label: "1h" },
  { key: "h6", label: "6h" },
  { key: "h24", label: "24h" },
] as const;

function ChangeBars({ row }: { row: TokenRow }) {
  const values = WINDOWS.map((w) => row.priceChange[w.key]);
  const max = Math.max(1, ...values.map((v) => Math.abs(v ?? 0)));
  return (
    <div className="space-y-2" role="img" aria-label="Price change by time window">
      {WINDOWS.map((w) => {
        const v = row.priceChange[w.key];
        const pct = v === null ? 0 : (Math.abs(v) / max) * 50;
        return (
          <div key={w.key} className="flex items-center gap-3 text-xs">
            <span className="w-8 text-muted">{w.label}</span>
            <div className="relative h-4 flex-1 rounded bg-panel-2">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              {v !== null && (
                <div
                  className={`absolute inset-y-0.5 rounded-sm ${v >= 0 ? "bg-up/70" : "bg-down/70"}`}
                  style={v >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
                />
              )}
            </div>
            <span className={`tabular w-16 text-right ${changeClass(v)}`}>{v === null ? "n/a" : formatPct(v, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Activity({ row }: { row: TokenRow }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="py-1 text-left font-medium">Window</th>
          <th className="py-1 text-right font-medium">Volume</th>
          <th className="py-1 text-right font-medium">Buys</th>
          <th className="py-1 text-right font-medium">Sells</th>
          <th className="hidden py-1 text-right font-medium sm:table-cell">Buy share</th>
        </tr>
      </thead>
      <tbody>
        {WINDOWS.map((w) => {
          const t = row.txns[w.key];
          const total = (t.buys ?? 0) + (t.sells ?? 0);
          const share = t.buys !== null && t.sells !== null && total > 0 ? (t.buys / total) * 100 : null;
          return (
            <tr key={w.key} className="border-t border-line/60">
              <td className="py-1.5 text-muted">{w.label}</td>
              <td className="tabular py-1.5 text-right">{formatCompactUsd(row.volume[w.key])}</td>
              <td className="tabular py-1.5 text-right text-up">{formatInt(t.buys)}</td>
              <td className="tabular py-1.5 text-right text-down">{formatInt(t.sells)}</td>
              <td className="hidden py-1.5 sm:table-cell">
                {share === null ? (
                  <span className="block text-right text-muted">{NA}</span>
                ) : (
                  <div className="ml-auto flex h-2 w-28 overflow-hidden rounded bg-down/60" title={`${share.toFixed(0)}% buys`}>
                    <div className="bg-up/80" style={{ width: `${share}%` }} />
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ChartEmbed({ pairAddress }: { pairAddress: string }) {
  const [prefs] = prefsStore.useStore();
  const [show, setShow] = useState(false);
  if (!show) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">
        <p>Price history comes from DEX Screener&apos;s embeddable chart.</p>
        <p className="text-xs">Loading it contacts dexscreener.com from your browser (third-party cookies/scripts may apply).</p>
        <button className="btn-ghost mt-1" onClick={() => setShow(true)}>
          Load price chart
        </button>
      </div>
    );
  }
  const src = `https://dexscreener.com/solana/${pairAddress}?embed=1&theme=${prefs.theme}&info=0&trades=0`;
  return (
    <iframe
      src={src}
      title="DEX Screener price chart"
      className="h-[420px] w-full rounded-lg border border-line"
      sandbox="allow-scripts allow-same-origin allow-popups"
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  );
}

export function TokenView() {
  const { mint } = useParams<{ mint: string }>();
  const valid = isSolanaAddress(mint);
  const [prefs] = prefsStore.useStore();
  const { data, error, loading, refresh } = useApi<TokenResponse>(valid ? `/api/dex/token/${mint}` : null, prefs.refreshMs);
  const { favoriteSet, toggle } = useFavorites();
  const now = useNow(30_000);

  if (!valid) {
    return <EmptyState title="Invalid token address">&quot;{String(mint).slice(0, 60)}&quot; is not a valid Solana mint address.</EmptyState>;
  }

  const row = data?.row ?? null;
  const fav = favoriteSet.has(mint);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <TokenAvatar src={row?.imageUrl ?? null} symbol={row?.symbol ?? "?"} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">
            {row ? `${row.name} (${row.symbol})` : loading ? "Loading…" : shortAddress(mint, 6)}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <code className="break-all rounded bg-panel-2 px-1.5 py-0.5">{mint}</code>
            <CopyButton value={mint} label="Copy mint" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => toggle({ mint, symbol: row?.symbol ?? shortAddress(mint), name: row?.name ?? mint })} aria-pressed={fav}>
            <IconStar filled={fav} width={16} height={16} className={fav ? "text-warn" : ""} />
            {fav ? "Favorited" : "Favorite"}
          </button>
          <Link className="btn-ghost" href={`/risk?mint=${mint}`}>
            Risk check
          </Link>
          <Link className="btn-ghost" href={`/watchlist?mint=${mint}`}>
            Add alert
          </Link>
          <Link className="btn-primary" href={`/trade?mint=${mint}`}>
            Trade
          </Link>
        </div>
      </div>

      <RiskDisclaimer />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Freshness fetchedAt={data?.fetchedAt} stale={data?.stale} staleReason={data?.staleReason} source={data?.source} onRefresh={refresh} loading={loading} />
        <div className="flex gap-4 text-sm text-muted">
          {row && <ExtLink href={row.pairUrl}>DEX Screener</ExtLink>}
          <ExtLink href={solscanToken(mint)}>Solscan</ExtLink>
        </div>
      </div>

      {error && <ErrorBanner message={data ? `${error} Showing the last data that loaded.` : error} onRetry={refresh} />}
      {!data && loading && <SkeletonRows rows={6} />}
      {data && !row && (
        <EmptyState title="No market data for this token">
          DEX Screener has no Solana pair where this mint is the base token. It may be untraded, very new, or not a token at all.
          You can still run the <Link className="underline" href={`/risk?mint=${mint}`}>on-chain risk check</Link>.
        </EmptyState>
      )}

      {row && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Price (USD)" value={formatUsd(row.priceUsd)} sub={row.priceNative !== null ? `${row.priceNative.toPrecision(4)} ${row.quoteSymbol}` : undefined} />
            <Stat label="24h change" value={formatPct(row.priceChange.h24)} valueClass={changeClass(row.priceChange.h24)} />
            <Stat label="Market cap" value={formatCompactUsd(row.marketCap)} sub={`FDV ${formatCompactUsd(row.fdv)}`} />
            <Stat
              label="Liquidity (main pool)"
              value={formatCompactUsd(row.liquidityUsd)}
              sub={row.pairCount > 1 ? `All pools: ${formatCompactUsd(row.totalLiquidityUsd)}` : undefined}
              valueClass={row.liquidityUsd !== null && row.liquidityUsd < 10_000 ? "text-warn" : ""}
            />
            <Stat label="24h volume" value={formatCompactUsd(row.volume.h24)} />
            <Stat label="Pair age" value={formatAge(row.pairCreatedAt, now)} sub={row.pairCreatedAt ? formatTime(row.pairCreatedAt) : "Creation time not reported"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Price history" className="lg:col-span-2">
              <ChartEmbed pairAddress={row.pairAddress} />
            </Card>
            <Card title="Price change by window">
              <ChangeBars row={row} />
              <p className="mt-3 text-xs text-muted">From DEX Screener&apos;s reported change for the main pool. &quot;n/a&quot; means not reported.</p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Buy / sell activity (main pool)">
              <Activity row={row} />
            </Card>
            <Card title={`Liquidity pools (${data?.pools.length ?? 0})`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 text-left font-medium">Pool</th>
                      <th className="py-1 text-right font-medium">Liquidity</th>
                      <th className="py-1 text-right font-medium">Vol 24h</th>
                      <th className="py-1 text-right font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.pools.map((p) => (
                      <tr key={p.pairAddress} className="border-t border-line/60">
                        <td className="py-1.5">
                          <ExtLink href={p.pairUrl}>
                            {p.baseSymbol}/{p.quoteSymbol} · {p.dexId}
                          </ExtLink>
                          <div className="text-[11px] text-muted">
                            {shortAddress(p.pairAddress)}
                            {p.labels.length > 0 && ` · ${p.labels.join(", ")}`}
                          </div>
                        </td>
                        <td className="tabular py-1.5 text-right">{formatCompactUsd(p.liquidityUsd)}</td>
                        <td className="tabular py-1.5 text-right">{formatCompactUsd(p.volume24h)}</td>
                        <td className="tabular py-1.5 text-right text-muted" title={formatTime(p.pairCreatedAt)}>
                          {formatAge(p.pairCreatedAt, now)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">
                Pool base liquidity: {row.liquidityBase !== null ? `${formatInt(row.liquidityBase)} ${row.symbol}` : NA} · quote:{" "}
                {row.liquidityQuote !== null ? `${row.liquidityQuote.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${row.quoteSymbol}` : NA}
              </p>
            </Card>
          </div>

          {(row.websites.length > 0 || row.socials.length > 0) && (
            <Card title="Links listed for this token">
              <Notice tone="warn">These links are supplied by whoever listed the token and are not verified. Scam tokens often impersonate real projects.</Notice>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
                {row.websites.map((w) => (
                  <ExtLink key={w.url} href={w.url}>
                    {w.label} ({hostnameOf(w.url)})
                  </ExtLink>
                ))}
                {row.socials.map((s) => (
                  <ExtLink key={s.url} href={s.url}>
                    {s.type} ({hostnameOf(s.url)})
                  </ExtLink>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
